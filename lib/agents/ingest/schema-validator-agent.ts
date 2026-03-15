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
  const rejectionReasons: string[] = [];

  const workflowStepTypeSchema = z.enum([
    "info_collection",
    "document_upload",
    "document_extract",
    "narrative_draft",
    "review",
    "submission"
  ]);

  const workflowStepSchema = WorkflowStepSchema.extend({
    stepType: workflowStepTypeSchema
  });

  const extractedResult = ExtractedGrantDataSchema.safeParse(input.extractedData);
  const workflowResult = z.array(workflowStepSchema).safeParse(input.workflowSteps);

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

  // Quality gate: deadline within 6 months or actively open
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const deadline = input.extractedData.deadline;
  const deadlineText = (input.extractedData as { deadlineText?: string | null }).deadlineText ?? null;
  const windowEnd = input.extractedData.applicationWindowEnd;

  // Check if deadline or window end is in the past beyond 6 months
  const checkDate = deadline ?? windowEnd;
  if (checkDate) {
    const d = new Date(checkDate);
    if (!isNaN(d.getTime())) {
      if (d.getTime() < now - 7 * 24 * 60 * 60 * 1000) {
        // Past deadline by more than 1 week
        rejectionReasons.push(`Deadline has passed: ${checkDate}`);
      } else if (d.getTime() > now + SIX_MONTHS_MS) {
        // More than 6 months away — warn but don't reject
        warnings.push(`Deadline is more than 6 months away: ${checkDate}`);
      }
    }
  } else if (deadlineText) {
    const lowerText = deadlineText.toLowerCase();
    if (lowerText.includes("closed") || lowerText.includes("ended") || lowerText.includes("expired")) {
      rejectionReasons.push(`Grant appears closed based on deadlineText: "${deadlineText}"`);
    }
    // Rolling/ongoing/open are fine — no rejection
  }

  // Quality gate: applicationUrl required
  if (!input.extractedData.applicationUrl) {
    rejectionReasons.push("applicationUrl is missing — cannot verify active online application");
  }

  // Quality gate: eligibilityRules must be non-empty
  const rulesEmpty = !input.extractedData.eligibilityRules ||
    Object.keys(input.extractedData.eligibilityRules).length === 0;
  if (rulesEmpty) {
    rejectionReasons.push("eligibilityRules is empty — eligibility criteria could not be extracted");
  }

  // Quality gate: requiredDocuments must be non-empty
  if (!input.extractedData.requiredDocuments || input.extractedData.requiredDocuments.length === 0) {
    rejectionReasons.push("requiredDocuments is empty — application requirements could not be extracted");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rejectionReasons
  };
}
