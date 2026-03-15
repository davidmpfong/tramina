# Tramina — Technical Specification (v2)

## 1. Product Overview

Tramina is a B2C platform for immigrant entrepreneurs in the United States.

### Core product goals
- Help users discover relevant grants and loans.
- Explain eligibility clearly in plain language.
- Guide users through application workflows conversationally, step by step.

### Primary audience
- Immigrant-owned small businesses in the US.
- Multilingual users, especially:
  - Spanish speakers
  - Khmer speakers
  - English speakers

### Production deployment
- Live URL: **https://tramina.vercel.app**

---

## 2. Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: Tailwind CSS
- **Database/Auth**: Supabase (Postgres + Auth + RLS)
- **LLM**: Google Gemini 2.5 Flash Lite (all LLM-backed flows)
- **Internationalization**: next-intl (`en`, `es`, `km`)
- **Hosting/Deployment**: Vercel

---

## 3. Architecture: Grant Ingest Engine

The Grant Ingest Engine is a 5-agent pipeline that transforms an admin-provided grant name into a normalized opportunity + workflow definition in Supabase.

### Pipeline stages

1. **Research Agent**
   - Performs web research and source gathering.
   - Produces normalized raw grant corpus and source metadata.

2. **Extraction Agent**
   - Converts raw content into structured grant fields.
   - Outputs typed grant data (amounts, deadlines, eligibility, docs, links).

3. **WorkflowBuilder Agent**
   - Generates the ordered end-user application workflow.
   - Produces `WorkflowStep[]` in canonical step format.

4. **Validator Agent**
   - Validates extraction and workflow outputs against schemas.
   - Returns structured errors/warnings for ingestion reporting.

5. **Writer Agent**
   - Upserts to `opportunities`, `workflow_definitions`, and `ingest_runs`.
   - Returns final persisted IDs.

### WorkflowStepType enum

```ts
export type WorkflowStepType =
  | "info_collection"
  | "document_upload"
  | "document_extract"
  | "narrative_draft"
  | "review"
  | "submission";
```

### `document_extract` step behavior
- `document_extract` steps include:

```ts
extractFields: string[];
```

- `extractFields` contains the exact field names to extract from user-provided document images.
- Extraction is performed by Gemini Vision in `/api/extract-document`.
- Returned fields are used to auto-fill answers in the chat collection phase.

### Localization strategy for steps
- Workflow steps are **always stored in English** in `workflow_definitions.steps`.
- `workflow_definitions.locale` is retained as **metadata only** (for audit/traceability).
- Runtime user-localization occurs later (chat engine display layer).

### Admin ingestion API
- Route: `POST /api/admin/ingest-grant`
- Transport: SSE (stage-by-stage progress)
- Auth: `adminSecret` compared against `ADMIN_SECRET`

---

## 4. Architecture: Chat Flow Engine

The conversational application flow is SSE-driven and phase-based.

### Phase model
The flow operates with 6 phases:
1. `greeting`
2. `matching`
3. `collection`
4. `review`
5. `done`
6. `error` (terminal failure phase)

> Product journey is typically summarized as: `greeting → matching → collection → review → done`.

### Phase details

#### 4.1 greeting
- Loads user profile + business context.
- Retrieves/ranks opportunities.
- Returns top 3 opportunities as cards for user selection.

#### 4.2 matching
- If `selectedOpportunityId` is present:
  - skip LLM intent detection,
  - fetch workflow from DB,
  - localize workflow steps,
  - transition directly to `collection`.

#### 4.3 collection
Collection UX adapts by `stepType`:

1. **`info_collection` / `narrative_draft`**
   - Text-input mode.
   - LLM asks guided questions in user locale.

2. **`document_upload`**
   - Checklist mode using `requiredDocuments`.
   - User confirms uploaded/provided documents through UI action.

3. **`document_extract`**
   - Camera/file picker mode.
   - Image is posted to `/api/extract-document`.
   - Gemini Vision extracts `extractFields`.
   - Extracted values auto-fill the corresponding answer fields.

#### 4.4 review
- LLM produces a concise summary in the user’s locale.
- User confirms final state before completion handoff.

#### 4.5 done
- Flow closes with persisted progress state and next-step guidance.

### Localization in chat flow
- Stored workflow steps are English-only.
- `localizeSteps()` translates step text at display time for non-English locales.
- Translation strategy:
  - Single batched Gemini call per workflow load.
  - No-op for English users.

### Rate limiting
- LLM-backed chat routes enforce **30 requests/minute per user** via Redis.

### Authentication
- Every request requires a valid Supabase JWT.

---

## 5. Architecture: Document Extraction (`/api/extract-document`)

### Endpoint contract
- Method: `POST`
- Content type: `multipart/form-data`
- Required parts:
  - `image` (file)
  - `fields` (JSON string array)
  - `documentType` (string)

### Processing
- Gemini Vision reads the image ephemerally in-memory.
- Image content is **never persisted**.

### Response

```ts
{
  extracted: Record<string, string | null>
}
```

### Constraints
- Max file size: **10MB**
- Auth required (Supabase JWT)

---

## 6. Security

### Route protection
- All API routes require Supabase JWT authentication.
- Admin routes additionally require `ADMIN_SECRET`.

### Admin secret verification
- Secret comparison uses **timing-safe comparison** to reduce side-channel leakage risk.

### Abuse prevention
- Rate limiting enabled on LLM-backed routes.

### Input hardening
- Prompt/input sanitization and validation helpers:
  - `sanitizeForPrompt()`
  - `validateSourceUrl()`
  - `sanitizeRawContent()`

### Data-layer security
- Supabase RLS enabled for all user-facing tables.
- Middleware validates sessions server-side using `@supabase/ssr`.
- Supabase service-role key is server-only and never exposed client-side.

---

## 7. Database Schema

Key tables in current architecture:

1. **`users`**
   - User identity + language preference.

2. **`business_profiles`**
   - Business context for matching (industry, revenue, employee count, location, ownership flags).

3. **`opportunities`**
   - Canonical grant/loan records used for retrieval and ranking.

4. **`workflow_definitions`**
   - Workflow templates linked to opportunities.
   - `steps` is JSONB containing `WorkflowStep[]`.
   - Steps are stored **always in English**.

5. **`ingest_runs`**
   - Ingestion observability table (status, events, warnings, source provenance, timing).

### Schema note
- `workflow_definitions.locale` is retained for metadata/reporting; runtime language rendering is done during retrieval/localization.

---

## 8. Internationalization

### Supported locales
- `en`
- `es`
- `km`

### i18n architecture
- `next-intl` handles UI string catalogs and locale routing.
- Workflow definitions are stored in English and translated on read.

### Workflow localization
- `localizeSteps()` handles step translation for non-English sessions.
- English locale bypasses translation.

### LLM output language control
- Prompts include explicit locale instruction so generated responses stay in the user’s language.

---

## 9. Testing

### End-to-end chat test
- Script: `scripts/test-chat.ts`
- Scope: validates full flow `greeting → matching → collection → review`.

### Seeded test user
- Email: `testuser@tramina.dev`
- Profile: restaurant in Lynn, MA; 2 years in business; 3 employees.

### Run command

```bash
SUPABASE_URL=... TEST_EMAIL=... TEST_PASSWORD=... npx tsx scripts/test-chat.ts
```

---

## 10. What's Not Yet Built (Backlog)

1. Application draft generation (PDF/email output after review phase).
2. Upsert strategy fix: `workflow_definitions` upsert should replace steps instead of preserving old ones.
3. Waitlist / user acquisition flow on landing page.
4. SMS/WhatsApp notification channel.
5. Admin dashboard for grant management.
6. Application status tracking for users (view in-progress applications).
7. Eligibility pre-screening before showing grants (short pre-qualification questions).
8. More grants ingested beyond the initial 3.
9. Localization of opportunity card names/descriptions (currently only workflow step text is localized).

---

## Operational Notes

- The v2 system intentionally separates **stored canonical workflow** (English, deterministic) from **runtime localized experience** (user-locale rendering).
- SSE is used for both ingest and chat orchestration to provide transparent progress and robust client UX.
- The ingestion and chat engines share the same opportunity/workflow substrate, enabling fast publication of newly ingested grants into matching.
