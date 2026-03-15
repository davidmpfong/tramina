import { vi } from "vitest";

// Mock environment variables
process.env.GOOGLE_API_KEY = "test-google-api-key";
process.env.ADMIN_SECRET = "test-admin-secret-32-chars-long!!";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

// Silence console.log in tests unless TEST_VERBOSE is set
if (!process.env.TEST_VERBOSE) {
  vi.spyOn(console, "log").mockImplementation(() => {});
}
