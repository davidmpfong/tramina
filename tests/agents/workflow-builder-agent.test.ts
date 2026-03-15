import { describe, it, expect, vi, beforeEach } from "vitest";

const validExtractedData = {
  name: "Test Grant",
  funder: "Test Foundation",
  type: "grant" as const,
  description: "A grant for small businesses",
  amountMin: 10000,
  amountMax: 50000,
  deadline: null,
  applicationWindowStart: null,
  applicationWindowEnd: null,
  awardType: null,
  eligibilityRules: {},
  geographicScope: "Massachusetts",
  languagesAvailable: ["en"],
  matchingTags: [],
  sourceUrl: null,
  rawContent: "Test content",
  applicationUrl: null,
  contactEmail: null,
  requiredDocuments: []
};

const validSteps = [
  {
    id: "step-1",
    stepType: "info_collection",
    order: 1,
    title: "Business Info",
    description: "Collect info",
    isOptional: false
  },
  {
    id: "step-2",
    stepType: "document_upload",
    order: 2,
    title: "Documents",
    description: "Upload docs",
    isOptional: false,
    requiredDocuments: ["Tax Return"]
  },
  {
    id: "step-3",
    stepType: "submission",
    order: 3,
    title: "Submit",
    description: "Submit application",
    isOptional: false
  }
];

describe("workflowBuilderAgent", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns workflow steps from Gemini response", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(validSteps) })
        };
      })
    }));

    const { workflowBuilderAgent } = await import("@/lib/agents/ingest/workflow-builder-agent");
    const result = await workflowBuilderAgent({ extractedData: validExtractedData, locale: "en" });

    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]!.stepType).toBe("info_collection");
    expect(result.steps[1]!.stepType).toBe("document_upload");
    expect(result.steps[2]!.stepType).toBe("submission");
  });

  it("throws WorkflowBuildError when JSON parse fails", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: "not valid json" })
        };
      })
    }));

    const { workflowBuilderAgent } = await import("@/lib/agents/ingest/workflow-builder-agent");
    await expect(workflowBuilderAgent({ extractedData: validExtractedData, locale: "en" })).rejects.toThrow(
      "Failed to generate valid workflow steps"
    );
  });

  it("throws WorkflowBuildError when result is not an array", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: '{"steps": []}' })
        };
      })
    }));

    const { workflowBuilderAgent } = await import("@/lib/agents/ingest/workflow-builder-agent");
    await expect(workflowBuilderAgent({ extractedData: validExtractedData, locale: "en" })).rejects.toThrow(
      "Failed to generate valid workflow steps"
    );
  });

  it("throws WorkflowBuildError when result is empty array", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: "[]" })
        };
      })
    }));

    const { workflowBuilderAgent } = await import("@/lib/agents/ingest/workflow-builder-agent");
    await expect(workflowBuilderAgent({ extractedData: validExtractedData, locale: "en" })).rejects.toThrow(
      "Failed to generate valid workflow steps"
    );
  });

  it("handles document_extract steps with extractFields", async () => {
    const stepsWithExtract = [
      ...validSteps,
      {
        id: "step-4",
        stepType: "document_extract",
        order: 4,
        title: "Business License",
        description: "Scan license",
        isOptional: false,
        extractFields: ["registration_number"],
        requiredDocuments: ["Business License"]
      }
    ];

    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(stepsWithExtract) })
        };
      })
    }));

    const { workflowBuilderAgent } = await import("@/lib/agents/ingest/workflow-builder-agent");
    const result = await workflowBuilderAgent({ extractedData: validExtractedData, locale: "en" });

    const extractStep = result.steps.find((s) => s.stepType === "document_extract");
    expect(extractStep).toBeDefined();
    expect((extractStep as { extractFields?: string[] }).extractFields).toContain("registration_number");
  });
});
