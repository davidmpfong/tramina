import { RankedOpportunity } from "@/lib/agents/eligibility-ranking-agent";

export interface QuestionPlannerInput {
  opportunities: RankedOpportunity[];
}

export interface QuestionPlannerOutput {
  followUpQuestions: string[];
}

/**
 * Generates smart follow-up questions that improve draft quality and eligibility confidence.
 */
export async function questionPlannerAgent(
  input: QuestionPlannerInput
): Promise<QuestionPlannerOutput> {
  const first = input.opportunities[0];

  return {
    followUpQuestions: [
      `What outcomes will your business deliver with ${first?.name ?? "this funding"}?`,
      "Do you have existing financial statements or tax returns available?",
      "Can you describe community impact in one paragraph?"
    ]
  };
}
