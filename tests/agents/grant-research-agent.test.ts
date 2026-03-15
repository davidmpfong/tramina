import { describe, it, expect, vi, beforeEach } from "vitest";

describe("grantResearchAgent", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns rawContent from Gemini response", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content:
              "This is detailed grant information about eligibility, funding amounts of $10,000-50,000, and deadlines in December 2026."
          })
        };
      })
    }));
    vi.doMock("@/lib/sanitize", () => ({
      validateSourceUrl: vi.fn((url: string | undefined) => url ?? null)
    }));

    const { grantResearchAgent } = await import("@/lib/agents/ingest/grant-research-agent");
    const result = await grantResearchAgent({ grantName: "Test Grant" });

    expect(result.rawContent).toContain("grant information");
    expect(result.sourceUrlsUsed).toHaveLength(0);
    expect(result.scrapedAt).toBeTruthy();
  });

  it("includes sourceUrl in sourceUrlsUsed when provided", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content: "A".repeat(200)
          })
        };
      })
    }));
    vi.doMock("@/lib/sanitize", () => ({
      validateSourceUrl: vi.fn((url: string | undefined) => url ?? null)
    }));

    const { grantResearchAgent } = await import("@/lib/agents/ingest/grant-research-agent");
    const result = await grantResearchAgent({
      grantName: "Test Grant",
      sourceUrl: "https://example.com/grant"
    });

    expect(result.sourceUrlsUsed).toContain("https://example.com/grant");
  });

  it("throws ResearchError when content is too short (< 100 chars)", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: "Too short" })
        };
      })
    }));
    vi.doMock("@/lib/sanitize", () => ({
      validateSourceUrl: vi.fn(() => null)
    }));

    const { grantResearchAgent } = await import("@/lib/agents/ingest/grant-research-agent");
    await expect(grantResearchAgent({ grantName: "Test" })).rejects.toThrow("Insufficient grant content");
  });

  it("throws ResearchError when content is empty", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({ content: "" })
        };
      })
    }));
    vi.doMock("@/lib/sanitize", () => ({
      validateSourceUrl: vi.fn(() => null)
    }));

    const { grantResearchAgent } = await import("@/lib/agents/ingest/grant-research-agent");
    await expect(grantResearchAgent({ grantName: "Test" })).rejects.toThrow();
  });

  it("handles array content response from Gemini", async () => {
    vi.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
          invoke: vi.fn().mockResolvedValue({
            content: [
              { text: "Part one of the grant details about eligibility criteria." },
              { text: " Part two with funding amounts and deadlines for 2026." }
            ]
          })
        };
      })
    }));
    vi.doMock("@/lib/sanitize", () => ({
      validateSourceUrl: vi.fn(() => null)
    }));

    const { grantResearchAgent } = await import("@/lib/agents/ingest/grant-research-agent");
    const result = await grantResearchAgent({ grantName: "Test Grant" });
    expect(result.rawContent.length).toBeGreaterThan(100);
  });
});
