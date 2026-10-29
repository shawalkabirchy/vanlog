"use client";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/components/app-shell";
import { Failure, Loading, PageHeading, Pages } from "@/components/common";
import { TaskTable } from "@/components/task-table";
import { statusLabels, statusOrder } from "@/lib/domain";
import type { Equipment, MaintenanceTask, Collection } from "@/lib/types";

export default function MaintenancePage() {
  const { user } = useSession();
  const [status, setStatus] = useState("all");
  const [equipment, setEquipment] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (equipment) params.set("equipmentId", equipment);
  if (cursors.length) params.set("cursor", cursors.at(-1)!);
  const tasks = useResource<Collection<MaintenanceTask>>(
    user.role === "owner" ? "/api/tasks?" + params : null,
  );
  const equipmentList = useResource<Collection<Equipment>>(
    user.role === "owner" ? "/api/equipment?limit=100" : null,
  );
  if (user.role !== "owner") return null;
  return (
    <>
      <PageHeading
        title="Stay ahead of what’s due."
        description="Review the most urgent day or runtime threshold for every active task."
      />
      <div className="list-toolbar">
        <ToggleGroup
          type="single"
          variant="outline"
          value={status}
          onValueChange={(value) => {
            if (value) {
              setStatus(value);
              setCursors([]);
            }
          }}
          aria-label="Maintenance status"
        >
          <ToggleGroupItem value="all">All tasks</ToggleGroupItem>
          {statusOrder.map((status) => (
            <ToggleGroupItem key={status} value={status}>
              {statusLabels[status]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <NativeSelect
          aria-label="Filter by equipment"
          value={equipment}
          onChange={(event) => {
            setEquipment(event.target.value);
            setCursors([]);
          }}
        >
          <NativeSelectOption value="">All equipment</NativeSelectOption>
          {equipmentList.data?.items.map((eq) => (
            <NativeSelectOption value={eq.id} key={eq.id}>
              {eq.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Failure error={tasks.error} retry={tasks.reload} />
      <Failure error={equipmentList.error} retry={equipmentList.reload} />
      {tasks.loading ? (
        <Loading />
      ) : (
        tasks.data && (
          <section className="panel table-panel">
            <TaskTable tasks={tasks.data.items} />
            <Pages
              cursors={cursors}
              onChange={setCursors}
              nextCursor={tasks.data.nextCursor}
              count={tasks.data.items.length}
            />
          </section>
        )
      )}
      <p className="page-footnote">
        A combined schedule is due when either threshold is reached. Setup
        baselines are assumptions, not service completions.
      </p>
    </>
  );
}
