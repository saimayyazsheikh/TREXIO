import { computeAnalytics, toHours, type Analytics, type AnalyticsInput } from "@/lib/domain/analytics";

export const SUMMARY_MAX_CHARS = 6000;
/** Longest blocked-reason text sent to the model. Reasons are free text typed by employees. */
const REASON_CLIP = 80;

export type SummaryPeriod = { from: string; to: string };

/** A manual run for the week in progress is kept apart from the finished week, so the weekly job never skips the real one. */
export const summaryId = (from: string, partial: boolean) => `week_${from}${partial ? "_live" : ""}`;

type Kpis = Analytics["kpis"];
export type SummaryStats = {
  period: SummaryPeriod;
  partial: boolean;
  kpis: Kpis;
  previous: Pick<Kpis, "total" | "completedPct" | "onTimePct" | "avgActiveHours" | "journalPct" | "blocked"> | null;
  people: { name: string; business: string; assigned: number; done: number; donePct: number; activeHours: number; idleHours: number; breakHours: number; daysSeen: number; journalPct: number | null }[];
  businesses: { name: string; total: number; completedPct: number; onTimePct: number; blocked: number }[];
  blockedReasons: { reason: string; count: number }[];
};

/**
 * The numbers the model gets: totals, per-person and per-business figures, and the most common blocked reasons.
 * Journal text and chat are never included, only how much of each journal was filled in.
 */
export function buildSummaryStats(input: AnalyticsInput, previous: AnalyticsInput | null, partial: boolean): SummaryStats {
  const all = computeAnalytics({ ...input, businessId: "" });
  const prev = previous ? computeAnalytics({ ...previous, businessId: "" }).kpis : null;
  const bName = new Map(input.businesses.map((b) => [b.id, b.name]));
  return {
    period: { from: input.from, to: input.to },
    partial,
    kpis: all.kpis,
    previous: prev && { total: prev.total, completedPct: prev.completedPct, onTimePct: prev.onTimePct, avgActiveHours: prev.avgActiveHours, journalPct: prev.journalPct, blocked: prev.blocked },
    people: all.employees.map((e) => ({
      name: e.name,
      business: e.businessId ? (bName.get(e.businessId) ?? "") : "",
      assigned: e.assigned,
      done: e.done,
      donePct: e.donePct,
      activeHours: toHours(e.activeSec),
      idleHours: toHours(e.idleSec),
      breakHours: toHours(e.breakSec),
      daysSeen: e.daysSeen,
      journalPct: e.journalExpected > 0 ? e.journalPct : null,
    })),
    businesses: input.businesses.map((b) => {
      const k = computeAnalytics({ ...input, businessId: b.id }).kpis;
      return { name: b.name, total: k.total, completedPct: k.completedPct, onTimePct: k.onTimePct, blocked: k.blocked };
    }),
    blockedReasons: all.blockedReasons.map((r) => ({ reason: r.reason.slice(0, REASON_CLIP), count: r.count })),
  };
}

export const SYSTEM_PROMPT = [
  "You write the weekly team summary for the owner of several small businesses who uses a task and team-monitoring app.",
  "You are given JSON with last week's figures. Use only those figures: never invent numbers, names, causes or events, and if something isn't in the data, don't mention it.",
  "Write plain text, under 350 words, in this exact layout:",
  "## Highlights",
  "## Bottlenecks",
  "## By business",
  "## Suggested actions",
  "Under each heading write short bullets that start with '- '. Name people only where the figures show something worth noticing, and be fair and factual about them, not harsh.",
  "Compare with the previous week when `previous` is present. Percentages are whole numbers. Hours are hours inside the app, not total hours worked.",
  "Each suggested action must follow from a figure you cited. Do not use markdown other than the headings and bullets.",
].join("\n");

export function buildPrompt(stats: SummaryStats): string {
  const note = stats.partial ? "This is a partial week so far, not a finished one.\n" : "";
  return `${note}Figures for ${stats.period.from} to ${stats.period.to}:\n${JSON.stringify(stats)}`;
}

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A readable summary written by rules, in the same layout the model is asked for. Used when no AI provider is configured. */
export function templateSummary(s: SummaryStats): string {
  const k = s.kpis;
  const p = s.previous;
  const highlights = [
    `- ${k.completed} of ${k.total} tasks were completed (${k.completedPct}%)${p ? `, ${sign(k.completedPct - p.completedPct)} points on the week before` : ""}.`,
    k.onTime + k.late > 0 ? `- ${k.onTimePct}% of tasks with a due time were finished on time (${k.onTime} on time, ${k.late} late or overdue).` : null,
    `- People were active in the app for ${k.avgActiveHours} hours a day on average.`,
  ].filter(Boolean);
  const best = [...s.people].filter((x) => x.assigned > 0).sort((a, b) => b.donePct - a.donePct)[0];
  if (best) highlights.push(`- ${best.name} finished the largest share of their tasks (${best.donePct}%).`);

  const bottlenecks: string[] = [];
  if (k.late > 0) bottlenecks.push(`- ${k.late} tasks were finished late or are still overdue.`);
  if (k.blocked > 0) bottlenecks.push(`- Tasks were blocked ${k.blocked} times${s.blockedReasons[0] ? `; the most common reason was "${s.blockedReasons[0].reason}" (${s.blockedReasons[0].count})` : ""}.`);
  if (k.journalPct < 60 && s.people.some((x) => x.journalPct !== null)) bottlenecks.push(`- Journals were only ${k.journalPct}% filled in.`);
  if (bottlenecks.length === 0) bottlenecks.push("- Nothing stood out as a bottleneck this week.");

  const byBusiness = s.businesses.map((b) => `- ${b.name}: ${b.total} tasks, ${b.completedPct}% completed, ${b.blocked} blocked.`);

  const actions: string[] = [];
  if (s.blockedReasons[0]) actions.push(`- Look into "${s.blockedReasons[0].reason}", the most common reason tasks got blocked.`);
  if (k.late > k.onTime && k.late > 0) actions.push("- More tasks ran late than finished on time: check whether due times are realistic.");
  if (k.journalPct < 60 && s.people.some((x) => x.journalPct !== null)) actions.push("- Remind the team to fill in their hourly journals.");
  if (actions.length === 0) actions.push("- Keep going: no action stands out from this week's figures.");

  return ["## Highlights", ...highlights, "", "## Bottlenecks", ...bottlenecks, "", "## By business", ...(byBusiness.length ? byBusiness : ["- No businesses yet."]), "", "## Suggested actions", ...actions].join("\n");
}

export type SummaryBlock = { type: "heading"; text: string } | { type: "bullets"; items: string[] } | { type: "paragraph"; text: string };

/** Turns the model's text into blocks the page can render without ever treating it as HTML. */
export function parseSummary(text: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (heading) blocks.push({ type: "heading", text: heading[1] });
    else if (bullet) {
      const last = blocks.at(-1);
      if (last?.type === "bullets") last.items.push(bullet[1]);
      else blocks.push({ type: "bullets", items: [bullet[1]] });
    } else blocks.push({ type: "paragraph", text: line });
  }
  return blocks;
}

/** Keeps a WhatsApp-sized version: the headings and bullets joined on one line. */
export function condense(text: string, max = 900): string {
  const flat = text.replace(/^#{1,3}\s+/gm, "").replace(/^[-*•]\s+/gm, "- ").replace(/\s*\n+\s*/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
