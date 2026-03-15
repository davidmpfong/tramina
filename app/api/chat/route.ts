import { NextRequest } from "next/server";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { supabaseServerAnon, supabaseServerService } from "@/lib/supabase/server";
import { opportunityRetrievalAgent } from "@/lib/agents/opportunity-retrieval-agent";
import { eligibilityRankingAgent } from "@/lib/agents/eligibility-ranking-agent";
import { checkRateLimit } from "@/lib/rateLimit";
import { sanitizeForPrompt } from "@/lib/sanitize";
import type { ChatResponseChunk, CollectedField, WorkflowStep } from "@/lib/chat/types";
export const runtime = "nodejs";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1)
});

const workflowStepSchema = z.object({
  id: z.string(),
  stepType: z.string(),
  order: z.number(),
  title: z.string(),
  description: z.string(),
  inputPrompt: z.string().optional(),
  isOptional: z.boolean()
});

const collectedFieldSchema = z.object({
  stepId: z.string(),
  stepTitle: z.string(),
  prompt: z.string(),
  answer: z.string()
});

const chatRequestSchema = z.object({
  messages: z.array(messageSchema),
  phase: z.enum(["greeting", "matching", "selection", "collection", "review", "done"]),
  locale: z.enum(["en", "es", "km"]),
  selectedOpportunityId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  currentStepIndex: z.number().int().min(0).optional().default(0),
  collectedFields: z.array(collectedFieldSchema).optional(),
  workflowSteps: z.array(workflowStepSchema).optional(),
  initialContext: z.string().optional()
});
const WELCOME_BY_LOCALE: Record<"en" | "es" | "km", string> = {
  en: "Hello! I’m your assistant for finding grants and funding for your business. Let me find the best opportunities for you.",
  es: "¡Hola! Soy tu asistente para encontrar subvenciones y fondos para tu negocio. Déjame encontrar las mejores oportunidades para ti.",
  km: "សួស្តី! ខ្ញុំជាជំនួយការរបស់អ្នកសម្រាប់ស្វែងរកជំនួយឥតសំណង និងថវិកាសម្រាប់អាជីវកម្មរបស់អ្នក។"
};

const SELECT_PROMPT: Record<"en" | "es" | "km", string> = {
  en: "You can select an opportunity by name, or ask me questions so I can help you decide.",
  es: "Puedes seleccionar una oportunidad por nombre o hacerme preguntas para ayudarte a decidir.",
  km: "អ្នកអាចជ្រើសឱកាសតាមឈ្មោះ ឬសួរខ្ញុំសំណួរដើម្បីជួយសម្រេចចិត្ត។"
};

const NO_STEPS: Record<"en" | "es" | "km", string> = {
  en: "I could not find application steps for this opportunity. Let's move to review.",
  es: "No encontré pasos de solicitud para esta oportunidad. Pasemos al resumen.",
  km: "ខ្ញុំមិនបានរកឃើញជំហានដាក់ពាក្យសម្រាប់ឱកាសនេះទេ។ យើងទៅសង្ខេប។"
};

const LANGUAGE_NAME_BY_LOCALE: Record<"en" | "es" | "km", string> = {
  en: "English",
  es: "Spanish",
  km: "Khmer (Cambodian)"
};
function toDeadlineText(deadline: string | null, locale: "en" | "es" | "km") {
  if (!deadline) {
    return null;
  }

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return deadline;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getLastUserMessage(messages: { role: "user" | "assistant"; content: string }[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      return messages[i]?.content ?? "";
    }
  }

  return "";
}

async function streamModelText(
  model: ChatGoogleGenerativeAI,
  prompt: string,
  onChunk: (text: string) => void
) {
  const stream = await model.stream(prompt);
  for await (const chunk of stream) {
    const text = chunk.content?.toString() ?? "";
    if (text) {
      onChunk(text);
    }
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { data: authData } = await supabaseServerAnon.auth.getUser(token);
  if (!authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Rate limit: 30 requests per minute per user
  const allowed = await checkRateLimit(`chat:${authData.user.id}`, 30, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    });
  }

  const body = await req.json();
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash-lite"
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendChunk = (chunk: ChatResponseChunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      try {
        const {
          phase,
          locale,
          userId,
          messages,
          selectedOpportunityId,
          workflowSteps = [],
          currentStepIndex = 0,
          collectedFields = [],
          initialContext
        } = parsed.data;
        if (phase === "greeting") {
          const safeCtx = initialContext ? sanitizeForPrompt(initialContext, 300) : null;
          const welcomeMsg = WELCOME_BY_LOCALE[locale] + (safeCtx ? ` ${safeCtx}` : "");
          sendChunk({ type: "text", content: welcomeMsg });
          const profileResult = supabaseServerService
            ? await supabaseServerService
                .from("business_profiles")
                .select("industry,is_artist,years_in_business,zip_code")
                .eq("user_id", userId)
                .maybeSingle()
            : { data: null };

          const profile = profileResult.data;

          const retrieved = await opportunityRetrievalAgent({
            userId,
            zipCode: profile?.zip_code ?? undefined
          });

          const ranked = await eligibilityRankingAgent({
            opportunities: retrieved.opportunities,
            userProfile: {
              industry: profile?.industry ?? undefined,
              is_artist: profile?.is_artist ?? undefined,
              years_in_business: profile?.years_in_business ?? undefined
            }
          });

          const topRanked = ranked.ranked.slice(0, 3);
          const ids = topRanked.map((item) => item.id);

          let detailsById = new Map<string, { funder: string; description: string; deadline_text: string | null }>();

          if (supabaseServerService && ids.length > 0) {
            const { data: detailedRows } = await supabaseServerService
              .from("opportunities")
              .select("id,funder,description,deadline")
              .in("id", ids);

            detailsById = new Map(
              (detailedRows ?? []).map((row) => [
                row.id,
                {
                  funder: row.funder ?? "",
                  description: row.description ?? "",
                  deadline_text: toDeadlineText(row.deadline ?? null, locale)
                }
              ])
            );
          }

          const opportunities = topRanked.map((item) => {
            const details = detailsById.get(item.id);
            return {
              id: item.id,
              name: item.name,
              funder: details?.funder ?? "",
              type: item.type,
              description: details?.description ?? "",
              amount_min: item.amount_min,
              amount_max: item.amount_max,
              deadline: item.deadline,
              deadline_text: details?.deadline_text ?? toDeadlineText(item.deadline, locale),
              score: item.score
            };
          });

          sendChunk({ type: "opportunities", opportunities });
          sendChunk({ type: "phase_change", phase: "matching" });
          sendChunk({ type: "done" });
          return;
        }

        if (phase === "matching") {
          const userMessage = getLastUserMessage(messages);
          const safeUserMessage = sanitizeForPrompt(userMessage);

          if (!userMessage) {
            sendChunk({
              type: "text",
              content: SELECT_PROMPT[locale]
            });
            sendChunk({ type: "done" });
            return;
          }
          const decisionPrompt = `Return strict JSON with this shape: {"intent":"selected"|"question","selectedOpportunityId":string|null}.\nThe user's language is ${LANGUAGE_NAME_BY_LOCALE[locale]}.\nUser message: ${safeUserMessage}\nKnown selectedOpportunityId (if any): ${selectedOpportunityId ?? "none"}`;
          const decisionRaw = await model.invoke(decisionPrompt);
          const decisionText = decisionRaw.content?.toString() ?? "";

          let intent: "selected" | "question" = "question";
          let selectedId: string | null = selectedOpportunityId ?? null;

          try {
            const parsedDecision = JSON.parse(decisionText) as {
              intent?: "selected" | "question";
              selectedOpportunityId?: string | null;
            };
            if (parsedDecision.intent === "selected" || parsedDecision.intent === "question") {
              intent = parsedDecision.intent;
            }
            if (typeof parsedDecision.selectedOpportunityId === "string") {
              selectedId = parsedDecision.selectedOpportunityId;
            }
          } catch {
            intent = selectedOpportunityId ? "selected" : "question";
          }

          if (intent === "selected" && selectedId) {
            const workflowRows = supabaseServerService
              ? await supabaseServerService
                  .from("workflow_definitions")
                  .select("steps")
                  .eq("opportunity_id", selectedId)
                  .order("version", { ascending: false })
                  .limit(1)
              : { data: null };

            const dbSteps = (workflowRows.data?.[0]?.steps as WorkflowStep[] | undefined) ?? [];
            sendChunk({ type: "workflow", workflowSteps: dbSteps });
            sendChunk({ type: "phase_change", phase: "collection" });
            sendChunk({ type: "done" });
            return;
          }

          const answerPrompt = `You are a helpful grants advisor. You MUST reply ONLY in ${LANGUAGE_NAME_BY_LOCALE[locale]}. Do not use any other language. Keep responses practical and warm.\nUser question: ${safeUserMessage}`;
          await streamModelText(model, answerPrompt, (text) => sendChunk({ type: "text", content: text }));
          sendChunk({ type: "phase_change", phase: "matching" });
          sendChunk({ type: "done" });
          return;
        }

        if (phase === "collection") {
          const totalSteps = workflowSteps.length;
          if (totalSteps === 0) {
            sendChunk({
              type: "text",
              content: NO_STEPS[locale]
            });
            sendChunk({ type: "phase_change", phase: "review" });
            sendChunk({ type: "done" });
            return;
          }
          const userMessage = getLastUserMessage(messages);
          let nextCollected = [...collectedFields];
          let nextIndex = currentStepIndex;

          if (userMessage && currentStepIndex < totalSteps) {
            const currentStep = workflowSteps[currentStepIndex];
            const alreadyCollected = collectedFields.some((field) => field.stepId === currentStep.id);

            if (!alreadyCollected) {
              const entry: CollectedField = {
                stepId: currentStep.id,
                stepTitle: currentStep.title,
                prompt: currentStep.inputPrompt ?? currentStep.description,
                answer: userMessage
              };
              nextCollected = [...collectedFields, entry];
              nextIndex = currentStepIndex + 1;
            }
          }

          if (nextIndex >= totalSteps) {
            sendChunk({ type: "phase_change", phase: "review" });
            sendChunk({ type: "done" });
            return;
          }

          const step = workflowSteps[nextIndex];
          sendChunk({ type: "workflow", workflowSteps });

          const stepPrompt = `You are guiding an immigrant entrepreneur through a grant application. You MUST reply ONLY in ${LANGUAGE_NAME_BY_LOCALE[locale]}. Do not use any other language. Ask one clear question for this step, and keep it supportive.\nStep title: ${step.title}\nStep description: ${step.description}\nPreferred input prompt: ${step.inputPrompt ?? ""}\nProgress: ${nextIndex + 1}/${totalSteps}`;
          await streamModelText(model, stepPrompt, (text) => sendChunk({ type: "text", content: text }));
          sendChunk({ type: "done" });
          return;
        }

        if (phase === "review") {
          const summaryInput = (parsed.data.collectedFields ?? [])
            .map((field) => `- ${field.stepTitle}: ${field.answer}`)
            .join("\n");

          const reviewPrompt = `Summarize this grant application information. You MUST write ONLY in ${LANGUAGE_NAME_BY_LOCALE[locale]}. Do not use any other language. Keep it concise and friendly.\n${summaryInput || "No answers collected yet."}`;
          await streamModelText(model, reviewPrompt, (text) => sendChunk({ type: "text", content: text }));
          sendChunk({ type: "phase_change", phase: "done" });
          sendChunk({ type: "done" });
          return;
        }

        sendChunk({ type: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        sendChunk({ type: "text", content: message });
        sendChunk({ type: "done" });
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
