import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "lib/agents/**/*.ts",
        "lib/chat/**/*.ts",
        "lib/ingest/**/*.ts",
        "lib/sanitize.ts",
        "app/api/**/*.ts"
      ],
      exclude: ["node_modules", ".next", "tests"]
    },
    testTimeout: 30000
  }
});