import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export interface GrantHunterInput {
  /** Primary audience description, e.g. "immigrant-owned small businesses in Massachusetts" */
  audience: string;
  /** Geographic focus, e.g. "Lynn, MA" or "Massachusetts" */
  geography: string;
  /** Industries or sectors to focus on, e.g. ["restaurant", "food", "arts", "retail"] */
  industries?: string[];
  /** How many candidates to discover (default 10) */
  maxCandidates?: number;
}

export interface GrantCandidate {
  name: string;
  funder: string;
  description: string;
  /** Best known URL for the grant program (may be the program page, not necessarily the application form) */
  programUrl: string | null;
  /** Best known application URL — null if not findable */
  applicationUrl: string | null;
  /** Deadline or deadline description */
  deadline: string | null;
  /** Whether the grant is currently accepting applications */
  isCurrentlyOpen: boolean | null;
  /** Extracted eligibility summary */
  eligibilitySummary: string | null;
  /** List of required documents if known */
  requiredDocuments: string[];
  /** Scoring breakdown (each 0–1) */
  scores: {
    applicationUrlKnown: number;
    isActiveOrRolling: number;
    hasEligibilityRules: number;
    hasRequiredDocuments: number;
    audienceGeographyFit: number;
  };
  /** Total weighted score 0–10 */
  totalScore: number;
  /** INGEST_READY (>=7), REVIEW_NEEDED (4-6.9), SKIP (<4) */
  recommendation: "INGEST_READY" | "REVIEW_NEEDED" | "SKIP";
  /** Reason for recommendation */
  recommendationReason: string;
}

export interface GrantHunterOutput {
  candidates: GrantCandidate[];
  huntedAt: string;
  context: {
    audience: string;
    geography: string;
    industries: string[];
  };
}

function scoreCandidate(
  candidate: Omit<GrantCandidate, "scores" | "totalScore" | "recommendation" | "recommendationReason">
): Pick<GrantCandidate, "scores" | "totalScore" | "recommendation" | "recommendationReason"> {
  const scores = {
    applicationUrlKnown: candidate.applicationUrl ? 1 : 0,
    isActiveOrRolling: (() => {
      if (candidate.isCurrentlyOpen === true) return 1;
      if (candidate.isCurrentlyOpen === false) return 0;
      // Unknown — partial credit
      return 0.5;
    })(),
    hasEligibilityRules: candidate.eligibilitySummary && candidate.eligibilitySummary.length > 30 ? 1 : 0,
    hasRequiredDocuments: candidate.requiredDocuments.length > 0 ? 1 : 0,
    audienceGeographyFit: (() => {
      const combined = [candidate.description ?? "", candidate.eligibilitySummary ?? ""].join(" ").toLowerCase();
      let fit = 0.3; // base
      if (combined.includes("immigrant") || combined.includes("minority") || combined.includes("woman-owned")) fit += 0.35;
      if (combined.includes("small business") || combined.includes("entrepreneur")) fit += 0.2;
      if (combined.includes("massachusetts") || combined.includes("lynn") || combined.includes("lowell") || combined.includes("new england")) fit += 0.15;
      return Math.min(fit, 1);
    })()
  };

  // Weighted total 0–10
  const totalScore =
    scores.applicationUrlKnown * 3.0 +
    scores.isActiveOrRolling * 2.5 +
    scores.hasEligibilityRules * 2.0 +
    scores.hasRequiredDocuments * 1.5 +
    scores.audienceGeographyFit * 1.0;

  const recommendation: "INGEST_READY" | "REVIEW_NEEDED" | "SKIP" =
    totalScore >= 7
      ? "INGEST_READY"
      : totalScore >= 4
        ? "REVIEW_NEEDED"
        : "SKIP";

  const reasons: string[] = [];
  if (!candidate.applicationUrl) reasons.push("no application URL");
  if (candidate.isCurrentlyOpen === false) reasons.push("not currently accepting");
  if (!candidate.eligibilitySummary || candidate.eligibilitySummary.length <= 30) reasons.push("eligibility unclear");
  if (candidate.requiredDocuments.length === 0) reasons.push("required documents unknown");

  const recommendationReason =
    recommendation === "INGEST_READY"
      ? "All key quality signals present — ready to ingest"
      : recommendation === "REVIEW_NEEDED"
        ? `Partial signals — review before ingesting: ${reasons.join(", ")}`
        : `Missing critical signals: ${reasons.join(", ")}`;

  return { scores, totalScore: Math.round(totalScore * 10) / 10, recommendation, recommendationReason };
}

/**
 * Discovers and scores potential grant candidates for ingestion.
 * Two-pass: first discovers candidates, then scores each one.
 */
export async function grantHunterAgent(input: GrantHunterInput): Promise<GrantHunterOutput> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash-lite"
  });

  const industries = input.industries ?? [];
  const maxCandidates = input.maxCandidates ?? 10;

  // Pass 1: Discover candidate grants
  const discoveryPrompt = [
    "You are a grant research specialist helping identify funding opportunities for small businesses.",
    `Target audience: ${input.audience}`,
    `Geographic focus: ${input.geography}`,
    industries.length > 0 ? `Industry focus: ${industries.join(", ")}` : "",
    "",
    `List up to ${maxCandidates} grant programs, loans, or funding opportunities that would be relevant for this audience.`,
    "Focus on programs that:",
    "  - Are currently accepting applications OR have rolling/ongoing deadlines",
    "  - Have application windows within the next 6 months if deadline-based",
    "  - Have real, accessible application portals (not just general info pages)",
    "  - Are specifically targeted to small businesses, immigrant entrepreneurs, or underserved communities",
    "",
    "Return a JSON array. Each element must have EXACTLY these fields:",
    '  { "name": string, "funder": string, "description": string, "programUrl": string|null, "applicationUrl": string|null, "deadline": string|null, "isCurrentlyOpen": boolean|null, "eligibilitySummary": string|null, "requiredDocuments": string[] }',
    "",
    "Rules:",
    "- programUrl: best known URL for the program information page",
    "- applicationUrl: direct URL to submit an application, or null if not known",
    "- deadline: exact date string or description like 'Rolling', 'Open until funds exhausted'",
    "- isCurrentlyOpen: true if currently accepting, false if closed/past, null if unknown",
    "- eligibilitySummary: 1-3 sentences describing who qualifies",
    "- requiredDocuments: list every document required, or empty array if unknown",
    "",
    "Return ONLY valid JSON array. No markdown fences."
  ]
    .filter(Boolean)
    .join("\n");

  const discoveryResponse = await model.invoke(discoveryPrompt);

  const discoveryText =
    typeof discoveryResponse.content === "string"
      ? discoveryResponse.content
      : Array.isArray(discoveryResponse.content)
        ? discoveryResponse.content
            .map((b) => (typeof b === "string" ? b : "text" in b ? (b as { text: string }).text : ""))
            .join("")
        : "";

  const cleanedDiscovery = discoveryText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  let rawCandidates: Omit<
    GrantCandidate,
    "scores" | "totalScore" | "recommendation" | "recommendationReason"
  >[] = [];

  try {
    rawCandidates = JSON.parse(cleanedDiscovery) as typeof rawCandidates;
    if (!Array.isArray(rawCandidates)) rawCandidates = [];
  } catch {
    rawCandidates = [];
  }

  // Score each candidate
  const candidates: GrantCandidate[] = rawCandidates
    .slice(0, maxCandidates)
    .map((raw) => {
      const scored = scoreCandidate(raw);
      return { ...raw, ...scored };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  return {
    candidates,
    huntedAt: new Date().toISOString(),
    context: {
      audience: input.audience,
      geography: input.geography,
      industries
    }
  };
}
