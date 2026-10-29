import { z } from "zod";
import { isCalendarDate } from "../lib/domain";

const name = z.string().trim().min(1).max(80);
const meter = z.number().int().min(0).max(6000000).multipleOf(6);
const intervalMinutes = z.number().int().min(6).max(600000).multipleOf(6);
const intervalDays = z.number().int().min(1).max(3650);
const version = z.number().int().positive();
const requestId = z.uuid();
const note = z.string().trim().max(1000).default("");
export const calendar = z
  .string()
  .refine(isCalendarDate, "Enter a real date in YYYY-MM-DD format.");
export const schemas = {
  login: z
    .object({
      email: z.email().max(254),
      password: z.string().min(1).max(1024),
    })
    .strict(),
  demo: z.object({ role: z.enum(["owner", "staff"]) }).strict(),
  equipmentCreate: z
    .object({ requestId, name, category: name, initialMeterMinutes: meter })
    .strict(),
  equipmentUpdate: z
    .object({
      expectedVersion: version,
      name: name.optional(),
      category: name.optional(),
      archived: z.boolean().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 1, "Choose a field to update."),
  taskCreate: z
    .object({
      requestId,
      label: name,
      intervalDays: intervalDays.optional(),
      intervalMinutes: intervalMinutes.optional(),
      baselineOn: calendar,
      baselineMeterMinutes: meter,
    })
    .strict()
    .refine(
      (v) => v.intervalDays !== undefined || v.intervalMinutes !== undefined,
      "Set at least one interval.",
    ),
  taskUpdate: z
    .object({
      expectedVersion: version,
      label: name.optional(),
      intervalDays: intervalDays.nullable().optional(),
      intervalMinutes: intervalMinutes.nullable().optional(),
      archived: z.boolean().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 1, "Choose a field to update."),
  reading: z
    .object({ requestId, expectedVersion: version, meterMinutes: meter, note })
    .strict(),
  service: z
    .object({
      requestId,
      expectedEquipmentVersion: version,
      costMinor: z.number().int().min(0).max(1000000000).default(0),
      note,
    })
    .strict(),
  page: z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      cursor: z.string().max(2000).optional(),
      q: z.string().trim().max(80).optional(),
      archived: z.enum(["true", "false"]).optional(),
      status: z.enum(["overdue", "due_now", "due_soon", "current"]).optional(),
      equipmentId: z.uuid().optional(),
      kind: z.enum(["reading", "service"]).optional(),
    })
    .strict(),
  report: z
    .object({ startOn: calendar, endOn: calendar })
    .strict()
    .refine(
      (v) =>
        v.endOn > v.startOn &&
        Date.parse(v.endOn) - Date.parse(v.startOn) <= 366 * 86400000,
      "Choose a period of 1–366 days; the end date is exclusive.",
    ),
};
