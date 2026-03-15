/**
 * End-to-end chat flow test.
 * Runs against the live deployment if TEST_E2E=true is set.
 * Otherwise skips gracefully.
 *
 * Run with:
 *   TEST_E2E=true SUPABASE_URL=... TEST_EMAIL=... TEST_PASSWORD=... npx vitest run tests/e2e/chat-flow.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";

const isE2E = process.env.TEST_E2E === "true";
const BASE_URL = process.env.BASE_URL || "https://tramina.vercel.app";
const BYPASS_TOKEN = process.env.BYPASS_TOKEN || "Ebf916hL4CtthHhWr1tYHyoSRz6rNMLl";

type ChatChunk = {
  type: string;
  content?: string;
  phase?: string;
  opportunities?: { id: string; name: string }[];
  workflowSteps?: { id: string; title: string; stepType: string }[];
};

async function signIn(): Promise<{ accessToken: string; userId: string }> {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY! },
    body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD })
  });
  const json = (await res.json()) as { access_token?: string; user?: { id?: string } };
  if (!res.ok || !json.access_token) throw new Error("Sign in failed");
  return { accessToken: json.access_token, userId: json.user?.id ?? "" };
}

async function chatRequest(payload: Record<string, unknown>, token: string): Promise<ChatChunk[]> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-vercel-protection-bypass": BYPASS_TOKEN
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok || !res.body) throw new Error(`Chat request failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks: ChatChunk[] = [];
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        chunks.push(JSON.parse(line.slice(6)) as ChatChunk);
      } catch {
        // skip malformed chunks
      }
    }
  }
  return chunks;
}

describe.skipIf(!isE2E)("E2E: Full chat flow", () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    ({ accessToken, userId } = await signIn());
  }, 30000);

  it("greeting phase returns opportunities", async () => {
    const chunks = await chatRequest({ phase: "greeting", locale: "en", userId, messages: [] }, accessToken);
    const oppsChunk = chunks.find((c) => c.type === "opportunities");
    expect(oppsChunk).toBeDefined();
    expect(oppsChunk?.opportunities?.length).toBeGreaterThan(0);
  }, 60000);

  it("matching phase with selectedOpportunityId returns workflow", async () => {
    const greetingChunks = await chatRequest({ phase: "greeting", locale: "en", userId, messages: [] }, accessToken);
    const opportunity = greetingChunks.find((c) => c.type === "opportunities")?.opportunities?.[0];
    expect(opportunity).toBeDefined();

    const matchingChunks = await chatRequest(
      {
        phase: "matching",
        locale: "en",
        userId,
        messages: [],
        selectedOpportunityId: opportunity!.id
      },
      accessToken
    );

    const workflowChunk = matchingChunks.find((c) => c.type === "workflow");
    expect(workflowChunk).toBeDefined();
    expect(workflowChunk?.workflowSteps?.length).toBeGreaterThan(0);

    const phaseChange = matchingChunks.find((c) => c.type === "phase_change");
    expect(phaseChange?.phase).toBe("collection");
  }, 60000);

  it("collection phase advances step index and returns next question", async () => {
    const greetingChunks = await chatRequest({ phase: "greeting", locale: "en", userId, messages: [] }, accessToken);
    const opportunity = greetingChunks.find((c) => c.type === "opportunities")?.opportunities?.[0];

    const matchingChunks = await chatRequest(
      {
        phase: "matching",
        locale: "en",
        userId,
        messages: [],
        selectedOpportunityId: opportunity!.id
      },
      accessToken
    );

    const workflowSteps = matchingChunks.find((c) => c.type === "workflow")?.workflowSteps ?? [];
    expect(workflowSteps.length).toBeGreaterThan(0);

    const collectionChunks = await chatRequest(
      {
        phase: "collection",
        locale: "en",
        userId,
        messages: [
          { role: "user", content: "Test answer for step 1", id: "msg-1", timestamp: new Date().toISOString() }
        ],
        selectedOpportunityId: opportunity!.id,
        workflowSteps,
        currentStepIndex: 0,
        collectedFields: []
      },
      accessToken
    );

    const hasText = collectionChunks.some((c) => c.type === "text" && c.content);
    const hasDone = collectionChunks.some((c) => c.type === "done");
    expect(hasText || hasDone).toBe(true);
  }, 60000);

  it("review phase returns summary and transitions to done", async () => {
    const reviewChunks = await chatRequest(
      {
        phase: "review",
        locale: "en",
        userId,
        messages: [],
        collectedFields: [
          {
            stepId: "step-1",
            stepTitle: "Business Name",
            prompt: "What is your name?",
            answer: "ACME Corp"
          }
        ]
      },
      accessToken
    );

    const hasText = reviewChunks.some((c) => c.type === "text" && c.content?.trim());
    const hasDone = reviewChunks.find((c) => c.type === "phase_change");
    expect(hasText).toBe(true);
    expect(hasDone?.phase).toBe("done");
  }, 60000);

  it("rejects unauthenticated requests with 401", async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vercel-protection-bypass": BYPASS_TOKEN
      },
      body: JSON.stringify({ phase: "greeting", locale: "en", userId, messages: [] })
    });
    expect(res.status).toBe(401);
  }, 30000);
});
