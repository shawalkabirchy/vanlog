import { describe, expect, it } from "vitest";
import {
  addDays,
  csvCell,
  isCalendarDate,
  parseHours,
  parseMoney,
  safeReturn,
} from "../../src/lib/domain";
import { schemas } from "../../src/server/validation";

describe("exact inputs and calendar dates", () => {
  it("stores tenths of hours as exact six-minute increments", () => {
    expect(parseHours("145.1")).toBe(8706);
    expect(parseHours("100000.0")).toBe(6000000);
    for (const value of ["-1", "1.01", "Infinity", "1e2", "100000.1", ""])
      expect(() => parseHours(value)).toThrow();
  });
  it("parses minor units without floating-point rounding", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("89.5")).toBe(8950);
    expect(parseMoney("10000000.00")).toBe(1000000000);
    for (const value of ["-1", "1.234", "1e3", "10000000.01", "NaN", ""])
      expect(() => parseMoney(value)).toThrow();
  });
  it("rejects invalid dates and advances leap-day and year boundaries", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2025-02-29")).toBe(false);
    expect(isCalendarDate("2026-04-31")).toBe(false);
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
describe("trust boundaries", () => {
  it("rejects unexpected write fields, fractional minutes, and empty schedules", () => {
    const create = {
      requestId: crypto.randomUUID(),
      name: " Generator ",
      category: " Power ",
      initialMeterMinutes: 0,
    };
    expect(schemas.equipmentCreate.parse(create).name).toBe("Generator");
    expect(
      schemas.equipmentCreate.safeParse({ ...create, role: "owner" }).success,
    ).toBe(false);
    expect(
      schemas.equipmentCreate.safeParse({ ...create, initialMeterMinutes: 7 })
        .success,
    ).toBe(false);
    expect(
      schemas.taskCreate.safeParse({
        requestId: crypto.randomUUID(),
        label: "Oil",
        baselineOn: "2026-10-29",
        baselineMeterMinutes: 0,
      }).success,
    ).toBe(false);
    expect(
      schemas.service.safeParse({
        requestId: crypto.randomUUID(),
        expectedEquipmentVersion: 1,
        costMinor: 0.1,
        note: "",
      }).success,
    ).toBe(false);
  });
  it("makes report end dates exclusive and bounds the period", () => {
    expect(
      schemas.report.safeParse({ startOn: "2024-01-01", endOn: "2025-01-01" })
        .success,
    ).toBe(true);
    expect(
      schemas.report.safeParse({ startOn: "2024-01-01", endOn: "2025-01-02" })
        .success,
    ).toBe(false);
    expect(
      schemas.report.safeParse({ startOn: "2026-01-01", endOn: "2026-01-01" })
        .success,
    ).toBe(false);
  });
  it("neutralizes formula text while keeping numeric values numeric", () => {
    expect(csvCell("  =SUM(A1:A2)")).toBe('"\'  =SUM(A1:A2)"');
    expect(csvCell('A, "B"')).toBe('"A, ""B"""');
    expect(csvCell(-12.5)).toBe("-12.5");
  });
  it("accepts only the internal equipment return path", () => {
    const url = "/equipment/view/?id=" + crypto.randomUUID();
    expect(safeReturn(url)).toBe(url);
    for (const value of [
      "https://evil.example/",
      "//evil.example/",
      "/equipment/view/?id=abc&next=https://evil.example/",
      null,
    ])
      expect(safeReturn(value)).toBe("/dashboard/");
  });
});
