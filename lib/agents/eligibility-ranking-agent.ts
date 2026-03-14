import { OpportunityRecord } from "@/lib/agents/opportunity-retrieval-agent";

export interface EligibilityRankingInput {
  opportunities: OpportunityRecord[];
  userProfile: {
    industry?: string;
    is_artist?: boolean;
    years_in_business?: number;
  };
}

export interface RankedOpportunity extends OpportunityRecord {
  score: number;
  reasons: string[];
}

export interface EligibilityRankingOutput {
  ranked: RankedOpportunity[];
}

/**
 * Assigns heuristic eligibility scores based on profile -> eligibility match.
 */
export async function eligibilityRankingAgent(
  input: EligibilityRankingInput
): Promise<EligibilityRankingOutput> {
  const ranked = input.opportunities
    .map((opportunity) => {
      const reasons: string[] = [];
      let score = 0.5;

      if (input.userProfile.is_artist && JSON.stringify(opportunity.eligibility_rules).includes("artist")) {
        score += 0.2;
        reasons.push("Artist-focused criteria detected");
      }

      if (input.userProfile.years_in_business && input.userProfile.years_in_business >= 2) {
        score += 0.1;
        reasons.push("Meets established business threshold");
      }

      return { ...opportunity, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return { ranked };
}
