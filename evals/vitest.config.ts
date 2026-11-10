import { defineConfig } from "vitest/config";

// Unit tests for graders, the shell guard, and transcript metrics. They never
// call a model or Docker. Run with `pnpm --filter @typesensekit/evals test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
