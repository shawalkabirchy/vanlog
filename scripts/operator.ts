import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { backupSchema } from "../src/server/backup.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    file: { type: "string" },
    "account-id": { type: "string" },
    "confirm-project": { type: "string" },
  },
});
const command = positionals[0];
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
if (!url || !key)
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SECRET_KEY privately before running operator commands.",
  );
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const project = new URL(url).hostname.split(".")[0];
async function rpc<T = Record<string, unknown>>(
  operation: string,
  input: Record<string, unknown> = {},
  token: string | null = null,
): Promise<T> {
  const { data, error } = await db.rpc("vanlog_api", {
    p_operation: operation,
    p_input: input,
    p_session_digest: token,
  });
  if (error)
    throw new Error(
      `Operation ${operation} failed (${error.code}): ${error.message}`,
    );
  return data as T;
}
async function authUser(email: string, password: string) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error("Could not list project accounts.");
  let user = data.users.find((u) => u.email === email);
  if (!user) {
    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(
        "Could not provision the requested Auth account: " +
          created.error?.message,
      );
    user = created.data.user;
  }
  return user;
}
async function provision(
  email: string,
  password: string,
  name: string,
  role: string,
  accountId?: string,
) {
  if (!["owner", "staff"].includes(role))
    throw new Error("Role must be owner or staff.");
  const user = await authUser(email, password);
  const profile = await rpc<{ id: string; displayName: string; role: string }>(
    "account_provision",
    {
      authUserId: user.id,
      displayName: name,
      role,
      ...(accountId ? { accountId } : {}),
    },
  );
  const updated = await db.auth.admin.updateUserById(user.id, {
    password,
    ban_duration: "none",
  });
  if (updated.error)
    throw new Error(
      "Account sessions were revoked, but its password could not be set. Retry provisioning.",
    );
  return { ...profile, authUserId: user.id };
}
async function backup() {
  const data = await rpc("export");
  await mkdir("backups", { recursive: true });
  const path = `backups/vanlog-${new Date().toISOString().replaceAll(":", "-")}.json`;
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  console.log("Application backup saved to " + path);
  return path;
}
async function seed() {
  const owner = await authUser(
    process.env.DEMO_OWNER_EMAIL!,
    process.env.DEMO_OWNER_PASSWORD!,
  );
  const token = randomBytes(32).toString("hex");
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  await rpc("session_create", { authUserId: owner.id, tokenDigest });
  try {
    const existing = await rpc<{ items: unknown[] }>(
      "equipment_list",
      { limit: 1 },
      tokenDigest,
    );
    if (existing.items.length)
      throw new Error(
        "Equipment already exists. Use demo-reset with an explicit project confirmation.",
      );
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.BUSINESS_TIME_ZONE || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const ago = (days: number) => {
      const d = new Date(date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().slice(0, 10);
    };
    const definitions = [
      {
        name: "Generator G-01",
        category: "Power",
        initial: 100,
        current: 145,
        tasks: [
          {
            label: "Oil & filter change",
            hours: 50,
            baseHours: 100,
            daysAgo: 10,
          },
          {
            label: "Air filter inspection",
            days: 90,
            baseHours: 100,
            daysAgo: 100,
          },
        ],
      },
      {
        name: "Fresh-water pump",
        category: "Plumbing",
        initial: 38,
        current: 42,
        tasks: [
          {
            label: "Pump & hose inspection",
            days: 30,
            baseHours: 38,
            daysAgo: 30,
          },
        ],
      },
      {
        name: "Upright refrigerator",
        category: "Refrigeration",
        initial: 400,
        current: 420,
        tasks: [
          {
            label: "Condenser coil cleaning",
            days: 30,
            baseHours: 400,
            daysAgo: 25,
          },
        ],
      },
      {
        name: "Ventilation hood",
        category: "Ventilation",
        initial: 220,
        current: 232,
        tasks: [
          {
            label: "Grease filter service",
            days: 14,
            baseHours: 220,
            daysAgo: 20,
          },
        ],
      },
      {
        name: "Flat-top griddle",
        category: "Cooking",
        initial: 80,
        current: 80,
        tasks: [
          {
            label: "Deep clean & inspection",
            hours: 100,
            baseHours: 0,
            daysAgo: 12,
          },
        ],
      },
      {
        name: "Prep cooler",
        category: "Refrigeration",
        initial: 160,
        current: 170,
        tasks: [
          {
            label: "Door seal inspection",
            days: 30,
            baseHours: 160,
            daysAgo: 29,
          },
        ],
      },
      {
        name: "LPG regulator",
        category: "Fuel system",
        initial: 90,
        current: 90,
        tasks: [
          {
            label: "Regulator inspection",
            days: 180,
            baseHours: 90,
            daysAgo: 60,
          },
        ],
      },
      {
        name: "Handwash station",
        category: "Water",
        initial: 25,
        current: 28,
        tasks: [
          {
            label: "Lines & fittings check",
            days: 30,
            baseHours: 25,
            daysAgo: 4,
          },
        ],
      },
    ];
    const manifest: { equipmentIds: string[]; taskIds: string[] } = {
      equipmentIds: [],
      taskIds: [],
    };
    for (const item of definitions) {
      let eq = await rpc<{ id: string; version: number }>(
        "equipment_create",
        {
          requestId: randomUUID(),
          name: item.name,
          category: item.category,
          initialMeterMinutes: item.initial * 60,
        },
        tokenDigest,
      );
      manifest.equipmentIds.push(eq.id);
      if (item.current !== item.initial) {
        const reading = await rpc<{ equipment: typeof eq }>(
          "reading_create",
          {
            id: eq.id,
            requestId: randomUUID(),
            expectedVersion: eq.version,
            meterMinutes: item.current * 60,
            note: "Synthetic sample runtime reading.",
          },
          tokenDigest,
        );
        eq = reading.equipment;
      }
      for (const schedule of item.tasks) {
        const task = await rpc<{ id: string }>(
          "task_create",
          {
            id: eq.id,
            requestId: randomUUID(),
            label: schedule.label,
            ...("days" in schedule
              ? { intervalDays: schedule.days }
              : { intervalMinutes: schedule.hours! * 60 }),
            baselineOn: ago(schedule.daysAgo),
            baselineMeterMinutes: schedule.baseHours * 60,
          },
          tokenDigest,
        );
        manifest.taskIds.push(task.id);
        if (item.name === "Flat-top griddle" || item.name === "LPG regulator") {
          const completed = await rpc<{ equipment: typeof eq }>(
            "service_create",
            {
              id: task.id,
              requestId: randomUUID(),
              expectedEquipmentVersion: eq.version,
              costMinor: item.name === "Flat-top griddle" ? 8950 : 3200,
              note: "Synthetic sample service, created for the portfolio demonstration.",
            },
            tokenDigest,
          );
          eq = completed.equipment;
        }
      }
    }
    await mkdir(".secrets", { recursive: true });
    await writeFile(
      ".secrets/demo-manifest.json",
      JSON.stringify(manifest, null, 2),
    );
    console.log(
      "Loaded eight synthetic equipment records and nine maintenance tasks.",
    );
  } finally {
    await rpc("session_delete", {}, tokenDigest);
  }
}
async function setupDemo() {
  await rpc("configure", {
    currency: process.env.BUSINESS_CURRENCY || "USD",
    timeZone: process.env.BUSINESS_TIME_ZONE || "UTC",
    demoMode: process.env.DEMO_MODE === "true",
  });
  await provision(
    process.env.DEMO_OWNER_EMAIL!,
    process.env.DEMO_OWNER_PASSWORD!,
    "Alex Morgan",
    "owner",
  );
  await provision(
    process.env.DEMO_STAFF_EMAIL!,
    process.env.DEMO_STAFF_PASSWORD!,
    "Jordan Lee",
    "staff",
  );
  console.log(
    "Demo owner and staff accounts provisioned. Credentials remain in .dev.vars.",
  );
}
async function main() {
  if (command === "setup-demo") {
    await setupDemo();
    return;
  }
  if (command === "seed") {
    await seed();
    return;
  }
  if (command === "backup") {
    await backup();
    return;
  }
  if (command === "cleanup") {
    await rpc("cleanup");
    console.log(
      "Expired sessions, rate buckets and receipts cleaned in bounded batches.",
    );
    return;
  }
  if (command === "demo-reset") {
    if (
      process.env.DEMO_MODE !== "true" ||
      values["confirm-project"] !== project
    )
      throw new Error(
        "A reset requires DEMO_MODE=true and --confirm-project matching the configured project.",
      );
    await backup();
    await rpc("demo_reset");
    await setupDemo();
    await seed();
    return;
  }
  if (command === "test-cleanup") {
    if (!values.file)
      throw new Error("Provide the test fixture manifest with --file.");
    const manifest = JSON.parse(await readFile(values.file, "utf8"));
    await rpc("test_cleanup", { equipmentIds: manifest.equipmentIds });
    console.log("Only the tagged test fixture IDs were removed.");
    return;
  }
  if (command === "restore") {
    if (!values.file || values["confirm-project"] !== project)
      throw new Error(
        "Restore requires --file and --confirm-project matching the configured project.",
      );
    const text = await readFile(values.file, "utf8");
    if (Buffer.byteLength(text) > 20 * 1024 * 1024)
      throw new Error("Backup exceeds 20 MiB.");
    const parsed = backupSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      throw new Error(
        "Backup validation failed. Existing records were not changed.",
      );
    const snapshot = parsed.data;
    await backup();
    const { error } = await db.rpc("vanlog_restore", {
      p_backup: snapshot,
      p_replace: true,
    });
    if (error)
      throw new Error(
        "Restore failed; the database transaction preserved its previous state.",
      );
    console.log(
      "Application records restored. Sessions were revoked; re-provision account bindings before signing in.",
    );
    return;
  }
  if (command === "provision") {
    if (!values.email || !values.name || !values.role)
      throw new Error("Provide --email, --name and --role owner|staff.");
    const password = randomBytes(32).toString("base64url");
    const profile = await provision(
      values.email,
      password,
      values.name,
      values.role,
      values["account-id"],
    );
    await mkdir(".secrets", { recursive: true });
    const path = `.secrets/account-${profile.id}.json`;
    await writeFile(
      path,
      JSON.stringify({ email: values.email, password, ...profile }, null, 2),
      { mode: 0o600 },
    );
    console.log("Account details saved privately to " + path);
    return;
  }
  if (command === "rotate" || command === "disable") {
    if (!values.email) throw new Error("Provide --email.");
    const users = await db.auth.admin.listUsers({ perPage: 1000 });
    const user = users.data.users.find((u) => u.email === values.email);
    if (!user) throw new Error("Account not found.");
    await rpc(command === "disable" ? "account_disable" : "account_revoke", {
      authUserId: user.id,
    });
    const password = randomBytes(32).toString("base64url");
    const changed = await db.auth.admin.updateUserById(
      user.id,
      command === "disable" ? { ban_duration: "876000h" } : { password },
    );
    if (changed.error)
      throw new Error(
        "Application sessions were revoked, but the Auth update failed. Retry the command.",
      );
    if (command === "rotate") {
      await mkdir(".secrets", { recursive: true });
      await writeFile(
        `.secrets/rotation-${user.id}.json`,
        JSON.stringify({ email: user.email, password }),
        { mode: 0o600 },
      );
    }
    console.log(
      "Account updated and all application sessions revoked. New credentials, if any, are in .secrets.",
    );
    return;
  }
  if (command === "setup-qa") {
    let settings: Record<string, string>;
    try {
      settings = JSON.parse(await readFile(".secrets/qa.json", "utf8"));
    } catch {
      settings = {
        QA_OWNER_EMAIL: "qa-owner@vanlog.example.com",
        QA_OWNER_PASSWORD: randomBytes(32).toString("base64url"),
        QA_STAFF_EMAIL: "qa-staff@vanlog.example.com",
        QA_STAFF_PASSWORD: randomBytes(32).toString("base64url"),
      };
    }
    await provision(
      settings.QA_OWNER_EMAIL,
      settings.QA_OWNER_PASSWORD,
      "QA Owner",
      "owner",
    );
    await provision(
      settings.QA_STAFF_EMAIL,
      settings.QA_STAFF_PASSWORD,
      "QA Staff",
      "staff",
    );
    await mkdir(".secrets", { recursive: true });
    await writeFile(".secrets/qa.json", JSON.stringify(settings), {
      mode: 0o600,
    });
    if (!process.env.QA_OWNER_EMAIL)
      await appendFile(
        ".dev.vars",
        "\n" +
          Object.entries(settings)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join("\n") +
          "\n",
      );
    console.log("Dedicated QA accounts configured privately.");
    return;
  }
  console.log(
    "Commands: setup-demo, seed, backup, cleanup, setup-qa, provision, rotate, disable, demo-reset, test-cleanup, restore. Destructive maintenance requires an exact project confirmation.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
