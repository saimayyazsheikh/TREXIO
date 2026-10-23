import { DomainError } from "@/lib/domain/errors";
import { phoneSchema } from "@/lib/domain/schemas";

export type WaKind = "nudge" | "briefing" | "escalation";

export type WaSend = { to: string; template: string; params: string[] };
export type WaProvider = {
  name: "mock" | "cloud";
  send(msg: WaSend): Promise<{ providerId: string }>;
};

export type WaLogEntry = {
  kind: WaKind;
  provider: "mock" | "cloud";
  template: string;
  toUid: string | null;
  toName: string;
  to: string;
  text: string;
  taskId: string | null;
  status: "sent" | "mock" | "failed";
  providerId: string | null;
  error: string | null;
  createdAt: Date;
};

export type WaDeps = {
  provider: WaProvider;
  /** Approved template names from the environment, by kind. A blank name is only a problem for the real provider. */
  templates: Record<WaKind, string>;
  writeLog(entry: WaLogEntry): Promise<string>;
  now(): Date;
};

export type WaMessage = { kind: WaKind; to: string; toUid: string | null; toName: string; text: string; taskId?: string | null; params?: string[] };

/** Meta rejects template values containing line breaks, tabs or long runs of spaces. */
export const cleanParam = (s: string) => s.replace(/[\r\n\t]+/g, " | ").replace(/ {4,}/g, "   ").trim().slice(0, 1000);

/**
 * Sends one WhatsApp message and records it, whatever happens. The mock provider records without sending, so the whole
 * flow works before Meta approves the templates. A failed send is logged as failed and surfaces a friendly error.
 */
export async function sendWhatsApp(deps: WaDeps, msg: WaMessage): Promise<{ status: "sent" | "mock"; logId: string }> {
  const phone = phoneSchema.safeParse(msg.to);
  if (!phone.success) throw new DomainError(`${msg.toName || "That person"} has no valid WhatsApp number yet. Add one in Team (like +923001234567).`, 400);

  const template = deps.templates[msg.kind];
  if (deps.provider.name === "cloud" && !template) throw new DomainError("The WhatsApp template for this message isn't set up yet.", 503);

  const params = (msg.params ?? [msg.text]).map(cleanParam);
  const entry: WaLogEntry = {
    kind: msg.kind, provider: deps.provider.name, template, toUid: msg.toUid, toName: msg.toName, to: phone.data, text: msg.text.slice(0, 1000),
    taskId: msg.taskId ?? null, status: "failed", providerId: null, error: null, createdAt: deps.now(),
  };
  try {
    const { providerId } = await deps.provider.send({ to: phone.data, template, params });
    entry.status = deps.provider.name === "mock" ? "mock" : "sent";
    entry.providerId = providerId;
  } catch (error) {
    entry.error = error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
    await deps.writeLog(entry);
    throw new DomainError("WhatsApp didn't accept that message. Check the number and try again.", 502);
  }
  return { status: entry.status as "sent" | "mock", logId: await deps.writeLog(entry) };
}

/* -------------------------------- Providers -------------------------------- */

export function mockProvider(): WaProvider {
  return { name: "mock", send: async () => ({ providerId: `mock_${Math.random().toString(36).slice(2, 10)}` }) };
}

export function cloudProvider(o: { token: string; phoneNumberId: string; fetchImpl?: typeof fetch }): WaProvider {
  const doFetch = o.fetchImpl ?? fetch;
  return {
    name: "cloud",
    async send({ to, template, params }) {
      const res = await doFetch(`https://graph.facebook.com/v21.0/${o.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${o.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: { name: template, language: { code: "en" }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
      if (!res.ok || !body.messages?.[0]) throw new Error(body.error?.message ?? `WhatsApp returned ${res.status}`);
      return { providerId: body.messages[0].id };
    },
  };
}
