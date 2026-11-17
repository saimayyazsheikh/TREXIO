import { z } from "zod";
import { PRIORITIES, type Priority } from "@/lib/domain/constants";
import { MAX_ADMIN_ALERT_MIN, MIN_ADMIN_ALERT_MIN } from "@/lib/domain/automation";
import { MAX_ACTIONS, rawActionSchema, type ActionLeave, type ActionPerson, type ActionRoutine, type ActionTask, type ProposedAction } from "@/lib/domain/assistant-actions";
import { dateStringFromDayIndex, dayIndexFromDateString, formatPkt, pktInstant } from "@/lib/time";

export const MAX_ASSISTANT_MESSAGE = 600;
export const MAX_PROPOSED_TASKS = 10;
export const MAX_PROPOSED_ALERTS = 10;
/** How many tasks, routines and leave requests are shown to the assistant so it can tell which one the admin means. */
export const MAX_OPEN_TASKS_IN_PROMPT = 60;
export const MAX_ROUTINES_IN_PROMPT = 40;
export const MAX_LEAVES_IN_PROMPT = 20;

export type AssistantPerson = { id: string; name: string; businessId: string | null; designation: string };
export type AssistantBusiness = { id: string; name: string };
/** A short line of figures per person, so the assistant can suggest who has room and answer "how busy is X". */
export type AssistantLoad = { personId: string; open: number; overdue: number; today: number; away: boolean };
/** An open task that has a due time, so the admin can ask to be told when it is late. `ref` is the short label the assistant uses. */
export type AssistantOpenTask = { ref: string; id: string; title: string; assigneeNames: string[]; date: string; dueTime: string };

const rawTask = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  priority: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  time: z.string().optional().nullable(),
  who: z.array(z.string().trim().min(1).max(80)).max(25).optional().nullable(),
  steps: z.array(z.string().trim().min(1).max(120)).max(30).optional().nullable(),
  dump: z.boolean().optional().nullable(),
});
const rawAlert = z.object({ task: z.string().trim().min(1).max(20), minutes: z.number().optional().nullable() });
const rawReply = z.object({
  reply: z.string().trim().max(800).default(""),
  tasks: z.array(rawTask).max(MAX_PROPOSED_TASKS).default([]),
  alerts: z.array(rawAlert).max(MAX_PROPOSED_ALERTS).default([]),
  actions: z.array(rawActionSchema).max(MAX_ACTIONS).default([]),
});
export type RawReply = z.infer<typeof rawReply>;

/** What the assistant is allowed to do is fixed here: it only ever proposes, and the admin confirms. */
export const ASSISTANT_SYSTEM = `You are the assistant inside Traxio, a task and team manager for a business owner (the admin) in Pakistan. The admin runs several businesses, each with its own employees.
The admin writes in English, Urdu or Roman Urdu (Urdu in English letters), often with spelling mistakes and mixed languages. Understand all of it. Write your "reply" in the same language and script the admin used, in one or two short, plain sentences.

You NEVER change anything yourself. You turn the admin's words into proposals; the admin sees each one as a card and presses a button to confirm. So never say you did, created, added, sent, deleted or changed anything: say what you understood and ask the admin to check and confirm.

Answer with ONE JSON object and nothing else (no markdown, no code fences):
{
  "reply": "one or two short sentences",
  "tasks":   [ ...new tasks to give to a team member, or notes for the Dump list... ],
  "alerts":  [ ...late alerts on existing tasks... ],
  "actions": [ ...everything else, listed below... ]
}
Each of the three lists may be empty. Put an item in the right list.

1) "tasks": { "title", "description", "priority": "high"|"medium"|"low", "date": "YYYY-MM-DD"|null, "time": "HH:MM"|null, "who": ["names exactly as written"], "steps": ["checklist"], "dump": true|false }
   - "who" is ONLY the person who must do the work. A name that is only someone to ask, call or meet is NOT the assignee: leave "who" empty and keep that name in the title.
   - A task with a person and no day means today. Words like kal (tomorrow), parson (day after tomorrow), aaj (today), agle hafte (next week), and weekday names become real dates using the calendar below.
   - With no person to do the work (something for the admin to remember or do), set "dump": true; a "date" then means "remind me that day".
2) "alerts": { "task": "T3", "minutes": 10 } to be told when an EXISTING open task is that many minutes past its due time (5 to 1440; use 10 if no number is given). Use it for "remind me / tell me / alert me if X's task is late or delayed". It never creates a task.
3) "actions": each is { "kind": ..., plus only the fields that kind needs }:
   - "task.update": change an existing task. "task":"T3" plus any of: "title", "description", "date" (YYYY-MM-DD), "time" (HH:MM, or "" to remove), "priority", "assignees": [names] (replaces who it is for), "client", "estimateMin".
   - "task.delete": "task":"T3".   - "task.status": "task":"T3", "status": "completed" | "in_progress" | "todo" (completed means done for everyone on it).
   - "reminder.send": "who": [names] or ["everyone"], "message": "the words to send to them". Use it for "tell Sara to…", "sab ko bata do…", "remind the team…". (To remind the ADMIN about something, use a Dump note or a late alert instead.)
   - "leave.decide": "leave":"L1", "decision": "approve" | "reject", optional "note".
   - "routine.create": a repeating daily routine. "person", "title", optional "description", "time" (HH:MM), "days" (numbers 1=Mon to 7=Sun; default Mon to Sat), "steps", "priority".
   - "routine.update": "routine":"R2" plus any of "title","description","time","days","steps","priority","active" (false pauses, true resumes).   - "routine.delete": "routine":"R2".
   - "employee.create": "name", "business" (name), optional "username","designation","phone" (+923001234567). NEVER ask for or write a password: the admin types it on the confirmation card.
   - "employee.update": "person" plus any of "name","designation","phone","business","workStart","workEnd".   - "employee.status": "person", "status": "active" | "disabled".   - "employee.password": "person" (resets their password; the admin types the new one on the card).
   - "holiday.add": "date", "name", optional "business" (omit for everyone).   - "holiday.remove": "date", optional "business".
   - "business.create": "name", optional "workStart","workEnd","days","color".   - "business.update": "business" plus any of "name","color","workStart","workEnd","days","active".
   - "settings.update": "settings": { name: value } using only these names: escalationL1Min, escalationL2Min (minutes late for the first alert to the person and the second to the admin), escalationHighL1Min, escalationHighL2Min (the same for High priority tasks), notifyOnBlocked (true/false), briefingEnabled (true/false), promptMinute (0 to 59), idleMin (1 to 60).
   - "open.page": "page": one of dashboard, kanban, workload, calendar, dump, reminders, presence, journals, leave, daily-report, analytics, ai-summaries, audit, inbox, chat, team, businesses, holidays, automation. Use it for "show me / open / kholo".
   Labels T1, T2… (tasks), R1… (routines) and L1… (pending leave) come ONLY from the lists you are given below. Pick by the person and subject the admin mentioned. Never invent a label. If nothing clearly matches, return nothing for that item and ask in "reply" which one they mean.

Other rules:
- Questions (who is free, how busy someone is, what is open, who is on leave, how many…): answer from the figures and lists given, in "reply", with all three lists empty. If the figures don't contain the answer, say so and offer the page where they can see it (use open.page).
- Passwords: never repeat, store or ask for one. If the admin writes a password in chat, tell them to type it only in the card.
- Things Traxio cannot do (change salaries, message people outside the app, edit the admin's own account, anything not listed above): say so plainly in "reply" and leave all lists empty. Never turn them into a task.
- Priority is "medium" unless the admin says urgent/important (high) or not urgent (low). Never invent people, days, times, businesses or tasks the admin did not mention.
- If the admin's words could match more than one task, routine, leave request or person, do NOT guess: leave all lists empty and ask which one, naming the options. Daily routine tasks cannot be changed one day at a time (use the routine instead).
- Never delete or change many things at once on a vague request such as "delete all tasks" or "sab ko off kar do": leave all lists empty and say that for many tasks they should use "Select tasks" on the Kanban board, and for people the Team page.
- Never mention internal names (task.update, kind, labels like T3) in "reply": speak plainly. If asked how to do something in Traxio, answer briefly using the page names (tasks: Kanban board; people: Team; routines: a person's page; holidays: Settings > Holidays; leave: Leave page), or offer to open the page.
- Several jobs in one message become several items. If you cannot tell what is wanted, ask one short question in "reply" and leave all lists empty.

Examples (the admin's words, then your JSON):
"kal subah 10 baje Ali ko stock count karwana hai" -> {"reply":"Ali ke liye kal subah 10 baje ka task tayyar hai. Check kar ke confirm karein.","tasks":[{"title":"Stock count","priority":"medium","date":"<tomorrow>","time":"10:00","who":["Ali"],"steps":[],"dump":false}],"alerts":[],"actions":[]}
"mujhe remind karna agar Sara ka invoices wala task 15 minute late ho" -> {"reply":"Sara ke invoices wale task par 15 minute ka alert tayyar hai.","tasks":[],"alerts":[{"task":"<label of Sara's invoices task>","minutes":15}],"actions":[]}
"Ali ka stock wala task Sara ko de do aur parson tak kar do" -> {"reply":"Task Sara ko aur parson ke din par le jane ka card tayyar hai.","tasks":[],"alerts":[],"actions":[{"kind":"task.update","task":"<label>","assignees":["Sara"],"date":"<day after tomorrow>"}]}
"sab ko bata do kal dukan band hai" -> {"reply":"Sab ke liye reminder tayyar hai.","tasks":[],"alerts":[],"actions":[{"kind":"reminder.send","who":["everyone"],"message":"Kal dukan band hai."}]}
"Sara ki leave approve kar do" -> {"reply":"Sara ki leave approve karne ka card tayyar hai.","tasks":[],"alerts":[],"actions":[{"kind":"leave.decide","leave":"<label>","decision":"approve"}]}
"aik naya employee add karo Zoya Khan Alpha mein cashier" -> {"reply":"Zoya Khan ka card tayyar hai. Password aap card mein khud likhein.","tasks":[],"alerts":[],"actions":[{"kind":"employee.create","name":"Zoya Khan","business":"Alpha","designation":"Cashier"}]}
"daily report kholo" -> {"reply":"Daily report khol deta hoon.","tasks":[],"alerts":[],"actions":[{"kind":"open.page","page":"daily-report"}]}
"Ali ki salary badha do" -> {"reply":"Yeh Traxio mein nahi ho sakta.","tasks":[],"alerts":[],"actions":[]}`;

const weekday = (date: string) => formatPkt(pktInstant(date, "12:00"), "EEE");

/** The calendar the assistant counts days from: it never has to do date arithmetic itself. */
export function upcomingDays(today: string, count = 21): string[] {
  const start = dayIndexFromDateString(today);
  return Array.from({ length: count }, (_, i) => {
    const d = dateStringFromDayIndex(start + i);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    return `${weekday(d)} ${d}${label}`;
  });
}

export type PromptLists = {
  /** Every open task the admin could mean, each with a label T1, T2… (the label is added by the caller). */
  tasks?: ActionTask[];
  routines?: ActionRoutine[];
  leaves?: ActionLeave[];
};

export function buildAssistantPrompt(i: { message: string; today: string; people: (AssistantPerson | ActionPerson)[]; businesses: AssistantBusiness[]; loads: AssistantLoad[] } & PromptLists): string {
  const biz = new Map(i.businesses.map((b) => [b.id, b.name]));
  const load = new Map(i.loads.map((l) => [l.personId, l]));
  const team = i.people.map((p) => {
    const l = load.get(p.id);
    const off = "status" in p && p.status === "disabled" ? "TURNED OFF; " : "";
    const figures = l ? `${l.away ? "on leave today; " : ""}${l.open} open, ${l.overdue} overdue, ${l.today} due today` : "no figures";
    return `- ${p.name} (${biz.get(p.businessId ?? "") ?? "no business"}${p.designation ? `, ${p.designation}` : ""}): ${off}${figures}`;
  });
  const tasks = (i.tasks ?? []).slice(0, MAX_OPEN_TASKS_IN_PROMPT).map((t) => `- ${t.ref}: “${t.title}” (${t.kind === "daily" ? "daily routine task" : "one-off"}, ${t.status}) for ${t.assigneeNames.join(", ") || "nobody"}, ${t.priority} priority, ${weekday(t.date)} ${t.date}${t.dueTime ? ` due ${t.dueTime}` : ", no due time"}`);
  const routines = (i.routines ?? []).slice(0, MAX_ROUTINES_IN_PROMPT).map((r) => `- ${r.ref}: “${r.title}” for ${r.employeeName}, days ${r.activeDays.join("")}${r.dueTime ? `, due ${r.dueTime}` : ""}, ${r.active ? "running" : "paused"}`);
  const leaves = (i.leaves ?? []).slice(0, MAX_LEAVES_IN_PROMPT).map((l) => `- ${l.ref}: ${l.employeeName}, ${l.kind}, ${l.fromDate}${l.toDate !== l.fromDate ? ` to ${l.toDate}` : ""}, “${l.reason}”`);
  return [
    `Today is ${weekday(i.today)} ${i.today}. Calendar:`,
    upcomingDays(i.today).join("\n"),
    "",
    "Businesses: " + (i.businesses.map((b) => b.name).join(", ") || "(none)"),
    "",
    "Team:",
    team.join("\n") || "(no team members yet)",
    "",
    "Tasks you can point at (labels T…):",
    tasks.join("\n") || "(none)",
    "",
    "Daily routines (labels R…):",
    routines.join("\n") || "(none)",
    "",
    "Leave requests waiting for a decision (labels L…):",
    leaves.join("\n") || "(none)",
    "",
    `The admin wrote: """${i.message.replace(/"""/g, '"')}"""`,
  ].join("\n");
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/**
 * The model now and then misspells a field name ("assigness" for "assignees"), which would silently drop what it said. A key that is not
 * known but is within two letters of exactly one known key is read as that key.
 */
export function fixKeys(value: unknown, known: readonly string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    let name = key;
    if (!known.includes(key) && key.length >= 4) {
      const near = known.filter((k) => k.length >= 4 && distance(key.toLowerCase(), k.toLowerCase()) <= 2);
      if (near.length === 1 && !(near[0] in (value as object))) name = near[0];
    }
    out[name] = v;
  }
  return out;
}

const TASK_KEYS = Object.keys(rawTask.shape);
const ALERT_KEYS = Object.keys(rawAlert.shape);
const ACTION_KEYS = Object.keys(rawActionSchema.shape);

function repair(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const top = fixKeys(json, ["reply", "tasks", "alerts", "actions"]) as Record<string, unknown>;
  const list = (v: unknown, keys: string[]) => (Array.isArray(v) ? v.map((x) => fixKeys(x, keys)) : v);
  return { ...top, tasks: list(top.tasks, TASK_KEYS), alerts: list(top.alerts, ALERT_KEYS), actions: list(top.actions, ACTION_KEYS) };
}

/** Takes whatever the model sent back (maybe wrapped in code fences or chatter) and returns the validated reply, or null. */
export function parseAssistantReply(text: string): RawReply | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = rawReply.safeParse(repair(JSON.parse(text.slice(start, end + 1))));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ProposedTask = {
  key: string;
  title: string;
  description: string;
  priority: Priority;
  /** Null for a dump entry. */
  date: string | null;
  /** For a dump entry: the day the admin wants to be reminded, if they said one. */
  remindOn: string | null;
  /** "HH:MM", or "" for no time. */
  dueTime: string;
  assigneeIds: string[];
  assigneeNames: string[];
  steps: string[];
  dump: boolean;
  /** Things the admin must fix before this can be created (an unknown name, a day that has passed). */
  issues: string[];
};

export type ProposedAlert = {
  key: string;
  taskId: string;
  taskTitle: string;
  assigneeNames: string[];
  dueLabel: string;
  minutes: number;
  issues: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

/**
 * Finds who a written name means: the full name, or a first name that only one person has. A surname alone is not enough: people
 * are called by their first name, and a surname can easily be a different person (someone to ask, a customer) rather than a colleague.
 */
export function matchPerson(name: string, people: AssistantPerson[]): { person?: AssistantPerson; problem?: string } {
  const n = norm(name);
  if (!n) return { problem: "Empty name" };
  const full = people.filter((p) => norm(p.name) === n);
  if (full.length === 1) return { person: full[0] };
  const part = people.filter((p) => norm(p.name).split(" ")[0] === n || norm(p.name).startsWith(`${n} `));
  if (part.length === 1) return { person: part[0] };
  if (part.length > 1) return { problem: `Which one: ${part.map((p) => p.name).join(" or ")}?` };
  return { problem: `No team member called “${name}”` };
}

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const isDate = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Turns the model's raw tasks into proposals with real people and dates, listing what is still wrong with each. */
export function resolveProposals(raw: RawReply, ctx: { people: AssistantPerson[]; today: string }): ProposedTask[] {
  return raw.tasks.map((t, index) => {
    const issues: string[] = [];
    const assigneeIds: string[] = [];
    const assigneeNames: string[] = [];
    for (const written of t.who ?? []) {
      const m = matchPerson(written, ctx.people);
      if (m.person) {
        if (!assigneeIds.includes(m.person.id)) {
          assigneeIds.push(m.person.id);
          assigneeNames.push(m.person.name);
        }
      } else issues.push(m.problem ?? "Unknown person");
    }

    const hasPerson = (t.who?.length ?? 0) > 0;
    // Work nobody is named for can't be given to anyone, so it is a note for the admin (the Dump list), with the day kept as a reminder.
    const wantsDump = !!t.dump || !hasPerson;
    const priority = (PRIORITIES as readonly string[]).includes(t.priority ?? "") ? (t.priority as Priority) : "medium";
    let date: string | null = null;
    let remindOn: string | null = null;
    if (wantsDump) {
      remindOn = isDate(t.date) && t.date >= ctx.today ? t.date : null;
    } else {
      date = isDate(t.date) ? t.date : ctx.today;
      if (date < ctx.today) issues.push("That day has already passed");
    }
    const dueTime = t.time && clock.test(t.time) && !wantsDump ? t.time : "";

    return {
      key: `p${index}`,
      title: t.title,
      description: t.description ?? "",
      priority,
      date,
      remindOn,
      dueTime,
      assigneeIds,
      assigneeNames,
      steps: t.steps ?? [],
      dump: wantsDump,
      issues,
    };
  });
}

/** Matches each requested late alert to one of the tasks the assistant was shown, and checks the minutes. */
export function resolveAlerts(raw: RawReply, openTasks: AssistantOpenTask[]): ProposedAlert[] {
  const byRef = new Map(openTasks.map((t) => [t.ref.toLowerCase(), t]));
  return raw.alerts.map((a, index) => {
    const found = byRef.get(a.task.trim().toLowerCase());
    const minutes = Math.round(a.minutes ?? 10);
    const issues: string[] = [];
    if (!found) issues.push("I couldn't tell which task you mean. Open the task and set it there, or ask again with its name.");
    else if (!found.dueTime) issues.push("This task has no due time, so there is nothing to be late for.");
    if (!(minutes >= MIN_ADMIN_ALERT_MIN && minutes <= MAX_ADMIN_ALERT_MIN)) issues.push(`Pick between ${MIN_ADMIN_ALERT_MIN} minutes and 24 hours`);
    return {
      key: `a${index}`,
      taskId: found?.id ?? "",
      taskTitle: found?.title ?? "Unknown task",
      assigneeNames: found?.assigneeNames ?? [],
      dueLabel: found ? `${weekday(found.date)} ${found.date.slice(5)} ${found.dueTime}` : "",
      minutes: Number.isFinite(minutes) ? minutes : 10,
      issues,
    };
  });
}

export type AssistantAnswer = { reply: string; proposals: ProposedTask[]; alerts: ProposedAlert[]; actions: ProposedAction[] };

/**
 * Whether the admin typed an actual password into the chat ("password: abc12345", "password hai Pak2026!"). Such a message is never
 * sent to the AI service. Just saying "reset Sara's password" is fine: it has no password in it.
 */
export function mentionsPassword(message: string): boolean {
  // "password: abc12345" or "pwd = abc12345": whatever follows the sign is taken to be the password.
  if (/(?:password|passwd|pwd|pass)\s*[:=]\s*\S{6,}/i.test(message)) return true;
  // "password hai Pak2026!": a spoken one counts when the word after it has a digit, as real passwords do.
  const spoken = /(?:password|passwd|pwd|pass)\s+(?:is|hai|ye|rakh\w*|set\s+kar\w*)?\s*(\S{6,})/i.exec(message);
  return !!spoken && /\d/.test(spoken[1]);
}
