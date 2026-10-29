"use client";
import { AlertCircle, CalendarClock, Clock3, Truck } from "lucide-react";
import { useResource } from "@/hooks/use-resource";
import { EquipmentEditor } from "@/components/equipment-editor";
import {
  EmptyState,
  Failure,
  Loading,
  PageHeading,
  Panel,
  ViewAll,
} from "@/components/common";
import { TaskTable } from "@/components/task-table";
import { HistoryList } from "@/components/history-list";
import { useSession } from "@/components/app-shell";
import { statusLabels, statusOrder } from "@/lib/domain";
import type {
  Dashboard,
  Collection,
  MaintenanceTask,
  HistoryEntry,
} from "@/lib/types";

export default function DashboardPage() {
  const { user, config } = useSession();
  const summary = useResource<Dashboard>(
    user.role === "owner" ? "/api/dashboard" : null,
  );
  const tasks = useResource<Collection<MaintenanceTask>>(
    user.role === "owner" ? "/api/tasks?limit=5" : null,
  );
  const history = useResource<Collection<HistoryEntry>>(
    user.role === "owner" ? "/api/history?limit=4" : null,
  );
  if (user.role !== "owner") return null;
  const stats = [
    {
      label: "Active equipment",
      value: summary.data?.equipmentCount || 0,
      icon: Truck,
      tone: "current",
    },
    {
      label: "Overdue",
      value: summary.data?.taskCounts.overdue || 0,
      icon: AlertCircle,
      tone: "overdue",
    },
    {
      label: "Due now",
      value: summary.data?.taskCounts.due_now || 0,
      icon: Clock3,
      tone: "due_now",
    },
    {
      label: "Due soon",
      value: summary.data?.taskCounts.due_soon || 0,
      icon: CalendarClock,
      tone: "due_soon",
    },
  ];
  const total = summary.data
    ? Object.values(summary.data.taskCounts).reduce((a, b) => a + (b || 0), 0)
    : 0;
  return (
    <>
      <PageHeading
        title="Equipment, ready for the next stop."
        description="A clear view of your kitchen’s maintenance."
      >
        <EquipmentEditor />
      </PageHeading>
      <Failure error={summary.error} retry={summary.reload} />
      {summary.loading ? (
        <Loading />
      ) : (
        <div className="stats-grid">
          {stats.map((stat) => (
            <div className="stat" key={stat.label}>
              <span className={`stat-icon ${stat.tone}`}>
                <stat.icon aria-hidden="true" />
              </span>
              <div>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Panel
        title="Maintenance queue"
        description="Upcoming and overdue maintenance for your equipment."
        action={<ViewAll href="/maintenance/" />}
      >
        <Failure error={tasks.error} retry={tasks.reload} />
        {tasks.loading ? (
          <Loading label="Loading maintenance…" />
        ) : (
          tasks.data && <TaskTable tasks={tasks.data.items} />
        )}
      </Panel>
      <div className="dashboard-bottom">
        <Panel
          title="Recent activity"
          description="Latest meter readings and maintenance work."
          action={<ViewAll href="/history/" />}
        >
          <Failure error={history.error} retry={history.reload} />
          {history.loading ? (
            <Loading />
          ) : (
            history.data && (
              <HistoryList
                entries={history.data.items}
                currency={config.currency}
                timeZone={config.timeZone}
              />
            )
          )}
        </Panel>
        <Panel
          title="Maintenance coverage"
          description="Active schedules by their most urgent threshold."
        >
          {total ? (
            <div className="coverage">
              {statusOrder.map((status) => (
                <div key={status}>
                  <div>
                    <span>{statusLabels[status]}</span>
                    <strong>{summary.data?.taskCounts[status] || 0}</strong>
                  </div>
                  <div className="coverage-track">
                    <span
                      className={`coverage-fill ${status}`}
                      style={{
                        width: `${((summary.data?.taskCounts[status] || 0) / total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <p>
                {total} active maintenance schedules. Status is a recordkeeping
                aid, not an equipment safety assessment.
              </p>
            </div>
          ) : (
            <EmptyState
              title="No active schedules"
              description="Add maintenance tasks to see their status here."
            />
          )}
        </Panel>
      </div>
    </>
  );
}
