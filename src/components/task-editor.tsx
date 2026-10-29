"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup, FieldSet } from "@/components/ui/field";
import { Failure, TextField } from "./common";
import { useMutation } from "@/hooks/use-mutation";
import { refreshResources } from "@/hooks/use-resource";
import { useSession } from "./app-shell";
import { api } from "@/lib/api";
import { parseHours } from "@/lib/domain";
import type { Equipment, MaintenanceTask } from "@/lib/types";

export function TaskEditor({
  equipment,
  task,
}: {
  equipment: Equipment;
  task?: MaintenanceTask;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={equipment.archived}>
          {task ? (
            <Pencil data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          {task ? "Edit schedule" : "Add task"}
        </Button>
      </DialogTrigger>
      <DialogContent className="editor-dialog">
        <DialogHeader>
          <DialogTitle>
            {task ? "Edit schedule" : "Add maintenance task"}
          </DialogTitle>
          <DialogDescription>
            {task
              ? "Keep a day interval, runtime interval, or both. The setup baseline stays unchanged."
              : "A task is due when either its day or runtime threshold is reached."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <TaskForm
            equipment={equipment}
            task={task}
            onSaved={() => {
              setOpen(false);
              refreshResources();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function TaskForm({
  equipment,
  task,
  onSaved,
}: {
  equipment: Equipment;
  task?: MaintenanceTask;
  onSaved: () => void;
}) {
  const { config } = useSession();
  const mutation = useMutation(onSaved);
  const [version, setVersion] = useState(task?.version);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const days = String(data.get("days") || "").trim();
      const runtime = String(data.get("hours") || "").trim();
      if (!days && !runtime) throw new Error("Set a day or runtime interval.");
      const intervalDays = days ? Number(days) : null;
      const intervalMinutes = runtime ? parseHours(runtime) : null;
      if (
        intervalDays !== null &&
        (!Number.isInteger(intervalDays) ||
          intervalDays < 1 ||
          intervalDays > 3650)
      )
        throw new Error("Day interval must be a whole number from 1 to 3,650.");
      if (
        intervalMinutes !== null &&
        (intervalMinutes < 6 || intervalMinutes > 600000)
      )
        throw new Error("Runtime interval must be 0.1–10,000 hours.");
      const values = {
        label: String(data.get("label")),
        ...(task
          ? { intervalDays, intervalMinutes }
          : {
              ...(intervalDays === null ? {} : { intervalDays }),
              ...(intervalMinutes === null ? {} : { intervalMinutes }),
            }),
      };
      const payload = task
        ? { ...values, expectedVersion: version }
        : {
            ...values,
            requestId: crypto.randomUUID(),
            baselineOn: String(data.get("baselineOn")),
            baselineMeterMinutes: parseHours(String(data.get("baselineHours"))),
          };
      await mutation.run(
        task ? `/api/tasks/${task.id}` : `/api/equipment/${equipment.id}/tasks`,
        task ? "PATCH" : "POST",
        payload,
      );
    } catch (error) {
      mutation.setError(error as Error);
    }
  }
  async function refresh() {
    try {
      const latest = await api<{ tasks: MaintenanceTask[] }>(
        `/api/equipment/${equipment.id}`,
      );
      const current = latest.tasks.find((t) => t.id === task?.id);
      if (!current) throw new Error("This task is no longer active.");
      setVersion(current.version);
      mutation.clear();
    } catch (error) {
      mutation.setError(error as Error);
    }
  }
  return (
    <form method="post" onSubmit={submit}>
      <FieldSet disabled={mutation.pending || mutation.uncertain}>
        <FieldGroup>
          <TextField
            name="label"
            label="Task name"
            defaultValue={task?.label}
            required
            maxLength={80}
            error={mutation.fields.label}
          />
          <div className="form-columns">
            <TextField
              name="days"
              label="Interval in days"
              defaultValue={task?.intervalDays}
              type="number"
              min={1}
              max={3650}
              step={1}
              placeholder="e.g. 30"
              error={mutation.fields.intervalDays}
            />
            <TextField
              name="hours"
              label="Interval in hours"
              defaultValue={
                task?.intervalMinutes === undefined
                  ? ""
                  : String(task.intervalMinutes / 60)
              }
              inputMode="decimal"
              placeholder="e.g. 50.0"
              error={mutation.fields.intervalMinutes}
            />
          </div>
          {!task && (
            <>
              <TextField
                name="baselineOn"
                label="Setup baseline date"
                type="date"
                defaultValue={config.businessDate}
                max={config.businessDate}
                required
                error={mutation.fields.baselineOn}
              />
              <TextField
                name="baselineHours"
                label="Setup baseline hours"
                defaultValue={String(equipment.currentMeterMinutes / 60)}
                inputMode="decimal"
                required
                error={mutation.fields.baselineMeterMinutes}
              />
              <p className="form-help">
                The baseline is a setup assumption, not a completed-service
                event.
              </p>
            </>
          )}
        </FieldGroup>
      </FieldSet>
      <Failure error={mutation.error} />
      <div className="form-actions">
        {mutation.uncertain ? (
          <Button
            type="button"
            onClick={mutation.retry}
            disabled={mutation.pending}
          >
            Retry original save
          </Button>
        ) : mutation.stale ? (
          <Button type="button" onClick={refresh}>
            Refresh and review
          </Button>
        ) : (
          <Button type="submit" disabled={mutation.pending}>
            {mutation.pending ? "Saving…" : "Save task"}
          </Button>
        )}
      </div>
    </form>
  );
}
