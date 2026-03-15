import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GrantResearchInput, GrantResearchOutput, ResearchError } from "@/lib/ingest/types";
import { validateSourceUrl } from "@/lib/sanitize";

/**
 * Researches grant details from prompt context (and optional source URL priority) using Gemini Flash.
 */
export async function grantResearchAgent(input: GrantResearchInput): Promise<GrantResearchOutput> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash-lite"
  });

  const response = await model.invoke(
    [
      "You are a grant research specialist. Your job is to gather high-quality, actionable information about a specific grant or funding program.",
      `Research the grant or funding program named: ${input.grantName}.`,
      validateSourceUrl(input.sourceUrl)
        ? `Start from this official source URL: ${validateSourceUrl(input.sourceUrl)}. Use it as the primary source.`
        : "No source URL provided — use your best available knowledge, prioritizing recent and verifiable information.",
      "",
      "You MUST provide detailed answers to ALL of the following. If any item is unknown, say explicitly 'UNKNOWN' for that item:",
      "",
      "1. GRANT NAME: The exact official name of the program.",
      "2. FUNDER: The organization or agency providing the funding.",
      "3. DESCRIPTION: What the grant funds, its purpose, and who it is designed to help.",
      "4. ELIGIBILITY CRITERIA: Who is eligible — be specific. Include:",
      "   - Business type, size, or industry requirements",
      "   - Geographic restrictions (state, city, zip codes)",
      "   - Ownership requirements (e.g., immigrant-owned, minority-owned, woman-owned)",
      "   - Years in business requirements",
      "   - Revenue or employee count limits",
      "   - Any other eligibility conditions",
      "5. FUNDING AMOUNTS: Minimum and maximum award amounts if known.",
      "6. APPLICATION DEADLINE: The exact application deadline date, or whether it is rolling/open. Include the application window open date if known.",
      "7. APPLICATION URL: The direct URL where applicants submit their application. This is critical — provide the most specific URL possible.",
      "8. REQUIRED DOCUMENTS: List every document applicants must submit with their application.",
      "9. HOW TO APPLY: Step-by-step application process.",
      "10. CONTACT INFORMATION: Email address or phone number for the grant program.",
      "",
      "IMPORTANT: If this grant is NOT currently accepting applications, has a deadline more than 6 months in the past, or has permanently closed, state that clearly at the top of your response.",
      "IMPORTANT: If you cannot find a real application URL or cannot verify this grant is currently active, state that clearly.",
      "",
      "Respond as detailed plain text. Be thorough — this information will be used to guide real applicants."
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

  if (!rawContent || rawContent.length < 500) {
    throw new ResearchError("Insufficient grant content retrieved — could not gather enough detail about this grant");
  }

  return {
    rawContent,
    sourceUrlsUsed: [validateSourceUrl(input.sourceUrl)].filter((url): url is string => Boolean(url)),
    scrapedAt: new Date().toISOString()
  };
}
