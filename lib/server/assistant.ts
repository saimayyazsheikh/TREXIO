import { DomainError } from "@/lib/domain/errors";
import { ASSISTANT_SYSTEM, MAX_ASSISTANT_MESSAGE, buildAssistantPrompt, parseAssistantReply, resolveProposals, type AssistantAnswer, type AssistantBusiness, type AssistantLoad, type AssistantPerson } from "@/lib/domain/assistant";
import { pktDateString } from "@/lib/time";
import type { AiProvider } from "@/lib/server/ai";

export type AssistantDeps = {
  now(): Date;
  provider: AiProvider;
  loadPeople(): Promise<AssistantPerson[]>;
  loadBusinesses(): Promise<AssistantBusiness[]>;
  loadLoads(today: string, nowMs: number, people: AssistantPerson[]): Promise<AssistantLoad[]>;
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
  const loads = await deps.loadLoads(today, now.getTime(), people);
  const text = await deps.provider.generate({ system: ASSISTANT_SYSTEM, prompt: buildAssistantPrompt({ message, today, people, businesses, loads }) });

  const raw = parseAssistantReply(text);
  if (!raw) return { reply: "I couldn't turn that into tasks. Try saying who, what and when, for example: “Tomorrow 10am Ali count the stock”.", proposals: [] };
  const proposals = resolveProposals(raw, { people, today });
  const reply = raw.reply || (proposals.length ? `I found ${proposals.length} ${proposals.length === 1 ? "task" : "tasks"}. Check them, then confirm.` : "I didn't find a task in that.");
  return { reply, proposals };
}
