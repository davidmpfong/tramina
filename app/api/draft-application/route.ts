import { NextRequest } from "next/server";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { supabaseServerAnon, supabaseServerService } from "@/lib/supabase/server";
import type { CollectedField } from "@/lib/chat/types";

export const runtime = "nodejs";

const collectedFieldSchema = z.object({
  stepId: z.string(),
  stepTitle: z.string(),
  prompt: z.string(),
  answer: z.string()
});

const draftApplicationRequestSchema = z.object({
  opportunityId: z.string().uuid(),
  collectedFields: z.array(collectedFieldSchema),
  locale: z.enum(["en", "es", "km"]),
  userId: z.string().uuid()
});

type DraftStreamChunk = {
  type: "text" | "done";
  content?: string;
};

type OpportunityDetails = {
  id: string;
  name: string;
  funder: string;
  application_url: string | null;
  contact_email: string | null;
  required_documents: string[] | null;
  deadline: string | null;
};

const LANGUAGE_NAME_BY_LOCALE: Record<"en" | "es" | "km", string> = {
  en: "English",
  es: "Spanish",
  km: "Khmer (Cambodian)"
};

function formatCollectedFields(collectedFields: CollectedField[]) {
  if (collectedFields.length === 0) {
    return "- No collected answers provided.";
  }

  return collectedFields
    .map(
      (field, index) =>
        `${index + 1}. Step: ${field.stepTitle}\nQuestion: ${field.prompt}\nAnswer: ${field.answer}`
    )
    .join("\n\n");
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

  const body = await req.json();
  const parsed = draftApplicationRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (parsed.data.userId !== authData.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!supabaseServerService) {
    return new Response(JSON.stringify({ error: "Server is missing service role configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const serviceClient = supabaseServerService;

  const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash-lite"
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendChunk = (chunk: DraftStreamChunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      try {
        const { opportunityId, collectedFields, locale } = parsed.data;

        const { data: opportunity, error } = await serviceClient
          .from("opportunities")
          .select("id,name,funder,application_url,contact_email,required_documents,deadline")
          .eq("id", opportunityId)
          .maybeSingle<OpportunityDetails>();

        if (error) {
          throw new Error(error.message);
        }

        if (!opportunity) {
          throw new Error("Opportunity not found");
        }

        const requiredDocuments = (opportunity.required_documents ?? []).filter(Boolean);

        const prompt = `You are creating a grant application draft document for a small business owner.\nYou MUST write ONLY in ${LANGUAGE_NAME_BY_LOCALE[locale]}.\n\nProduce a clear, submission-ready structured draft with these exact sections and ordering:\n1) Header\n2) Applicant Responses\n3) Next Steps\n4) Required Documents Checklist\n\nRules:\n- Keep the formatting readable with headings and bullet points.\n- Under Applicant Responses, list every collected field with the question and answer.\n- Under Next Steps, include where to submit, deadline if known, and contact info.\n- Under Required Documents Checklist, include unchecked checklist items.\n- If any value is unknown, write "Not provided".\n- Do not output JSON. Output plain formatted text only.\n\nOpportunity Details:\n- Opportunity name: ${opportunity.name || "Not provided"}\n- Funder: ${opportunity.funder || "Not provided"}\n- Application URL: ${opportunity.application_url || "Not provided"}\n- Deadline: ${opportunity.deadline || "Not provided"}\n- Contact email: ${opportunity.contact_email || "Not provided"}\n- Required documents: ${requiredDocuments.length > 0 ? requiredDocuments.join(", ") : "Not provided"}\n\nCollected applicant responses:\n${formatCollectedFields(collectedFields)}\n`;

        await streamModelText(model, prompt, (text) => sendChunk({ type: "text", content: text }));
        sendChunk({ type: "done" });
      } catch (errorCaught) {
        const message = errorCaught instanceof Error ? errorCaught.message : "Unknown error";
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
