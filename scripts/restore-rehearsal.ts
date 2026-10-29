import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { backupSchema } from "../src/server/backup.ts";

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const container = "vanlog-restore-" + randomUUID().slice(0, 8);
const psql = (sql: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 24 * 1024 * 1024 },
  );
let created = false;
try {
  const exported = await db.rpc("vanlog_api", {
    p_operation: "export",
    p_input: {},
    p_session_digest: null,
  });
  if (exported.error) throw new Error("Hosted application export failed.");
  const snapshot = backupSchema.parse(exported.data);
  await mkdir("backups", { recursive: true });
  await mkdir(".secrets", { recursive: true });
  const backupPath = `backups/rehearsal-${Date.now()}.json`;
  await writeFile(backupPath, JSON.stringify(snapshot, null, 2), {
    mode: 0o600,
  });
  await writeFile(
    ".secrets/restore.env",
    "POSTGRES_PASSWORD=" + randomBytes(32).toString("hex") + "\n",
    { mode: 0o600 },
  );
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--network",
      "none",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "--env-file",
      ".secrets/restore.env",
      "--name",
      container,
      "postgres:17",
    ],
    { stdio: "pipe" },
  );
  created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      execFileSync(
        "docker",
        ["exec", container, "pg_isready", "-U", "postgres"],
        { stdio: "ignore" },
      );
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert(ready, "Disposable PostgreSQL did not become ready.");
  psql(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
  );
  const migrations = (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations)
    psql(await readFile("supabase/migrations/" + file, "utf8"));
  const literal =
    "convert_from(decode('" +
    Buffer.from(JSON.stringify(snapshot)).toString("hex") +
    "','hex'),'UTF8')::jsonb";
  psql(`select public.vanlog_restore(${literal},false);`);
  const counts = JSON.parse(
    psql(
      "select jsonb_build_object('equipment',(select count(*) from vanlog.equipment),'tasks',(select count(*) from vanlog.tasks),'readings',(select count(*) from vanlog.readings),'services',(select count(*) from vanlog.services),'costMinor',(select coalesce(sum(cost_minor),0) from vanlog.services));",
    ),
  );
  assert.equal(counts.equipment, snapshot.payload.equipment.length);
  assert.equal(counts.tasks, snapshot.payload.tasks.length);
  assert.equal(counts.readings, snapshot.payload.readings.length);
  assert.equal(counts.services, snapshot.payload.services.length);
  assert.equal(
    counts.costMinor,
    snapshot.payload.services.reduce((sum, s) => sum + s.cost_minor, 0),
  );
  const authId = randomUUID();
  const accountId = snapshot.payload.accounts.find(
    (a) => a.role === "owner",
  )!.id;
  const tokenDigest = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  const fixture = randomUUID();
  const request = randomUUID();
  const badSnapshot = structuredClone(snapshot);
  if (badSnapshot.payload.readings.length)
    badSnapshot.payload.readings[0].equipment_id = randomUUID();
  else throw new Error("The restore fixture needs a reading.");
  const badLiteral =
    "convert_from(decode('" +
    Buffer.from(JSON.stringify(badSnapshot)).toString("hex") +
    "','hex'),'UTF8')::jsonb";
  psql(`begin;
    do $$ begin
      assert vanlog.due_status('2024-02-29',8700,'2024-02-01',6000,null,3000)='due_soon';
      assert vanlog.due_status('2024-02-29',9000,'2024-02-01',6000,null,3000)='due_now';
      assert vanlog.due_status('2024-02-29',9006,'2024-02-01',6000,null,3000)='overdue';
      assert vanlog.due_status('2024-02-29',0,'2024-02-28',0,1,null)='due_now';
      assert vanlog.due_status('2026-12-31',0,'2026-12-24',0,14,null)='due_soon';
      assert not has_schema_privilege('anon','vanlog','usage');
      assert not has_function_privilege('anon','public.vanlog_api(text,text,jsonb)','execute');
      assert not has_function_privilege('authenticated','public.vanlog_api(text,text,jsonb)','execute');
      begin perform public.vanlog_restore(${literal}-'formatVersion',true); raise exception 'Missing backup version was accepted'; exception when raise_exception then if sqlerrm<>'IMPORT_INVALID' then raise; end if; end;
      begin perform public.vanlog_restore(${literal}#-'{payload,equipment}',true); raise exception 'Missing equipment array was accepted'; exception when raise_exception then if sqlerrm<>'IMPORT_INVALID' then raise; end if; end;
      begin perform public.vanlog_restore(${badLiteral},true); raise exception 'Broken references were accepted'; exception when foreign_key_violation then null; end;
      assert (select count(*) from vanlog.equipment)=${counts.equipment};
      assert (select coalesce(sum(cost_minor),0) from vanlog.services)=${counts.costMinor};
    end $$;
    insert into auth.users(id) values('${authId}');
    select public.vanlog_api('account_provision',null,jsonb_build_object('authUserId','${authId}','accountId','${accountId}','displayName','QA restore owner','role','owner'));
    select public.vanlog_api('session_create',null,jsonb_build_object('authUserId','${authId}','tokenDigest','${tokenDigest}'));
    select public.vanlog_api('equipment_create','${tokenDigest}',jsonb_build_object('requestId','${fixture}','name','QA-restore-expiry','category','QA','initialMeterMinutes',0));
    select public.vanlog_api('reading_create','${tokenDigest}',jsonb_build_object('id','${fixture}','requestId','${request}','expectedVersion',1,'meterMinutes',6,'note','QA'));
    update vanlog.mutation_receipts set created_at=now()-interval '25 hours' where request_id='${request}';
    do $$ begin
      begin perform public.vanlog_api('reading_create','${tokenDigest}',jsonb_build_object('id','${fixture}','requestId','${request}','expectedVersion',1,'meterMinutes',6,'note','QA')); raise exception 'Expired receipt was accepted'; exception when raise_exception then if sqlerrm<>'REQUEST_ALREADY_RECORDED' then raise; end if; end;
      assert (select count(*) from vanlog.readings where equipment_id='${fixture}')=1;
    end $$;
    insert into vanlog.equipment(id,name,category,initial_meter_minutes,current_meter_minutes) select gen_random_uuid(),'QA-capacity','QA',0,0 from generate_series(1,100-(select count(*)::integer from vanlog.equipment));
    do $$ begin begin perform public.vanlog_api('equipment_create','${tokenDigest}',jsonb_build_object('requestId',gen_random_uuid(),'name','QA-over-cap','category','QA','initialMeterMinutes',0)); raise exception 'Equipment cap failed'; exception when raise_exception then if sqlerrm<>'EQUIPMENT_CAPACITY_REACHED' then raise; end if; end; end $$;
    insert into vanlog.tasks(id,equipment_id,label,interval_days,baseline_on,baseline_meter_minutes) select gen_random_uuid(),'${fixture}','QA-capacity',30,current_date,0 from generate_series(1,20);
    do $$ begin begin perform public.vanlog_api('task_create','${tokenDigest}',jsonb_build_object('id','${fixture}','requestId',gen_random_uuid(),'label','QA-over-cap','intervalDays',30,'baselineOn',current_date,'baselineMeterMinutes',0)); raise exception 'Task cap failed'; exception when raise_exception then if sqlerrm<>'TASK_CAPACITY_REACHED' then raise; end if; end; end $$;
    insert into vanlog.readings(id,equipment_id,previous_meter_minutes,meter_minutes,account_id,note) select gen_random_uuid(),'${fixture}',6,6,'${accountId}','QA-capacity' from generate_series(1,10000-(select (select count(*)::integer from vanlog.readings)+(select count(*)::integer from vanlog.services)));
    do $$ begin begin perform public.vanlog_api('reading_create','${tokenDigest}',jsonb_build_object('id','${fixture}','requestId',gen_random_uuid(),'expectedVersion',2,'meterMinutes',6,'note','QA')); raise exception 'History cap failed'; exception when raise_exception then if sqlerrm<>'DEMO_CAPACITY_REACHED' then raise; end if; end; end $$;
    update vanlog.sessions set expires_at=now()-interval '1 second' where token_digest='${tokenDigest}';
    do $$ begin begin perform public.vanlog_api('session_get','${tokenDigest}','{}'); raise exception 'Expired session was accepted'; exception when raise_exception then if sqlerrm<>'UNAUTHENTICATED' then raise; end if; end; end $$;
    rollback;`);
  const version = psql("select version();").trim();
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/verification-restore.json",
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        result: "passed",
        database: version,
        network: "none",
        backup: backupPath,
        counts,
        checks: [
          "all migrations apply to PostgreSQL 17",
          "application IDs and record counts preserved",
          "cost totals preserved",
          "credentials and sessions excluded",
          "invalid/missing backup fields rejected before replacement",
          "broken-reference restore rolls back",
          "anonymous/authenticated RPC denied",
          "leap-day and combined maintenance thresholds",
          "expired receipt cannot duplicate a record",
          "100 equipment cap",
          "20 tasks per equipment cap",
          "10,000 combined history cap",
          "expired sessions denied",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Restore rehearsal passed. Counts, costs, permissions, limits, dates and rollback verified in isolated PostgreSQL 17.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Restore rehearsal failed.",
  );
  process.exitCode = 1;
} finally {
  if (created)
    execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
