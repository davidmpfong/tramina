import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { WorkflowBuilderInput, WorkflowBuilderOutput, WorkflowStep, WorkflowBuildError } from "@/lib/ingest/types";

/**
 * Builds ordered workflow steps for a grant application process using Gemini Flash.
 */
export async function workflowBuilderAgent(input: WorkflowBuilderInput): Promise<WorkflowBuilderOutput> {
  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash-lite"
  });

  const response = await model.invoke(
    [
      "You are a workflow design assistant for grant applications.",
      "Given extracted grant data as JSON, generate an ordered JSON array of WorkflowStep objects.",
      "IMPORTANT: Always generate all text (title, description, inputPrompt) in ENGLISH only, regardless of locale.",
      "The steps should cover these step types as appropriate:",
      "  - info_collection: for text-based information the applicant types in",
      "  - document_upload: for documents the applicant must gather and submit to the funder later (no data extraction needed)",
      "  - document_extract: for documents where we need to extract a SPECIFIC STRUCTURED FIELD from the document (e.g. EIN from tax form, license number from business license). Use this when the grant application output will need a specific value FROM the document. Set extractFields to the list of field names to extract.",
      "  - narrative_draft: for written narratives or project proposals",
      "  - review: for the applicant to review their application",
      "  - submission: for the final submission step",
      "Each step must include: id (step-1, step-2, ...), stepType, order, title, description, isOptional.",
      "For document_upload steps: include requiredDocuments array and inputPrompt.",
      "For document_extract steps: include requiredDocuments array, inputPrompt describing what document to provide, and extractFields array of snake_case field names to extract (e.g. ['business_registration_number', 'ein']).",
      "For info_collection steps: include inputPrompt.",
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
