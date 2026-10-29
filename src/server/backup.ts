import { z } from "zod";
import { isCalendarDate } from "../lib/domain.ts";

const id = z.uuid();
const date = z.string().refine(isCalendarDate);
const timestamp = z.iso.datetime({ offset: true });
const meter = z.number().int().min(0).max(6000000).multipleOf(6);
const name = z.string().min(1).max(80);
const stamps = { created_at: timestamp, updated_at: timestamp };
const account = z
  .object({
    id,
    display_name: name,
    role: z.enum(["owner", "staff"]),
    disabled: z.boolean(),
    ...stamps,
  })
  .strict();
const equipment = z
  .object({
    id,
    name,
    category: name,
    initial_meter_minutes: meter,
    current_meter_minutes: meter,
    archived: z.boolean(),
    version: z.number().int().positive(),
    ...stamps,
  })
  .strict()
  .refine((e) => e.current_meter_minutes >= e.initial_meter_minutes);
const task = z
  .object({
    id,
    equipment_id: id,
    label: name,
    interval_days: z.number().int().min(1).max(3650).nullable(),
    interval_minutes: z
      .number()
      .int()
      .min(6)
      .max(600000)
      .multipleOf(6)
      .nullable(),
    baseline_on: date,
    baseline_meter_minutes: meter,
    archived: z.boolean(),
    version: z.number().int().positive(),
    ...stamps,
  })
  .strict()
  .refine((t) => t.interval_days !== null || t.interval_minutes !== null);
const reading = z
  .object({
    id,
    equipment_id: id,
    previous_meter_minutes: meter,
    meter_minutes: meter,
    account_id: id,
    note: z.string().max(1000),
    created_at: timestamp,
  })
  .strict()
  .refine((r) => r.meter_minutes >= r.previous_meter_minutes);
const service = z
  .object({
    id,
    task_id: id,
    equipment_id: id,
    meter_minutes: meter,
    performed_on: date,
    cost_minor: z.number().int().min(0).max(1000000000),
    note: z.string().max(1000),
    account_id: id,
    created_at: timestamp,
  })
  .strict();
export const backupSchema = z
  .object({
    appId: z.literal("P07"),
    formatVersion: z.literal(1),
    exportedAt: timestamp,
    payload: z
      .object({
        settings: z
          .object({
            id: z.literal(true),
            currency: z.enum(["USD", "BDT"]),
            time_zone: z.string().refine((value) => {
              try {
                new Intl.DateTimeFormat("en-US", { timeZone: value });
                return true;
              } catch {
                return false;
              }
            }),
            demo_mode: z.boolean(),
          })
          .strict(),
        accounts: z.array(account).max(10),
        equipment: z.array(equipment).max(100),
        tasks: z.array(task).max(2000),
        readings: z.array(reading).max(10000),
        services: z.array(service).max(10000),
      })
      .strict(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const p = snapshot.payload;
    const equipment = new Map(p.equipment.map((e) => [e.id, e]));
    const tasks = new Map(p.tasks.map((t) => [t.id, t]));
    const accounts = new Set(p.accounts.map((a) => a.id));
    const invalid = (message: string) =>
      context.addIssue({ code: "custom", message });
    for (const rows of [
      p.accounts,
      p.equipment,
      p.tasks,
      p.readings,
      p.services,
    ])
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        invalid("Duplicate record identifiers.");
    if (p.readings.length + p.services.length > 10000)
      invalid("Combined history exceeds 10,000 entries.");
    for (const t of p.tasks)
      if (
        !equipment.has(t.equipment_id) ||
        t.baseline_meter_minutes >
          equipment.get(t.equipment_id)!.current_meter_minutes
      )
        invalid("Invalid task equipment or baseline.");
    for (const e of p.equipment)
      if (p.tasks.filter((t) => t.equipment_id === e.id).length > 20)
        invalid("Equipment exceeds 20 tasks.");
    for (const r of [...p.readings, ...p.services])
      if (
        !equipment.has(r.equipment_id) ||
        !accounts.has(r.account_id) ||
        r.meter_minutes > equipment.get(r.equipment_id)!.current_meter_minutes
      )
        invalid("Broken history reference or reading above current meter.");
    for (const s of p.services)
      if (
        !tasks.has(s.task_id) ||
        tasks.get(s.task_id)!.equipment_id !== s.equipment_id
      )
        invalid("Service refers to the wrong equipment or task.");
  });
