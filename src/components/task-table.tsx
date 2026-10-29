"use client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { DueHint, EmptyState, EquipmentLink, StatusBadge } from "./common";
import type { MaintenanceTask } from "@/lib/types";

export function TaskTable({ tasks }: { tasks: MaintenanceTask[] }) {
  if (!tasks.length)
    return (
      <EmptyState
        title="Nothing due in this view"
        description="Your active schedules will appear here. Try another status filter."
      />
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Equipment</TableHead>
          <TableHead>Maintenance</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Open equipment</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <EquipmentLink id={task.equipmentId}>
                {task.equipmentName}
              </EquipmentLink>
            </TableCell>
            <TableCell>
              <strong>{task.label}</strong>
              <small>
                {task.intervalDays ? `${task.intervalDays} days` : ""}
                {task.intervalDays && task.intervalMinutes ? " or " : ""}
                {task.intervalMinutes
                  ? `${task.intervalMinutes / 60} hours`
                  : ""}
              </small>
            </TableCell>
            <TableCell>
              <DueHint task={task} />
            </TableCell>
            <TableCell>
              <StatusBadge status={task.status} />
            </TableCell>
            <TableCell>
              <Button asChild size="sm" variant="outline">
                <EquipmentLink id={task.equipmentId}>View</EquipmentLink>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
