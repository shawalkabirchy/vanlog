import { defineConfig } from "vitest/config";
import { loadEnvFile } from "node:process";
loadEnvFile(".dev.vars");
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 90000,
    fileParallelism: false,
  },
});
