import type { DueStatus } from "./types";

export const statusLabels: Record<DueStatus, string> = {
  overdue: "Overdue",
  due_now: "Due now",
  due_soon: "Due soon",
  current: "Current",
};
export const statusOrder: DueStatus[] = [
  "overdue",
  "due_now",
  "due_soon",
  "current",
];

export function parseHours(value: string): number {
  if (!/^\d{1,6}(\.\d)?$/.test(value.trim()))
    throw new Error("Enter hours with at most one decimal place.");
  const [whole, decimal = "0"] = value.trim().split(".");
  const minutes = Number(whole) * 60 + Number(decimal) * 6;
  if (minutes > 6000000)
    throw new Error("Runtime cannot exceed 100,000 hours.");
  return minutes;
}
export function parseMoney(value: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Enter a non-negative cost with at most two decimal places.",
    );
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (minor > 1000000000) throw new Error("Cost cannot exceed 10,000,000.00.");
  return minor;
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "0001-01-01"
  );
}
export function addDays(value: string, days: number): string {
  if (!isCalendarDate(value)) throw new Error("Enter a valid calendar date.");
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const hours = (minutes: number) =>
  (minutes / 60).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
export const money = (minor: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value.length === 10 ? value + "T00:00:00Z" : value));
export const timeLabel = (value: string, timeZone = "UTC") =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value)) +
  " " +
  timeZone;
export function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^\s*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function equipmentUrl(id: string) {
  return `/equipment/view/?id=${encodeURIComponent(id)}`;
}
export function safeReturn(value: string | null): string {
  if (!value || !/^\/equipment\/view\/\?id=[0-9a-f-]{36}$/i.test(value))
    return "/dashboard/";
  return value;
}
