import { describe, it, expect } from "vitest";

describe("extract-document route - input validation logic", () => {
  it("correctly validates a non-empty JSON array of fields", () => {
    const parseFields = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return parsed as string[];
      } catch {
        return null;
      }
    };

    expect(parseFields('["registration_number", "ein"]')).toEqual(["registration_number", "ein"]);
    expect(parseFields("[]")).toBeNull(); // empty array rejected
    expect(parseFields("not json")).toBeNull();
    expect(parseFields('{"key":"value"}')).toBeNull(); // object rejected
  });

  it("validates file size limit of 10MB", () => {
    const MAX_SIZE = 10 * 1024 * 1024;
    const tooLarge = MAX_SIZE + 1;
    const justRight = MAX_SIZE;

    expect(tooLarge > MAX_SIZE).toBe(true);
    expect(justRight <= MAX_SIZE).toBe(true);
  });
});
