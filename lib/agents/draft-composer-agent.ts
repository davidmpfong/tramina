import Anthropic from "@anthropic-ai/sdk";
import { RankedOpportunity } from "@/lib/agents/eligibility-ranking-agent";

export interface DraftComposerInput {
  selectedOpportunity: RankedOpportunity;
  userNarrative: string;
  locale: "en" | "es" | "km";
}

export interface DraftComposerOutput {
  draft: string;
}

/**
 * Composes a first application draft using Claude Sonnet for long-form writing quality.
 */
export async function draftComposerAgent(input: DraftComposerInput): Promise<DraftComposerOutput> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 900,
    messages: [
      {
        role: "user",
        content: `Write a concise funding application draft in ${input.locale}.\nOpportunity: ${input.selectedOpportunity.name}\nNarrative: ${input.userNarrative}`
      }
    ]
  });

  const textBlock = response.content.find((block) => block.type === "text");

  return {
    draft: textBlock?.text ?? "Draft unavailable."
  };
}
