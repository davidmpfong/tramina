import crypto from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { grantHunterAgent } from "@/lib/agents/grant-hunter-agent";
import type { GrantCandidate } from "@/lib/agents/grant-hunter-agent";
import { supabaseServerService } from "@/lib/supabase/server";

export const runtime = "nodejs";

const HuntGrantsRequestSchema = z.object({
  adminSecret: z.string().min(1),
  audience: z.string().min(1).max(500).default("immigrant-owned small businesses in Massachusetts"),
  geography: z.string().min(1).max(200).default("Lynn, Massachusetts"),
  industries: z.array(z.string()).max(10).optional(),
  maxCandidates: z.number().int().min(1).max(50).optional().default(10)
});

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

  const parsed = HuntGrantsRequestSchema.safeParse(body);
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("started", {
          message: "Grant hunt started",
          context: {
            audience: parsed.data.audience,
            geography: parsed.data.geography,
            industries: parsed.data.industries ?? [],
            maxCandidates: parsed.data.maxCandidates
          },
          timestamp: new Date().toISOString()
        });

        const result = await grantHunterAgent({
          audience: parsed.data.audience,
          geography: parsed.data.geography,
          industries: parsed.data.industries,
          maxCandidates: parsed.data.maxCandidates
        });

        // Stream each candidate as it's scored
        for (const candidate of result.candidates) {
          send("candidate", {
            ...candidate,
            timestamp: new Date().toISOString()
          });
        }

        // Summary
        const summary = {
          total: result.candidates.length,
          ingestReady: result.candidates.filter((c: GrantCandidate) => c.recommendation === "INGEST_READY").length,
          reviewNeeded: result.candidates.filter((c: GrantCandidate) => c.recommendation === "REVIEW_NEEDED").length,
          skip: result.candidates.filter((c: GrantCandidate) => c.recommendation === "SKIP").length,
          topCandidates: result.candidates
            .filter((c: GrantCandidate) => c.recommendation === "INGEST_READY")
            .slice(0, 5)
            .map((c: GrantCandidate) => ({ name: c.name, score: c.totalScore, applicationUrl: c.applicationUrl }))
        };

        send("done", {
          message: "Grant hunt complete",
          summary,
          huntedAt: result.huntedAt,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : "Hunt failed",
          timestamp: new Date().toISOString()
        });
      } finally {
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
