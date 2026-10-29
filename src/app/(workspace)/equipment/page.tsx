"use client";
import { useState } from "react";
import { Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/components/app-shell";
import { EquipmentEditor } from "@/components/equipment-editor";
import {
  EmptyState,
  EquipmentLink,
  Failure,
  Loading,
  PageHeading,
  Pages,
  StatusBadge,
} from "@/components/common";
import { hours, statusOrder } from "@/lib/domain";
import type { Equipment, Collection } from "@/lib/types";

export default function EquipmentPage() {
  const { user } = useSession();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const params = new URLSearchParams({ q: query, archived: String(archived) });
  if (cursors.length) params.set("cursor", cursors.at(-1)!);
  const records = useResource<Collection<Equipment>>(
    "/api/equipment?" + params,
  );
  function filter(value: string) {
    if (!value) return;
    setArchived(value === "archived");
    setCursors([]);
  }
  return (
    <>
      <PageHeading
        title="Your equipment."
        description={
          user.role === "owner"
            ? "One place for every counter, schedule, and service record."
            : "Open a record to log hours or complete maintenance."
        }
      >
        {user.role === "owner" && <EquipmentEditor />}
      </PageHeading>
      <div className="list-toolbar">
        <form
          className="search-form"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setCursors([]);
          }}
        >
          <label className="sr-only" htmlFor="equipment-search">
            Search equipment
          </label>
          <Search aria-hidden="true" />
          <Input
            id="equipment-search"
            placeholder="Search equipment or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={80}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        {user.role === "owner" && (
          <ToggleGroup
            type="single"
            value={archived ? "archived" : "active"}
            onValueChange={filter}
            aria-label="Equipment visibility"
            variant="outline"
          >
            <ToggleGroupItem value="active">Active</ToggleGroupItem>
            <ToggleGroupItem value="archived">Archived</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      <Failure error={records.error} retry={records.reload} />
      {records.loading ? (
        <Loading />
      ) : (
        records.data && (
          <section className="panel table-panel">
            {records.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Current runtime</TableHead>
                    <TableHead>Maintenance</TableHead>
                    <TableHead>
                      <span className="sr-only">Open equipment</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.data.items.map((eq) => {
                    const status = statusOrder.find(
                      (s) => (eq.taskCounts?.[s] || 0) > 0,
                    );
                    return (
                      <TableRow key={eq.id}>
                        <TableCell>
                          <div className="equipment-name">
                            <span className="equipment-icon">
                              <Truck aria-hidden="true" />
                            </span>
                            <EquipmentLink id={eq.id}>{eq.name}</EquipmentLink>
                          </div>
                        </TableCell>
                        <TableCell>{eq.category}</TableCell>
                        <TableCell>
                          <strong className="tabular">
                            {hours(eq.currentMeterMinutes)} h
                          </strong>
                        </TableCell>
                        <TableCell>
                          {eq.archived ? (
                            <Badge variant="outline">Archived</Badge>
                          ) : status ? (
                            <StatusBadge status={status} />
                          ) : (
                            <Badge variant="outline">No tasks</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <EquipmentLink id={eq.id}>Open</EquipmentLink>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title={
                  query
                    ? "No matching equipment"
                    : archived
                      ? "No archived equipment"
                      : "No equipment yet"
                }
                description={
                  query
                    ? "Try a different name or category."
                    : archived
                      ? "Archived records stay available with their history."
                      : "The owner can add equipment to start tracking maintenance."
                }
              />
            )}
            <Pages
              count={records.data.items.length}
              cursors={cursors}
              onChange={setCursors}
              nextCursor={records.data.nextCursor}
            />
          </section>
        )
      )}
      <p className="page-footnote">
        Already at the equipment? Scan its QR label with your phone’s camera to
        open its record.
      </p>
    </>
  );
}
