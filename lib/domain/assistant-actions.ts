import { z } from "zod";
import { BUSINESS_COLOR_IDS } from "@/lib/domain/business-colors";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/domain/constants";
import { DEFAULT_SETTINGS, settingsSchema, type AutomationSettings } from "@/lib/domain/automation";
import { passwordSchema, phoneSchema, usernameSchema } from "@/lib/domain/schemas";
import { WEEKDAYS } from "@/lib/domain/work-days";
import { formatPkt, pktInstant } from "@/lib/time";

/** Everything the assistant can ask for beyond creating tasks, a dump note or a late alert. Each one is shown to the admin first. */
export const ACTION_KINDS = [
  "task.update",
  "task.delete",
  "task.status",
  "reminder.send",
  "leave.decide",
  "routine.create",
  "routine.update",
  "routine.delete",
  "employee.create",
  "employee.update",
  "employee.status",
  "employee.password",
  "holiday.add",
  "holiday.remove",
  "business.create",
  "business.update",
  "settings.update",
  "open.page",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const MAX_ACTIONS = 8;

/** Pages the assistant can take the admin to. */
export const PAGES = {
  dashboard: { label: "Dashboard", href: "/admin" },
  kanban: { label: "Kanban board", href: "/admin/kanban" },
  workload: { label: "Workload", href: "/admin/workload" },
  calendar: { label: "Calendar", href: "/admin/calendar" },
  dump: { label: "Dump tasks", href: "/admin/dump" },
  reminders: { label: "Reminders", href: "/admin/reminders" },
  presence: { label: "Presence", href: "/admin/presence" },
  journals: { label: "Journals", href: "/admin/journals" },
  leave: { label: "Leave", href: "/admin/leave" },
  "daily-report": { label: "Daily report", href: "/admin/daily-report" },
  analytics: { label: "Analytics", href: "/admin/analytics" },
  "ai-summaries": { label: "AI summaries", href: "/admin/ai-summaries" },
  audit: { label: "Audit log", href: "/admin/audit" },
  inbox: { label: "Inbox", href: "/admin/inbox" },
  chat: { label: "Chat", href: "/admin/chat" },
  team: { label: "Team", href: "/admin/settings/team" },
  businesses: { label: "Businesses", href: "/admin/settings/businesses" },
  holidays: { label: "Holidays", href: "/admin/settings/calendar" },
  automation: { label: "Automation settings", href: "/admin/settings/automation" },
} as const;
export type PageKey = keyof typeof PAGES;
const PAGE_KEYS = Object.keys(PAGES) as [PageKey, ...PageKey[]];

const id = z.string().min(1).max(80);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time like 09:00");
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const priority = z.enum(PRIORITIES);
const title = z.string().trim().min(2, "Give it a short title").max(120, "Keep the title under 120 characters");
const note = z.string().trim().max(2000);
const days = z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day").transform((d) => [...new Set(d)].sort((a, b) => a - b));
const steps = z.array(z.string().trim().min(1).max(120)).max(30);

const nonEmpty = <T extends Record<string, unknown>>(o: T) => Object.values(o).some((v) => v !== undefined);

/** What the server will do. This is the ONLY thing the confirm button sends back, and it is checked again there. */
export const actionPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task.update"),
    taskId: id,
    changes: z
      .object({
        title: title.optional(),
        description: note.optional(),
        date: dateText.optional(),
        dueTime: z.union([z.literal(""), hhmm]).optional(),
        priority: priority.optional(),
        assigneeIds: z.array(id).min(1).max(25).optional(),
        client: z.string().trim().max(60).optional(),
        estimateMin: z.number().int().min(5).max(1440).nullable().optional(),
      })
      .refine(nonEmpty, { message: "Nothing to change" }),
  }),
  z.object({ kind: z.literal("task.delete"), taskId: id }),
  z.object({ kind: z.literal("task.status"), taskId: id, status: z.enum(["completed", "todo", "in_progress"]) }),
  z.object({
    kind: z.literal("reminder.send"),
    message: z.string().trim().min(1, "Write a message").max(2000),
    toUids: z.array(id).max(200).default([]),
    toAll: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("leave.decide"), requestId: id, decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).default("") }),
  z.object({
    kind: z.literal("routine.create"),
    employeeId: id,
    title,
    description: note.default(""),
    priority: priority.default("medium"),
    dueTime: z.union([z.literal(""), hhmm]).default(""),
    steps: steps.default([]),
    activeDays: days,
  }),
  z.object({
    kind: z.literal("routine.update"),
    templateId: id,
    changes: z
      .object({ title: title.optional(), description: note.optional(), priority: priority.optional(), dueTime: z.union([z.literal(""), hhmm]).optional(), steps: steps.optional(), activeDays: days.optional(), active: z.boolean().optional() })
      .refine(nonEmpty, { message: "Nothing to change" }),
  }),
  z.object({ kind: z.literal("routine.delete"), templateId: id }),
  z.object({
    kind: z.literal("employee.create"),
    name: z.string().trim().min(2, "Enter the full name").max(80),
    username: usernameSchema,
    businessId: id,
    designation: z.string().trim().max(60).default(""),
    phone: z.union([z.literal(""), phoneSchema]).default(""),
  }),
  z.object({
    kind: z.literal("employee.update"),
    employeeId: id,
    changes: z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        designation: z.string().trim().max(60).optional(),
        phone: z.union([z.literal(""), phoneSchema]).optional(),
        businessId: id.optional(),
        workStart: z.union([z.literal(""), hhmm]).optional(),
        workEnd: z.union([z.literal(""), hhmm]).optional(),
      })
      .refine(nonEmpty, { message: "Nothing to change" }),
  }),
  z.object({ kind: z.literal("employee.status"), employeeId: id, status: z.enum(["active", "disabled"]) }),
  z.object({ kind: z.literal("employee.password"), employeeId: id }),
  z.object({ kind: z.literal("holiday.add"), date: dateText, name: z.string().trim().min(2, "Name it").max(80), businessId: id.nullable() }),
  z.object({ kind: z.literal("holiday.remove"), date: dateText, businessId: id.nullable() }),
  z.object({
    kind: z.literal("business.create"),
    name: z.string().trim().min(2, "Enter a business name").max(60),
    color: z.enum(BUSINESS_COLOR_IDS),
    workStart: hhmm,
    workEnd: hhmm,
    workDays: days,
  }),
  z.object({
    kind: z.literal("business.update"),
    businessId: id,
    changes: z
      .object({ name: z.string().trim().min(2).max(60).optional(), color: z.enum(BUSINESS_COLOR_IDS).optional(), workStart: hhmm.optional(), workEnd: hhmm.optional(), workDays: days.optional(), active: z.boolean().optional() })
      .refine(nonEmpty, { message: "Nothing to change" }),
  }),
  z.object({
    kind: z.literal("settings.update"),
    changes: z
      .object({
        escalationL1Min: z.number().int().optional(),
        escalationL2Min: z.number().int().optional(),
        escalationHighL1Min: z.number().int().optional(),
        escalationHighL2Min: z.number().int().optional(),
        notifyOnBlocked: z.boolean().optional(),
        briefingEnabled: z.boolean().optional(),
        promptMinute: z.number().int().optional(),
        idleMin: z.number().int().optional(),
      })
      .refine(nonEmpty, { message: "Nothing to change" }),
  }),
  z.object({ kind: z.literal("open.page"), page: z.enum(PAGE_KEYS) }),
]);
export type ActionPayload = z.infer<typeof actionPayloadSchema>;

/** What the confirm button posts: the payload, plus a password typed into the card for the two kinds that need one. */
export const runActionSchema = z.object({ action: actionPayloadSchema, password: passwordSchema.optional() });
export type RunActionInput = z.infer<typeof runActionSchema>;

/** The kinds that need a password the admin types themselves. The assistant never sees it. */
export const needsPassword = (kind: ActionKind) => kind === "employee.create" || kind === "employee.password";

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the model sends back, and how it becomes something the admin can confirm.                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const text = z.string().trim().max(2000).optional().nullable();
export const rawActionSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  /** Labels from the lists the assistant was shown: T3 (task), R2 (routine), L1 (leave request). */
  task: z.string().trim().max(20).optional().nullable(),
  routine: z.string().trim().max(20).optional().nullable(),
  leave: z.string().trim().max(20).optional().nullable(),
  /** A team member's name as the admin wrote it. */
  person: z.string().trim().max(80).optional().nullable(),
  /** Reminder recipients: names, or "everyone". */
  who: z.array(z.string().trim().min(1).max(80)).max(50).optional().nullable(),
  /** Task assignees for task.update, names as written. */
  assignees: z.array(z.string().trim().min(1).max(80)).max(25).optional().nullable(),
  business: text,
  title: text,
  description: text,
  priority: z.string().optional().nullable(),
  date: text,
  time: text,
  client: text,
  estimateMin: z.number().optional().nullable(),
  status: text,
  message: text,
  decision: text,
  note: text,
  name: text,
  username: text,
  designation: text,
  phone: text,
  color: text,
  workStart: text,
  workEnd: text,
  /** ISO weekdays 1 (Monday) to 7 (Sunday). */
  days: z.array(z.number()).max(7).optional().nullable(),
  steps: z.array(z.string().trim().min(1).max(120)).max(30).optional().nullable(),
  active: z.boolean().optional().nullable(),
  page: text,
  /** For settings.update: setting name to its new value. */
  settings: z.record(z.string(), z.union([z.number(), z.boolean()])).optional().nullable(),
});
export type RawAction = z.infer<typeof rawActionSchema>;

export type ActionPerson = { id: string; name: string; businessId: string | null; designation: string; status: "active" | "disabled" };
export type ActionTask = { ref: string; id: string; title: string; kind: "daily" | "oneoff"; assigneeNames: string[]; date: string; dueTime: string; priority: Priority; status: string };
export type ActionRoutine = { ref: string; id: string; title: string; employeeName: string; dueTime: string; activeDays: number[]; active: boolean };
export type ActionLeave = { ref: string; id: string; employeeName: string; kind: "leave" | "excuse"; fromDate: string; toDate: string; reason: string };
export type ActionContext = {
  today: string;
  people: ActionPerson[];
  businesses: { id: string; name: string }[];
  tasks: ActionTask[];
  routines: ActionRoutine[];
  leaves: ActionLeave[];
};

export type ProposedAction = {
  key: string;
  kind: ActionKind;
  /** The card's title, for example "Change task “Count stock”". */
  heading: string;
  /** Plain lines saying exactly what will happen. */
  lines: string[];
  /** Things to fix first. The confirm button stays off while any remain. */
  issues: string[];
  payload: ActionPayload | null;
  needsPassword: boolean;
  /** Deleting, turning someone off, or anything that is hard to take back. */
  danger: boolean;
  /** For open.page: where to go. */
  href?: string;
};

const dayName = (n: number) => WEEKDAYS.find((d) => d.n === n)?.short ?? String(n);
const dayText = (d: string) => formatPkt(pktInstant(d, "12:00"), "EEE d MMM");
const daysText = (ds: number[]) => (ds.length === 7 ? "Every day" : ds.join(",") === "1,2,3,4,5" ? "Mon to Fri" : ds.join(",") === "1,2,3,4,5,6" ? "Mon to Sat" : ds.map(dayName).join(", "));
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

/** A person by name: the full name, or a first name only one of them has (never a surname alone). */
function findPerson(name: string | null | undefined, pool: ActionPerson[]): { person?: ActionPerson; problem?: string } {
  const n = norm(name ?? "");
  if (!n) return { problem: "Who is it for?" };
  const full = pool.filter((p) => norm(p.name) === n);
  if (full.length === 1) return { person: full[0] };
  const first = pool.filter((p) => norm(p.name).split(" ")[0] === n || norm(p.name).startsWith(`${n} `));
  if (first.length === 1) return { person: first[0] };
  if (first.length > 1) return { problem: `Which one: ${first.map((p) => p.name).join(" or ")}?` };
  return { problem: `No team member called “${name}”` };
}

function findBusiness(name: string | null | undefined, ctx: ActionContext): { id?: string; label?: string; problem?: string } {
  const n = norm(name ?? "");
  if (!n) return { problem: "Which business?" };
  const exact = ctx.businesses.filter((b) => norm(b.name) === n);
  const hits = exact.length ? exact : ctx.businesses.filter((b) => norm(b.name).includes(n) || n.includes(norm(b.name)));
  if (hits.length === 1) return { id: hits[0].id, label: hits[0].name };
  if (hits.length > 1) return { problem: `Which business: ${hits.map((b) => b.name).join(" or ")}?` };
  return { problem: `No business called “${name}”` };
}

/** The model sometimes puts the one person in "who" or "assignees" instead of "person": all three mean the same here. */
const personOf = (raw: RawAction) => raw.person ?? raw.who?.[0] ?? raw.assignees?.[0] ?? null;

const byRef = <T extends { ref: string }>(list: T[], ref: string | null | undefined) => (ref ? list.find((x) => x.ref.toLowerCase() === ref.trim().toLowerCase()) : undefined);
const cleanPriority = (p: string | null | undefined): Priority | undefined => ((PRIORITIES as readonly string[]).includes(p ?? "") ? (p as Priority) : undefined);

/** Turns one raw action into a card: what will happen in plain lines, what is still wrong, and the exact payload to run on confirm. */
export function resolveAction(raw: RawAction, ctx: ActionContext, index: number): ProposedAction {
  const key = `x${index}`;
  const base = { key, kind: raw.kind, lines: [] as string[], issues: [] as string[], payload: null as ActionPayload | null, needsPassword: needsPassword(raw.kind), danger: false };
  const bad = (heading: string, ...issues: string[]): ProposedAction => ({ ...base, heading, issues });
  const done = (heading: string, lines: string[], payload: ActionPayload, extra: Partial<ProposedAction> = {}): ProposedAction => {
    const parsed = actionPayloadSchema.safeParse(payload);
    return parsed.success ? { ...base, heading, lines, payload: parsed.data, ...extra } : { ...base, heading, lines, issues: parsed.error.issues.map((i) => i.message), ...extra };
  };
  const active = ctx.people.filter((p) => p.status === "active");

  switch (raw.kind) {
    case "task.update": {
      const t = byRef(ctx.tasks, raw.task);
      if (!t) return bad("Change a task", "I couldn't tell which task you mean. Say its title or who it is for.");
      if (t.kind === "daily") return bad(`Change “${t.title}”`, "This is a daily routine task. Change the routine itself instead.");
      const changes: Record<string, unknown> = {};
      const lines: string[] = [];
      const issues: string[] = [];
      if (raw.title) {
        changes.title = raw.title.trim();
        lines.push(`Title: ${raw.title.trim()}`);
      }
      if (raw.description !== undefined && raw.description !== null) {
        changes.description = raw.description;
        lines.push("Details updated");
      }
      if (raw.date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) issues.push("I couldn't read that day");
        else if (raw.date < ctx.today) issues.push("That day has already passed");
        else {
          changes.date = raw.date;
          lines.push(`Day: ${dayText(raw.date)}`);
        }
      }
      if (raw.time !== undefined && raw.time !== null) {
        changes.dueTime = raw.time;
        lines.push(raw.time ? `Due time: ${raw.time}` : "Due time removed");
      }
      const p = cleanPriority(raw.priority);
      if (p) {
        changes.priority = p;
        lines.push(`Priority: ${PRIORITY_LABEL[p]}`);
      }
      const written = raw.assignees?.length ? raw.assignees : (raw.who ?? []);
      if (written.length) {
        const ids: string[] = [];
        const names: string[] = [];
        for (const w of written) {
          const m = findPerson(w, active);
          if (m.person) {
            ids.push(m.person.id);
            names.push(m.person.name);
          }
          else issues.push(m.problem ?? "Unknown person");
        }
        if (ids.length) {
          changes.assigneeIds = [...new Set(ids)];
          lines.push(`Given to: ${[...new Set(names)].join(", ")}`);
        }
      }
      if (raw.client !== undefined && raw.client !== null) {
        changes.client = raw.client;
        lines.push(raw.client ? `Client: ${raw.client}` : "Client removed");
      }
      if (raw.estimateMin !== undefined && raw.estimateMin !== null) {
        changes.estimateMin = Math.round(raw.estimateMin);
        lines.push(`Estimate: ${Math.round(raw.estimateMin)} min`);
      }
      if (!lines.length && !issues.length) issues.push("Say what to change on it");
      return { ...done(`Change “${t.title}”`, lines, { kind: "task.update", taskId: t.id, changes } as ActionPayload), issues: [...issues] , ...(issues.length ? { payload: null } : {}) };
    }

    case "task.delete": {
      const t = byRef(ctx.tasks, raw.task);
      if (!t) return bad("Delete a task", "I couldn't tell which task you mean.");
      return done(`Delete “${t.title}”`, [`For ${t.assigneeNames.join(", ") || "nobody"}, ${dayText(t.date)}`, "This can't be undone."], { kind: "task.delete", taskId: t.id }, { danger: true });
    }

    case "task.status": {
      const t = byRef(ctx.tasks, raw.task);
      const status = ["completed", "todo", "in_progress"].includes(raw.status ?? "") ? (raw.status as "completed" | "todo" | "in_progress") : null;
      if (!t) return bad("Change a task's status", "I couldn't tell which task you mean.");
      if (!status) return bad(`“${t.title}”`, "Say whether it is done, started, or back to to-do.");
      const label = status === "completed" ? "Mark as done (for everyone on it)" : status === "in_progress" ? "Mark as in progress" : "Put back to to-do";
      return done(`“${t.title}”`, [label], { kind: "task.status", taskId: t.id, status });
    }

    case "reminder.send": {
      const message = (raw.message ?? "").trim();
      if (!message) return bad("Send a reminder", "What should the reminder say?");
      const names = raw.who ?? [];
      const toAll = names.some((n) => /^(everyone|everybody|all|sab|sabhi|sab log|poori team|team)$/i.test(n.trim()));
      const ids: string[] = [];
      const labels: string[] = [];
      const issues: string[] = [];
      if (!toAll) {
        if (!names.length) issues.push("Who should get it?");
        for (const w of names) {
          const m = findPerson(w, active);
          if (m.person) {
            ids.push(m.person.id);
            labels.push(m.person.name);
          }
          else issues.push(m.problem ?? "Unknown person");
        }
      }
      const out = done("Send a reminder", [`To: ${toAll ? "Everyone" : [...new Set(labels)].join(", ")}`, `“${message}”`], { kind: "reminder.send", message, toUids: [...new Set(ids)], toAll });
      return issues.length ? { ...out, issues, payload: null } : out;
    }

    case "leave.decide": {
      const l = byRef(ctx.leaves, raw.leave);
      const decision = raw.decision === "approve" || raw.decision === "reject" ? raw.decision : null;
      if (!l) return bad("Decide on leave", "I couldn't tell which request you mean.");
      if (!decision) return bad(`${l.employeeName}'s ${l.kind}`, "Approve or reject?");
      const when = l.fromDate === l.toDate ? dayText(l.fromDate) : `${dayText(l.fromDate)} to ${dayText(l.toDate)}`;
      return done(`${decision === "approve" ? "Approve" : "Reject"} ${l.employeeName}'s ${l.kind}`, [when, `“${l.reason}”`, ...(raw.note ? [`Your note: ${raw.note}`] : [])], { kind: "leave.decide", requestId: l.id, decision, note: raw.note ?? "" }, { danger: decision === "reject" });
    }

    case "routine.create": {
      const m = findPerson(personOf(raw), active);
      const title = (raw.title ?? "").trim();
      const issues: string[] = [];
      if (!m.person) issues.push(m.problem ?? "Who is it for?");
      if (title.length < 2) issues.push("What is the routine called?");
      const dayList = raw.days?.length ? raw.days : [1, 2, 3, 4, 5, 6];
      const p = cleanPriority(raw.priority) ?? "medium";
      const out = done(`New daily routine “${title}”`, [`For ${m.person?.name ?? "?"}`, `${daysText([...new Set(dayList)].sort())}${raw.time ? `, due ${raw.time}` : ""}`, `Priority: ${PRIORITY_LABEL[p]}`, ...(raw.steps?.length ? [`Steps: ${raw.steps.join(" · ")}`] : [])], {
        kind: "routine.create",
        employeeId: m.person?.id ?? "",
        title,
        description: raw.description ?? "",
        priority: p,
        dueTime: raw.time ?? "",
        steps: raw.steps ?? [],
        activeDays: dayList,
      });
      return issues.length ? { ...out, issues, payload: null } : out;
    }

    case "routine.update":
    case "routine.delete": {
      const r = byRef(ctx.routines, raw.routine);
      if (!r) return bad(raw.kind === "routine.delete" ? "Delete a routine" : "Change a routine", "I couldn't tell which routine you mean.");
      if (raw.kind === "routine.delete") return done(`Delete the routine “${r.title}”`, [`For ${r.employeeName}`, "Past days stay as they are; it stops from now on."], { kind: "routine.delete", templateId: r.id }, { danger: true });
      const changes: Record<string, unknown> = {};
      const lines: string[] = [];
      if (raw.title) {
        changes.title = raw.title.trim();
        lines.push(`Title: ${raw.title.trim()}`);
      }
      if (raw.description !== undefined && raw.description !== null) {
        changes.description = raw.description;
        lines.push("Instructions updated");
      }
      const p = cleanPriority(raw.priority);
      if (p) {
        changes.priority = p;
        lines.push(`Priority: ${PRIORITY_LABEL[p]}`);
      }
      if (raw.time !== undefined && raw.time !== null) {
        changes.dueTime = raw.time;
        lines.push(raw.time ? `Due time: ${raw.time}` : "Due time removed");
      }
      if (raw.steps) {
        changes.steps = raw.steps;
        lines.push(`Steps: ${raw.steps.join(" · ") || "none"}`);
      }
      if (raw.days?.length) {
        changes.activeDays = raw.days;
        lines.push(`Days: ${daysText([...new Set(raw.days)].sort())}`);
      }
      if (typeof raw.active === "boolean") {
        changes.active = raw.active;
        lines.push(raw.active ? "Resume it" : "Pause it");
      }
      if (!lines.length) return bad(`Change “${r.title}”`, "Say what to change on it");
      return done(`${raw.active === false && lines.length === 1 ? "Pause" : raw.active === true && lines.length === 1 ? "Resume" : "Change"} the routine “${r.title}”`, [`For ${r.employeeName}`, ...lines], { kind: "routine.update", templateId: r.id, changes } as ActionPayload);
    }

    case "employee.create": {
      const biz = findBusiness(raw.business, ctx);
      const issues: string[] = [];
      const name = (raw.name ?? "").trim();
      if (name.length < 2) issues.push("What is their full name?");
      if (!biz.id) issues.push(biz.problem ?? "Which business?");
      const username = (raw.username ?? name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")).toLowerCase();
      const out = done(`Add team member ${name}`, [`Business: ${biz.label ?? "?"}`, `Username: ${username}`, ...(raw.designation ? [`Job: ${raw.designation}`] : []), ...(raw.phone ? [`Phone: ${raw.phone}`] : []), "You choose their password below."], {
        kind: "employee.create",
        name,
        username,
        businessId: biz.id ?? "",
        designation: raw.designation ?? "",
        phone: raw.phone ?? "",
      });
      return issues.length ? { ...out, issues, payload: null } : out;
    }

    case "employee.update":
    case "employee.status":
    case "employee.password": {
      const pool = raw.kind === "employee.status" && raw.status === "active" ? ctx.people.filter((p) => p.status === "disabled") : raw.kind === "employee.status" ? active : ctx.people;
      const m = findPerson(personOf(raw), pool.length ? pool : ctx.people);
      if (!m.person) return bad(raw.kind === "employee.status" ? "Turn a team member on or off" : raw.kind === "employee.password" ? "Reset a password" : "Change a team member", m.problem ?? "Who do you mean?");
      const p = m.person;
      if (raw.kind === "employee.password") return done(`Reset ${p.name}'s password`, ["You choose the new password below.", "They are signed out everywhere."], { kind: "employee.password", employeeId: p.id });
      if (raw.kind === "employee.status") {
        const status = raw.status === "active" ? "active" : raw.status === "disabled" ? "disabled" : null;
        if (!status) return bad(p.name, "Turn them on or off?");
        return done(status === "disabled" ? `Turn off ${p.name}` : `Turn ${p.name} back on`, status === "disabled" ? ["They can't sign in and are signed out now.", "Their history stays."] : ["They can sign in again."], { kind: "employee.status", employeeId: p.id, status }, { danger: status === "disabled" });
      }
      const changes: Record<string, unknown> = {};
      const lines: string[] = [];
      const issues: string[] = [];
      if (raw.name) {
        changes.name = raw.name.trim();
        lines.push(`Name: ${raw.name.trim()}`);
      }
      if (raw.designation !== undefined && raw.designation !== null) {
        changes.designation = raw.designation;
        lines.push(`Job: ${raw.designation || "none"}`);
      }
      if (raw.phone !== undefined && raw.phone !== null) {
        changes.phone = raw.phone;
        lines.push(`Phone: ${raw.phone || "none"}`);
      }
      if (raw.business) {
        const b = findBusiness(raw.business, ctx);
        if (b.id) {
          changes.businessId = b.id;
          lines.push(`Business: ${b.label}`);
        }
        else issues.push(b.problem ?? "Which business?");
      }
      if (raw.workStart !== undefined && raw.workStart !== null) {
        changes.workStart = raw.workStart;
        lines.push(`Starts at: ${raw.workStart || "the business's time"}`);
      }
      if (raw.workEnd !== undefined && raw.workEnd !== null) {
        changes.workEnd = raw.workEnd;
        lines.push(`Finishes at: ${raw.workEnd || "the business's time"}`);
      }
      if (!lines.length && !issues.length) issues.push("Say what to change");
      const out = done(`Change ${p.name}`, lines, { kind: "employee.update", employeeId: p.id, changes } as ActionPayload);
      return issues.length ? { ...out, issues, payload: null } : out;
    }

    case "holiday.add":
    case "holiday.remove": {
      const date = raw.date ?? "";
      const issues: string[] = [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) issues.push("Which day?");
      let businessId: string | null = null;
      let scope = "everyone";
      if (raw.business && !/^(all|everyone|sab|sabhi|every business)$/i.test(raw.business.trim())) {
        const b = findBusiness(raw.business, ctx);
        if (b.id) {
          businessId = b.id;
          scope = b.label ?? "";
        }
        else issues.push(b.problem ?? "Which business?");
      }
      if (raw.kind === "holiday.add") {
        const name = (raw.name ?? raw.title ?? "").trim();
        if (name.length < 2) issues.push("What is it called?");
        const out = done(`${businessId ? "Close" : "Holiday"}: ${name}`, [`${date ? dayText(date) : "?"} for ${scope}`, "No routines are created and no alerts are sent that day."], { kind: "holiday.add", date, name, businessId });
        return issues.length ? { ...out, issues, payload: null } : out;
      }
      const out = done("Remove a holiday or closure", [`${date ? dayText(date) : "?"} for ${scope}`], { kind: "holiday.remove", date, businessId }, { danger: true });
      return issues.length ? { ...out, issues, payload: null } : out;
    }

    case "business.create": {
      const issues: string[] = [];
      const name = (raw.name ?? "").trim();
      if (name.length < 2) issues.push("What is the business called?");
      const color = (BUSINESS_COLOR_IDS as readonly string[]).includes(raw.color ?? "") ? raw.color! : BUSINESS_COLOR_IDS[ctx.businesses.length % BUSINESS_COLOR_IDS.length];
      const workStart = raw.workStart || "09:00";
      const workEnd = raw.workEnd || "18:00";
      const dayList = raw.days?.length ? raw.days : [1, 2, 3, 4, 5, 6];
      const out = done(`New business ${name}`, [`Open ${workStart} to ${workEnd}`, daysText([...new Set(dayList)].sort()), `Colour: ${color}`], { kind: "business.create", name, color: color as never, workStart, workEnd, workDays: dayList });
      return issues.length ? { ...out, issues, payload: null } : out;
    }

    case "business.update": {
      const b = findBusiness(raw.business, ctx);
      if (!b.id) return bad("Change a business", b.problem ?? "Which business?");
      const changes: Record<string, unknown> = {};
      const lines: string[] = [];
      if (raw.name) {
        changes.name = raw.name.trim();
        lines.push(`Name: ${raw.name.trim()}`);
      }
      if ((BUSINESS_COLOR_IDS as readonly string[]).includes(raw.color ?? "")) {
        changes.color = raw.color;
        lines.push(`Colour: ${raw.color}`);
      }
      if (raw.workStart) {
        changes.workStart = raw.workStart;
        lines.push(`Opens: ${raw.workStart}`);
      }
      if (raw.workEnd) {
        changes.workEnd = raw.workEnd;
        lines.push(`Closes: ${raw.workEnd}`);
      }
      if (raw.days?.length) {
        changes.workDays = raw.days;
        lines.push(`Working days: ${daysText([...new Set(raw.days)].sort())}`);
      }
      if (typeof raw.active === "boolean") {
        changes.active = raw.active;
        lines.push(raw.active ? "Switch it on" : "Switch it off");
      }
      if (!lines.length) return bad(`Change ${b.label}`, "Say what to change");
      return done(`Change ${b.label}`, lines, { kind: "business.update", businessId: b.id, changes } as ActionPayload, { danger: raw.active === false });
    }

    case "settings.update": {
      const changes: Record<string, number | boolean> = {};
      const labels: Record<string, string> = {
        escalationL1Min: "First late alert (people)",
        escalationL2Min: "Second late alert (you)",
        escalationHighL1Min: "First late alert, High priority",
        escalationHighL2Min: "Second late alert, High priority",
        notifyOnBlocked: "Tell me when someone is blocked",
        briefingEnabled: "Morning briefing",
        promptMinute: "Journal prompt minute",
        idleMin: "Idle after (minutes)",
      };
      const lines: string[] = [];
      for (const [k, v] of Object.entries(raw.settings ?? {})) {
        if (!(k in labels)) continue;
        changes[k] = v;
        lines.push(`${labels[k]}: ${typeof v === "boolean" ? (v ? "on" : "off") : v}`);
      }
      if (!lines.length) return bad("Change a setting", "Which setting, and to what?");
      return done("Change automation settings", lines, { kind: "settings.update", changes } as ActionPayload);
    }

    case "open.page": {
      const page = (raw.page ?? "") as PageKey;
      if (!(page in PAGES)) return bad("Open a page", "I don't know that page.");
      return done(`Open ${PAGES[page].label}`, [], { kind: "open.page", page }, { href: PAGES[page].href });
    }
  }
}

export function resolveActions(raws: RawAction[], ctx: ActionContext): ProposedAction[] {
  return raws.slice(0, MAX_ACTIONS).map((r, i) => resolveAction(r, ctx, i));
}

/** Settings the assistant changed, merged over what is saved and checked the same way the Settings form checks them. */
export function mergeSettings(current: AutomationSettings, changes: Partial<AutomationSettings>): { ok: true; settings: AutomationSettings } | { ok: false; message: string } {
  const merged = { ...DEFAULT_SETTINGS, ...current, ...changes };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? { ok: true, settings: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? "Those values aren't allowed" };
}
