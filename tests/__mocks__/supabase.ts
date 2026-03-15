import { vi } from "vitest";

export function createSupabaseMock(overrides?: {
  data?: unknown;
  error?: { message: string } | null;
}) {
  const defaults = { data: null, error: null };
  const result = { ...defaults, ...overrides };

  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    from: vi.fn().mockReturnThis(),
  };

  // Make from() return the chainable builder
  const client = {
    from: vi.fn(() => chainable),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } }, error: null }),
    },
  };

  return { client, chainable };
}

export function createGeminiMock(responseText: string) {
  return {
    invoke: vi.fn().mockResolvedValue({ content: responseText }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { content: responseText };
    }),
  };
}
