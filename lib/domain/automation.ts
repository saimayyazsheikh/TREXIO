import { z } from "zod";
import { DEFAULT_IDLE_MIN } from "@/lib/domain/presence";
import { PROMPT_MINUTE } from "@/lib/domain/journal";
import { phoneSchema } from "@/lib/domain/schemas";
import { formatPkt } from "@/lib/time";

export const SETTINGS_PATH = "settings/global";

/** Escalation never looks further back than this, so an abandoned task doesn't alert forever. */
export const ESCALATION_LOOKBACK_MS = 48 * 60 * 60 * 1000;
/** A task still To-Do or In Progress is the only kind that escalates (blocked and in-review tasks have an owner already). */
export const ESCALATING_STATUSES = ["todo", "in_progress"] as const;

const baseSchema = z.object({
  escalationL1Min: z.number().int("Use whole minutes").min(10, "At least 10 minutes").max(1440, "At most 24 hours"),
  escalationL2Min: z.number().int("Use whole minutes").min(20, "At least 20 minutes").max(2880, "At most 48 hours"),
  briefingEnabled: z.boolean(),
  promptMinute: z.number().int("Use whole minutes").min(0).max(59, "A minute from 0 to 59"),
  idleMin: z.number().int("Use whole minutes").min(1, "At least 1 minute").max(60, "At most 60 minutes"),
  /** The admin's WhatsApp number for urgent alerts; empty turns those alerts off. */
  adminPhone: z.union([z.literal(""), phoneSchema]),
});
export const settingsSchema = baseSchema.refine((s) => s.escalationL2Min > s.escalationL1Min, { path: ["escalationL2Min"], message: "The second alert must come after the first" });
export type AutomationSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AutomationSettings = {
  escalationL1Min: 60,
  escalationL2Min: 180,
  briefingEnabled: true,
  promptMinute: PROMPT_MINUTE,
  idleMin: DEFAULT_IDLE_MIN,
  adminPhone: "",
};

/** Whatever is stored, repaired field by field: a missing or invalid value falls back to its default. */
export function resolveSettings(raw: unknown): AutomationSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AutomationSettings)[]) {
    if (baseSchema.shape[key].safeParse(r[key]).success) out[key] = r[key];
  }
  const s = out as AutomationSettings;
  // Two thresholds in the wrong order can't both be trusted: use the defaults for the pair.
  if (s.escalationL2Min <= s.escalationL1Min) return { ...s, escalationL1Min: DEFAULT_SETTINGS.escalationL1Min, escalationL2Min: DEFAULT_SETTINGS.escalationL2Min };
  return s;
}

/* -------------------------------- Escalation -------------------------------- */

export type EscalationTask = {
  status: string;
  dueAtMs: number | null;
  escalation: { l1At: unknown; l2At: unknown } | null | undefined;
};

/** Which alerts are due now and haven't fired yet. A level fires once per task (the flag is set when it does). */
export function escalationDue(t: EscalationTask, nowMs: number, s: Pick<AutomationSettings, "escalationL1Min" | "escalationL2Min">): { l1: boolean; l2: boolean } {
  if (!(ESCALATING_STATUSES as readonly string[]).includes(t.status) || t.dueAtMs === null) return { l1: false, l2: false };
  const late = nowMs - t.dueAtMs;
  if (late <= 0 || late > ESCALATION_LOOKBACK_MS) return { l1: false, l2: false };
  return {
    l1: late >= s.escalationL1Min * 60_000 && !t.escalation?.l1At,
    l2: late >= s.escalationL2Min * 60_000 && !t.escalation?.l2At,
  };
}

export function lateBy(dueAtMs: number, nowMs: number): string {
  const min = Math.max(0, Math.round((nowMs - dueAtMs) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* --------------------------------- Messages --------------------------------- */

export type TaskLine = { title: string; dueAtMs: number | null; priority?: string };

const dueText = (ms: number | null) => (ms ? `due ${formatPkt(new Date(ms), "h:mm a")}` : "no due time");

export function nudgeDefault(o: { employeeName: string; title: string; dueAtMs: number | null; status: string }): string {
  return `Hi ${o.employeeName.split(" ")[0]}, a quick check on “${o.title}” (${o.status}, ${dueText(o.dueAtMs)}). Could you share a short update and when you expect to finish?`;
}

export function briefingText(name: string, tasks: TaskLine[]): string {
  const first = name.split(" ")[0];
  if (tasks.length === 0) return `Good morning ${first}! You have nothing assigned for today yet.`;
  const lines = tasks.slice(0, 12).map((t, i) => `${i + 1}. ${t.title} (${dueText(t.dueAtMs)})`);
  const more = tasks.length > 12 ? `\n…and ${tasks.length - 12} more` : "";
  return `Good morning ${first}! Today you have ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}:\n${lines.join("\n")}${more}`;
}

export function escalationEmployeeText(o: { title: string; lateMs: number }): { title: string; body: string } {
  return { title: "A task is running late", body: `“${o.title}” is ${lateBy(0, o.lateMs)} past its due time. Please finish it or tell your admin what's blocking you.` };
}

export function escalationAdminText(o: { employeeNames: string[]; title: string; business: string; lateMs: number }): string {
  return `Late task: “${o.title}” (${o.business}) assigned to ${o.employeeNames.join(", ") || "nobody"} is ${lateBy(0, o.lateMs)} past its due time.`;
}
