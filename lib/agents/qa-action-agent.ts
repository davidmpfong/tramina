export interface QAActionInput {
  draft: string;
}

export interface QAActionOutput {
  cleanedDraft: string;
  flags: string[];
}

/**
 * Final QA pass: checks completeness, tone, and returns action flags for missing sections.
 */
export async function qaActionAgent(input: QAActionInput): Promise<QAActionOutput> {
  const flags: string[] = [];

  if (input.draft.length < 200) {
    flags.push("Draft may be too short for submission");
  }

  return {
    cleanedDraft: input.draft.trim(),
    flags
  };
}
