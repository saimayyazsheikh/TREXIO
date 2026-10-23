"use client";

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WEEKDAY_LABELS, type Analytics } from "@/lib/domain/analytics";

const INK = "var(--viz-ink-muted)";
const GRID = "var(--viz-grid)";
const AXIS = "var(--viz-axis)";
const SURFACE = "var(--surface-solid)";
export const SERIES = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)"] as const;

const tick = { fill: INK, fontSize: 12 };
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

type Row = { color: string; name: string; value: string };

/** Values lead, series names follow; each row is keyed with a short line in the series colour. */
function Readout({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="viz rounded-control border border-border-solid bg-surface-solid px-3 py-2 text-sm shadow-[var(--shadow-2)]">
      <p className="mb-1 text-xs text-muted">{title}</p>
      {rows.map((r, i) => (
        <p key={`${r.name}-${i}`} className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
          <span className="num font-semibold">{r.value}</span>
          <span className="text-muted">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

type TipProps = { active?: boolean; payload?: { name?: string; value?: number; color?: string; fill?: string; stroke?: string; payload?: Record<string, unknown> }[]; label?: string };
const makeTip =
  (format: (p: NonNullable<TipProps["payload"]>[number], label: string) => Row | null) =>
  // eslint-disable-next-line react/display-name
  (props: unknown) => {
    const { active, payload, label } = props as TipProps;
    if (!active || !payload?.length) return null;
    const rows = payload.flatMap((p) => {
      const r = format(p, String(label ?? ""));
      return r ? [r] : [];
    });
    return rows.length ? <Readout title={String(label ?? "")} rows={rows} /> : null;
  };

/* ------------------------------ Completion trend ------------------------------ */

export function TrendChart({ points }: { points: Analytics["trend"]["points"] }) {
  const last = points.length - 1;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={points} margin={{ top: 16, right: 20, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: AXIS }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          cursor={{ stroke: AXIS }}
          content={makeTip((p) => {
            const d = p.payload as { completed: number; total: number } | undefined;
            return p.name === "Completed" && d && p.value !== undefined && p.value !== null ? { color: "var(--viz-1)", name: `completed · ${d.completed} of ${d.total} tasks`, value: `${p.value}%` } : null;
          })}
        />
        <Area dataKey="completedPct" name="Completed" connectNulls stroke="none" fill="var(--viz-1)" fillOpacity={0.1} isAnimationActive={false} legendType="none" tooltipType="none" />
        <Line
          dataKey="completedPct"
          name="Completed"
          connectNulls
          stroke="var(--viz-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number }) =>
            props.index === last && props.cx !== undefined && props.cy !== undefined ? (
              <circle key="end" cx={props.cx} cy={props.cy} r={4} fill="var(--viz-1)" stroke={SURFACE} strokeWidth={2} />
            ) : (
              <g key={props.index} />
            )
          }
          activeDot={{ r: 4, fill: "var(--viz-1)", stroke: SURFACE, strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------- On time vs late ------------------------------ */

export function OnTimeChart({ points }: { points: Analytics["trend"]["points"] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={points} margin={{ top: 16, right: 20, bottom: 4, left: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: AXIS }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
        <Tooltip
          cursor={{ fill: GRID, fillOpacity: 0.5 }}
          content={makeTip((p) => (p.value === undefined ? null : { color: p.fill ?? "", name: p.name ?? "", value: String(p.value) }))}
        />
        <Bar dataKey="onTime" name="On time" stackId="t" fill="var(--viz-1)" stroke={SURFACE} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="late" name="Late or overdue" stackId="t" fill="var(--viz-2)" stroke={SURFACE} strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------ Horizontal bars ------------------------------- */

const rowHeight = 34;
const barsHeight = (n: number) => Math.max(120, n * rowHeight + 36);

/** One series, one colour for every bar (the names are not an ordered scale), value at the tip. */
export function HBarChart({ data, unit = "", max, label, labelWidth = 112 }: { data: { name: string; value: number }[]; unit?: string; max?: number; label: string; labelWidth?: number }) {
  const chars = Math.floor(labelWidth / 7);
  return (
    <ResponsiveContainer width="100%" height={barsHeight(data.length)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 44, bottom: 4, left: 4 }} barCategoryGap={10} accessibilityLayer>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, max ?? "auto"]} allowDecimals={false} tick={tick} tickLine={false} axisLine={{ stroke: AXIS }} tickFormatter={(v) => `${compact(v)}${unit}`} />
        <YAxis type="category" dataKey="name" width={labelWidth} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > chars ? `${v.slice(0, chars - 1)}…` : v)} />
        <Tooltip cursor={{ fill: GRID, fillOpacity: 0.5 }} content={makeTip((p, name) => (p.value === undefined ? null : { color: "var(--viz-1)", name: `${label} · ${name}`, value: `${p.value}${unit}` }))} />
        <Bar dataKey="value" name={label} fill="var(--viz-1)" maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" formatter={(v: unknown) => `${v}${unit}`} style={{ fill: "var(--foreground)", fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ----------------------------- Active, idle and break ------------------------- */

export function TimeUseChart({ data }: { data: { name: string; active: number; idle: number; break: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={barsHeight(data.length)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, bottom: 4, left: 4 }} barCategoryGap={10} accessibilityLayer>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={tick} tickLine={false} axisLine={{ stroke: AXIS }} tickFormatter={(v) => `${v}h`} />
        <YAxis type="category" dataKey="name" width={112} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
        <Tooltip cursor={{ fill: GRID, fillOpacity: 0.5 }} content={makeTip((p) => (p.value === undefined ? null : { color: p.fill ?? "", name: p.name ?? "", value: `${p.value}h` }))} />
        <Bar dataKey="active" name="Active" stackId="u" fill="var(--viz-1)" stroke={SURFACE} strokeWidth={2} maxBarSize={18} isAnimationActive={false} />
        <Bar dataKey="idle" name="Idle" stackId="u" fill="var(--viz-2)" stroke={SURFACE} strokeWidth={2} maxBarSize={18} isAnimationActive={false} />
        <Bar dataKey="break" name="On break" stackId="u" fill="var(--viz-3)" stroke={SURFACE} strokeWidth={2} maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* --------------------------------- Heat map ----------------------------------- */

const STEPS = 5;
const step = (count: number, max: number) => (count === 0 || max === 0 ? 0 : Math.min(STEPS, Math.ceil((count / max) * STEPS)));

/** Tasks per person per weekday. One hue, more is darker; the number is printed in every cell, so nothing relies on colour. */
export function Heatmap({ rows }: { rows: Analytics["workload"] }) {
  const max = Math.max(1, ...rows.map((r) => r.max));
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full min-w-[26rem] border-separate border-spacing-0.5 text-sm">
        <caption className="sr-only">Tasks assigned to each person on each weekday</caption>
        <thead>
          <tr>
            <th scope="col" className="w-32 px-2 text-left text-xs font-medium text-muted">
              Person
            </th>
            {WEEKDAY_LABELS.map((d) => (
              <th key={d} scope="col" className="text-xs font-medium text-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="truncate px-2 text-left font-medium">
                {r.name}
              </th>
              {r.counts.map((c, i) => {
                const s = step(c, max);
                return (
                  <td
                    key={i}
                    title={`${r.name}, ${WEEKDAY_LABELS[i]}: ${c} ${c === 1 ? "task" : "tasks"}`}
                    className="num h-9 rounded-md text-center text-xs font-semibold"
                    style={s === 0 ? { color: INK } : { background: `var(--viz-seq-${s})`, color: `var(--viz-seq-ink-${s})` }}
                  >
                    {c}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
