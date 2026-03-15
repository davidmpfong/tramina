import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkflowStep } from "@/lib/chat/types";

const makeStep = (overrides: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id: "step-1",
  stepType: "info_collection",
  order: 1,
  title: "Business Information",
  description: "Tell us about your business",
  inputPrompt: "What is your business name?",
  isOptional: false,
  ...overrides
});

describe("localizeSteps", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns original steps unchanged for en locale", async () => {
    const { localizeSteps } = await import("@/lib/chat/localize");
    const steps = [makeStep()];
    const result = await localizeSteps(steps, "en");
    expect(result).toBe(steps); // same reference
  });

  it("returns original steps unchanged for empty array", async () => {
    const { localizeSteps } = await import("@/lib/chat/localize");
    const result = await localizeSteps([], "es");
    expect(result).toEqual([]);
  });

  it("calls Gemini and returns translated steps for es locale", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify([
              {
                id: "step-1",
                title: "Información del Negocio",
                description: "Cuéntenos sobre su negocio",
                inputPrompt: "¿Cuál es el nombre de su negocio?"
              }
            ])
          })
        };
      })
    }));

    const { localizeSteps } = await import("@/lib/chat/localize");
    const steps = [makeStep()];
    const result = await localizeSteps(steps, "es");

    expect(result[0]!.title).toBe("Información del Negocio");
    expect(result[0]!.description).toBe("Cuéntenos sobre su negocio");
    expect(result[0]!.inputPrompt).toBe("¿Cuál es el nombre de su negocio?");
    expect(result[0]!.id).toBe("step-1"); // id unchanged
  });

  it("returns original steps if translation JSON parse fails", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: "not valid json [{" })
        };
      })
    }));

    const { localizeSteps } = await import("@/lib/chat/localize");
    const steps = [makeStep()];
    const result = await localizeSteps(steps, "es");
    expect(result[0]!.title).toBe("Business Information"); // original
  });

  it("preserves original inputPrompt if translation returns null", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify([
              {
                id: "step-1",
                title: "Traducido",
                description: "Descripción",
                inputPrompt: null
              }
            ])
          })
        };
      })
    }));

    const { localizeSteps } = await import("@/lib/chat/localize");
    const steps = [makeStep({ inputPrompt: "Original prompt" })];
    const result = await localizeSteps(steps, "es");
    expect(result[0]!.inputPrompt).toBe("Original prompt"); // preserved
  });
});
