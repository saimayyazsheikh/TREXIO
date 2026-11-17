import { DomainError } from "@/lib/domain/errors";
import { ASSISTANT_SYSTEM, MAX_ASSISTANT_MESSAGE, buildAssistantPrompt, mentionsPassword, parseAssistantReply, resolveAlerts, resolveProposals, type AssistantAnswer, type AssistantBusiness, type AssistantLoad } from "@/lib/domain/assistant";
import { resolveActions, type ActionContext, type ActionLeave, type ActionPerson, type ActionRoutine, type ActionTask } from "@/lib/domain/assistant-actions";
import { pktDateString } from "@/lib/time";
import type { AiProvider } from "@/lib/server/ai";

/** The lists the assistant points at, before labels (T1, R1, L1…) are added. */
export type AssistantLists = {
  tasks: Omit<ActionTask, "ref">[];
  routines: Omit<ActionRoutine, "ref">[];
  leaves: Omit<ActionLeave, "ref">[];
};

export type AssistantDeps = {
  now(): Date;
  provider: AiProvider;
  /** Every employee, including people who are turned off. */
  loadPeople(): Promise<ActionPerson[]>;
  loadBusinesses(): Promise<AssistantBusiness[]>;
  loadLoads(today: string, nowMs: number, people: ActionPerson[]): Promise<AssistantLoad[]>;
  loadLists(today: string, nowMs: number): Promise<AssistantLists>;
};

const label = <T extends object>(prefix: string, list: T[]): (T & { ref: string })[] => list.map((x, i) => ({ ...x, ref: `${prefix}${i + 1}` }));

/**
 * Reads what the admin wrote and answers with proposals: new tasks, late alerts, and changes to what already exists. It never
 * writes anything. The admin confirms each card, and the confirmed payload is checked again and run by the same code the
 * normal screens use (see assistant-run.ts).
 */
export async function askAssistant(deps: AssistantDeps, input: { message: string }): Promise<AssistantAnswer> {
  const message = input.message.trim();
  if (message.length === 0) throw new DomainError("Write what you need first.", 400);
  if (message.length > MAX_ASSISTANT_MESSAGE) throw new DomainError(`Keep it under ${MAX_ASSISTANT_MESSAGE} characters.`, 400);
  if (deps.provider.name === "mock") {
    throw new DomainError("The assistant needs an AI key. Ask whoever set up Traxio to add GEMINI_API_KEY (or ANTHROPIC_API_KEY).", 503);
  }
  // A password must never travel to the AI service. It is typed into the confirmation card instead.
  if (mentionsPassword(message)) {
    return { reply: "Password yahan mat likhein: main isay kabhi nahi leta. Aap bas bata dein kis ka password badalna hai, phir card mein khud likh dein.", proposals: [], alerts: [], actions: [] };
  }

  const now = deps.now();
  const today = pktDateString(now);
  const [everyone, businesses] = await Promise.all([deps.loadPeople(), deps.loadBusinesses()]);
  const people = everyone.filter((p) => p.status === "active");
  const [loads, lists] = await Promise.all([deps.loadLoads(today, now.getTime(), everyone), deps.loadLists(today, now.getTime())]);
  const tasks = label("T", lists.tasks);
  const routines = label("R", lists.routines);
  const leaves = label("L", lists.leaves);
  const text = await deps.provider.generate({ system: ASSISTANT_SYSTEM, prompt: buildAssistantPrompt({ message, today, people: everyone, businesses, loads, tasks, routines, leaves }) });

  const raw = parseAssistantReply(text);
  if (!raw) {
    // The model sometimes answers in plain words instead of the expected format (usually a question back). Show that rather than a canned line.
    const plain = text.replace(/```[a-z]*/gi, "").trim();
    const readable = plain.length > 0 && !plain.startsWith("{") && !plain.includes('"tasks"');
    return { reply: readable ? plain.slice(0, 400) : "I couldn't understand that. Try saying who, what and when, for example: “Tomorrow 10am Ali count the stock”.", proposals: [], alerts: [], actions: [] };
  }
  const ctx: ActionContext = { today, people: everyone, businesses, tasks, routines, leaves };
  const proposals = resolveProposals(raw, { people, today });
  const alerts = resolveAlerts(raw, tasks);
  const actions = resolveActions(raw.actions, ctx);
  const items = proposals.length + alerts.length + actions.length;
  // When every card has something wrong with it, the AI's cheerful "card tayyar hai" would mislead: say what is wrong instead.
  const problems = [...proposals.flatMap((p) => p.issues), ...alerts.flatMap((a) => a.issues), ...actions.flatMap((a) => a.issues)];
  const allBroken = items > 0 && [...proposals, ...alerts, ...actions].every((x) => x.issues.length > 0);
  const reply = allBroken ? `Yeh abhi nahi ho sakta: ${problems[0]}` : raw.reply || (items ? `I found ${items} ${items === 1 ? "thing" : "things"}. Check them, then confirm.` : "I didn't find anything to do in that.");
  return { reply, proposals, alerts, actions };
}
