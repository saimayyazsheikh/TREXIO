import { z } from "zod";
import { PRIORITIES, type Priority } from "@/lib/domain/constants";
import { MAX_ADMIN_ALERT_MIN, MIN_ADMIN_ALERT_MIN } from "@/lib/domain/automation";
import { dateStringFromDayIndex, dayIndexFromDateString, formatPkt, pktInstant } from "@/lib/time";

export const MAX_ASSISTANT_MESSAGE = 600;
export const MAX_PROPOSED_TASKS = 10;
export const MAX_PROPOSED_ALERTS = 10;
/** How many open tasks are shown to the assistant so it can tell which one the admin means. */
export const MAX_OPEN_TASKS_IN_PROMPT = 40;

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
});
export type RawReply = z.infer<typeof rawReply>;

/** What the assistant is allowed to do is fixed here: it only ever proposes, and the admin confirms. */
export const ASSISTANT_SYSTEM = `You are the planning assistant inside Traxio, a task manager for a business owner (the admin) and their team in Pakistan.
The admin writes in English, Urdu or Roman Urdu (Urdu in English letters), often with spelling mistakes and mixed languages. Understand all of it. Write your "reply" in the same language and script the admin used, in one or two short, plain sentences.

You never change anything yourself. You can do exactly FOUR things, and the admin reviews and confirms every one:
1. TASKS: turn the admin's words into proposed tasks for a team member to do.
2. DUMP NOTES: keep a reminder-to-self (something the admin must remember or do later) on the Dump list.
3. LATE ALERTS: ask Traxio to tell the admin when an EXISTING task is late by some minutes ("alerts"). Use it when the admin says things like "remind me / tell me / alert me if X's task is late / delayed by N minutes".
4. ANSWERS: answer a question about the team's workload or open tasks using ONLY the figures you are given.

You can NOT add, remove or change employees or businesses, approve leave, change settings, send messages to people, or anything else. If the admin asks for something like that (for example "add an employee called Ali", "approve Sara's leave", "delete the Alpha business"), return "tasks": [] and "alerts": [] and in "reply" say plainly that you can't do that, and where it is done: employees on the Team page, businesses under Settings > Businesses, leave on the Leave page, reminders to the team on the Reminders page. Never turn such a request into a task.

Answer with ONE JSON object and nothing else (no markdown, no code fences):
{
  "reply": "one or two short sentences for the admin",
  "tasks": [
    { "title": "short title, under 80 characters", "description": "optional detail or null", "priority": "high" | "medium" | "low", "date": "YYYY-MM-DD or null", "time": "HH:MM 24-hour or null", "who": ["names exactly as written, or []"], "steps": ["optional checklist steps"], "dump": true | false }
  ],
  "alerts": [
    { "task": "the label of an open task from the list you are given, for example T3", "minutes": 10 }
  ]
}

Rules:
- "who" is ONLY the person who must do the task. A name that appears only as someone to ask, call or meet (for example "ask Ahmed about the paint") is NOT the assignee: leave "who" empty and keep that name in the title.
- Never say you created, added, assigned or set anything. You only propose; say what you understood and ask the admin to check and press the button.
- A task with a person and no day means today. A task with a day goes on that day. Words like kal (tomorrow), parson (day after tomorrow), aaj (today), agle hafte (next week) and weekday names must be turned into real dates using the calendar you are given.
- If there is no person to do the work (it is something for the admin to remember or do), set "dump": true. You may still give a "date" if the admin wants to be reminded on a certain day.
- For a late alert, the "task" must be one of the labels in the list of open tasks, chosen by the person and subject the admin mentioned. "minutes" is how long after the task's due time the admin wants to be told (between 5 and 1440). If the admin gives no number, use 10. If no task in the list clearly matches, return "alerts": [] and in "reply" ask which task they mean, or say you could not find it. A late alert never creates a task.
- Priority is "medium" unless the admin says it is urgent, important, or asks for it first (high), or says it is not urgent (low).
- Split one message into several items when it clearly lists several jobs. Never invent people, days, times or tasks the admin did not mention.
- If the admin asks a question (who is free, how busy someone is, what is open), answer it in "reply" from the figures given and return empty "tasks" and "alerts".
- If you cannot tell what is wanted, put one short question in "reply" and return empty "tasks" and "alerts".

Examples (the admin's words, then your JSON):
"kal subah 10 baje Ali ko stock count karwana hai" -> {"reply":"Ali ke liye kal subah 10 baje ka stock count ka task tayyar hai. Check kar ke Create dabayen.","tasks":[{"title":"Stock count","description":null,"priority":"medium","date":"<tomorrow>","time":"10:00","who":["Ali"],"steps":[],"dump":false}],"alerts":[]}
"yaad rakhna paint wale se rate poochna hai" -> {"reply":"Yeh Dump list ke liye note hai. Check kar ke add karein.","tasks":[{"title":"Paint wale se rate poochna","description":null,"priority":"medium","date":null,"time":null,"who":[],"steps":[],"dump":true}],"alerts":[]}
"mujhe remind karna agar Sara ka invoices wala task 15 minute late ho" -> {"reply":"Sara ke invoices wale task par 15 minute late hone ka alert tayyar hai. Check kar ke Set karein.","tasks":[],"alerts":[{"task":"<the label of Sara's invoices task>","minutes":15}]}
"kaun sab se zyada free hai?" -> {"reply":"<answer from the figures>","tasks":[],"alerts":[]}
"Ali ki salary badha do" -> {"reply":"Main yeh nahi kar sakta. Traxio mein salary ka koi option nahi hai.","tasks":[],"alerts":[]}`;

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

export function buildAssistantPrompt(i: { message: string; today: string; people: AssistantPerson[]; businesses: AssistantBusiness[]; loads: AssistantLoad[]; openTasks?: AssistantOpenTask[] }): string {
  const biz = new Map(i.businesses.map((b) => [b.id, b.name]));
  const load = new Map(i.loads.map((l) => [l.personId, l]));
  const team = i.people.map((p) => {
    const l = load.get(p.id);
    const figures = l ? `${l.away ? "on leave today; " : ""}${l.open} open, ${l.overdue} overdue, ${l.today} due today` : "no figures";
    return `- ${p.name} (${biz.get(p.businessId ?? "") ?? "no business"}${p.designation ? `, ${p.designation}` : ""}): ${figures}`;
  });
  const open = (i.openTasks ?? []).slice(0, MAX_OPEN_TASKS_IN_PROMPT).map((t) => `- ${t.ref}: “${t.title}” for ${t.assigneeNames.join(", ") || "nobody"}, due ${weekday(t.date)} ${t.date} ${t.dueTime}`);
  return [
    `Today is ${weekday(i.today)} ${i.today}. Calendar:`,
    upcomingDays(i.today).join("\n"),
    "",
    "Team:",
    team.join("\n") || "(no team members yet)",
    "",
    "Open tasks that have a due time (for late alerts):",
    open.join("\n") || "(none)",
    "",
    `The admin wrote: """${i.message.replace(/"""/g, '"')}"""`,
  ].join("\n");
}

/** Takes whatever the model sent back (maybe wrapped in code fences or chatter) and returns the validated reply, or null. */
export function parseAssistantReply(text: string): RawReply | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = rawReply.safeParse(JSON.parse(text.slice(start, end + 1)));
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

/** Matches each requested late alert to one of the open tasks the assistant was shown, and checks the minutes. */
export function resolveAlerts(raw: RawReply, openTasks: AssistantOpenTask[]): ProposedAlert[] {
  const byRef = new Map(openTasks.map((t) => [t.ref.toLowerCase(), t]));
  return raw.alerts.map((a, index) => {
    const found = byRef.get(a.task.trim().toLowerCase());
    const minutes = Math.round(a.minutes ?? 10);
    const issues: string[] = [];
    if (!found) issues.push("I couldn't tell which task you mean. Open the task and set it there, or ask again with its name.");
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

export type AssistantAnswer = { reply: string; proposals: ProposedTask[]; alerts: ProposedAlert[] };
