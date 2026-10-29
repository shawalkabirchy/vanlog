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
import { api } from "@/lib/api";
import { parseHours } from "@/lib/domain";
import type { Equipment } from "@/lib/types";

export function EquipmentEditor({ equipment }: { equipment?: Equipment }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={equipment ? "outline" : "default"}>
          {equipment ? (
            <Pencil data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}
          {equipment ? "Edit equipment" : "Add equipment"}
        </Button>
      </DialogTrigger>
      <DialogContent className="editor-dialog">
        <DialogHeader>
          <DialogTitle>
            {equipment ? "Edit equipment" : "Add equipment"}
          </DialogTitle>
          <DialogDescription>
            {equipment
              ? "Update its name or category. Runtime changes use the reading log."
              : "Create a record and set its starting cumulative runtime."}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <EquipmentForm
            equipment={equipment}
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
function EquipmentForm({
  equipment,
  onSaved,
}: {
  equipment?: Equipment;
  onSaved: () => void;
}) {
  const mutation = useMutation(onSaved);
  const [version, setVersion] = useState(equipment?.version);
  const [reviewed, setReviewed] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const values = {
        name: String(data.get("name")),
        category: String(data.get("category")),
      };
      await mutation.run(
        equipment ? `/api/equipment/${equipment.id}` : "/api/equipment",
        equipment ? "PATCH" : "POST",
        equipment
          ? { ...values, expectedVersion: version }
          : {
              ...values,
              requestId: crypto.randomUUID(),
              initialMeterMinutes: parseHours(String(data.get("hours"))),
            },
      );
    } catch (error) {
      mutation.setError(error as Error);
    }
  }
  async function refresh() {
    if (!equipment) return;
    try {
      const latest = await api<{ equipment: Equipment }>(
        `/api/equipment/${equipment.id}`,
      );
      setVersion(latest.equipment.version);
      mutation.clear();
      setReviewed(true);
    } catch (error) {
      mutation.setError(error as Error);
    }
  }
  return (
    <form method="post" onSubmit={submit}>
      <FieldSet disabled={mutation.pending || mutation.uncertain}>
        <FieldGroup>
          <TextField
            name="name"
            label="Equipment name"
            defaultValue={equipment?.name}
            required
            maxLength={80}
            error={mutation.fields.name}
          />
          <TextField
            name="category"
            label="Category"
            defaultValue={equipment?.category}
            placeholder="e.g. Power, refrigeration"
            required
            maxLength={80}
            error={mutation.fields.category}
          />
          {!equipment && (
            <TextField
              name="hours"
              label="Initial cumulative hours"
              defaultValue="0.0"
              inputMode="decimal"
              required
              help="Hours with at most one decimal. This starts the record; it does not record a service."
              error={mutation.fields.initialMeterMinutes}
            />
          )}
        </FieldGroup>
      </FieldSet>
      <Failure error={mutation.error} />
      {reviewed && (
        <p className="form-help" role="status">
          Latest record loaded. Review your values before saving.
        </p>
      )}
      <div className="form-actions">
        {mutation.uncertain ? (
          <Button
            type="button"
            disabled={mutation.pending}
            onClick={mutation.retry}
          >
            Retry original save
          </Button>
        ) : mutation.stale ? (
          <Button type="button" onClick={refresh}>
            Refresh and review
          </Button>
        ) : (
          <Button type="submit" disabled={mutation.pending}>
            {mutation.pending ? "Saving…" : "Save equipment"}
          </Button>
        )}
      </div>
    </form>
  );
}

export function ArchiveAction({
  label,
  archived,
  onConfirm,
}: {
  label: string;
  archived: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function commit() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
      refreshResources();
    } catch (error) {
      setError(error as Error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{archived ? "Restore" : "Archive"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {archived ? "Restore" : "Archive"} {label}?
          </DialogTitle>
          <DialogDescription>
            {archived
              ? "This record will be active again."
              : "History is retained. New logs will be blocked until this record is restored."}
          </DialogDescription>
        </DialogHeader>
        <Failure error={error} />
        <Button disabled={pending} onClick={commit}>
          {pending ? "Saving…" : archived ? "Restore record" : "Archive record"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
