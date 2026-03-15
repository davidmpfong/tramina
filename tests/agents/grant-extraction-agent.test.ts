import { describe, it, expect, vi, beforeEach } from "vitest";

const validExtractedJson = {
  name: "Test Grant",
  funder: "Test Foundation",
  type: "grant",
  description: "A comprehensive grant for small businesses",
  amountMin: 10000,
  amountMax: 50000,
  deadline: "2026-12-31",
  applicationWindowStart: null,
  applicationWindowEnd: null,
  awardType: null,
  eligibilityRules: { minYears: 2 },
  geographicScope: "Massachusetts",
  languagesAvailable: ["en"],
  matchingTags: ["small-business"],
  sourceUrl: null,
  rawContent: "Test content",
  applicationUrl: "https://apply.example.com",
  contactEmail: "grants@example.com",
  requiredDocuments: ["Business License"]
};

describe("grantExtractionAgent", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns structured extracted data on success", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: JSON.stringify(validExtractedJson) })
        };
      })
    }));

    const { grantExtractionAgent } = await import("@/lib/agents/ingest/grant-extraction-agent");
    const result = await grantExtractionAgent({ rawContent: "Raw grant info" });

    expect(result.extractedData.name).toBe("Test Grant");
    expect(result.extractedData.funder).toBe("Test Foundation");
    expect(result.extractedData.type).toBe("grant");
    expect(result.isPartial).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("normalizes type 'loan program' to 'loan'", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify({ ...validExtractedJson, type: "small business loan program" })
          })
        };
      })
    }));

    const { grantExtractionAgent } = await import("@/lib/agents/ingest/grant-extraction-agent");
    const result = await grantExtractionAgent({ rawContent: "Raw content" });
    expect(result.extractedData.type).toBe("loan");
  });

  it("strips markdown fences from LLM response", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content: `\`\`\`json\n${JSON.stringify(validExtractedJson)}\n\`\`\``
          })
        };
      })
    }));

    const { grantExtractionAgent } = await import("@/lib/agents/ingest/grant-extraction-agent");
    const result = await grantExtractionAgent({ rawContent: "Raw content" });
    expect(result.extractedData.name).toBe("Test Grant");
  });

  it("returns partial result with warnings when JSON parse fails", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: "not valid json {{" })
        };
      })
    }));

    const { grantExtractionAgent } = await import("@/lib/agents/ingest/grant-extraction-agent");
    const result = await grantExtractionAgent({ rawContent: "Raw grant content here" });

    expect(result.isPartial).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/Failed to parse/);
  });

  it("returns partial if required fields are missing", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content: JSON.stringify({ ...validExtractedJson, name: "", funder: "" })
          })
        };
      })
    }));

    const { grantExtractionAgent } = await import("@/lib/agents/ingest/grant-extraction-agent");
    const result = await grantExtractionAgent({ rawContent: "Raw content" });
    expect(result.isPartial).toBe(true);
    expect(result.warnings).toContain(expect.stringMatching(/Missing required/));
  });
});
