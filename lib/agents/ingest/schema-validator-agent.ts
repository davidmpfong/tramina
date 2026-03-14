import { z } from "zod";
import { SchemaValidatorInput, SchemaValidatorOutput } from "@/lib/ingest/types";
import { ExtractedGrantDataSchema, WorkflowStepSchema } from "@/lib/ingest/schemas";

/**
 * Validates extraction and workflow outputs with Zod schemas.
 * Never throws; always returns validation result.
 */
export async function schemaValidatorAgent(input: SchemaValidatorInput): Promise<SchemaValidatorOutput> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const extractedResult = ExtractedGrantDataSchema.safeParse(input.extractedData);
  const workflowResult = z.array(WorkflowStepSchema).safeParse(input.workflowSteps);

  if (!extractedResult.success) {
    errors.push(
      ...extractedResult.error.issues.map((issue) => {
        const path = issue.path.join(".") || "extractedData";
        return `[extractedData] ${path}: ${issue.message}`;
      })
    );
  }

  if (!workflowResult.success) {
    errors.push(
      ...workflowResult.error.issues.map((issue) => {
        const path = issue.path.join(".") || "workflowSteps";
        return `[workflowSteps] ${path}: ${issue.message}`;
      })
    );
  }

  if (input.extractedData.amountMin === null && input.extractedData.amountMax === null) {
    warnings.push("Both amountMin and amountMax are null");
  }

  if (input.workflowSteps.length < 3) {
    warnings.push("Workflow contains fewer than 3 steps");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
