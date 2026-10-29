import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".dev.vars");
} catch {}

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/browser",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  use: {
    actionTimeout: 15_000,
    baseURL: process.env.TEST_ORIGIN || "http://localhost:8788",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
