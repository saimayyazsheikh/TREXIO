import { DomainError } from "@/lib/domain/errors";
import { ASSISTANT_SYSTEM, MAX_ASSISTANT_MESSAGE, buildAssistantPrompt, parseAssistantReply, resolveAlerts, resolveProposals, type AssistantAnswer, type AssistantBusiness, type AssistantLoad, type AssistantOpenTask, type AssistantPerson } from "@/lib/domain/assistant";
import { pktDateString } from "@/lib/time";
import type { AiProvider } from "@/lib/server/ai";

export type AssistantDeps = {
  now(): Date;
  provider: AiProvider;
  loadPeople(): Promise<AssistantPerson[]>;
  loadBusinesses(): Promise<AssistantBusiness[]>;
  loadLoads(today: string, nowMs: number, people: AssistantPerson[]): Promise<AssistantLoad[]>;
  /** Open tasks with a due time, soonest first (the labels T1, T2… are added here). */
  loadOpenTasks(today: string, nowMs: number): Promise<Omit<AssistantOpenTask, "ref">[]>;
};

/**
 * Reads what the admin wrote and answers with proposed tasks (or a plain answer). It never writes anything: the admin
 * confirms each proposal, and that goes through the same task routes as the forms do.
 */
export async function askAssistant(deps: AssistantDeps, input: { message: string }): Promise<AssistantAnswer> {
  const message = input.message.trim();
  if (message.length === 0) throw new DomainError("Write what you need first.", 400);
  if (message.length > MAX_ASSISTANT_MESSAGE) throw new DomainError(`Keep it under ${MAX_ASSISTANT_MESSAGE} characters.`, 400);
  if (deps.provider.name === "mock") {
    throw new DomainError("The assistant needs an AI key. Ask whoever set up Traxio to add GEMINI_API_KEY (or ANTHROPIC_API_KEY).", 503);
  }

  const now = deps.now();
  const today = pktDateString(now);
  const [people, businesses] = await Promise.all([deps.loadPeople(), deps.loadBusinesses()]);
  const [loads, openRaw] = await Promise.all([deps.loadLoads(today, now.getTime(), people), deps.loadOpenTasks(today, now.getTime())]);
  const openTasks: AssistantOpenTask[] = openRaw.map((t, i) => ({ ...t, ref: `T${i + 1}` }));
  const text = await deps.provider.generate({ system: ASSISTANT_SYSTEM, prompt: buildAssistantPrompt({ message, today, people, businesses, loads, openTasks }) });

  const raw = parseAssistantReply(text);
  if (!raw) {
    // The model sometimes answers in plain words instead of the expected format (usually a question back). Show that rather than a canned line.
    const plain = text.replace(/```[a-z]*/gi, "").trim();
    const readable = plain.length > 0 && !plain.startsWith("{") && !plain.includes("\"tasks\"");
    return { reply: readable ? plain.slice(0, 400) : "I couldn't understand that. Try saying who, what and when, for example: “Tomorrow 10am Ali count the stock”.", proposals: [], alerts: [] };
  }
  const proposals = resolveProposals(raw, { people, today });
  const alerts = resolveAlerts(raw, openTasks);
  const items = proposals.length + alerts.length;
  const reply = raw.reply || (items ? `I found ${items} ${items === 1 ? "thing" : "things"}. Check them, then confirm.` : "I didn't find anything to do in that.");
  return { reply, proposals, alerts };
}
