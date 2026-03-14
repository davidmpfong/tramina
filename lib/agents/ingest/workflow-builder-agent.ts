import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { WorkflowBuilderInput, WorkflowBuilderOutput, WorkflowStep, WorkflowBuildError } from "@/lib/ingest/types";

/**
 * Builds ordered workflow steps for a grant application process using Gemini Flash.
 */
export async function workflowBuilderAgent(input: WorkflowBuilderInput): Promise<WorkflowBuilderOutput> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.0-flash-lite"
  });

  const response = await model.invoke(
    [
      "You are a workflow design assistant for grant applications.",
      "Given extracted grant data as JSON, generate an ordered JSON array of WorkflowStep objects.",
      "The steps should cover these step types: info_collection, document_upload, narrative_draft, review, submission.",
      "Each step must include: id (step-1, step-2, ...), stepType, order, title, description, isOptional:false.",
      "Include relevant requiredDocuments and inputPrompt where useful.",
      `Locale: ${input.locale}`,
      "Return ONLY a valid JSON array with no markdown fences.",
      "",
      `Extracted grant data JSON:\n${JSON.stringify(input.extractedData, null, 2)}`
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

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WorkflowBuildError("Failed to generate valid workflow steps");
  }

  if (!Array.isArray(parsed) || parsed.length < 1) {
    throw new WorkflowBuildError("Failed to generate valid workflow steps");
  }

  return {
    steps: parsed as WorkflowStep[]
  };
}
