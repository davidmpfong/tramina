import { z } from "zod";

export const IngestLocaleSchema = z.enum(["en", "es", "km"]);

export const IngestGrantRequestSchema = z.object({
  grantName: z.string().min(1).max(200),
  sourceUrl: z.string().url().optional(),
  locale: IngestLocaleSchema.optional(),
  localeHints: z.array(z.string()).optional(),
  adminSecret: z.string().min(1)
});

export const OpportunityTypeSchema = z.enum(["grant", "loan", "benefit"]);

export const WorkflowStepTypeSchema = z.enum([
  "info_collection",
  "document_upload",
  "narrative_draft",
  "review",
  "submission"
]);

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  stepType: WorkflowStepTypeSchema,
  order: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  requiredDocuments: z.array(z.string()).optional(),
  inputPrompt: z.string().optional(),
  validationRules: z.array(z.string()).optional(),
  isOptional: z.boolean()
});

export const ExtractedGrantDataSchema = z.object({
  name: z.string().nullish().transform((v) => v ?? "Unknown"),
  funder: z.string().nullish().transform((v) => v ?? "Unknown"),
  type: OpportunityTypeSchema,
  description: z.string().min(1),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  deadline: z.string().nullable(),
  applicationWindowStart: z.string().nullable(),
  applicationWindowEnd: z.string().nullable(),
  awardType: z.string().nullable(),
  eligibilityRules: z.record(z.unknown()),
  geographicScope: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .transform((v) => (Array.isArray(v) ? v.join(", ") : (v ?? null))),
  languagesAvailable: z.array(z.string()),
  matchingTags: z.array(z.string()),
  sourceUrl: z.string().url().nullable(),
  rawContent: z.string().min(1),
  applicationUrl: z.string().url().nullable(),
  contactEmail: z.string().email().nullable(),
  requiredDocuments: z.array(z.string())
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  opportunity_id: z.string().uuid(),
  version: z.number().int().min(1),
  steps: z.array(WorkflowStepSchema),
  locale: IngestLocaleSchema,
  created_at: z.string(),
  updated_at: z.string()
});

export const GrantResearchInputSchema = z.object({
  grantName: z.string().min(1),
  sourceUrl: z.string().url().optional()
});

export const GrantResearchOutputSchema = z.object({
  rawContent: z.string().min(1),
  sourceUrlsUsed: z.array(z.string()),
  scrapedAt: z.string()
});

export const GrantExtractionInputSchema = z.object({
  rawContent: z.string().min(1)
});

export const GrantExtractionOutputSchema = z.object({
  extractedData: ExtractedGrantDataSchema,
  warnings: z.array(z.string()),
  isPartial: z.boolean()
});

export const WorkflowBuilderInputSchema = z.object({
  extractedData: ExtractedGrantDataSchema,
  locale: IngestLocaleSchema
});

export const WorkflowBuilderOutputSchema = z.object({
  steps: z.array(WorkflowStepSchema)
});

export const SchemaValidatorInputSchema = z.object({
  extractedData: ExtractedGrantDataSchema,
  workflowSteps: z.array(WorkflowStepSchema)
});

export const SchemaValidatorOutputSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string())
});

export const IngestionWriterInputSchema = z.object({
  extractedData: ExtractedGrantDataSchema,
  workflowSteps: z.array(WorkflowStepSchema),
  ingestRunId: z.string(),
  locale: IngestLocaleSchema
});

export const IngestionWriterOutputSchema = z.object({
  opportunityId: z.string(),
  workflowDefinitionId: z.string()
});
