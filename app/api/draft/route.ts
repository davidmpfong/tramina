import { NextRequest } from "next/server";
import { z } from "zod";
import { intakeLanguageAgent } from "@/lib/agents/intake-language-agent";
import { opportunityRetrievalAgent } from "@/lib/agents/opportunity-retrieval-agent";
import { eligibilityRankingAgent } from "@/lib/agents/eligibility-ranking-agent";
import { questionPlannerAgent } from "@/lib/agents/question-planner-agent";
import { draftComposerAgent } from "@/lib/agents/draft-composer-agent";
import { qaActionAgent } from "@/lib/agents/qa-action-agent";

export const runtime = "nodejs";

const draftRequestSchema = z.object({
  userId: z.string().uuid(),
  userText: z.string().min(5),
  locale: z.enum(["en", "es", "km"]).default("en")
});

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const body = await req.json();
  const parsed = draftRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const intake = await intakeLanguageAgent({
          userText: parsed.data.userText,
          preferredLocale: parsed.data.locale
        });
        controller.enqueue(encoder.encode(`event: intake\ndata: ${JSON.stringify(intake)}\n\n`));

        const retrieved = await opportunityRetrievalAgent({ userId: parsed.data.userId });
        controller.enqueue(
          encoder.encode(
            `event: opportunities\ndata: ${JSON.stringify({ count: retrieved.opportunities.length })}\n\n`
          )
        );

        const ranked = await eligibilityRankingAgent({
          opportunities: retrieved.opportunities,
          userProfile: {}
        });

        const questions = await questionPlannerAgent({ opportunities: ranked.ranked });
        controller.enqueue(encoder.encode(`event: questions\ndata: ${JSON.stringify(questions)}\n\n`));

        const selected = ranked.ranked[0];
        if (!selected) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "No opportunities found" })}\n\n`));
          controller.close();
          return;
        }

        const draft = await draftComposerAgent({
          selectedOpportunity: selected,
          userNarrative: parsed.data.userText,
          locale: intake.detectedLocale
        });

        const qa = await qaActionAgent({ draft: draft.draft });
        controller.enqueue(encoder.encode(`event: draft\ndata: ${JSON.stringify(qa)}\n\n`));
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`));
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
