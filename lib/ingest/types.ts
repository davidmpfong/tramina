// Locale & Stage
export type IngestLocale = "en" | "es" | "km";
export type IngestStageName = "researching" | "extracting" | "building_workflow" | "validating" | "writing";

// Request / Report / Result
export interface IngestGrantRequest {
  grantName: string;
  sourceUrl?: string;
  locale?: IngestLocale;
  localeHints?: string[];
  adminSecret: string;
}

export interface IngestRunEvent {
  stage: IngestStageName;
  status: "started" | "succeeded" | "failed";
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface IngestRunReport {
  ingestRunId: string;
  status: "success" | "partial_success" | "failed" | "rejected";
  startedAt: string;
  endedAt: string;
  stageDurationsMs: Record<IngestStageName, number>;
  events: IngestRunEvent[];
  warnings: string[];
  sourceUrlsUsed: string[];
}
export interface IngestGrantResult {
  opportunity: OpportunityRowExtended;
  workflowDefinition: WorkflowDefinitionRow;
  runReport: IngestRunReport;
}

// Opportunity / Workflow
export type OpportunityType = "grant" | "loan" | "benefit";
export type WorkflowStepType = "info_collection" | "document_upload" | "document_extract" | "narrative_draft" | "review" | "submission";

export interface WorkflowStep {
  id: string;
  stepType: WorkflowStepType;
  order: number;
  title: string;
  description: string;
  requiredDocuments?: string[];
  extractFields?: string[]; // for document_extract steps: list of field names to extract e.g. ["registration_number", "ein"]
  inputPrompt?: string;
  validationRules?: string[];
  isOptional: boolean;
}
// Extraction
export interface ExtractedGrantData {
  name: string;
  funder: string;
  type: OpportunityType;
  description: string;
  amountMin: number | null;
  amountMax: number | null;
  deadline: string | null;
  deadlineText?: string | null;
  applicationWindowStart: string | null;
  applicationWindowEnd: string | null;
  awardType: string | null;
  eligibilityRules: Record<string, unknown>;
  geographicScope: string | null;
  languagesAvailable: string[];
  matchingTags: string[];
  sourceUrl: string | null;
  rawContent: string;
  applicationUrl: string | null;
  contactEmail: string | null;
  requiredDocuments: string[];
}

// DB rows
export interface OpportunityRowExtended {
  id: string;
  name: string;
  type: OpportunityType;
  amount_min: number | null;
  amount_max: number | null;
  deadline: string | null;
  eligibility_rules: Record<string, unknown>;
  funder: string;
  description: string;
  is_active: boolean;
  geographic_scope: string | null;
  languages_available: string[];
  created_at: string;
  source_url: string | null;
  raw_content: string | null;
  ingest_run_id: string | null;
  application_url: string | null;
  contact_email: string | null;
  required_documents: string[];
  application_window_start: string | null;
  application_window_end: string | null;
  award_type: string | null;
  matching_tags: string[];
}

export interface WorkflowDefinitionRow {
  id: string;
  opportunity_id: string;
  version: number;
  steps: WorkflowStep[];
  locale: IngestLocale;
  created_at: string;
  updated_at: string;
}

// Per-stage IO
export interface GrantResearchInput {
  grantName: string;
  sourceUrl?: string;
}

export interface GrantResearchOutput {
  rawContent: string;
  sourceUrlsUsed: string[];
  scrapedAt: string;
}

export interface GrantExtractionInput {
  rawContent: string;
}

export interface GrantExtractionOutput {
  extractedData: ExtractedGrantData;
  warnings: string[];
  isPartial: boolean;
}

export interface WorkflowBuilderInput {
  extractedData: ExtractedGrantData;
  locale: IngestLocale;
}

export interface WorkflowBuilderOutput {
  steps: WorkflowStep[];
  estimatedMinutes: number;
  applicationOverview: string;
}
export interface SchemaValidatorInput {
  extractedData: ExtractedGrantData;
  workflowSteps: WorkflowStep[];
}

export interface SchemaValidatorOutput {
  valid: boolean;
  errors: string[];
  warnings: string[];
  rejectionReasons: string[];  // quality gate failures — distinct from schema errors
}

export interface IngestionWriterInput {
  extractedData: ExtractedGrantData;
  workflowSteps: WorkflowStep[];
  ingestRunId: string;
  locale: IngestLocale;
  estimatedMinutes?: number;
  applicationOverview?: string;
}
export interface IngestionWriterOutput {
  opportunityId: string;
  workflowDefinitionId: string;
}

// Errors
export class ResearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchError";
  }
}

export class WorkflowBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowBuildError";
  }
}

export class IngestionWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionWriteError";
  }
}
