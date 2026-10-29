"use client";
import { Gauge, Wrench } from "lucide-react";
import { EmptyState, EquipmentLink } from "./common";
import { hours, money, timeLabel } from "@/lib/domain";
import type { HistoryEntry } from "@/lib/types";

export function HistoryList({
  entries,
  currency = "USD",
  timeZone = "UTC",
}: {
  entries: HistoryEntry[];
  currency?: string;
  timeZone?: string;
}) {
  if (!entries.length)
    return (
      <EmptyState
        title="No activity yet"
        description="Meter readings and completed services will appear here."
      />
    );
  return (
    <ol className="activity-list">
      {entries.map((entry) => (
        <li key={`${entry.kind}-${entry.id}`}>
          <span className={`activity-icon ${entry.kind}`}>
            {entry.kind === "reading" ? (
              <Gauge aria-hidden="true" />
            ) : (
              <Wrench aria-hidden="true" />
            )}
          </span>
          <div className="activity-copy">
            <strong>
              {entry.equipmentName ? (
                <EquipmentLink id={entry.equipmentId}>
                  {entry.equipmentName}
                </EquipmentLink>
              ) : entry.kind === "reading" ? (
                "Meter reading logged"
              ) : (
                "Service completed"
              )}
            </strong>
            <p>
              {entry.kind === "reading"
                ? `Recorded ${hours(entry.meterMinutes)} h${entry.previousMeterMinutes === undefined ? "" : ` · +${hours(entry.meterMinutes - entry.previousMeterMinutes)} h`}`
                : `${entry.taskLabel || "Maintenance"} completed at ${hours(entry.meterMinutes)} h`}
              {entry.costMinor !== undefined &&
                ` · ${money(entry.costMinor, currency)}`}
            </p>
            {entry.note && <p className="activity-note">{entry.note}</p>}
            <small>
              {timeLabel(entry.createdAt, timeZone)}
              {entry.actorName && ` · ${entry.actorName}`}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}
