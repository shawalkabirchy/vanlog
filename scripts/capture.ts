import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const origin = process.env.TEST_ORIGIN || "http://localhost:8788";
assert(
  ["http://localhost:8788", "https://vanlog-consolelog.pages.dev"].includes(
    origin,
  ),
);
const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const users = await db.auth.admin.listUsers({ perPage: 1000 });
assert.ifError(users.error);
const owner = users.data.users.find(
  (u) => u.email === process.env.DEMO_OWNER_EMAIL,
);
assert(owner);
const token = randomBytes(32).toString("hex"),
  tokenDigest = createHash("sha256").update(token).digest("hex");
async function rpc<T>(
  operation: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const result = await db.rpc("vanlog_api", {
    p_operation: operation,
    p_input: input,
    p_session_digest: tokenDigest,
  });
  assert.ifError(result.error);
  return result.data as T;
}
await rpc("session_create", { authUserId: owner.id, tokenDigest });
const ids: string[] = [];
const browser = await chromium.launch();
try {
  await mkdir("docs/assets", { recursive: true });
  await mkdir(".secrets", { recursive: true });
  const equipment = await rpc<{ id: string }>("equipment_create", {
    requestId: randomUUID(),
    name: "QA-Generator walkthrough",
    category: "Power",
    initialMeterMinutes: 6000,
  });
  ids.push(equipment.id);
  await writeFile(
    ".secrets/walkthrough-manifest.json",
    JSON.stringify({ equipmentIds: ids }),
  );
  await rpc("task_create", {
    id: equipment.id,
    requestId: randomUUID(),
    label: "Oil & filter change",
    intervalMinutes: 3000,
    baselineOn: new Date().toISOString().slice(0, 10),
    baselineMeterMinutes: 6000,
  });
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 420, height: 900 },
    recordVideo: {
      dir: "test-results/video",
      size: { width: 420, height: 900 },
    },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const started = performance.now();
  await page.goto(`/equipment/${equipment.id}`);
  await page.getByRole("button", { name: "Try as staff", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "QA-Generator walkthrough",
  );
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  await page
    .getByLabel("New cumulative hours")
    .pressSequentially("145.0", { delay: 150 });
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Confirm large increase" }).click();
  await page.getByRole("button", { name: "Save reading", exact: true }).click();
  await expect(
    page.locator(".task-card").getByText("Due soon", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Log reading", exact: true }).click();
  await page
    .getByLabel("New cumulative hours")
    .pressSequentially("150.0", { delay: 150 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Save reading", exact: true }).click();
  await expect(
    page.locator(".task-card").getByText("Due now", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(3000);
  await page
    .getByRole("button", { name: "Complete service", exact: true })
    .click();
  await page.getByLabel("Cost (USD)", { exact: true }).fill("12.34");
  await page.waitForTimeout(4000);
  await page
    .getByRole("button", { name: "Confirm completion", exact: true })
    .click();
  await expect(
    page.getByText("Service recorded.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".task-card").getByText("Current", { exact: true }),
  ).toBeVisible();
  await page.locator(".task-card").scrollIntoViewIfNeeded();
  const remaining = 42000 - (performance.now() - started);
  if (remaining > 0) await page.waitForTimeout(remaining);
  const video = page.video()!;
  await context.close();
  await video.saveAs("docs/assets/walkthrough.webm");
  const screens = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1080 },
    reducedMotion: "reduce",
  });
  const screenshot = await screens.newPage();
  await screenshot.goto("/");
  await screenshot.evaluate(() => document.fonts.ready);
  await screenshot.screenshot({
    path: "docs/assets/landing-desktop.png",
    fullPage: true,
  });
  await screenshot
    .getByRole("button", { name: "Try as owner", exact: true })
    .click();
  await expect(
    screenshot.getByRole("heading", { name: "Maintenance queue", exact: true }),
  ).toBeVisible();
  await expect(screenshot.locator(".stat strong").first()).not.toHaveText("0");
  // Remove only the walkthrough record before capturing the seeded dashboard.
  await rpc("test_cleanup", { equipmentIds: ids });
  ids.length = 0;
  await screenshot.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(screenshot.locator(".stat strong").first()).toHaveText("8");
  await screenshot.screenshot({
    path: "docs/assets/dashboard-desktop.png",
    fullPage: true,
  });
  const eq = await rpc<{ items: { id: string; name: string }[] }>(
    "equipment_list",
    { limit: 100 },
  );
  const generator = eq.items.find((e) => e.name === "Generator G-01")!;
  await screenshot.goto(`/equipment/view/?id=${generator.id}`);
  await expect(
    screenshot.getByRole("heading", { name: "Generator G-01", exact: true }),
  ).toBeVisible();
  await screenshot.screenshot({
    path: "docs/assets/equipment-desktop.png",
    fullPage: true,
  });
  await screenshot
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: "Cost reports", exact: true })
    .click();
  await expect(screenshot.locator(".report-total strong")).toBeVisible();
  await screenshot.screenshot({
    path: "docs/assets/report-desktop.png",
    fullPage: true,
  });
  await screens.close();
  const mobile = await browser.newContext({
    baseURL: origin,
    viewport: { width: 360, height: 800 },
    reducedMotion: "reduce",
  });
  const phone = await mobile.newPage();
  await phone.goto(`/equipment/${generator.id}`);
  await phone
    .getByRole("button", { name: "Try as staff", exact: true })
    .click();
  await expect(
    phone.getByRole("heading", { name: "Generator G-01", exact: true }),
  ).toBeVisible();
  await phone.screenshot({
    path: "docs/assets/equipment-mobile.png",
    fullPage: true,
  });
  await phone.getByRole("button", { name: "Log reading", exact: true }).click();
  await phone.getByLabel("New cumulative hours").fill("150.0");
  await phone.screenshot({
    path: "docs/assets/reading-mobile.png",
    fullPage: true,
  });
  await mobile.close();
  console.log(
    "Captured actual desktop/mobile screens and the staff workflow video; only tagged recording fixtures were removed.",
  );
} finally {
  await browser.close();
  if (ids.length) await rpc("test_cleanup", { equipmentIds: ids });
  await rpc("session_delete");
}
