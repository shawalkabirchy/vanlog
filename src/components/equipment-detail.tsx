"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Gauge, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSession } from "./app-shell";
import { useResource } from "@/hooks/use-resource";
import { EquipmentEditor, ArchiveAction } from "./equipment-editor";
import { TaskEditor } from "./task-editor";
import { ReadingForm, CompleteService } from "./logging";
import { QrLabel } from "./qr-label";
import { HistoryList } from "./history-list";
import {
  DueHint,
  EmptyState,
  Failure,
  Loading,
  PageHeading,
  Panel,
  Pages,
  StatusBadge,
} from "./common";
import { send } from "@/lib/api";
import { dateLabel, hours, statusOrder } from "@/lib/domain";
import type {
  Equipment,
  MaintenanceTask,
  Collection,
  HistoryEntry,
} from "@/lib/types";

export function EquipmentDetail() {
  const id = useSearchParams().get("id");
  const valid = !!id && /^[0-9a-f-]{36}$/i.test(id);
  const { user, config } = useSession();
  const [reading, setReading] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const detail = useResource<{
    equipment: Equipment;
    tasks: MaintenanceTask[];
  }>(valid ? `/api/equipment/${id}` : null);
  const params = new URLSearchParams({ limit: "10" });
  if (cursors.length) params.set("cursor", cursors.at(-1)!);
  const history = useResource<Collection<HistoryEntry>>(
    valid ? `/api/equipment/${id}/history?${params}` : null,
  );
  if (!valid)
    return (
      <EmptyState
        title="Equipment link is invalid"
        description="Open equipment from the list or scan a valid VanLog label."
      />
    );
  if (detail.loading) return <Loading label="Opening equipment…" />;
  if (detail.error && !detail.data)
    return <Failure error={detail.error} retry={detail.reload} />;
  if (!detail.data) return null;
  const { equipment, tasks } = detail.data;
  return (
    <>
      <Link className="back-link" href="/equipment/">
        <ArrowLeft />
        All equipment
      </Link>
      <PageHeading
        title={equipment.name}
        description={`${equipment.category} · Mobile kitchen`}
      >
        {user.role === "owner" && (
          <>
            <QrLabel equipment={equipment} />
            <EquipmentEditor equipment={equipment} />
            <ArchiveAction
              label="equipment"
              archived={equipment.archived}
              onConfirm={() =>
                send(`/api/equipment/${equipment.id}`, "PATCH", {
                  expectedVersion: equipment.version,
                  archived: !equipment.archived,
                })
              }
            />
          </>
        )}
      </PageHeading>
      <Failure error={detail.error} retry={detail.reload} />
      {equipment.archived && (
        <Alert>
          <Info />
          <AlertDescription>
            This equipment is archived. Its history is retained; new readings
            and services are blocked.
          </AlertDescription>
        </Alert>
      )}
      <section className="meter-panel">
        <span className="meter-icon">
          <Gauge aria-hidden="true" />
        </span>
        <div>
          <strong>
            {hours(equipment.currentMeterMinutes)} <small>h</small>
          </strong>
          <span>Current runtime</span>
        </div>
        <Button
          disabled={equipment.archived}
          onClick={() => {
            setReading(true);
            setTimeout(
              () =>
                document
                  .getElementById("reading-form")
                  ?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                    block: "center",
                  }),
              0,
            );
          }}
        >
          Log reading
        </Button>
      </section>
      {reading && (
        <ReadingForm equipment={equipment} onCancel={() => setReading(false)} />
      )}
      <Panel
        title="Maintenance tasks"
        description="Whichever threshold comes first determines when a task is due."
        action={
          user.role === "owner" ? (
            <TaskEditor equipment={equipment} />
          ) : undefined
        }
      >
        {tasks.length ? (
          <div className="task-cards">
            {[...tasks]
              .sort(
                (a, b) =>
                  statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
              )
              .map((task) => (
                <article className="task-card" key={task.id}>
                  <div className="task-card-heading">
                    <h3>{task.label}</h3>
                    <StatusBadge status={task.status} />
                  </div>
                  <dl>
                    <div>
                      <dt>
                        {task.lastServiceOn ? "Last service" : "Setup baseline"}
                      </dt>
                      <dd>
                        {dateLabel(task.lastServiceOn || task.baselineOn)} ·{" "}
                        {hours(
                          task.lastServiceMeterMinutes ??
                            task.baselineMeterMinutes,
                        )}{" "}
                        h
                      </dd>
                    </div>
                    <div>
                      <dt>Due at</dt>
                      <dd>
                        <DueHint task={task} />
                      </dd>
                    </div>
                  </dl>
                  <div className="task-card-actions">
                    <CompleteService equipment={equipment} task={task} />
                    {user.role === "owner" && !equipment.archived && (
                      <>
                        <TaskEditor equipment={equipment} task={task} />
                        <ArchiveAction
                          label="task"
                          archived={task.archived}
                          onConfirm={() =>
                            send(`/api/tasks/${task.id}`, "PATCH", {
                              expectedVersion: task.version,
                              archived: !task.archived,
                            })
                          }
                        />
                      </>
                    )}
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <EmptyState
            title="No active maintenance tasks"
            description="The owner can add a day or runtime schedule for this equipment."
          />
        )}
      </Panel>
      <Panel
        title="Recent activity"
        description="Readings and services are append-only. Confirm values before saving."
      >
        <Failure error={history.error} retry={history.reload} />
        {history.loading ? (
          <Loading />
        ) : (
          history.data && (
            <>
              <HistoryList
                entries={history.data.items}
                currency={config.currency}
                timeZone={config.timeZone}
              />
              <Pages
                cursors={cursors}
                onChange={setCursors}
                nextCursor={history.data.nextCursor}
                count={history.data.items.length}
              />
            </>
          )
        )}
      </Panel>
    </>
  );
}
