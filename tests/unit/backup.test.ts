import { expect, it } from "vitest";
import { backupSchema } from "../../src/server/backup";
const snapshot = {
  appId: "P07",
  formatVersion: 1,
  exportedAt: new Date().toISOString(),
  payload: {
    settings: { id: true, currency: "USD", time_zone: "UTC", demo_mode: true },
    accounts: [],
    equipment: [],
    tasks: [],
    readings: [],
    services: [],
  },
};
it("requires complete known-version backups before any replacement", () => {
  expect(backupSchema.safeParse(snapshot).success).toBe(true);
  expect(
    backupSchema.safeParse({ ...snapshot, formatVersion: 2 }).success,
  ).toBe(false);
  const missing = structuredClone(snapshot) as Record<string, unknown>;
  delete missing.exportedAt;
  expect(backupSchema.safeParse(missing).success).toBe(false);
  expect(
    backupSchema.safeParse({
      ...snapshot,
      payload: { ...snapshot.payload, equipment: undefined },
    }).success,
  ).toBe(false);
  expect(
    backupSchema.safeParse({ ...snapshot, secretKey: "unexpected" }).success,
  ).toBe(false);
});
