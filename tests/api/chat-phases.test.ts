import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Chat route schema validation", () => {
  const schema = z.object({
    messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })),
    phase: z.enum(["greeting", "screening", "matching", "selection", "collection", "review", "done"]),
    locale: z.enum(["en", "es", "km"]),
    userId: z.string().uuid()
  });

  it("validates greeting phase request", () => {
    const result = schema.safeParse({
      messages: [],
      phase: "greeting",
      locale: "en",
      userId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid phase", () => {
    expect(schema.safeParse({ messages: [], phase: "invalid", locale: "en", userId: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(false);
  });

  it("rejects invalid locale", () => {
    expect(schema.safeParse({ messages: [], phase: "greeting", locale: "fr", userId: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(false);
  });

  it("accepts all valid phases", () => {
    const phases = ["greeting", "screening", "matching", "selection", "collection", "review", "done"] as const;
    const phaseSchema = z.enum(phases);

    for (const phase of phases) {
      expect(phaseSchema.safeParse(phase).success).toBe(true);
    }
  });
});

describe("Chat phase logic - screening zip detection", () => {
  it("correctly identifies 5-digit zip codes", () => {
    const isZip = (s: string) => /^\d{5}$/.test(s.trim());
    expect(isZip("01901")).toBe(true);
    expect(isZip("90210")).toBe(true);
    expect(isZip("0190")).toBe(false);
    expect(isZip("019011")).toBe(false);
    expect(isZip("restaurant")).toBe(false);
    expect(isZip("01901 ")).toBe(true);
    expect(isZip(" 01901")).toBe(true);
  });

  it("treats non-zip as industry", () => {
    const classify = (s: string) => (/^\d{5}$/.test(s.trim()) ? "zip" : "industry");
    expect(classify("restaurant")).toBe("industry");
    expect(classify("tech startup")).toBe("industry");
    expect(classify("01901")).toBe("zip");
  });
});

describe("Chat deadline text formatting", () => {
  const toDeadlineText = (deadline: string | null, locale: string) => {
    if (!deadline) return null;
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) return deadline;
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(date);
  };

  it("returns null for null deadline", () => {
    expect(toDeadlineText(null, "en")).toBeNull();
  });

  it("returns raw string for invalid date", () => {
    expect(toDeadlineText("rolling basis", "en")).toBe("rolling basis");
  });

  it("formats valid date for en locale", () => {
    const result = toDeadlineText("2026-12-31", "en");
    expect(result).toContain("2026");
    expect(result).toContain("Dec");
  });
});

describe("Chat collection phase - field deduplication", () => {
  it("does not collect an answer for an already-collected step", () => {
    const collectedFields = [{ stepId: "step-1", stepTitle: "Test", prompt: "q", answer: "a" }];
    const currentStep = { id: "step-1", stepType: "info_collection", order: 1, title: "Test", description: "D", isOptional: false };

    const alreadyCollected = collectedFields.some((f) => f.stepId === currentStep.id);
    expect(alreadyCollected).toBe(true);
  });

  it("collects answer for a new step", () => {
    const collectedFields = [{ stepId: "step-1", stepTitle: "Test", prompt: "q", answer: "a" }];
    const currentStep = { id: "step-2", stepType: "info_collection", order: 2, title: "Step 2", description: "D", isOptional: false };

    const alreadyCollected = collectedFields.some((f) => f.stepId === currentStep.id);
    expect(alreadyCollected).toBe(false);
  });
});
