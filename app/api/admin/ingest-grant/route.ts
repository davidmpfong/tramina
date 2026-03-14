import crypto from "crypto";
import { NextRequest } from "next/server";
import { grantExtractionAgent } from "@/lib/agents/ingest/grant-extraction-agent";
import { grantResearchAgent } from "@/lib/agents/ingest/grant-research-agent";
import { ingestionWriterAgent } from "@/lib/agents/ingest/ingestion-writer-agent";
import { schemaValidatorAgent } from "@/lib/agents/ingest/schema-validator-agent";
import { workflowBuilderAgent } from "@/lib/agents/ingest/workflow-builder-agent";
import { IngestGrantRequestSchema } from "@/lib/ingest/schemas";
import { IngestStageName } from "@/lib/ingest/types";
import { supabaseServerService } from "@/lib/supabase/server";

export const runtime = "nodejs";

type IngestStatus = "success" | "partial_success" | "failed";

type StreamEvent = {
  ingestRunId: string;
  stage: IngestStageName | "done" | "error";
  status: "started" | "succeeded" | "failed";
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  if (!supabaseServerService) {
    return new Response(JSON.stringify({ error: "Service role key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const parsed = IngestGrantRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret || parsed.data.adminSecret.length !== secret.length ||
    !crypto.timingSafeEqual(Buffer.from(parsed.data.adminSecret), Buffer.from(secret))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const ingestRunId = crypto.randomUUID();
  const locale = parsed.data.locale ?? "en";

  const { error: insertRunError } = await supabaseServerService.from("ingest_runs").insert({
    id: ingestRunId,
    grant_name: parsed.data.grantName,
    source_url: parsed.data.sourceUrl ?? null,
    status: "running"
  });

  if (insertRunError) {
    return new Response(JSON.stringify({ error: "Failed to initialize ingest run" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const stageDurations: Partial<Record<IngestStageName, number>> = {};
      const allWarnings: string[] = [];
      let sourceUrlsUsed: string[] = [];
      let finalStatus: IngestStatus | null = null;
      const stageEvents: StreamEvent[] = [];

      let failedStage: IngestStageName | null = null;
      let opportunityId: string | null = null;

      function emitEvent(eventName: string, payload: StreamEvent) {
        stageEvents.push(payload);
        controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
      }

      async function runStage<T>(
        stage: IngestStageName,
        startedMessage: string,
        run: () => Promise<{ result: T; data: Record<string, unknown>; message: string; warnings?: string[] }>
      ): Promise<T> {
        emitEvent(stage, {
          ingestRunId,
          stage,
          status: "started",
          message: startedMessage,
          timestamp: new Date().toISOString()
        });

        const t0 = Date.now();

        try {
          const { result, data, message, warnings } = await run();
          stageDurations[stage] = Date.now() - t0;

          if (warnings && warnings.length > 0) {
            allWarnings.push(...warnings);
          }

          emitEvent(stage, {
            ingestRunId,
            stage,
            status: "succeeded",
            message,
            timestamp: new Date().toISOString(),
            data
          });

          return result;
        } catch (error) {
          stageDurations[stage] = Date.now() - t0;
          failedStage = stage;

          const errorName = error instanceof Error ? error.name : "UnknownError";
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          emitEvent(stage, {
            ingestRunId,
            stage,
            status: "failed",
            message: `${stage} failed`,
            timestamp: new Date().toISOString(),
            data: {
              errorName,
              errorMessage
            }
          });

          throw error;
        }
      }

      try {
        const research = await runStage("researching", "Research started", async () => {
          const result = await grantResearchAgent({
            grantName: parsed.data.grantName,
            sourceUrl: parsed.data.sourceUrl
          });

          sourceUrlsUsed = result.sourceUrlsUsed;

          return {
            result,
            data: {
              sourceUrlsUsed: result.sourceUrlsUsed,
              scrapedAt: result.scrapedAt
            },
            message: "Research complete"
          };
        });

        const extraction = await runStage("extracting", "Extraction started", async () => {
          const result = await grantExtractionAgent({
            rawContent: research.rawContent
          });

          return {
            result,
            data: {
              warnings: result.warnings,
              isPartial: result.isPartial,
              fieldCount: Object.keys(result.extractedData).length
            },
            message: "Extraction complete",
            warnings: result.warnings
          };
        });

        const workflow = await runStage("building_workflow", "Workflow building started", async () => {
          const result = await workflowBuilderAgent({
            extractedData: extraction.extractedData,
            locale
          });

          return {
            result,
            data: {
              stepsCount: result.steps.length,
              locale
            },
            message: "Workflow generated"
          };
        });

        const validation = await runStage("validating", "Schema validation started", async () => {
          const result = await schemaValidatorAgent({
            extractedData: extraction.extractedData,
            workflowSteps: workflow.steps
          });

          if (!result.valid) {
            throw new Error(result.errors.join("; ") || "Schema validation failed");
          }

          return {
            result,
            data: {
              valid: result.valid,
              warnings: result.warnings
            },
            message: "Schema validation passed",
            warnings: result.warnings
          };
        });

        const writing = await runStage("writing", "Database write started", async () => {
          const result = await ingestionWriterAgent({
            extractedData: extraction.extractedData,
            workflowSteps: workflow.steps,
            ingestRunId,
            locale
          });

          opportunityId = result.opportunityId;

          return {
            result,
            data: {
              opportunityId: result.opportunityId,
              workflowDefinitionId: result.workflowDefinitionId
            },
            message: "Database upsert complete"
          };
        });

        finalStatus = validation.valid && writing.opportunityId ? "success" : "failed";

        emitEvent("done", {
          ingestRunId,
          stage: "done",
          status: "succeeded",
          message: "Grant ingest completed",
          timestamp: new Date().toISOString(),
          data: {
            result: "success"
          }
        });
      } catch (error) {
        finalStatus = "failed";

        const errorName = error instanceof Error ? error.name : "UnknownError";
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const failedStageName: string = failedStage ?? "researching";
        const errorData: Record<string, unknown> = {
          failedStage: failedStageName,
          errorName,
          errorMessage
        };

        if (failedStage === "writing") {
          errorData.partial = true;
          if (opportunityId) {
            errorData.opportunityId = opportunityId;
            finalStatus = "partial_success";
          }
        }

        emitEvent("error", {
          ingestRunId,
          stage: "error",
          status: "failed",
          message: "Grant ingest failed",
          timestamp: new Date().toISOString(),
          data: errorData
        });
      } finally {
        await supabaseServerService
          ?.from("ingest_runs")
          .update({
            status: finalStatus ?? "success",
            ended_at: new Date().toISOString(),
            stage_durations_ms: stageDurations,
            events: stageEvents,
            warnings: allWarnings,
            sources_used: sourceUrlsUsed
          })
          .eq("id", ingestRunId);

        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
