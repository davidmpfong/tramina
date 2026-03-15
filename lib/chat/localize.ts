import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { WorkflowStep } from "@/lib/chat/types";

const LANGUAGE_NAME: Record<"en" | "es" | "km", string> = {
  en: "English",
  es: "Spanish",
  km: "Khmer (Cambodian)"
};

/**
 * Translates workflow step display text (title, description, inputPrompt) into the
 * user's locale. Steps are always stored in English; translation happens at display time.
 * Returns the original steps unchanged if locale is "en".
 */
export async function localizeSteps(
  steps: WorkflowStep[],
  locale: "en" | "es" | "km"
): Promise<WorkflowStep[]> {
  if (locale === "en" || steps.length === 0) {
    return steps;
  }

  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash-lite"
  });

  // Build a compact representation of only the text fields to translate
  const toTranslate = steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    inputPrompt: step.inputPrompt ?? null
  }));

  const prompt = [
    `Translate the following JSON array of grant application step text fields into ${LANGUAGE_NAME[locale]}.`,
    "Translate only the values of: title, description, inputPrompt.",
    "Keep id unchanged. If inputPrompt is null, keep it null.",
    "Return ONLY a valid JSON array with the same structure. No markdown fences.",
    "",
    JSON.stringify(toTranslate)
  ].join("\n");

  const response = await model.invoke(prompt);
  const text = typeof response.content === "string"
    ? response.content
    : Array.isArray(response.content)
      ? response.content.map((b) => (typeof b === "string" ? b : ("text" in b ? b.text : ""))).join("")
      : "";

  let translated: { id: string; title: string; description: string; inputPrompt: string | null }[];

  try {
    translated = JSON.parse(text) as typeof translated;
  } catch {
    // If translation fails, return originals
    return steps;
  }

  const byId = new Map(translated.map((t) => [t.id, t]));

  return steps.map((step) => {
    const t = byId.get(step.id);
    if (!t) return step;
    return {
      ...step,
      title: t.title,
      description: t.description,
      inputPrompt: t.inputPrompt ?? step.inputPrompt
    };
  });
}
