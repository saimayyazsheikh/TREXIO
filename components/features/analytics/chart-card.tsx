"use client";

import { useId, useState } from "react";
import { ChartColumn, Table2 } from "lucide-react";
import { GlassCard } from "@/components/features/glass-card";
import { cn } from "@/lib/utils";

export type LegendItem = { label: string; color: string };
export type TableData = { columns: string[]; rows: (string | number)[][] };

/**
 * One chart with its title, a legend when there are two or more series, and a table twin of the same numbers
 * (the accessible equivalent, and where every value is reachable without hovering).
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  empty,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  legend?: LegendItem[];
  table: TableData;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  return (
    <GlassCard className={cn("viz p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {!empty ? (
          <div role="group" aria-label={`${title}: view`} className="flex rounded-control border border-border-solid p-0.5 print:hidden">
            {(
              [
                ["chart", "Chart", ChartColumn],
                ["table", "Table", Table2],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                aria-controls={`${id}-${value}`}
                onClick={() => setView(value)}
                className={cn("flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors", view === value ? "bg-surface-raised text-foreground" : "text-muted hover:text-foreground")}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {empty ? (
        <p className="rounded-control bg-surface-raised px-4 py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          {legend && legend.length > 1 ? (
            <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5 text-sm text-muted">
                  <span aria-hidden className="size-2.5 rounded-sm" style={{ background: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          ) : null}
          <div id={`${id}-chart`} hidden={view !== "chart"} className="rounded-control bg-surface-solid">
            {children}
          </div>
          <div id={`${id}-table`} hidden={view !== "table"} className="max-h-80 overflow-auto rounded-control border border-border-solid">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-solid">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} scope="col" className={cn("px-3 py-2 font-semibold", i > 0 && "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-border-solid">
                    {r.map((cell, ci) => (
                      <td key={ci} className={cn("px-3 py-1.5", ci > 0 ? "num text-right" : "font-medium")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </GlassCard>
  );
}
