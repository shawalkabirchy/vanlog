"use client";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/components/app-shell";
import {
  Failure,
  Loading,
  PageHeading,
  Pages,
  Panel,
} from "@/components/common";
import { HistoryList } from "@/components/history-list";
import type { Equipment, HistoryEntry, Collection } from "@/lib/types";

export default function HistoryPage() {
  const { user, config } = useSession();
  const [kind, setKind] = useState("all");
  const [equipment, setEquipment] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (equipment) params.set("equipmentId", equipment);
  if (cursors.length) params.set("cursor", cursors.at(-1)!);
  const history = useResource<Collection<HistoryEntry>>(
    user.role === "owner" ? "/api/history?" + params : null,
  );
  const equipmentList = useResource<Collection<Equipment>>(
    user.role === "owner" ? "/api/equipment?limit=100" : null,
  );
  const archived = useResource<Collection<Equipment>>(
    user.role === "owner" ? "/api/equipment?limit=100&archived=true" : null,
  );
  if (user.role !== "owner") return null;
  return (
    <>
      <PageHeading
        title="A clear record of the work."
        description="Every reading and service, with the person, meter snapshot, and cost."
      />
      <div className="list-toolbar">
        <ToggleGroup
          type="single"
          variant="outline"
          value={kind}
          onValueChange={(value) => {
            if (value) {
              setKind(value);
              setCursors([]);
            }
          }}
          aria-label="History type"
        >
          <ToggleGroupItem value="all">All activity</ToggleGroupItem>
          <ToggleGroupItem value="reading">Readings</ToggleGroupItem>
          <ToggleGroupItem value="service">Services</ToggleGroupItem>
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
          {[
            ...(equipmentList.data?.items || []),
            ...(archived.data?.items || []),
          ].map((eq) => (
            <NativeSelectOption value={eq.id} key={eq.id}>
              {eq.name}
              {eq.archived ? " (archived)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Failure error={history.error} retry={history.reload} />
      <Panel
        title="Activity history"
        description={`Newest first · ${config.timeZone} · Historical records cannot be edited.`}
      >
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
