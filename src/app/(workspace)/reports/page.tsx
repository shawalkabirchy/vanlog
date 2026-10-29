"use client";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableFooter,
} from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/components/app-shell";
import {
  EmptyState,
  EquipmentLink,
  Failure,
  Loading,
  PageHeading,
  TextField,
} from "@/components/common";
import { addDays, csvCell, dateLabel, money } from "@/lib/domain";
import { downloadBlob } from "@/lib/download";
import { schemas } from "@/server/validation";
import type { CostReport } from "@/lib/types";

export default function ReportsPage() {
  const { user, config } = useSession();
  const [period, setPeriod] = useState({
    startOn: addDays(config.businessDate, -29),
    endOn: addDays(config.businessDate, 1),
  });
  const [inputError, setInputError] = useState<Error | null>(null);
  const report = useResource<CostReport>(
    user.role === "owner"
      ? "/api/reports/costs?" + new URLSearchParams(period)
      : null,
  );
  if (user.role !== "owner") return null;
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const parsed = schemas.report.safeParse({
      startOn: fields.get("startOn"),
      endOn: fields.get("endOn"),
    });
    if (!parsed.success) {
      setInputError(
        new Error(
          "Choose valid dates covering 1–366 days. The end date is exclusive.",
        ),
      );
      return;
    }
    setInputError(null);
    setPeriod(parsed.data);
  }
  function csv() {
    if (!report.data) return;
    const data = report.data;
    const rows: (string | number)[][] = [
      [
        "Equipment",
        "Services",
        `Cost (${data.currency})`,
        "Start date (inclusive)",
        "End date (exclusive)",
      ],
      ...data.equipmentTotals.map((item) => [
        item.equipmentName,
        item.serviceCount,
        item.costMinor / 100,
        data.period.startOn,
        data.period.endOn,
      ]),
      [
        "Total",
        data.equipmentTotals.reduce((sum, e) => sum + e.serviceCount, 0),
        data.totalMinor / 100,
        data.period.startOn,
        data.period.endOn,
      ],
    ];
    downloadBlob(
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
      `vanlog-costs-${data.period.startOn}-${data.period.endOn}.csv`,
    );
  }
  return (
    <>
      <PageHeading
        title="Know where maintenance adds up."
        description="Recorded service and repair costs, grouped by equipment."
      >
        <Button variant="outline" disabled={!report.data} onClick={csv}>
          <Download data-icon="inline-start" />
          Export CSV
        </Button>
        <Button
          variant="outline"
          disabled={!report.data}
          onClick={() => window.print()}
        >
          <Printer data-icon="inline-start" />
          Print / Save PDF
        </Button>
      </PageHeading>
      <form className="report-filter no-print" onSubmit={submit}>
        <FieldGroup className="report-fields">
          <TextField
            label="Start date (inclusive)"
            name="startOn"
            type="date"
            defaultValue={period.startOn}
            required
          />
          <TextField
            label="End date (exclusive)"
            name="endOn"
            type="date"
            defaultValue={period.endOn}
            required
          />
          <Button type="submit">Update report</Button>
        </FieldGroup>
      </form>
      <Failure error={inputError} />
      <Failure error={report.error} retry={report.reload} />
      {report.loading ? (
        <Loading label="Preparing cost report…" />
      ) : (
        report.data && (
          <section className="panel cost-report">
            <header className="report-heading">
              <div>
                <h2>Maintenance cost report</h2>
                <p>
                  {dateLabel(report.data.period.startOn)} —{" "}
                  {dateLabel(addDays(report.data.period.endOn, -1))} ·{" "}
                  {config.timeZone} · {report.data.currency}
                </p>
              </div>
              <div className="report-total">
                <span>Total recorded cost</span>
                <strong>
                  {money(report.data.totalMinor, report.data.currency)}
                </strong>
              </div>
            </header>
            {report.data.equipmentTotals.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Completed services</TableHead>
                    <TableHead className="numeric">Recorded cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.data.equipmentTotals.map((item) => (
                    <TableRow key={item.equipmentId}>
                      <TableCell>
                        <EquipmentLink id={item.equipmentId}>
                          {item.equipmentName}
                        </EquipmentLink>
                      </TableCell>
                      <TableCell>{item.serviceCount}</TableCell>
                      <TableCell className="numeric">
                        {money(item.costMinor, report.data!.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell>
                      {report.data.equipmentTotals.reduce(
                        (sum, item) => sum + item.serviceCount,
                        0,
                      )}
                    </TableCell>
                    <TableCell className="numeric">
                      {money(report.data.totalMinor, report.data.currency)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            ) : (
              <EmptyState
                title="No service costs in this period"
                description="Completed services, including zero-cost work, appear in this report."
              />
            )}
            <footer className="report-notes">
              <p>
                Amounts use the deployment’s locked currency. Zero-cost services
                are included. The API treats the start date as inclusive and the
                end date as exclusive.
              </p>
              <p>
                VanLog · Self-initiated ConsoleLog Studio project · Fictional
                shared-demo data
              </p>
            </footer>
          </section>
        )
      )}
    </>
  );
}
