import { STATUS_LABEL, type DayStatus } from "@/lib/domain/attendance";
import type { PersonReport } from "@/lib/domain/performance";
import { formatDuration } from "@/lib/domain/presence";
import { formatPkt, pktInstant } from "@/lib/time";

export type DayLine = {
  id: string;
  name: string;
  business: string | null;
  status: DayStatus;
  checkInMs: number | null;
  lateMin: number;
  assigned: number;
  done: number;
  open: number;
  /** Routines whose time passed without being finished. `reason` is null while the person hasn't explained. */
  notDone: { title: string; reason: string | null }[];
  /** Routines finished after their time, with the reason given. */
  doneLate: { title: string; reason: string | null }[];
  blocked: { title: string; reason: string }[];
  journal: { filled: number; expected: number };
  activeSec: number;
  idleSec: number;
};

export type DayDigest = {
  date: string;
  lines: DayLine[];
  totals: { assigned: number; done: number; notDone: number; needReason: number; doneLate: number; present: number; late: number; absent: number; onLeave: number };
};

/** One day for the whole team: who was in, what got done, what didn't (and why), and how the hours went. */
export function buildDayDigest(date: string, reports: PersonReport[]): DayDigest {
  const lines = reports.map<DayLine>(({ person, business, report }) => {
    const day = report.attendance.days.find((d) => d.date === date)?.result;
    return {
      id: person.id,
      name: person.name,
      business: business?.name ?? null,
      status: day?.status ?? "off",
      checkInMs: day?.checkInMs ?? null,
      lateMin: day?.lateMin ?? 0,
      assigned: report.tasks.assigned,
      done: report.tasks.done,
      open: report.tasks.open,
      notDone: report.missed.map((t) => ({ title: t.title, reason: t.missedReason })),
      doneLate: report.done.filter((t) => t.kind === "daily" && t.dueAtMs !== null && t.completedAtMs !== null && t.completedAtMs > t.dueAtMs).map((t) => ({ title: t.title, reason: t.missedReason })),
      blocked: report.open.filter((t) => t.status === "blocked").map((t) => ({ title: t.title, reason: t.blockedReason ?? "No reason given" })),
      journal: { filled: report.journal.filled, expected: report.journal.expected },
      activeSec: report.presence.activeSec,
      idleSec: report.presence.idleSec,
    };
  });
  const sum = (pick: (l: DayLine) => number) => lines.reduce((n, l) => n + pick(l), 0);
  const count = (...statuses: DayStatus[]) => lines.filter((l) => statuses.includes(l.status)).length;
  return {
    date,
    lines,
    totals: {
      assigned: sum((l) => l.assigned),
      done: sum((l) => l.done),
      notDone: sum((l) => l.notDone.length),
      needReason: sum((l) => l.notDone.filter((n) => !n.reason).length),
      doneLate: sum((l) => l.doneLate.length),
      present: count("present"),
      late: count("late"),
      absent: count("absent"),
      onLeave: count("leave", "excused"),
    },
  };
}

const clock = (ms: number) => formatPkt(new Date(ms), "h:mm a");

/** The same digest as plain text for WhatsApp: bold with asterisks, one block per person. */
export function digestText(d: DayDigest): string {
  const t = d.totals;
  const head = [
    `*Daily report: ${formatPkt(pktInstant(d.date, "12:00"), "EEE d MMM")}*`,
    `Tasks done ${t.done} of ${t.assigned}${t.notDone ? ` · ${t.notDone} routine${t.notDone === 1 ? "" : "s"} not done` : ""}${t.doneLate ? ` · ${t.doneLate} finished late` : ""}`,
    `In: ${t.present + t.late}${t.late ? ` (${t.late} late)` : ""}${t.absent ? ` · Absent: ${t.absent}` : ""}${t.onLeave ? ` · On leave: ${t.onLeave}` : ""}`,
  ];
  const blocks = d.lines.map((l) => {
    const status = STATUS_LABEL[l.status] + (l.status === "late" && l.lateMin ? ` ${l.lateMin}m` : "") + (l.checkInMs && (l.status === "present" || l.status === "late") ? ` (in ${clock(l.checkInMs)})` : "");
    const rows = [`*${l.name}*${l.business ? ` (${l.business})` : ""}: ${status}`, `Tasks ${l.done}/${l.assigned} · Journal ${l.journal.filled}/${l.journal.expected}h · Active ${formatDuration(l.activeSec)}`];
    for (const n of l.notDone) rows.push(`- Not done: ${n.title}${n.reason ? ` (${n.reason})` : " (no reason yet)"}`);
    for (const n of l.doneLate) rows.push(`- Finished late: ${n.title}${n.reason ? ` (${n.reason})` : ""}`);
    for (const b of l.blocked) rows.push(`- Blocked: ${b.title} (${b.reason})`);
    return rows.join("\n");
  });
  return [head.join("\n"), ...blocks].join("\n\n");
}
