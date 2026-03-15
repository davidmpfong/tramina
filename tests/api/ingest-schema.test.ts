import { describe, it, expect } from "vitest";
import { IngestGrantRequestSchema } from "@/lib/ingest/schemas";

describe("IngestGrantRequestSchema - request validation", () => {
  it("accepts minimal valid request", () => {
    expect(
      IngestGrantRequestSchema.safeParse({
        grantName: "Test Grant",
        adminSecret: "secret"
      }).success
    ).toBe(true);
  });

  it("accepts full valid request", () => {
    expect(
      IngestGrantRequestSchema.safeParse({
        grantName: "Test Grant",
        adminSecret: "secret",
        sourceUrl: "https://example.com",
        locale: "en",
        localeHints: ["en", "es"]
      }).success
    ).toBe(true);
  });

  it("rejects missing adminSecret", () => {
    expect(IngestGrantRequestSchema.safeParse({ grantName: "Test Grant" }).success).toBe(false);
  });

  it("rejects grantName that is too long", () => {
    expect(
      IngestGrantRequestSchema.safeParse({
        grantName: "A".repeat(201),
        adminSecret: "secret"
      }).success
    ).toBe(false);
  });

  it("rejects invalid sourceUrl", () => {
    expect(
      IngestGrantRequestSchema.safeParse({
        grantName: "Test",
        adminSecret: "secret",
        sourceUrl: "not-a-url"
      }).success
    ).toBe(false);
  });

  it("rejects unsupported locale", () => {
    expect(
      IngestGrantRequestSchema.safeParse({
        grantName: "Test",
        adminSecret: "secret",
        locale: "zh"
      }).success
    ).toBe(false);
  });
});
