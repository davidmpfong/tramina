import { describe, it, expect } from "vitest";
import { schemaValidatorAgent } from "@/lib/agents/ingest/schema-validator-agent";

const validExtractedData = {
  name: "Test Grant",
  funder: "Test Foundation",
  type: "grant" as const,
  description: "A test grant",
  amountMin: 10000,
  amountMax: 50000,
  deadline: null,
  applicationWindowStart: null,
  applicationWindowEnd: null,
  awardType: null,
  eligibilityRules: {},
  geographicScope: null,
  languagesAvailable: ["en"],
  matchingTags: [],
  sourceUrl: null,
  rawContent: "Test content",
  applicationUrl: null,
  contactEmail: null,
  requiredDocuments: []
};

const validStep = {
  id: "step-1",
  stepType: "info_collection" as const,
  order: 1,
  title: "Business Info",
  description: "Collect business information",
  isOptional: false
};

describe("schemaValidatorAgent", () => {
  it("returns valid:true for valid data and steps", async () => {
    const result = await schemaValidatorAgent({
      extractedData: validExtractedData,
      workflowSteps: [validStep, { ...validStep, id: "step-2", order: 2 }, { ...validStep, id: "step-3", order: 3 }]
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid:false with error for invalid extracted data type", async () => {
    const result = await schemaValidatorAgent({
      extractedData: { ...validExtractedData, type: "invalid" as never },
      workflowSteps: [validStep, { ...validStep, id: "step-2", order: 2 }, { ...validStep, id: "step-3", order: 3 }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("extractedData"))).toBe(true);
  });

  it("returns valid:false with error for invalid stepType", async () => {
    const result = await schemaValidatorAgent({
      extractedData: validExtractedData,
      workflowSteps: [{ ...validStep, stepType: "invalid_type" as never }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("workflowSteps"))).toBe(true);
  });

  it("accepts document_extract as valid stepType", async () => {
    const result = await schemaValidatorAgent({
      extractedData: validExtractedData,
      workflowSteps: [
        { ...validStep, stepType: "document_extract" as never, id: "step-1" },
        { ...validStep, id: "step-2", order: 2 },
        { ...validStep, id: "step-3", order: 3 }
      ]
    });
    expect(result.valid).toBe(true);
  });

  it("warns when both amountMin and amountMax are null", async () => {
    const result = await schemaValidatorAgent({
      extractedData: { ...validExtractedData, amountMin: null, amountMax: null },
      workflowSteps: [validStep, { ...validStep, id: "step-2", order: 2 }, { ...validStep, id: "step-3", order: 3 }]
    });
    expect(result.warnings).toContain("Both amountMin and amountMax are null");
  });

  it("warns when workflow has fewer than 3 steps", async () => {
    const result = await schemaValidatorAgent({
      extractedData: validExtractedData,
      workflowSteps: [validStep, { ...validStep, id: "step-2", order: 2 }]
    });
    expect(result.warnings).toContain("Workflow contains fewer than 3 steps");
  });

  it("never throws - handles edge cases gracefully", async () => {
    await expect(schemaValidatorAgent({ extractedData: {} as never, workflowSteps: [] })).resolves.toBeDefined();
  });
});
