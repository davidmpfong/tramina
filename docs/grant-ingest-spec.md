# Grant Ingest Engine — Technical Specification

## 1) Overview & Goals

### Problem the engine solves
NavigateAI needs a reliable way to add new grants into production without manual data entry. Today, grant onboarding is fragmented (research in one place, ad-hoc extraction in another, no consistent workflow structure), which causes:
- inconsistent `opportunities` data quality,
- delays in publishing new opportunities,
- weak traceability when grant details change,
- brittle downstream drafting behavior due to missing step-level structure.

### Why this is a pipeline (not a single LLM call)
A staged ingestion pipeline is required for production reliability:
1. **Observability**: each stage emits SSE progress and artifacts (research, extraction, validation, write).
2. **Retryability**: failed stages can be retried independently (e.g., scrape timeout) without repeating successful work.
3. **Validation gates**: schema checks prevent malformed data from being written to DB.
4. **Model specialization**: use the right model per stage (Gemini Flash for research/extraction; Claude Sonnet for workflow synthesis).
5. **Controlled failure semantics**: preserve partial stage outputs and run telemetry even when terminal write fails.

---

## 2) Input / Output Contract

### TypeScript interfaces

```ts
export type IngestLocale = "en" | "es" | "km";

export type IngestStageName =
  | "researching"
  | "extracting"
  | "building_workflow"
  | "validating"
  | "writing";

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
  timestamp: string; // ISO-8601
  data?: Record<string, unknown>;
}

export interface IngestRunReport {
  ingestRunId: string;
  status: "success" | "partial_success" | "failed";
  startedAt: string; // ISO-8601
  endedAt: string; // ISO-8601
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
```

---

## 3) Pipeline Stages

> All stage files: `lib/agents/ingest/*`

### A) GrantResearchAgent
- **Agent name**: `GrantResearchAgent`
- **Model**: Gemini Flash + web search/scrape tooling
- **Input type**:

```ts
export interface GrantResearchInput {
  grantName: string;
  sourceUrl?: string;
}
```

- **Output type**:

```ts
export interface GrantResearchOutput {
  rawContent: string;
  sourceUrlsUsed: string[];
  scrapedAt: string; // ISO-8601
}
```

- **Failure behavior**:
  - Throws `ResearchError` when no usable source content is gathered.

```ts
export class ResearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchError";
  }
}
```

---

### B) GrantExtractionAgent
- **Agent name**: `GrantExtractionAgent`
- **Model**: Gemini Flash (structured output)
- **Input type**:

```ts
export interface GrantExtractionInput {
  rawContent: string;
}
```

- **Output type**:

```ts
export interface GrantExtractionOutput {
  extractedData: ExtractedGrantData;
  warnings: string[];
  isPartial: boolean;
}
```

- **Failure behavior**:
  - Never hard-throws for incomplete extraction.
  - Returns **partial extraction** with populated `warnings` and `isPartial: true`.

---

### C) WorkflowBuilderAgent
- **Agent name**: `WorkflowBuilderAgent`
- **Model**: Claude Sonnet
- **Input type**:

```ts
export interface WorkflowBuilderInput {
  extractedData: ExtractedGrantData;
  locale: IngestLocale;
}
```

- **Output type**:

```ts
export interface WorkflowBuilderOutput {
  steps: WorkflowStep[];
}
```

- **Failure behavior**:
  - Throws `WorkflowBuildError` on unusable/invalid workflow output.

```ts
export class WorkflowBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowBuildError";
  }
}
```

---

### D) SchemaValidatorAgent
- **Agent name**: `SchemaValidatorAgent`
- **Model**: none (pure Zod validation)
- **Input type**:

```ts
import type { ZodError } from "zod";

export interface SchemaValidatorInput {
  extractedData: ExtractedGrantData;
  workflowSteps: WorkflowStep[];
}
```

- **Output type**:

```ts
export interface SchemaValidatorOutput {
  valid: boolean;
  errors: ZodError[];
  warnings: string[];
}
```

- **Failure behavior**:
  - **Never throws**.
  - Always returns validation result with `valid`, `errors`, and `warnings`.

---

### E) IngestionWriterAgent
- **Agent name**: `IngestionWriterAgent`
- **Model**: none (Supabase service role client)
- **Input type**:

```ts
export interface IngestionWriterInput {
  extractedData: ExtractedGrantData;
  workflowSteps: WorkflowStep[];
  ingestRunId: string;
  locale: IngestLocale;
}
```

- **Output type**:

```ts
export interface IngestionWriterOutput {
  opportunityId: string;
  workflowDefinitionId: string;
}
```

- **Failure behavior**:
  - Throws `IngestionWriteError` on DB write failure.
  - Must rollback if partial write occurs (transaction/RPC strategy).

```ts
export class IngestionWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionWriteError";
  }
}
```

---

## 4) Data Schemas

### 4.1 SQL DDL

```sql
-- supabase/migrations/002_grant_ingest.sql

-- 1) Extend opportunities
alter table public.opportunities
  add column if not exists source_url text,
  add column if not exists raw_content text,
  add column if not exists ingest_run_id uuid,
  add column if not exists application_url text,
  add column if not exists contact_email text,
  add column if not exists required_documents text[] not null default array[]::text[],
  add column if not exists application_window_start date,
  add column if not exists application_window_end date,
  add column if not exists award_type text,
  add column if not exists matching_tags text[] not null default array[]::text[];

-- 2) ingest_runs
create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  grant_name text not null,
  source_url text,
  status text not null check (status in ('running', 'success', 'partial_success', 'failed')),
  stage_durations_ms jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  warnings text[] not null default array[]::text[],
  sources_used text[] not null default array[]::text[],
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- 3) workflow_definitions
create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  version int not null default 1,
  steps jsonb not null,
  locale text not null check (locale in ('en', 'es', 'km')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) Indexes
create index if not exists workflow_definitions_opportunity_id_idx
  on public.workflow_definitions(opportunity_id);

create index if not exists opportunities_active_matching_tags_gin_idx
  on public.opportunities using gin (matching_tags)
  where is_active = true;

create index if not exists opportunities_is_active_idx
  on public.opportunities(is_active);

-- 5) RLS policies
alter table public.workflow_definitions enable row level security;
alter table public.ingest_runs enable row level security;

-- workflow_definitions: readable by active app users (paired with active opportunity)
create policy "workflow_definitions_select_active"
on public.workflow_definitions
for select
using (
  exists (
    select 1
    from public.opportunities o
    where o.id = workflow_definitions.opportunity_id
      and o.is_active = true
  )
);

-- ingest_runs: service role only (no end-user access)
create policy "ingest_runs_no_user_select"
on public.ingest_runs
for select
using (false);

create policy "ingest_runs_no_user_insert"
on public.ingest_runs
for insert
with check (false);

create policy "ingest_runs_no_user_update"
on public.ingest_runs
for update
using (false)
with check (false);
```

> Note: service role bypasses RLS by design in Supabase, satisfying “service-role only” access for ingestion writes.

---

### 4.2 TypeScript types

```ts
export type OpportunityType = "grant" | "loan" | "benefit";
export type WorkflowStepType =
  | "info_collection"
  | "document_upload"
  | "narrative_draft"
  | "review"
  | "submission";

export interface WorkflowStep {
  id: string;
  stepType: WorkflowStepType;
  order: number;
  title: string;
  description: string;
  requiredDocuments?: string[];
  inputPrompt?: string;
  validationRules?: string[];
  isOptional: boolean;
}

export interface ExtractedGrantData {
  // Core grant identity
  name: string;
  funder: string;
  type: OpportunityType;
  description: string;

  // Financial + date windows
  amountMin: number | null;
  amountMax: number | null;
  deadline: string | null; // ISO date/time if known
  applicationWindowStart: string | null; // YYYY-MM-DD
  applicationWindowEnd: string | null; // YYYY-MM-DD
  awardType: string | null;

  // Eligibility + targeting
  eligibilityRules: Record<string, unknown>;
  geographicScope: string | null;
  languagesAvailable: string[];
  matchingTags: string[];

  // Application metadata
  sourceUrl: string | null;
  rawContent: string;
  applicationUrl: string | null;
  contactEmail: string | null;
  requiredDocuments: string[];
}

// Existing OpportunityRecord baseline + new ingest columns
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
```

---

### 4.3 Zod schemas

```ts
import { z } from "zod";

export const IngestGrantRequestSchema = z.object({
  grantName: z.string().min(1).max(200),
  sourceUrl: z.string().url().optional(),
  locale: z.enum(["en", "es", "km"]).optional(),
  localeHints: z.array(z.string()).optional(),
  adminSecret: z.string().min(1)
});

export const ExtractedGrantDataSchema = z.object({
  name: z.string().min(1),
  funder: z.string().min(1),
  type: z.enum(["grant", "loan", "benefit"]),
  description: z.string().min(1),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  deadline: z.string().nullable(),
  applicationWindowStart: z.string().nullable(),
  applicationWindowEnd: z.string().nullable(),
  awardType: z.string().nullable(),
  eligibilityRules: z.record(z.unknown()),
  geographicScope: z.string().nullable(),
  languagesAvailable: z.array(z.string()),
  matchingTags: z.array(z.string()),
  sourceUrl: z.string().url().nullable(),
  rawContent: z.string().min(1),
  applicationUrl: z.string().url().nullable(),
  contactEmail: z.string().email().nullable(),
  requiredDocuments: z.array(z.string())
});

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  stepType: z.enum([
    "info_collection",
    "document_upload",
    "narrative_draft",
    "review",
    "submission"
  ]),
  order: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  requiredDocuments: z.array(z.string()).optional(),
  inputPrompt: z.string().optional(),
  validationRules: z.array(z.string()).optional(),
  isOptional: z.boolean()
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  opportunity_id: z.string().uuid(),
  version: z.number().int().min(1).default(1),
  steps: z.array(WorkflowStepSchema).min(1),
  locale: z.enum(["en", "es", "km"]),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});
```

---

## 5) API Surface

### Route
- **Method/Path**: `POST /api/admin/ingest-grant`
- **File**: `app/api/admin/ingest-grant/route.ts`
- **Transport**: `text/event-stream`

### Auth behavior

```ts
if (body.adminSecret !== process.env.ADMIN_SECRET) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
}
```

### Required SSE event order
`researching` → `extracting` → `building_workflow` → `validating` → `writing` → `done`

On failure at any stage, emit `error` as terminal event (after emitting completed prior stages).

### SSE payload shapes (exact examples)

#### researching
```json
{
  "ingestRunId": "2f703940-3e1f-49b3-a60f-5dba76c8ef0f",
  "stage": "researching",
  "status": "succeeded",
  "data": {
    "sourceUrlsUsed": ["https://example.org/grants/abc"],
    "scrapedAt": "2026-03-14T13:40:00.000Z"
  },
  "message": "Research complete"
}
```

#### extracting
```json
{
  "ingestRunId": "2f703940-3e1f-49b3-a60f-5dba76c8ef0f",
  "stage": "extracting",
  "status": "succeeded",
  "data": {
    "warnings": [],
    "isPartial": false,
    "fieldCount": 18
  },
  "message": "Extraction complete"
}
```

#### building_workflow
```json
{
  "ingestRunId": "2f703940-3e1f-49b3-a60f-5dba76c8ef0f",
  "stage": "building_workflow",
  "status": "succeeded",
  "data": {
    "stepsCount": 6,
    "locale": "en"
  },
  "message": "Workflow generated"
}
```

#### validating
```json
{
  "ingestRunId": "2f703940-3e1f-49b3-a60f-5dba76c8ef0f",
  "stage": "validating",
  "status": "succeeded",
  "data": {
    "valid": true,
    "warnings": []
  },
  "message": "Schema validation passed"
}
```

#### writing
```json
{
  "ingestRunId": "2f703940-3e1f-49b3-a60f-5dba76c8ef0f",
  "stage": "writing",
  "status": "succeeded",
  "data": {
    "opportunityId": "f592ff84-9199-403f-8e7c-5fc7f12df611",
    "workflowDefinitionId": "f9bd71fc-3520-4ef5-a8d1-fac6f8087d3e"
  },
  "message": "Database upsert complete"
}
```

#### done
```json
{
  "ingestRunId": "2f703940-3e1f-49b3-a60f-5dba76c8ef0f",
  "stage": "done",
  "status": "succeeded",
  "data": {
    "result": "success"
  },
  "message": "Grant ingest completed"
}
```

#### error
```json
{
  "ingestRunId": "2f703940-3e1f-49b3-a60f-5dba76c8ef0f",
  "stage": "error",
  "status": "failed",
  "data": {
    "failedStage": "writing",
    "errorName": "IngestionWriteError",
    "errorMessage": "Failed to insert workflow_definitions"
  },
  "message": "Grant ingest failed"
}
```

### Partial-failure behavior
- Any succeeded stage event remains emitted and recorded.
- If later stage fails, API still emits `error` with prior stage successes preserved.
- `ingest_runs.status` becomes `partial_success` when a DB partial write required rollback handling but earlier processing artifacts are retained.

---

## 6) Parallel Workstreams

### A) DB Migration
- **Files**:
  - `supabase/migrations/002_grant_ingest.sql`
- **Depends on**: nothing
- **Provides**:
  - extended `opportunities` schema,
  - `ingest_runs`,
  - `workflow_definitions`,
  - indexes + RLS.

### B) Types & Zod Schemas
- **Files**:
  - `lib/ingest/types.ts`
  - `lib/ingest/schemas.ts`
- **Depends on**: nothing (foundational)
- **Provides**:
  - all shared TS contracts,
  - runtime schemas for request + extraction + workflow validation.

### C) Agent Implementations
- **Files**:
  - `lib/agents/ingest/grant-research-agent.ts`
  - `lib/agents/ingest/grant-extraction-agent.ts`
  - `lib/agents/ingest/workflow-builder-agent.ts`
  - `lib/agents/ingest/schema-validator-agent.ts`
  - `lib/agents/ingest/ingestion-writer-agent.ts`
- **Depends on**:
  - **B** (types/schemas)
- **Provides**:
  - executable pipeline stages with typed inputs/outputs and explicit failures.

### D) API Route
- **Files**:
  - `app/api/admin/ingest-grant/route.ts`
- **Depends on**:
  - **B** (request/result types)
  - **C** (agents)
  - Can be scaffolded first and filled in as C lands.
- **Provides**:
  - authenticated SSE ingest endpoint,
  - pipeline orchestration,
  - stage event streaming,
  - terminal success/error output.

---

## 7) Integration Points

### 7.1 Opportunity retrieval path
Ingested grants land in `public.opportunities` and are marked active.
Existing `opportunityRetrievalAgent` already selects active opportunities from this table, so ingested grants are discoverable with **zero changes**.

### 7.2 Workflow consumption path
Add helper:
- `lib/ingest/get-workflow-for-opportunity.ts`

```ts
export async function getWorkflowForOpportunity(opportunityId: string): Promise<WorkflowDefinitionRow | null>
```

Behavior:
- query `workflow_definitions` by `opportunity_id`, highest `version`, locale preference fallback (`requested locale` → `en`).
- pass resulting `steps` to draft/question planning pipeline.

### 7.3 Admin triggers
#### cURL (immediate)
```bash
curl -N -X POST http://localhost:3000/api/admin/ingest-grant \
  -H "Content-Type: application/json" \
  -d '{
    "grantName": "California Dream Fund",
    "sourceUrl": "https://example.org/grants/california-dream-fund",
    "locale": "en",
    "localeHints": ["en", "es"],
    "adminSecret": "'$ADMIN_SECRET'"
  }'
```

#### Future admin UI hook
- Planned page: `/admin` ingest panel with grant-name + optional source URL form.
- Calls same API route and renders SSE timeline.

### 7.4 Environment
Add to `.env.example`:

```env
ADMIN_SECRET=replace-with-long-random-secret
```

---

## Appendix: Proposed file map

```txt
supabase/migrations/002_grant_ingest.sql
lib/ingest/types.ts
lib/ingest/schemas.ts
lib/ingest/get-workflow-for-opportunity.ts
lib/agents/ingest/grant-research-agent.ts
lib/agents/ingest/grant-extraction-agent.ts
lib/agents/ingest/workflow-builder-agent.ts
lib/agents/ingest/schema-validator-agent.ts
lib/agents/ingest/ingestion-writer-agent.ts
app/api/admin/ingest-grant/route.ts
```

This spec is implementation-ready and aligned with the existing Next.js 14 + TypeScript + Supabase architecture.
