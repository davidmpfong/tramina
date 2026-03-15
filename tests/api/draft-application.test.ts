import { describe, it, expect } from "vitest";
import { z } from "zod";

const draftRequestSchema = z.object({
  opportunityId: z.string().uuid(),
  collectedFields: z.array(
    z.object({
      stepId: z.string(),
      stepTitle: z.string(),
      prompt: z.string(),
      answer: z.string()
    })
  ),
  locale: z.enum(["en", "es", "km"]),
  userId: z.string().uuid()
});

describe("draft-application route schema", () => {
  it("accepts valid draft request", () => {
    const result = draftRequestSchema.safeParse({
      opportunityId: "550e8400-e29b-41d4-a716-446655440000",
      collectedFields: [
        { stepId: "step-1", stepTitle: "Business Name", prompt: "What is your name?", answer: "ACME Corp" }
      ],
      locale: "en",
      userId: "550e8400-e29b-41d4-a716-446655440001"
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty collectedFields array", () => {
    const result = draftRequestSchema.safeParse({
      opportunityId: "550e8400-e29b-41d4-a716-446655440000",
      collectedFields: [],
      locale: "en",
      userId: "550e8400-e29b-41d4-a716-446655440001"
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid opportunityId", () => {
    const result = draftRequestSchema.safeParse({
      opportunityId: "not-a-uuid",
      collectedFields: [],
      locale: "en",
      userId: "550e8400-e29b-41d4-a716-446655440001"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid locale", () => {
    const result = draftRequestSchema.safeParse({
      opportunityId: "550e8400-e29b-41d4-a716-446655440000",
      collectedFields: [],
      locale: "de",
      userId: "550e8400-e29b-41d4-a716-446655440001"
    });
    expect(result.success).toBe(false);
  });
});

describe("formatCollectedFields helper logic", () => {
  const formatCollectedFields = (fields: { stepTitle: string; prompt: string; answer: string }[]) => {
    if (fields.length === 0) return "- No collected answers provided.";
    return fields
      .map((f, i) => `${i + 1}. Step: ${f.stepTitle}\nQuestion: ${f.prompt}\nAnswer: ${f.answer}`)
      .join("\n\n");
  };

  it("returns placeholder for empty fields", () => {
    expect(formatCollectedFields([])).toBe("- No collected answers provided.");
  });

  it("formats single field correctly", () => {
    const result = formatCollectedFields([
      { stepTitle: "Business Name", prompt: "What is your name?", answer: "ACME" }
    ]);
    expect(result).toContain("1. Step: Business Name");
    expect(result).toContain("Question: What is your name?");
    expect(result).toContain("Answer: ACME");
  });

  it("formats multiple fields with numbering", () => {
    const fields = [
      { stepTitle: "Step A", prompt: "Q1", answer: "A1" },
      { stepTitle: "Step B", prompt: "Q2", answer: "A2" }
    ];
    const result = formatCollectedFields(fields);
    expect(result).toContain("1. Step: Step A");
    expect(result).toContain("2. Step: Step B");
  });
});
