export type Role = "owner" | "staff";
export type DueStatus = "overdue" | "due_now" | "due_soon" | "current";
export type User = {
  id: string;
  displayName: string;
  role: Role;
  expiresAt: string;
};
export type TaskCounts = Partial<Record<DueStatus, number>>;
export type Equipment = {
  id: string;
  name: string;
  category: string;
  initialMeterMinutes: number;
  currentMeterMinutes: number;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  taskCounts?: TaskCounts;
};
export type MaintenanceTask = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  label: string;
  intervalDays?: number;
  intervalMinutes?: number;
  baselineOn: string;
  baselineMeterMinutes: number;
  currentMeterMinutes: number;
  lastServiceOn?: string;
  lastServiceMeterMinutes?: number;
  dueOn?: string;
  dueMeterMinutes?: number;
  status: DueStatus;
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type HistoryEntry = {
  id: string;
  kind: "reading" | "service";
  equipmentId: string;
  equipmentName?: string;
  taskId?: string;
  taskLabel?: string;
  previousMeterMinutes?: number;
  meterMinutes: number;
  performedOn?: string;
  costMinor?: number;
  accountId: string;
  actorName?: string;
  note: string;
  createdAt: string;
};
export type Collection<T> = { items: T[]; nextCursor: string | null };
export type Dashboard = {
  equipmentCount: number;
  taskCounts: TaskCounts;
  currency: "USD" | "BDT";
  timeZone: string;
  businessDate: string;
};
export type CostReport = {
  currency: "USD" | "BDT";
  period: { startOn: string; endOn: string };
  totalMinor: number;
  equipmentTotals: {
    equipmentId: string;
    equipmentName: string;
    costMinor: number;
    serviceCount: number;
  }[];
};
