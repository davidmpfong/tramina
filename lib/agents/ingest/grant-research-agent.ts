import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GrantResearchInput, GrantResearchOutput, ResearchError } from "@/lib/ingest/types";

/**
 * Researches grant details from prompt context (and optional source URL priority) using Gemini Flash.
 */
export async function grantResearchAgent(input: GrantResearchInput): Promise<GrantResearchOutput> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-1.5-flash-latest"
  });

  const response = await model.invoke(
    [
      "You are a grant research assistant.",
      `Research the grant named: ${input.grantName}.`,
      input.sourceUrl
        ? `Prioritize information from this source URL first: ${input.sourceUrl}.`
        : "No source URL was provided; rely on your strongest available knowledge.",
      "Return everything you know about this grant, including:",
      "- eligibility",
      "- funding amounts",
      "- deadlines",
      "- how to apply",
      "- required documents",
      "- funder",
      "- description",
      "Respond as plain text."
    ].join("\n")
  );

  const rawText =
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

  const rawContent = rawText.trim();

  if (!rawContent || rawContent.length < 100) {
    throw new ResearchError("Insufficient grant content retrieved");
  }

  return {
    rawContent,
    sourceUrlsUsed: [input.sourceUrl].filter((url): url is string => Boolean(url)),
    scrapedAt: new Date().toISOString()
  };
}
