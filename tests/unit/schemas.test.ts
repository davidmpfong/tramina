import { describe, it, expect } from "vitest";
import {
  ExtractedGrantDataSchema,
  WorkflowStepSchema,
  IngestGrantRequestSchema,
  IngestLocaleSchema,
  OpportunityTypeSchema
} from "@/lib/ingest/schemas";

const validExtractedData = {
  name: "Test Grant",
  funder: "Test Org",
  type: "grant",
  description: "A test grant for testing",
  amountMin: 10000,
  amountMax: 50000,
  deadline: "2026-12-31",
  applicationWindowStart: null,
  applicationWindowEnd: null,
  awardType: null,
  eligibilityRules: {},
  geographicScope: "Massachusetts",
  languagesAvailable: ["en"],
  matchingTags: ["small-business"],
  sourceUrl: null,
  rawContent: "Test grant raw content",
  applicationUrl: null,
  contactEmail: null,
  requiredDocuments: []
};

describe("ExtractedGrantDataSchema", () => {
  it("accepts valid extracted data", () => {
    const result = ExtractedGrantDataSchema.safeParse(validExtractedData);
    expect(result.success).toBe(true);
  });

  it("transforms null name to 'Unknown'", () => {
    const result = ExtractedGrantDataSchema.safeParse({ ...validExtractedData, name: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Unknown");
  });

  it("transforms undefined name to 'Unknown'", () => {
    const result = ExtractedGrantDataSchema.safeParse({ ...validExtractedData, name: undefined });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Unknown");
  });

  it("transforms null funder to 'Unknown'", () => {
    const result = ExtractedGrantDataSchema.safeParse({ ...validExtractedData, funder: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.funder).toBe("Unknown");
  });

  it("transforms array geographicScope to a comma-joined string", () => {
    const result = ExtractedGrantDataSchema.safeParse({
      ...validExtractedData,
      geographicScope: ["Massachusetts", "Rhode Island"]
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.geographicScope).toBe("Massachusetts, Rhode Island");
  });

  it("transforms null geographicScope to null", () => {
    const result = ExtractedGrantDataSchema.safeParse({ ...validExtractedData, geographicScope: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.geographicScope).toBeNull();
  });

  it("accepts loan type", () => {
    const result = ExtractedGrantDataSchema.safeParse({ ...validExtractedData, type: "loan" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = ExtractedGrantDataSchema.safeParse({ ...validExtractedData, type: "invalid" });
    expect(result.success).toBe(false);
  });

  it("requires description", () => {
    const { description: _, ...rest } = validExtractedData;
    const result = ExtractedGrantDataSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("WorkflowStepSchema", () => {
  const validStep = {
    id: "step-1",
    stepType: "info_collection",
    order: 1,
    title: "Business Information",
    description: "Collect basic business info",
    isOptional: false
  };

  it("accepts valid step", () => {
    expect(WorkflowStepSchema.safeParse(validStep).success).toBe(true);
  });

  it("accepts all valid stepTypes", () => {
    const types = ["info_collection", "document_upload", "narrative_draft", "review", "submission"];
    for (const stepType of types) {
      expect(WorkflowStepSchema.safeParse({ ...validStep, stepType }).success).toBe(true);
    }
  });

  it("rejects invalid stepType", () => {
    expect(WorkflowStepSchema.safeParse({ ...validStep, stepType: "invalid_type" }).success).toBe(false);
  });

  it("requires id, title, description, isOptional", () => {
    expect(WorkflowStepSchema.safeParse({ stepType: "info_collection", order: 1 }).success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = WorkflowStepSchema.safeParse({
      ...validStep,
      inputPrompt: "What is your business name?",
      requiredDocuments: ["Business License"],
      validationRules: ["required"]
    });
    expect(result.success).toBe(true);
  });
});

describe("IngestGrantRequestSchema", () => {
  it("accepts valid request", () => {
    const result = IngestGrantRequestSchema.safeParse({
      grantName: "Test Grant",
      adminSecret: "secret"
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty grantName", () => {
    const result = IngestGrantRequestSchema.safeParse({ grantName: "", adminSecret: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects grantName over 200 chars", () => {
    const result = IngestGrantRequestSchema.safeParse({
      grantName: "A".repeat(201),
      adminSecret: "secret"
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional locale", () => {
    const result = IngestGrantRequestSchema.safeParse({
      grantName: "Test",
      adminSecret: "secret",
      locale: "es"
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid locale", () => {
    const result = IngestGrantRequestSchema.safeParse({
      grantName: "Test",
      adminSecret: "secret",
      locale: "fr"
    });
    expect(result.success).toBe(false);
  });
});

describe("IngestLocaleSchema", () => {
  it("accepts en, es, km", () => {
    expect(IngestLocaleSchema.safeParse("en").success).toBe(true);
    expect(IngestLocaleSchema.safeParse("es").success).toBe(true);
    expect(IngestLocaleSchema.safeParse("km").success).toBe(true);
  });

  it("rejects other locales", () => {
    expect(IngestLocaleSchema.safeParse("fr").success).toBe(false);
    expect(IngestLocaleSchema.safeParse("zh").success).toBe(false);
  });
});

describe("OpportunityTypeSchema", () => {
  it("accepts grant, loan, benefit", () => {
    expect(OpportunityTypeSchema.safeParse("grant").success).toBe(true);
    expect(OpportunityTypeSchema.safeParse("loan").success).toBe(true);
    expect(OpportunityTypeSchema.safeParse("benefit").success).toBe(true);
  });

  it("rejects invalid types", () => {
    expect(OpportunityTypeSchema.safeParse("scholarship").success).toBe(false);
  });
});
