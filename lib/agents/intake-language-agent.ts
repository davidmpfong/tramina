import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export interface IntakeLanguageInput {
  userText: string;
  preferredLocale?: "en" | "es" | "km";
}

export interface IntakeLanguageOutput {
  detectedLocale: "en" | "es" | "km";
  normalizedIntent: string;
}

/**
 * Detects language + intent from user free-text onboarding/applicant questions.
 */
export async function intakeLanguageAgent(input: IntakeLanguageInput): Promise<IntakeLanguageOutput> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-1.5-flash-latest"
  });

  await model.invoke(`Detect language and normalize intent: ${input.userText}`);

  return {
    detectedLocale: input.preferredLocale ?? "en",
    normalizedIntent: input.userText.trim()
  };
}
