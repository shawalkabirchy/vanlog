import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { addDays } from "../../src/lib/domain";
import type {
  Collection,
  CostReport,
  Equipment,
  HistoryEntry,
  MaintenanceTask,
  User,
} from "../../src/lib/types";

const origin = process.env.TEST_ORIGIN || "http://localhost:8788";
const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const run = crypto.randomUUID().slice(0, 8);
const ids: string[] = [];
let owner = "",
  staff = "";
let generator: Equipment;
let oil: MaintenanceTask;
let today: string;
async function call<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  data?: unknown,
  session = owner,
  extra: Record<string, string> = {},
) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(session ? { Cookie: session } : {}),
      ...(method !== "GET"
        ? { Origin: origin, "Content-Type": "application/json" }
        : {}),
      ...extra,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return {
    status: response.status,
    headers: response.headers,
    data:
      response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T),
  };
}
async function need<T>(
  path: string,
  method = "GET",
  data?: unknown,
  session = owner,
  status = 200,
) {
  const result = await call<T>(path, method, data, session);
  if (result.status !== status)
    throw new Error(
      `${method} ${path} returned ${result.status}: ${JSON.stringify(result.data)}`,
    );
  return result.data;
}
async function equipment(suffix: string, initial = 0) {
  const row = await need<Equipment>(
    "/api/equipment",
    "POST",
    {
      requestId: crypto.randomUUID(),
      name: `QA-${run}-${suffix}`,
      category: "QA fixture",
      initialMeterMinutes: initial,
    },
    owner,
    201,
  );
  ids.push(row.id);
  await writeFile(
    `.secrets/integration-${run}.json`,
    JSON.stringify({ equipmentIds: ids }),
  );
  return row;
}
async function task(eq: Equipment, extra: Record<string, unknown> = {}) {
  return need<MaintenanceTask>(
    `/api/equipment/${eq.id}/tasks`,
    "POST",
    {
      requestId: crypto.randomUUID(),
      label: "QA oil change",
      intervalMinutes: 3000,
      baselineOn: today,
      baselineMeterMinutes: eq.currentMeterMinutes,
      ...extra,
    },
    owner,
    201,
  );
}
async function detail(id: string) {
  return need<{ equipment: Equipment; tasks: MaintenanceTask[] }>(
    `/api/equipment/${id}`,
  );
}

beforeAll(async () => {
  await mkdir(".secrets", { recursive: true });
  for (const role of ["OWNER", "STAFF"]) {
    const result = await call<{ user: User }>(
      "/api/auth/session",
      "POST",
      {
        email: process.env[`QA_${role}_EMAIL`],
        password: process.env[`QA_${role}_PASSWORD`],
      },
      "",
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");
    expect(result.headers.get("set-cookie")).toContain("SameSite=Strict");
    const value = result.headers.get("set-cookie")!.split(";")[0];
    if (role === "OWNER") owner = value;
    else staff = value;
  }
  today = (await need<{ businessDate: string }>("/api/config")).businessDate;
  generator = await equipment("generator", 6000);
  oil = await task(generator);
});
afterAll(async () => {
  try {
    const result = await admin.rpc("vanlog_api", {
      p_operation: "test_cleanup",
      p_input: { equipmentIds: ids },
      p_session_digest: null,
    });
    if (result.error) throw result.error;
  } finally {
    if (owner) await call("/api/auth/session", "DELETE", undefined, owner);
    if (staff) await call("/api/auth/session", "DELETE", undefined, staff);
  }
});
describe("hosted Supabase and real Pages Functions", () => {
  it("blocks public signup and direct database RPC access", async () => {
    const publicClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const signup = await publicClient.auth.signUp({
      email: `qa-rejected-${run}@vanlog.example.com`,
      password: crypto.randomUUID() + crypto.randomUUID(),
    });
    if (signup.data.user) {
      await admin.auth.admin.deleteUser(signup.data.user.id);
      throw new Error("Public registration was enabled.");
    }
    expect(signup.error?.code).toBe("signup_disabled");
    const result = await publicClient.rpc("vanlog_api", {
      p_operation: "dashboard",
    });
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
    const login = await publicClient.auth.signInWithPassword({
      email: process.env.QA_STAFF_EMAIL!,
      password: process.env.QA_STAFF_PASSWORD!,
    });
    expect(login.error).toBeNull();
    const authenticated = await publicClient.rpc("vanlog_api", {
      p_operation: "dashboard",
    });
    expect(authenticated.error).not.toBeNull();
    await publicClient.auth.signOut();
  });
  it("rejects staff owner actions and forged fields", async () => {
    expect(
      (
        await call(
          `/api/tasks/${oil.id}`,
          "PATCH",
          { expectedVersion: 1, intervalDays: 30 },
          staff,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          `/api/reports/costs?startOn=${today}&endOn=${addDays(today, 1)}`,
          "GET",
          undefined,
          staff,
        )
      ).status,
    ).toBe(403);
    expect((await call("/api/history", "GET", undefined, staff)).status).toBe(
      403,
    );
    expect(
      (await call("/api/equipment?archived=true", "GET", undefined, staff))
        .status,
    ).toBe(403);
    expect(
      (
        await call(
          `/api/equipment/${generator.id}/readings`,
          "POST",
          {
            requestId: crypto.randomUUID(),
            expectedVersion: 1,
            meterMinutes: 6006,
            note: "",
            accountId: crypto.randomUUID(),
          },
          staff,
        )
      ).status,
    ).toBe(422);
  });
  it("computes runtime thresholds exactly and rejects decreasing meters", async () => {
    for (const [meter, status] of [
      [8700, "due_soon"],
      [9000, "due_now"],
      [9006, "overdue"],
    ] as const) {
      const saved = await need<{ equipment: Equipment }>(
        `/api/equipment/${generator.id}/readings`,
        "POST",
        {
          requestId: crypto.randomUUID(),
          expectedVersion: generator.version,
          meterMinutes: meter,
          note: "QA threshold fixture",
        },
        staff,
        201,
      );
      generator = saved.equipment;
      expect((await detail(generator.id)).tasks[0].status).toBe(status);
    }
    const rejected = await call(
      `/api/equipment/${generator.id}/readings`,
      "POST",
      {
        requestId: crypto.randomUUID(),
        expectedVersion: generator.version,
        meterMinutes: 6000,
        note: "",
      },
      staff,
    );
    expect(rejected.status).toBe(422);
  });
  it("serializes competing readings and appends only one history record", async () => {
    const eq = await equipment("race");
    const outcomes = await Promise.all(
      [6, 12].map((meterMinutes) =>
        call(
          `/api/equipment/${eq.id}/readings`,
          "POST",
          {
            requestId: crypto.randomUUID(),
            expectedVersion: 1,
            meterMinutes,
            note: "QA concurrency",
          },
          staff,
        ),
      ),
    );
    expect(outcomes.map((v) => v.status).sort()).toEqual([201, 409]);
    const current = await detail(eq.id);
    expect([6, 12]).toContain(current.equipment.currentMeterMinutes);
    expect(current.equipment.version).toBe(2);
    expect(
      (await need<Collection<HistoryEntry>>(`/api/equipment/${eq.id}/history`))
        .items,
    ).toHaveLength(1);
  });
  it("replays committed service requests without duplicate costs", async () => {
    const payload = {
      requestId: crypto.randomUUID(),
      expectedEquipmentVersion: generator.version,
      costMinor: 1234,
      note: "QA idempotent completion",
    };
    const responses = await Promise.all([
      call<{ equipment: Equipment }>(
        `/api/tasks/${oil.id}/services`,
        "POST",
        payload,
        staff,
      ),
      call<{ equipment: Equipment }>(
        `/api/tasks/${oil.id}/services`,
        "POST",
        payload,
        staff,
      ),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].data).toEqual(responses[1].data);
    generator = responses[0].data.equipment;
    expect(
      (
        await call(
          `/api/tasks/${oil.id}/services`,
          "POST",
          { ...payload, costMinor: 999 },
          staff,
        )
      ).status,
    ).toBe(409);
    const history = await need<Collection<HistoryEntry>>(
      `/api/equipment/${generator.id}/history`,
    );
    expect(history.items.filter((e) => e.kind === "service")).toHaveLength(1);
    expect((await detail(generator.id)).tasks[0].status).toBe("current");
    const staffHistory = await need<Collection<HistoryEntry>>(
      `/api/equipment/${generator.id}/history`,
      "GET",
      undefined,
      staff,
    );
    for (const entry of staffHistory.items)
      expect(entry).not.toHaveProperty("costMinor");
  });
  it("keeps stale service attempts out of history", async () => {
    expect(
      (
        await call(
          `/api/tasks/${oil.id}/services`,
          "POST",
          {
            requestId: crypto.randomUUID(),
            expectedEquipmentVersion: 1,
            costMinor: 500,
            note: "QA stale",
          },
          staff,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await need<Collection<HistoryEntry>>(
          `/api/equipment/${generator.id}/history`,
        )
      ).items.filter((e) => e.kind === "service"),
    ).toHaveLength(1);
  });
  it("serializes service completion against a simultaneous reading", async () => {
    const eq = await equipment("mixed-race");
    const schedule = await task(eq);
    const outcomes = await Promise.all([
      call(
        `/api/equipment/${eq.id}/readings`,
        "POST",
        {
          requestId: crypto.randomUUID(),
          expectedVersion: 1,
          meterMinutes: 6,
          note: "",
        },
        staff,
      ),
      call(
        `/api/tasks/${schedule.id}/services`,
        "POST",
        {
          requestId: crypto.randomUUID(),
          expectedEquipmentVersion: 1,
          costMinor: 0,
          note: "",
        },
        staff,
      ),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await detail(eq.id)).equipment.version).toBe(2);
    expect(
      (await need<Collection<HistoryEntry>>(`/api/equipment/${eq.id}/history`))
        .items,
    ).toHaveLength(1);
  });
  it("uses calendar thresholds and the most urgent combined status", async () => {
    const eq = await equipment("calendar", 6000);
    const calendar = await task(eq, {
      label: "QA calendar",
      intervalDays: 10,
      intervalMinutes: 300000,
      baselineOn: addDays(today, -10),
    });
    expect(calendar.status).toBe("due_now");
    const soon = await task(eq, {
      label: "QA calendar soon",
      intervalDays: 10,
      intervalMinutes: 300000,
      baselineOn: addDays(today, -3),
    });
    expect(soon.status).toBe("due_soon");
    const overdue = await task(eq, {
      label: "QA combined",
      intervalDays: 10,
      intervalMinutes: 300000,
      baselineOn: addDays(today, -11),
    });
    expect(overdue.status).toBe("overdue");
    expect(
      (
        await call(`/api/equipment/${eq.id}/tasks`, "POST", {
          requestId: crypto.randomUUID(),
          label: "QA future",
          intervalDays: 1,
          baselineOn: addDays(today, 1),
          baselineMeterMinutes: 0,
        })
      ).status,
    ).toBe(422);
  });
  it("retains archive history and blocks new logs", async () => {
    generator = await need<Equipment>(
      `/api/equipment/${generator.id}`,
      "PATCH",
      { expectedVersion: generator.version, archived: true },
    );
    expect(
      (
        await call(
          `/api/equipment/${generator.id}/readings`,
          "POST",
          {
            requestId: crypto.randomUUID(),
            expectedVersion: generator.version,
            meterMinutes: 9012,
            note: "",
          },
          staff,
        )
      ).status,
    ).toBe(409);
    expect(
      (await call(`/api/equipment/${generator.id}`, "GET", undefined, staff))
        .status,
    ).toBe(404);
    expect(
      (
        await need<Collection<HistoryEntry>>(
          `/api/equipment/${generator.id}/history`,
        )
      ).items.length,
    ).toBe(4);
    generator = await need<Equipment>(
      `/api/equipment/${generator.id}`,
      "PATCH",
      { expectedVersion: generator.version, archived: false },
    );
    const current = (await detail(generator.id)).tasks[0];
    await need(`/api/tasks/${current.id}`, "PATCH", {
      expectedVersion: current.version,
      archived: true,
    });
    expect(
      (
        await call(
          `/api/tasks/${current.id}/services`,
          "POST",
          {
            requestId: crypto.randomUUID(),
            expectedEquipmentVersion: generator.version,
            costMinor: 0,
            note: "",
          },
          staff,
        )
      ).status,
    ).toBe(409);
  });
  it("paginates without exposing cursor internals or restarting bad cursors", async () => {
    const first = await need<Collection<Equipment>>("/api/equipment?limit=2");
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    expect(first.items[0]).not.toHaveProperty("_sortKey");
    const second = await need<Collection<Equipment>>(
      "/api/equipment?limit=2&cursor=" + first.nextCursor,
    );
    expect(
      second.items.some((e) => first.items.some((f) => f.id === e.id)),
    ).toBe(false);
    expect(
      (await call("/api/equipment?limit=2&q=other&cursor=" + first.nextCursor))
        .status,
    ).toBe(422);
    expect((await call("/api/equipment?cursor=not-a-cursor")).status).toBe(422);
  });
  it("reports exact costs and treats end dates as exclusive", async () => {
    const report = await need<CostReport>(
      `/api/reports/costs?startOn=${today}&endOn=${addDays(today, 1)}`,
    );
    expect(
      report.equipmentTotals.find((e) => e.equipmentId === generator.id)
        ?.costMinor,
    ).toBe(1234);
    expect(Number.isSafeInteger(report.totalMinor)).toBe(true);
    const previous = await need<CostReport>(
      `/api/reports/costs?startOn=${addDays(today, -1)}&endOn=${today}`,
    );
    expect(
      previous.equipmentTotals.some((e) => e.equipmentId === generator.id),
    ).toBe(false);
  });
  it("rejects cross-origin, oversized, and unknown API requests", async () => {
    expect(
      (
        await call(
          "/api/equipment",
          "POST",
          {
            requestId: crypto.randomUUID(),
            name: "QA",
            category: "QA",
            initialMeterMinutes: 0,
          },
          owner,
          { Origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await call("/api/equipment", "POST", { note: "a".repeat(66000) }))
        .status,
    ).toBe(413);
    const missing = await call("/api/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("application/json");
    expect((await call(`/api/equipment/${crypto.randomUUID()}`)).status).toBe(
      404,
    );
  });
  it("increments distributed rate limits atomically", async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        admin.rpc("vanlog_rate", {
          p_scope: "qa-rate:" + run,
          p_limit: 2,
          p_seconds: 60,
        }),
      ),
    );
    expect(results.filter((r) => r.data?.allowed)).toHaveLength(2);
    expect(results.some((r) => r.data?.retryAfter > 0)).toBe(true);
  });
  it("revokes disabled accounts and rejects new application sessions", async () => {
    const users = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUserId = users.data.users.find(
      (u) => u.email === process.env.QA_STAFF_EMAIL,
    )!.id;
    expect(
      (await call("/api/auth/session", "GET", undefined, staff)).status,
    ).toBe(200);
    const disabled = await admin.rpc("vanlog_api", {
      p_operation: "account_disable",
      p_input: { authUserId },
    });
    expect(disabled.error).toBeNull();
    try {
      expect(
        (await call("/api/auth/session", "GET", undefined, staff)).status,
      ).toBe(401);
      const denied = await admin.rpc("vanlog_api", {
        p_operation: "session_create",
        p_input: { authUserId, tokenDigest: "1".repeat(64) },
      });
      expect(denied.error?.message).toBe("UNAUTHENTICATED");
    } finally {
      const restored = await admin.rpc("vanlog_api", {
        p_operation: "account_provision",
        p_input: { authUserId, displayName: "QA Staff", role: "staff" },
      });
      expect(restored.error).toBeNull();
    }
    expect(
      (await call("/api/auth/session", "GET", undefined, staff)).status,
    ).toBe(401);
    expect(
      (await call("/api/auth/session", "DELETE", undefined, staff)).status,
    ).toBe(204);
  });
});
