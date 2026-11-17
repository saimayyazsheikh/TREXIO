import { z } from "zod";
import { PRIORITIES, type Priority } from "@/lib/domain/constants";
import { dateStringFromDayIndex, dayIndexFromDateString, formatPkt, pktInstant } from "@/lib/time";

export const MAX_ASSISTANT_MESSAGE = 600;
export const MAX_PROPOSED_TASKS = 10;

export type AssistantPerson = { id: string; name: string; businessId: string | null; designation: string };
export type AssistantBusiness = { id: string; name: string };
/** A short line of figures per person, so the assistant can suggest who has room and answer "how busy is X". */
export type AssistantLoad = { personId: string; open: number; overdue: number; today: number; away: boolean };

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
const rawReply = z.object({ reply: z.string().trim().max(800).default(""), tasks: z.array(rawTask).max(MAX_PROPOSED_TASKS).default([]) });
export type RawReply = z.infer<typeof rawReply>;

/** What the assistant is allowed to do is fixed here: it only ever proposes, and the admin confirms. */
export const ASSISTANT_SYSTEM = `You are the planning assistant inside Traxio, a task manager for a business owner (the admin) and their team in Pakistan.
The admin writes in English, Urdu or Roman Urdu (Urdu in English letters). Understand all three. Write your "reply" in the same language and script the admin used.

You never change anything yourself. You turn what the admin writes into proposed tasks, or you answer a question using ONLY the figures you are given. The admin reviews and confirms every proposal.

Answer with ONE JSON object and nothing else (no markdown, no code fences):
{
  "reply": "one or two short sentences for the admin",
  "tasks": [
    {
      "title": "short title, under 80 characters",
      "description": "optional extra detail, or null",
      "priority": "high" | "medium" | "low",
      "date": "YYYY-MM-DD or null",
      "time": "HH:MM in 24-hour time or null",
      "who": ["names exactly as the admin wrote them, or [] if no person was named"],
      "steps": ["optional checklist steps"],
      "dump": true | false
    }
  ]
}

Rules:
- A task with a person and no day means today. A task with a day goes on that day. Words like kal (tomorrow), parson (day after tomorrow), aaj (today), agle hafte (next week) and weekday names must be turned into real dates using the calendar you are given.
- If the admin only wants to remember something for later, with no person and no day, set "dump": true and leave date and who empty.
- Priority is "medium" unless the admin says it is urgent, important, or asks for it first (high), or says it is not urgent (low).
- Split one message into several tasks when it clearly lists several jobs. Never invent people, days or times the admin did not mention.
- If the admin asks a question (who is free, how busy someone is), answer it in "reply" from the figures given and return "tasks": [].
- If you cannot tell what is wanted, put a short question in "reply" and return "tasks": [].`;

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

export function buildAssistantPrompt(i: { message: string; today: string; people: AssistantPerson[]; businesses: AssistantBusiness[]; loads: AssistantLoad[] }): string {
  const biz = new Map(i.businesses.map((b) => [b.id, b.name]));
  const load = new Map(i.loads.map((l) => [l.personId, l]));
  const team = i.people.map((p) => {
    const l = load.get(p.id);
    const figures = l ? `${l.away ? "on leave today; " : ""}${l.open} open, ${l.overdue} overdue, ${l.today} due today` : "no figures";
    return `- ${p.name} (${biz.get(p.businessId ?? "") ?? "no business"}${p.designation ? `, ${p.designation}` : ""}): ${figures}`;
  });
  return [
    `Today is ${weekday(i.today)} ${i.today}. Calendar:`,
    upcomingDays(i.today).join("\n"),
    "",
    "Team:",
    team.join("\n") || "(no team members yet)",
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
  /** "HH:MM", or "" for no time. */
  dueTime: string;
  assigneeIds: string[];
  assigneeNames: string[];
  steps: string[];
  dump: boolean;
  /** Things the admin must fix before this can be created (an unknown name, a day that has passed). */
  issues: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

/** Finds who a written name means: the full name, or a first/last name that only one person has. */
export function matchPerson(name: string, people: AssistantPerson[]): { person?: AssistantPerson; problem?: string } {
  const n = norm(name);
  if (!n) return { problem: "Empty name" };
  const full = people.filter((p) => norm(p.name) === n);
  if (full.length === 1) return { person: full[0] };
  const part = people.filter((p) => norm(p.name).split(" ").includes(n) || norm(p.name).startsWith(n));
  if (part.length === 1) return { person: part[0] };
  if (part.length > 1) return { problem: `Which one: ${part.map((p) => p.name).join(" or ")}?` };
  return { problem: `No team member called “${name}”` };
}

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    const wantsDump = !!t.dump || (!hasPerson && !t.date);
    const priority = (PRIORITIES as readonly string[]).includes(t.priority ?? "") ? (t.priority as Priority) : "medium";
    let date: string | null = null;
    if (!wantsDump) {
      date = t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : ctx.today;
      if (date < ctx.today) issues.push("That day has already passed");
      if (!hasPerson) issues.push("Choose who it is for");
    }
    const dueTime = t.time && clock.test(t.time) && !wantsDump ? t.time : "";

    return {
      key: `p${index}`,
      title: t.title,
      description: t.description ?? "",
      priority,
      date,
      dueTime,
      assigneeIds,
      assigneeNames,
      steps: t.steps ?? [],
      dump: wantsDump,
      issues,
    };
  });
}

export type AssistantAnswer = { reply: string; proposals: ProposedTask[] };
