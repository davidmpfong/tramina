/* eslint-disable no-console */

type ChatPhase = "greeting" | "matching" | "selection" | "collection" | "review" | "done";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
};

type CollectedField = {
  stepId: string;
  stepTitle: string;
  prompt: string;
  answer: string;
};

type WorkflowStep = {
  id: string;
  stepType: string;
  order: number;
  title: string;
  description: string;
  inputPrompt?: string;
  isOptional: boolean;
};

type MatchedOpportunity = {
  id: string;
  name: string;
  funder: string;
  type: string;
  description: string;
  amount_min: number | null;
  amount_max: number | null;
  deadline: string | null;
  deadline_text: string | null;
  score: number;
};

type ChatRequestBody = {
  messages: ChatMessage[];
  phase: ChatPhase;
  locale: "en" | "es" | "km";
  selectedOpportunityId?: string;
  workflowSteps?: WorkflowStep[];
  currentStepIndex?: number;
  collectedFields?: CollectedField[];
  userId: string;
};

type ChatResponseChunk = {
  type: "text" | "phase_change" | "opportunities" | "workflow" | "done";
  content?: string;
  phase?: ChatPhase;
  opportunities?: MatchedOpportunity[];
  workflowSteps?: WorkflowStep[];
};

type SupabasePasswordAuthResponse = {
  access_token?: string;
  token_type?: string;
  user?: { id?: string };
  error?: string;
  error_description?: string;
};

export {};

const BASE_URL = process.env.BASE_URL ?? "https://tramina.vercel.app";
const BYPASS_TOKEN = process.env.BYPASS_TOKEN ?? "Ebf916hL4CtthHhWr1tYHyoSRz6rNMLl";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

function parseJwtSub(token: string): string | null {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) {
      return null;
    }

    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payloadJson = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(payloadJson) as { sub?: string };

    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function makeMessage(role: "assistant" | "user", content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date().toISOString()
  };
}

async function signInWithPassword(): Promise<{ accessToken: string; userId: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      "Missing required env vars. Please set SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD."
    );
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    })
  });

  const authJson = (await response.json()) as SupabasePasswordAuthResponse;

  if (!response.ok || !authJson.access_token) {
    throw new Error(
      `Supabase sign-in failed (${response.status}): ${JSON.stringify(authJson, null, 2)}`
    );
  }

  const accessToken = authJson.access_token;
  const userId =
    process.env.TEST_USER_ID ?? authJson.user?.id ?? parseJwtSub(accessToken) ?? "";

  if (!userId) {
    throw new Error(
      "Could not determine userId. Set TEST_USER_ID env var or ensure token contains sub/user.id."
    );
  }

  return { accessToken, userId };
}

async function chatRequest(payload: ChatRequestBody, token: string): Promise<ChatResponseChunk[]> {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-vercel-protection-bypass": BYPASS_TOKEN,
      "x-vercel-set-bypass-cookie": "true"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "<no body>");
    throw new Error(
      `Chat request failed (${response.status}) for phase=${payload.phase}. Body: ${text}`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: ChatResponseChunk[] = [];
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        continue;
      }

      const raw = dataLine.slice("data: ".length).trim();
      if (!raw) {
        continue;
      }

      let parsed: ChatResponseChunk;
      try {
        parsed = JSON.parse(raw) as ChatResponseChunk;
      } catch (error) {
        throw new Error(`Failed parsing SSE data JSON: ${raw}. Error: ${String(error)}`);
      }

      chunks.push(parsed);
      console.log("[chunk]", JSON.stringify(parsed));
    }
  }

  return chunks;
}

function requireOpportunities(chunks: ChatResponseChunk[]): MatchedOpportunity[] {
  const opportunitiesChunk = chunks.find(
    (chunk) => chunk.type === "opportunities" && Array.isArray(chunk.opportunities)
  );

  if (!opportunitiesChunk?.opportunities) {
    throw new Error(
      `Expected opportunities chunk, got: ${JSON.stringify(chunks, null, 2)}`
    );
  }

  return opportunitiesChunk.opportunities;
}

function requireWorkflow(chunks: ChatResponseChunk[]): WorkflowStep[] {
  const workflowChunk = chunks.find(
    (chunk) => chunk.type === "workflow" && Array.isArray(chunk.workflowSteps)
  );

  if (!workflowChunk?.workflowSteps) {
    throw new Error(`Expected workflow chunk, got: ${JSON.stringify(chunks, null, 2)}`);
  }

  return workflowChunk.workflowSteps;
}

async function main() {
  const startedAt = Date.now();

  try {
    console.log(`Running chat flow test against: ${BASE_URL}`);

    const { accessToken, userId } = await signInWithPassword();
    console.log(`Authenticated user: ${userId}`);

    const messages: ChatMessage[] = [];
    const collectedFields: CollectedField[] = [];

    // Phase 1 — GREETING
    const greetingChunks = await chatRequest(
      {
        phase: "greeting",
        locale: "en",
        userId,
        messages
      },
      accessToken
    );

    const opportunities = requireOpportunities(greetingChunks);
    if (opportunities.length === 0) {
      throw new Error(`Expected at least 1 opportunity, got 0. chunks=${JSON.stringify(greetingChunks, null, 2)}`);
    }

    const selectedOpportunity = opportunities[0];
    if (!selectedOpportunity) {
      throw new Error(`Failed to select top opportunity. chunks=${JSON.stringify(greetingChunks, null, 2)}`);
    }

    console.log(`✓ Greeting complete — found ${opportunities.length} opportunities`);

    // Phase 2 — MATCHING
    const matchingChunks = await chatRequest(
      {
        phase: "matching",
        locale: "en",
        userId,
        messages,
        selectedOpportunityId: selectedOpportunity.id
      },
      accessToken
    );

    const workflowSteps = requireWorkflow(matchingChunks);
    console.log(`✓ Opportunity selected — ${workflowSteps.length} workflow steps loaded (${selectedOpportunity.name})`);

    // Phase 3 — COLLECTION
    let reachedReview = false;

    for (let i = 0; i < workflowSteps.length; i += 1) {
      const step = workflowSteps[i];
      const answer = `Test answer for step ${i + 1}`;

      messages.push(makeMessage("user", answer));
      collectedFields.push({
        stepId: step.id,
        stepTitle: step.title,
        prompt: step.inputPrompt ?? step.description,
        answer
      });

      const collectionChunks = await chatRequest(
        {
          phase: "collection",
          locale: "en",
          userId,
          messages,
          selectedOpportunityId: selectedOpportunity.id,
          workflowSteps,
          currentStepIndex: i,
          collectedFields: collectedFields.slice(0, i)
        },
        accessToken
      );

      const assistantText = collectionChunks
        .filter((chunk) => chunk.type === "text" && chunk.content)
        .map((chunk) => chunk.content)
        .join("");

      if (assistantText.trim()) {
        messages.push(makeMessage("assistant", assistantText));
      }

      const phaseChangeToReview = collectionChunks.some(
        (chunk) => chunk.type === "phase_change" && chunk.phase === "review"
      );

      console.log(`✓ Step ${i + 1}/${workflowSteps.length}: ${step.title}`);

      if (phaseChangeToReview) {
        reachedReview = true;
        break;
      }
    }

    if (!reachedReview && workflowSteps.length > 0) {
      throw new Error("Did not receive phase_change to review during collection phase.");
    }

    // Phase 4 — REVIEW
    const reviewChunks = await chatRequest(
      {
        phase: "review",
        locale: "en",
        userId,
        messages,
        selectedOpportunityId: selectedOpportunity.id,
        workflowSteps,
        collectedFields
      },
      accessToken
    );

    const hasSummaryText = reviewChunks.some((chunk) => chunk.type === "text" && Boolean(chunk.content?.trim()));
    const hasDonePhase = reviewChunks.some(
      (chunk) => chunk.type === "phase_change" && chunk.phase === "done"
    );

    if (!hasSummaryText || !hasDonePhase) {
      throw new Error(
        `Expected review summary text and phase_change=done. Got: ${JSON.stringify(reviewChunks, null, 2)}`
      );
    }

    console.log("✓ Review complete");

    const ms = Date.now() - startedAt;
    console.log(`\nPASS — full chat flow succeeded in ${ms}ms`);
  } catch (error) {
    const ms = Date.now() - startedAt;
    console.error(`\nFAIL after ${ms}ms`);
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
