import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("owner setup, staff QR logging, uncertain retry, service and cost export", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const equipmentIds: string[] = [];
  const run = randomUUID().slice(0, 8);
  const name = `QA-${info.project.name}-${run}`;
  const manifestPath = `.secrets/browser-${run}.json`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const localHeaders: Record<string, string> =
    new URL(baseURL!).hostname === "localhost"
      ? { "CF-Connecting-IP": `192.0.2.${1 + Math.floor(Math.random() * 253)}` }
      : {};
  await page.context().setExtraHTTPHeaders(localHeaders);
  const staffContext = await browser.newContext({
    viewport: { width: 360, height: 800 },
    baseURL,
    extraHTTPHeaders: localHeaders,
  });
  const staff = await staffContext.newPage();
  staff.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Keep your kitchen moving.",
        level: 1,
      }),
    ).toBeVisible();
    await accessible(page);
    await page.bringToFront();
    await page.keyboard.press("Tab");
    if (info.project.name === "webkit") {
      // Windows WebKit's default tab order skips links, including the skip link.
      await expect(
        page.getByRole("button", { name: "Try as owner", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
    } else {
      await expect(
        page.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      await page
        .getByRole("button", { name: "Try as owner", exact: true })
        .click();
    }
    await expect(page).toHaveURL(/\/dashboard\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Equipment, ready",
    );
    await accessible(page);
    await noOverflow(page);
    await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link", { name: "Equipment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add equipment", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Equipment name").fill(name);
    await dialog
      .getByLabel("Category", { exact: true })
      .fill("QA portable power");
    await dialog.getByLabel("Initial cumulative hours").fill("100.0");
    const created = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/equipment") && r.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Save equipment", exact: true })
      .click();
    const response = await created;
    expect(response.status()).toBe(201);
    const eq = (await response.json()) as { id: string };
    equipmentIds.push(eq.id);
    await mkdir(".secrets", { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({ equipmentIds, run, engine: info.project.name }, null, 2),
    );
    await expect(dialog).toBeHidden();
    await page.getByRole("link", { name, exact: true }).click();
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await dialog.getByLabel("Task name").fill("Oil change");
    await dialog.getByLabel("Interval in hours").fill("50.0");
    await dialog.getByLabel("Setup baseline hours").fill("100.0");
    await accessible(page);
    await dialog
      .getByRole("button", { name: "Save task", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Oil change", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "QR label", exact: true }).click();
    await expect(dialog.getByRole("img")).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download SVG" }).click();
    const download = await downloadEvent;
    const svg = await readFile((await download.path())!, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/password|token|secret|session/i);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "QR label", exact: true }),
    ).toBeFocused();

    await staff.goto(`/equipment/${eq.id}`);
    await expect(staff).toHaveURL(/\/login\/\?next=/);
    await staff
      .getByRole("button", { name: "Try as staff", exact: true })
      .click();
    await expect(staff).toHaveURL(
      new RegExp(`/equipment/view/\\?id=${eq.id}$`),
    );
    await expect(staff.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(
      staff.getByRole("button", { name: "Edit equipment", exact: true }),
    ).toHaveCount(0);
    await noOverflow(staff);
    await accessible(staff);
    await staff
      .getByRole("button", { name: "Log reading", exact: true })
      .click();
    await staff.getByLabel("New cumulative hours").fill("145.0");
    await staff
      .getByLabel("Note (optional)")
      .fill("Recovery test: response lost after commit.");
    await expect(
      staff.getByRole("button", { name: "Save reading", exact: true }),
    ).toBeDisabled();
    await staff.getByRole("button", { name: "Confirm large increase" }).click();
    const requestIds: string[] = [];
    await staff.route("**/api/equipment/*/readings", async (route) => {
      requestIds.push(route.request().postDataJSON().requestId);
      if (requestIds.length === 1) {
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        await route.abort("connectionreset");
      } else {
        await route.continue();
      }
    });
    await staff
      .getByRole("button", { name: "Save reading", exact: true })
      .click();
    await expect(
      staff.getByRole("button", { name: "Retry original save" }),
    ).toBeVisible();
    await expect(staff.getByLabel("New cumulative hours")).toHaveValue("145.0");
    await expect(staff.getByLabel("New cumulative hours")).toBeDisabled();
    await staff.getByRole("button", { name: "Retry original save" }).click();
    await expect(
      staff.getByText("Meter reading saved.", { exact: true }),
    ).toBeVisible();
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toBe(requestIds[1]);
    await expect(
      staff.locator(".task-card").getByText("Due soon", { exact: true }),
    ).toBeVisible();
    await staff.unroute("**/api/equipment/*/readings");
    await staff
      .getByRole("button", { name: "Log reading", exact: true })
      .click();
    await staff.getByLabel("New cumulative hours").fill("150.0");
    await staff
      .getByRole("button", { name: "Save reading", exact: true })
      .click();
    await expect(
      staff.locator(".task-card").getByText("Due now", { exact: true }),
    ).toBeVisible();
    await staff
      .getByRole("button", { name: "Complete service", exact: true })
      .click();
    await staff.getByLabel("Cost (USD)", { exact: true }).fill("12.34");
    await staff.getByLabel("Note (optional)").fill("QA oil change completed.");
    await accessible(staff);
    await noOverflow(staff);
    await staff
      .getByRole("button", { name: "Confirm completion", exact: true })
      .click();
    await expect(
      staff.getByText("Service recorded.", { exact: true }),
    ).toBeVisible();
    await expect(
      staff.locator(".task-card").getByText("Current", { exact: true }),
    ).toBeVisible();
    await expect(staff.locator(".activity-list")).not.toContainText("$12.34");
    await staff.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      staff.getByRole("link", { name: "Cost reports", exact: true }),
    ).toHaveCount(0);
    await staff.keyboard.press("Escape");

    await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link", { name: "Cost reports", exact: true })
      .click();
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("$12.34");
    await accessible(page);
    const csvEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const csv = await readFile((await (await csvEvent).path())!, "utf8");
    expect(csv).toContain(`"${name}",1,12.34`);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(row).toBeVisible();
    await noOverflow(page);
    await page.emulateMedia({ media: "screen" });
    await noOverflow(page);
    expect(errors).toEqual([]);
  } finally {
    await staffContext.close();
    if (equipmentIds.length) {
      const result = await admin.rpc("vanlog_api", {
        p_operation: "test_cleanup",
        p_input: { equipmentIds },
        p_session_digest: null,
      });
      expect(result.error).toBeNull();
    }
  }
});
