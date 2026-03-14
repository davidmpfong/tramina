import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GrantExtractionInput, GrantExtractionOutput, ExtractedGrantData } from "@/lib/ingest/types";

function extractFallbackField(rawContent: string, label: string): string | null {
  const regex = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, "i");
  const match = rawContent.match(regex);
  return match?.[1]?.trim() ?? null;
}

function buildSafePartialExtractedData(rawContent: string): ExtractedGrantData {
  const fallbackName = extractFallbackField(rawContent, "grant name|name") ?? "Unknown";
  const fallbackFunder = extractFallbackField(rawContent, "funder|funding organization|organization") ?? "Unknown";
  const fallbackDescription =
    extractFallbackField(rawContent, "description|summary") ?? rawContent.slice(0, 500).trim() || "Unknown";

  return {
    name: fallbackName,
    funder: fallbackFunder,
    type: "grant",
    description: fallbackDescription,
    amountMin: null,
    amountMax: null,
    deadline: null,
    applicationWindowStart: null,
    applicationWindowEnd: null,
    awardType: null,
    eligibilityRules: {},
    geographicScope: null,
    languagesAvailable: [],
    matchingTags: [],
    sourceUrl: null,
    rawContent,
    applicationUrl: null,
    contactEmail: null,
    requiredDocuments: []
  };
}

/**
 * Extracts structured grant data from researched raw content using Gemini Flash.
 * Never throws; returns partial output with warnings on failure.
 */
export async function grantExtractionAgent(input: GrantExtractionInput): Promise<GrantExtractionOutput> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-1.5-flash"
  });

  const warnings: string[] = [];

  try {
    const response = await model.invoke(
      [
        "You are a grant data extraction assistant.",
        "Given raw grant content, extract a JSON object that matches the ExtractedGrantData interface exactly.",
        "Include all fields.",
        "For missing values, use null (or [] for arrays, {} for eligibilityRules).",
        "Return ONLY valid JSON with no markdown fences.",
        "",
        "ExtractedGrantData fields:",
        "name, funder, type, description, amountMin, amountMax, deadline, applicationWindowStart, applicationWindowEnd, awardType, eligibilityRules, geographicScope, languagesAvailable, matchingTags, sourceUrl, rawContent, applicationUrl, contactEmail, requiredDocuments",
        "",
        `Raw content:\n${input.rawContent}`
      ].join("\n")
    );

    const text =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .map((block) => {
                if (typeof block === "string") {
                  return block;
                }

                if ("text" in block && typeof block.text === "string") {
                  return block.text;
                }

                return "";
              })
              .join("\n")
          : "";

    const parsed = JSON.parse(text) as ExtractedGrantData;

    const extractedData: ExtractedGrantData = {
      ...parsed,
      rawContent: parsed.rawContent?.trim() ? parsed.rawContent : input.rawContent
    };

    const requiredStringFields: Array<keyof Pick<ExtractedGrantData, "name" | "funder" | "description">> = [
      "name",
      "funder",
      "description"
    ];

    const missingRequired = requiredStringFields.filter((field) => !extractedData[field]?.trim());

    if (missingRequired.length > 0) {
      warnings.push(`Missing required extracted fields: ${missingRequired.join(", ")}`);
    }

    return {
      extractedData,
      warnings,
      isPartial: missingRequired.length > 0
    };
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Failed to parse structured extraction output: ${error.message}`
        : "Failed to parse structured extraction output"
    );

    return {
      extractedData: buildSafePartialExtractedData(input.rawContent),
      warnings,
      isPartial: true
    };
  }
}
