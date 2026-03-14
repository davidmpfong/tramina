"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Progress } from "@/components/ui/progress";
import type {
  ChatMessage,
  ChatPhase,
  ChatResponseChunk,
  CollectedField,
  MatchedOpportunity,
  WorkflowStep
} from "@/lib/chat/types";

type SupportedLocale = "en" | "es" | "km";

function formatAmount(min: number | null, max: number | null) {
  if (min === null && max === null) {
    return "—";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  if (min !== null && max !== null) {
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  }

  if (min !== null) {
    return `${formatter.format(min)}+`;
  }

  return `Up to ${formatter.format(max ?? 0)}`;
}

function ChatContent() {
  const t = useTranslations("chat");
  const locale = useLocale() as SupportedLocale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialContext = searchParams.get("ctx") ?? undefined;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>("greeting");
  const [matchedOpportunities, setMatchedOpportunities] = useState<MatchedOpportunity[]>([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [collectedFields, setCollectedFields] = useState<CollectedField[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const progressValue = useMemo(() => {
    if (workflowSteps.length === 0) {
      return 0;
    }

    return Math.min(100, (currentStepIndex / workflowSteps.length) * 100);
  }, [currentStepIndex, workflowSteps.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    let active = true;

    async function init() {
      const {
        data: { session }
      } = await supabaseBrowser.auth.getSession();

      if (!active) {
        return;
      }

      if (!session) {
        router.push(`/${locale}/auth?redirect=${encodeURIComponent(window.location.pathname)}` as never);
        return;
      }

      setUserId(session.user.id);
    }

    init();

    return () => {
      active = false;
    };
  }, [locale, router]);

  useEffect(() => {
    if (!userId || isLoading || messages.length > 0 || phase !== "greeting") {
      return;
    }

    void sendMessage("", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, phase, isLoading, messages.length]);

  async function sendMessage(rawText: string, isSystemKickoff = false, selectedOpportunityOverride?: string) {
    if (!userId || isLoading) {
      return;
    }

    const text = rawText.trim();
    if (!isSystemKickoff && !text) {
      return;
    }

    setIsLoading(true);

    let nextMessages = messages;
    let nextCollectedFields = collectedFields;
    let nextStepIndex = currentStepIndex;

    if (!isSystemKickoff && text) {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString()
      };
      nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInput("");

      if (phase === "collection" && workflowSteps[currentStepIndex]) {
        const activeStep = workflowSteps[currentStepIndex];
        const alreadyCaptured = collectedFields.some((field) => field.stepId === activeStep.id);

        if (!alreadyCaptured) {
          const updatedField: CollectedField = {
            stepId: activeStep.id,
            stepTitle: activeStep.title,
            prompt: activeStep.inputPrompt ?? activeStep.description,
            answer: text
          };

          nextCollectedFields = [...collectedFields, updatedField];
          nextStepIndex = currentStepIndex + 1;
          setCollectedFields(nextCollectedFields);
          setCurrentStepIndex(nextStepIndex);
        }
      }
    }

    const {
      data: { session }
    } = await supabaseBrowser.auth.getSession();

    const payload = {
      messages: nextMessages,
      phase,
      locale,
      userId,
      selectedOpportunityId: selectedOpportunityOverride ?? selectedOpportunityId ?? undefined,
      workflowSteps,
      currentStepIndex: nextStepIndex,
      collectedFields: nextCollectedFields,
      initialContext: phase === "greeting" ? initialContext : undefined
    };

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok || !response.body) {
      setIsLoading(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pendingAssistantMessageId: string | null = null;
    let shouldKickoffCollection = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part
          .split("\n")
          .find((entry) => entry.startsWith("data: "));

        if (!line) {
          continue;
        }

        const data = line.replace("data: ", "").trim();
        if (!data) {
          continue;
        }

        let chunk: ChatResponseChunk;

        try {
          chunk = JSON.parse(data) as ChatResponseChunk;
        } catch {
          continue;
        }

        if (chunk.type === "text" && chunk.content) {
          setMessages((prev) => {
            if (!pendingAssistantMessageId) {
              pendingAssistantMessageId = crypto.randomUUID();
              return [
                ...prev,
                {
                  id: pendingAssistantMessageId,
                  role: "assistant",
                  content: chunk.content ?? "",
                  timestamp: new Date().toISOString()
                }
              ];
            }

            return prev.map((message) =>
              message.id === pendingAssistantMessageId
                ? { ...message, content: `${message.content}${chunk.content ?? ""}` }
                : message
            );
          });
        }

        if (chunk.type === "opportunities") {
          setMatchedOpportunities(chunk.opportunities ?? []);
        }

        if (chunk.type === "workflow") {
          const incomingSteps = chunk.workflowSteps ?? [];
          setWorkflowSteps(incomingSteps);
          if (incomingSteps.length > 0 && currentStepIndex >= incomingSteps.length) {
            setCurrentStepIndex(0);
          }
        }

        if (chunk.type === "phase_change" && chunk.phase) {
          setPhase(chunk.phase);
          pendingAssistantMessageId = null;

          if (chunk.phase === "collection" && nextStepIndex === 0) {
            shouldKickoffCollection = true;
          }
        }

        if (chunk.type === "done") {
          pendingAssistantMessageId = null;
        }
      }
    }

    setIsLoading(false);

    if (shouldKickoffCollection) {
      void sendMessage("", true);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleSelectOpportunity(opportunityId: string, opportunityName: string) {
    setSelectedOpportunityId(opportunityId);
    void sendMessage(opportunityName, false, opportunityId);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col bg-amber-50/40 px-4 py-6">
      <header className="mb-4 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-amber-950">{t("title")}</h1>
      </header>

      {phase === "collection" && workflowSteps.length > 0 && (
        <section className="mb-4 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm text-amber-900">
            {t("progress", { current: Math.min(currentStepIndex + 1, workflowSteps.length), total: workflowSteps.length })}
          </p>
          <Progress value={progressValue} />
        </section>
      )}

      <section className="flex-1 overflow-y-auto rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
              <div
                className={
                  message.role === "assistant"
                    ? "max-w-[85%] rounded-2xl rounded-bl-sm bg-amber-100 px-4 py-2 text-amber-950"
                    : "max-w-[85%] rounded-2xl rounded-br-sm bg-amber-900 px-4 py-2 text-amber-50"
                }
              >
                {message.content}
              </div>
            </div>
          ))}

          {phase === "matching" && matchedOpportunities.length > 0 && (
            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-amber-900">{t("selectGrant")}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {matchedOpportunities.map((opportunity) => {
                  const isSelected = selectedOpportunityId === opportunity.id;
                  return (
                    <button
                      key={opportunity.id}
                      type="button"
                      className={`rounded-xl border p-4 text-left transition ${
                        isSelected
                          ? "border-amber-500 bg-amber-50"
                          : "border-amber-100 bg-white hover:border-amber-300 hover:bg-amber-50/60"
                      }`}
                      onClick={() => handleSelectOpportunity(opportunity.id, opportunity.name)}
                      disabled={isLoading}
                    >
                      <p className="font-semibold text-amber-950">{opportunity.name}</p>
                      <p className="mt-1 text-sm text-amber-900">{opportunity.funder}</p>
                      <p className="mt-2 text-sm text-amber-700">{formatAmount(opportunity.amount_min, opportunity.amount_max)}</p>
                      {opportunity.deadline_text && (
                        <p className="mt-1 text-xs text-amber-700/90">Deadline: {opportunity.deadline_text}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </section>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2 rounded-2xl border border-amber-100 bg-white p-3 shadow-sm">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("placeholder")}
          className="flex-1 rounded-xl border border-amber-100 px-3 py-2 text-sm outline-none ring-amber-300 focus:ring"
          disabled={isLoading || phase === "done"}
        />
        <button
          type="submit"
          className="rounded-xl bg-amber-900 px-4 py-2 text-sm font-medium text-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading || phase === "done"}
        >
          {isLoading ? t("thinking") : t("send")}
        </button>
      </form>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center bg-amber-50/40">
          <div className="text-amber-900">Cargando...</div>
        </main>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
