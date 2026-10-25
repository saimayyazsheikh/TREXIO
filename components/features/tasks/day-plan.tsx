"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock as ClockIcon } from "lucide-react";
import { GlassCard } from "@/components/features/glass-card";
import { buildDayPlan, fractionOfDay, type DayPlan, type PlanItem, type PlanWindow } from "@/lib/domain/day-plan";
import { isMissed } from "@/lib/domain/tasks";
import { formatPkt, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskDoc, WithId } from "@/types/models";

type View = "timeline" | "clock";
const VIEW_KEY = "traxio:plan-view";

const STATE_LABEL: Record<PlanWindow["state"], string> = { done: "Done", missed: "Not done", now: "Time left now", open: "Coming up" };
const BAR: Record<PlanWindow["state"], string> = {
  done: "border-success/60 bg-success/25",
  missed: "border-danger/60 bg-danger/20",
  now: "border-brand bg-brand/30",
  open: "border-info/50 bg-info/15",
};
const ARC: Record<PlanWindow["state"], string> = {
  done: "fill-success/35 stroke-success",
  missed: "fill-danger/30 stroke-danger",
  now: "fill-brand/45 stroke-brand",
  open: "fill-info/25 stroke-info",
};

const clock = (ms: number) => formatPkt(new Date(ms), "h:mm a");
const label = (w: PlanWindow) => (w.items.length === 1 ? w.items[0].title : `${w.items.length} routines`);
const tip = (w: PlanWindow) => `${w.items.map((i) => i.title).join(", ")} · ${clock(w.startMs)} to ${clock(w.endMs)} · ${STATE_LABEL[w.state]}`;

function Timeline({ plan, nowMs }: { plan: DayPlan; nowMs: number }) {
  const span = plan.endMs - plan.startMs;
  const hours: number[] = [];
  const step = span > 10 * 3_600_000 ? 2 : 1;
  for (let ms = Math.ceil(plan.startMs / 3_600_000) * 3_600_000; ms <= plan.endMs; ms += step * 3_600_000) hours.push(ms);
  const nowAt = nowMs >= plan.startMs && nowMs <= plan.endMs ? fractionOfDay(plan, nowMs) * 100 : null;

  return (
    <div aria-hidden>
      <div className="relative h-16 overflow-hidden rounded-xl bg-surface-raised">
        {plan.windows.map((w) => (
          <div
            key={w.endMs}
            title={tip(w)}
            className={cn("absolute inset-y-1.5 flex min-w-1.5 items-center overflow-hidden rounded-lg border px-2 text-xs font-semibold", BAR[w.state])}
            style={{ left: `${fractionOfDay(plan, w.startMs) * 100}%`, width: `${Math.max(0.8, (fractionOfDay(plan, w.endMs) - fractionOfDay(plan, w.startMs)) * 100)}%` }}
          >
            <span className="truncate">{label(w)}</span>
          </div>
        ))}
        {nowAt !== null ? (
          <div className="absolute inset-y-0 z-10 w-0.5 bg-foreground" style={{ left: `${nowAt}%` }}>
            <span className="absolute -top-0 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground" />
          </div>
        ) : null}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted">
        {hours.map((ms) => (
          <span key={ms} className="num absolute -translate-x-1/2" style={{ left: `${fractionOfDay(plan, ms) * 100}%` }}>
            {formatPkt(new Date(ms), "h a")}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A 24-hour round clock: midnight at the top, working hours shaded, each routine a slice that ends at its deadline. */
function Clock({ plan, nowMs, date }: { plan: DayPlan; nowMs: number; date: string }) {
  const midnight = pktInstant(date, "00:00").getTime();
  const DAY = 24 * 3_600_000;
  const C = 120;
  const R = 104;
  const r = 70;
  const angle = (ms: number) => ((ms - midnight) / DAY) * Math.PI * 2 - Math.PI / 2;
  const pt = (radius: number, a: number) => [C + radius * Math.cos(a), C + radius * Math.sin(a)];
  const sector = (a0: number, a1: number) => {
    const [x0, y0] = pt(R, a0);
    const [x1, y1] = pt(R, a1);
    const [x2, y2] = pt(r, a1);
    const [x3, y3] = pt(r, a0);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0} ${y0} A${R} ${R} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${big} 0 ${x3} ${y3} Z`;
  };
  const next = plan.windows.find((w) => w.state !== "done" && w.endMs >= nowMs);
  const nowA = angle(nowMs);
  const [hx, hy] = pt(R + 6, nowA);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="-18 -18 276 276" className="size-64 shrink-0" aria-hidden>
        <circle cx={C} cy={C} r={(R + r) / 2} fill="none" strokeWidth={R - r} className="stroke-surface-raised" />
        <path d={sector(angle(plan.startMs), angle(plan.endMs))} className="fill-brand/10" />
        {Array.from({ length: 24 }, (_, h) => {
          const a = angle(midnight + h * 3_600_000);
          const [x0, y0] = pt(R + 2, a);
          const [x1, y1] = pt(R + (h % 6 === 0 ? 9 : 5), a);
          return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth={h % 6 === 0 ? 1.6 : 1} className="stroke-muted/70" />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = pt(R + 20, angle(midnight + h * 3_600_000));
          return (
            <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[10px] font-medium">
              {h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
            </text>
          );
        })}
        {plan.windows.map((w) => (
          <path key={w.endMs} d={sector(angle(w.startMs), Math.max(angle(w.endMs), angle(w.startMs) + 0.04))} strokeWidth={1.5} className={ARC[w.state]}>
            <title>{tip(w)}</title>
          </path>
        ))}
        <line x1={C} y1={C} x2={hx} y2={hy} strokeWidth={2} strokeLinecap="round" className="stroke-foreground" />
        <circle cx={C} cy={C} r={4} className="fill-foreground" />
      </svg>
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{next ? "Next deadline" : "Nothing left"}</p>
        {next ? (
          <>
            <p className="mt-1 font-display text-lg font-semibold leading-snug">{label(next)}</p>
            <p className="num text-sm text-muted">by {clock(next.endMs)}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">No more deadlines today.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Today's daily routines laid out along the day, as a bar or a round clock. Each routine gets the stretch of time that ends at its
 * deadline, so it is clear how long there is for it. The list underneath is the same information in words.
 */
export function DayPlanCard({ routines, uid, hours, now, today, status }: {
  routines: WithId<TaskDoc>[];
  uid: string;
  hours: { start: string; end: string };
  now: Date;
  today: string;
  status: (t: WithId<TaskDoc>) => TaskDoc["status"];
}) {
  const [view, setView] = useState<View>("timeline");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "clock") setView("clock");
    } catch {
      /* the default stays */
    }
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered */
    }
  };

  const nowMs = now.getTime();
  const plan = useMemo(() => {
    const items: PlanItem[] = routines.map((t) => {
      const st = status(t);
      const done = st === "completed" || !!t.completion[uid]?.done;
      const missed = !done && isMissed({ kind: t.kind, status: st, dueAtMs: t.dueAt?.toMillis() ?? null, date: t.date }, nowMs, today);
      return { id: t.id, title: t.title, dueMs: t.dueAt?.toMillis() ?? null, state: done ? "done" : missed ? "missed" : "open" };
    });
    return buildDayPlan(items, hours, today, nowMs);
  }, [routines, status, uid, hours, today, nowMs]);

  if (routines.length === 0) return null;

  return (
    <GlassCard className="mb-5 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <CalendarClock className="size-5 text-brand-text" aria-hidden /> Your day
          </h2>
          <p className="text-sm text-muted">Each routine has the time up to its deadline.</p>
        </div>
        <div role="group" aria-label="Show as" className="inline-flex rounded-full border border-border-solid bg-surface-raised p-0.5">
          {(["timeline", "clock"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)} className={cn("h-8 rounded-full px-3.5 text-sm font-medium capitalize transition-colors", view === v ? "bg-surface-solid text-foreground shadow-[var(--shadow-1)]" : "text-muted hover:text-foreground")}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {plan.windows.length > 0 ? view === "timeline" ? <Timeline plan={plan} nowMs={nowMs} /> : <Clock plan={plan} nowMs={nowMs} date={today} /> : <p className="text-sm text-muted">None of today&apos;s routines has a time yet.</p>}

      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Key">
        {(["done", "now", "open", "missed"] as const).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-[4px] border", BAR[s])} />
            {STATE_LABEL[s]}
          </li>
        ))}
      </ul>
      <ol className="sr-only" aria-label="Routines by deadline">
        {plan.windows.map((w) => (
          <li key={w.endMs}>{tip(w)}</li>
        ))}
      </ol>
      {plan.untimed.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <ClockIcon className="size-4" aria-hidden /> Any time today:
          {plan.untimed.map((i) => (
            <span key={i.id} className={cn("rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-foreground", i.state === "done" && "line-through opacity-60")}>
              {i.title}
            </span>
          ))}
        </p>
      ) : null}
    </GlassCard>
  );
}
