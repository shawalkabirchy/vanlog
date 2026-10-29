"use client";
import Link from "next/link";
import { useId } from "react";
import {
  AlertCircle,
  ArrowRight,
  ClipboardList,
  LoaderCircle,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestError } from "@/lib/api";
import { dateLabel, hours, statusLabels, equipmentUrl } from "@/lib/domain";
import type { DueStatus, MaintenanceTask } from "@/lib/types";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="VanLog home">
      <Truck aria-hidden="true" />
      <span>VanLog</span>
    </Link>
  );
}
export function Loading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spinner" aria-hidden="true" />
      <span>{label}</span>
      <Skeleton className="loading-line" />
      <Skeleton className="loading-line short" />
    </div>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: Error | null;
  retry?: () => void;
}) {
  if (!error) return null;
  const fields =
    error instanceof RequestError ? Object.entries(error.fields) : [];
  return (
    <Alert variant="destructive" className="failure">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{error.message}</AlertTitle>
      {fields.length > 0 && (
        <AlertDescription>
          <ul>
            {fields.map(([key, value]) => (
              <li key={key}>{key === "form" ? value : `${key}: ${value}`}</li>
            ))}
          </ul>
        </AlertDescription>
      )}
      {retry && (
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}
export function EmptyState({
  title = "No records yet",
  description = "Add your first record to get started.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardList aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function StatusBadge({ status }: { status: DueStatus }) {
  return <Badge variant={status}>{statusLabels[status]}</Badge>;
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function TextField({
  label,
  help,
  error,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  help?: string;
  error?: string;
}) {
  const generatedId = useId();
  const id = props.id || `field-${generatedId}`;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : help ? `${id}-help` : undefined
        }
      />
      {help && <FieldDescription id={`${id}-help`}>{help}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
export function DueHint({ task }: { task: MaintenanceTask }) {
  return (
    <span className="due-hint">
      {task.dueOn && <span>{dateLabel(task.dueOn)}</span>}
      {task.dueMeterMinutes !== undefined && (
        <span>
          {hours(task.dueMeterMinutes)} h
          {task.currentMeterMinutes < task.dueMeterMinutes && (
            <small>
              {hours(task.dueMeterMinutes - task.currentMeterMinutes)} h
              remaining
            </small>
          )}
        </span>
      )}
    </span>
  );
}
export function EquipmentLink({
  id,
  children,
  className,
  ...props
}: { id: string; children: React.ReactNode } & Omit<
  React.ComponentProps<typeof Link>,
  "href" | "id"
>) {
  return (
    <Link
      {...props}
      className={className || "text-link"}
      href={equipmentUrl(id)}
    >
      {children}
    </Link>
  );
}
export function ViewAll({ href }: { href: string }) {
  return (
    <Link className="text-link inline-link" href={href}>
      View all
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}
export function Pages({
  nextCursor,
  cursors,
  onChange,
  count,
}: {
  nextCursor: string | null;
  cursors: string[];
  onChange: (value: string[]) => void;
  count: number;
}) {
  return (
    <div className="pagination">
      <span>
        {count} records · Page {cursors.length + 1}
      </span>
      <div>
        <Button
          variant="outline"
          disabled={!cursors.length}
          onClick={() => onChange(cursors.slice(0, -1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={!nextCursor}
          onClick={() => nextCursor && onChange([...cursors, nextCursor])}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
