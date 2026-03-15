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
    (extractFallbackField(rawContent, "description|summary") ?? rawContent.slice(0, 500).trim()) || "Unknown";

  return {
    name: fallbackName,
    funder: fallbackFunder,
    type: "grant",
    description: fallbackDescription,
    amountMin: null,
    amountMax: null,
    deadline: null,
    deadlineText: null,
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
    model: "gemini-2.5-flash-lite"
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
        "CRITICAL FIELDS — extract these with maximum accuracy:",
        "- applicationUrl: The direct URL where applicants submit the application. Must be a full URL starting with https://. Set null ONLY if genuinely not findable.",
        "- deadline: ISO date string (YYYY-MM-DD) of the application deadline. If rolling/ongoing, set to null and note in deadlineText.",
        "- deadlineText: Human-readable deadline description (e.g., 'Rolling basis', 'December 31, 2026', 'Applications closed').",
        "- applicationWindowStart: ISO date when the application window opens, or null.",
        "- applicationWindowEnd: ISO date when the application window closes, or null.",
        "- eligibilityRules: A detailed JSON object with keys like: industries (array), ownershipFlags (array of 'immigrant-owned'|'minority-owned'|'woman-owned'|'artist'), minYearsInBusiness (number|null), maxEmployees (number|null), revenueRanges (array), geographicRestrictions (array), otherRequirements (array of strings).",
        "- requiredDocuments: Array of every document applicants must submit.",
        "- contactEmail: Contact email for the program, or null.",
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

    // Strip markdown fences if present
    const cleanedText = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleanedText) as ExtractedGrantData;

    const normalizeType = (raw: unknown): "grant" | "loan" | "benefit" => {
      const s = String(raw ?? "").toLowerCase();
      if (s.includes("loan")) return "loan";
      if (s.includes("benefit")) return "benefit";
      return "grant";
    };

    const extractedData: ExtractedGrantData = {
      ...parsed,
      type: normalizeType(parsed.type),
      deadlineText: parsed.deadline ?? null, // preserve raw deadline text
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

    // Quality gate warnings
    if (!extractedData.applicationUrl) {
      warnings.push("QUALITY: applicationUrl is missing — grant may not have an online application");
    }

    const eligibilityRulesEmpty = !extractedData.eligibilityRules ||
      Object.keys(extractedData.eligibilityRules).length === 0;
    if (eligibilityRulesEmpty) {
      warnings.push("QUALITY: eligibilityRules is empty — eligibility criteria not extracted");
    }

    if (!extractedData.requiredDocuments || extractedData.requiredDocuments.length === 0) {
      warnings.push("QUALITY: requiredDocuments is empty — required documents not extracted");
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
