import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
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
const sessions = Array.from({ length: 10 }, () => {
  const token = randomBytes(32).toString("hex");
  return { token, digest: createHash("sha256").update(token).digest("hex") };
});
const endpoints = [
  "/api/dashboard",
  "/api/equipment?limit=25",
  "/api/tasks?limit=25",
  "/api/history?limit=25",
  "/api/reports/costs",
];
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
endpoints[4] += `?startOn=${today}&endOn=${tomorrow}`;
const samples: { path: string; durationMs: number; status: number }[] = [];
try {
  for (const session of sessions) {
    const result = await db.rpc("vanlog_api", {
      p_operation: "session_create",
      p_input: { authUserId: owner.id, tokenDigest: session.digest },
    });
    assert.ifError(result.error);
  }
  const started = performance.now();
  await Promise.all(
    sessions.map(async (session) => {
      for (const path of endpoints) {
        const start = performance.now();
        const response = await fetch(origin + path, {
          headers: {
            Cookie: `${origin.startsWith("https:") ? "__Host-vanlog_session" : "vanlog_session_local"}=${session.token}`,
          },
          signal: AbortSignal.timeout(15000),
        });
        await response.arrayBuffer();
        samples.push({
          path,
          durationMs: Math.round(performance.now() - start),
          status: response.status,
        });
      }
    }),
  );
  const sorted = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sorted[Math.ceil(sorted.length * fraction) - 1];
  const result = {
    executedAt: new Date().toISOString(),
    origin,
    concurrency: 10,
    sampleCount: samples.length,
    workload:
      "Five sequential owner GETs per visitor; ten distinct demo sessions concurrently. Includes response body transfer. Auth login is excluded.",
    durationMs: Math.round(performance.now() - started),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1),
    targetMs: 1500,
    passed: percentile(0.95) < 1500 && samples.every((s) => s.status === 200),
    client: {
      node: process.version,
      os: platform() + " " + release(),
      cpu: cpus()[0]?.model,
      location: "Dhaka, Bangladesh; local operator network",
    },
    samples,
  };
  await writeFile(
    "docs/verification-performance.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      sampleCount: result.sampleCount,
      p95Ms: result.p95Ms,
      passed: result.passed,
    }),
  );
} finally {
  for (const session of sessions)
    await db.rpc("vanlog_api", {
      p_operation: "session_delete",
      p_session_digest: session.digest,
      p_input: {},
    });
}
