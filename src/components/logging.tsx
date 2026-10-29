"use client";
import { useId, useState } from "react";
import { Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldSet,
  FieldError,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Failure, TextField } from "./common";
import { useSession } from "./app-shell";
import { useMutation } from "@/hooks/use-mutation";
import { refreshResources } from "@/hooks/use-resource";
import { api, RequestError } from "@/lib/api";
import { hours, parseHours, parseMoney } from "@/lib/domain";
import type { Equipment, MaintenanceTask } from "@/lib/types";

function NoteField({ error }: { error?: string }) {
  const id = useId();
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>Note (optional)</FieldLabel>
      <Textarea
        id={id}
        name="note"
        maxLength={1000}
        placeholder="Add useful context for your team."
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}

export function ReadingForm({
  equipment,
  onCancel,
}: {
  equipment: Equipment;
  onCancel: () => void;
}) {
  const [snapshot, setSnapshot] = useState(equipment);
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useMutation(() => {
    onCancel();
    refreshResources();
  });
  let minutes: number | null = null;
  try {
    minutes = value ? parseHours(value) : null;
  } catch {}
  const increase =
    minutes === null ? null : minutes - snapshot.currentMeterMinutes;
  const large = increase !== null && increase > 1440;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const meterMinutes = parseHours(value);
      if (meterMinutes < snapshot.currentMeterMinutes)
        throw new Error(
          "Cumulative hours cannot be below the current reading.",
        );
      if (large && !confirmed)
        throw new Error("Confirm the increase of more than 24 hours first.");
      await mutation.run(`/api/equipment/${equipment.id}/readings`, "POST", {
        requestId: crypto.randomUUID(),
        expectedVersion: snapshot.version,
        meterMinutes,
        note: String(data.get("note") || ""),
      });
    } catch (error) {
      const message = (error as Error).message;
      mutation.setError(
        new RequestError(message, "VALIDATION_ERROR", 422, {
          meterMinutes: message,
        }),
      );
    }
  }
  async function refresh() {
    try {
      const latest = await api<{ equipment: Equipment }>(
        `/api/equipment/${equipment.id}`,
      );
      setSnapshot(latest.equipment);
      setConfirmed(false);
      mutation.clear();
    } catch (error) {
      mutation.setError(error as Error);
    }
  }
  return (
    <section className="panel reading-panel" id="reading-form">
      <header className="panel-heading">
        <div>
          <h2>Log a meter reading</h2>
          <p>
            Record the current cumulative counter. Readings cannot be edited.
          </p>
        </div>
      </header>
      <form method="post" onSubmit={submit}>
        <div className="reading-previous">
          <span>Current reading</span>
          <strong>{hours(snapshot.currentMeterMinutes)} h</strong>
        </div>
        <FieldSet disabled={mutation.pending || mutation.uncertain}>
          <FieldGroup>
            <TextField
              label="New cumulative hours"
              name="hours"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setConfirmed(false);
              }}
              inputMode="decimal"
              required
              autoFocus
              error={mutation.fields.meterMinutes}
              help={
                increase !== null
                  ? `Increase: ${hours(increase)} hours`
                  : "Hours with at most one decimal place."
              }
            />
            <NoteField error={mutation.fields.note} />
            {large && (
              <Alert variant="demo">
                <Info aria-hidden="true" />
                <AlertDescription>
                  This adds {hours(increase!)} hours. Check the meter before
                  continuing.
                </AlertDescription>
                {!confirmed ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmed(true)}
                  >
                    Confirm large increase
                  </Button>
                ) : (
                  <span className="confirmed">
                    <Check />
                    Increase confirmed
                  </span>
                )}
              </Alert>
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
              Refresh reading and review
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={mutation.pending || (large && !confirmed)}
            >
              {mutation.pending ? "Saving…" : "Save reading"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={mutation.pending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

export function CompleteService({
  equipment,
  task,
}: {
  equipment: Equipment;
  task: MaintenanceTask;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={equipment.archived || task.archived}
        >
          Complete service
        </Button>
      </DialogTrigger>
      <DialogContent className="editor-dialog">
        <DialogHeader>
          <DialogTitle>Complete service</DialogTitle>
          <DialogDescription>
            Confirm the task, meter snapshot, and cost. Completed records cannot
            be edited.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ServiceForm
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
function ServiceForm({
  equipment,
  task,
  onSaved,
}: {
  equipment: Equipment;
  task: MaintenanceTask;
  onSaved: () => void;
}) {
  const { config } = useSession();
  const [snapshot, setSnapshot] = useState(equipment);
  const mutation = useMutation(onSaved);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await mutation.run(`/api/tasks/${task.id}/services`, "POST", {
        requestId: crypto.randomUUID(),
        expectedEquipmentVersion: snapshot.version,
        costMinor: parseMoney(String(data.get("cost"))),
        note: String(data.get("note") || ""),
      });
    } catch (error) {
      const message = (error as Error).message;
      mutation.setError(
        new RequestError(message, "VALIDATION_ERROR", 422, {
          costMinor: message,
        }),
      );
    }
  }
  async function refresh() {
    try {
      const latest = await api<{
        equipment: Equipment;
        tasks: MaintenanceTask[];
      }>(`/api/equipment/${equipment.id}`);
      if (!latest.tasks.some((t) => t.id === task.id))
        throw new Error("This task is no longer active.");
      setSnapshot(latest.equipment);
      mutation.clear();
    } catch (error) {
      mutation.setError(error as Error);
    }
  }
  return (
    <form method="post" onSubmit={submit}>
      <div className="service-summary">
        <strong>{task.label}</strong>
        <span>{equipment.name}</span>
        <span>
          Meter snapshot <b>{hours(snapshot.currentMeterMinutes)} h</b>
        </span>
        <span>
          Recorded on{" "}
          <b>
            {config.businessDate} · {config.timeZone}
          </b>
        </span>
      </div>
      <FieldSet disabled={mutation.pending || mutation.uncertain}>
        <FieldGroup>
          <TextField
            label={`Cost (${config.currency})`}
            name="cost"
            defaultValue="0.00"
            inputMode="decimal"
            required
            error={mutation.fields.costMinor}
          />
          <NoteField error={mutation.fields.note} />
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
            Retry original completion
          </Button>
        ) : mutation.stale ? (
          <Button type="button" onClick={refresh}>
            Refresh details and review
          </Button>
        ) : (
          <Button type="submit" disabled={mutation.pending}>
            {mutation.pending ? "Recording…" : "Confirm completion"}
          </Button>
        )}
      </div>
    </form>
  );
}
