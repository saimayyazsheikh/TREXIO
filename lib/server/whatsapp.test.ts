import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanParam, cloudProvider, mockProvider, sendWhatsApp, type WaDeps, type WaLogEntry } from "@/lib/server/whatsapp";

const now = new Date("2026-10-21T08:00:00Z");
let logs: WaLogEntry[];
const deps = (provider = mockProvider(), templates = { nudge: "task_nudge", briefing: "morning_briefing", escalation: "escalation_alert", summary: "weekly_summary" }): WaDeps => ({
  provider,
  templates,
  now: () => now,
  writeLog: async (e) => (logs.push(e), `log${logs.length}`),
});
const msg = { kind: "nudge" as const, to: "+923001234567", toUid: "ali", toName: "Ali Khan", text: "How is the stock count going?", taskId: "t1" };

beforeEach(() => {
  logs = [];
});

describe("sendWhatsApp", () => {
  it("the mock provider records the message without sending it", async () => {
    await expect(sendWhatsApp(deps(), msg)).resolves.toEqual({ status: "mock", logId: "log1" });
    expect(logs[0]).toMatchObject({ kind: "nudge", provider: "mock", status: "mock", to: "+923001234567", toUid: "ali", taskId: "t1", template: "task_nudge", createdAt: now, error: null });
    expect(logs[0].providerId).toMatch(/^mock_/);
  });

  it("refuses a missing or badly formatted number, and logs nothing", async () => {
    for (const to of ["", "0300 1234567", "923001234567", "+92"]) await expect(sendWhatsApp(deps(), { ...msg, to })).rejects.toMatchObject({ status: 400 });
    expect(logs).toHaveLength(0);
  });

  it("the real provider needs an approved template name", async () => {
    const cloud = cloudProvider({ token: "t", phoneNumberId: "1", fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(sendWhatsApp(deps(cloud, { nudge: "", briefing: "", escalation: "", summary: "" }), msg)).rejects.toMatchObject({ status: 503 });
  });

  it("a provider failure is logged as failed and shown as a friendly error", async () => {
    const failing = { name: "cloud" as const, send: async () => Promise.reject(new Error("(#131030) Recipient not in allowed list")) };
    await expect(sendWhatsApp(deps(failing), msg)).rejects.toMatchObject({ status: 502 });
    expect(logs[0]).toMatchObject({ status: "failed", error: "(#131030) Recipient not in allowed list" });
  });
});

describe("cloud provider", () => {
  it("posts a template message with the number in digits and the values as body parameters", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    const cloud = cloudProvider({ token: "secret", phoneNumberId: "555", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await sendWhatsApp(deps(cloud), { ...msg, params: ["Ali", "Line one\nLine two"] });
    expect(result.status).toBe("sent");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/555/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe("923001234567");
    expect(body.template.name).toBe("task_nudge");
    expect(body.template.components[0].parameters).toEqual([{ type: "text", text: "Ali" }, { type: "text", text: "Line one | Line two" }]);
    expect(logs[0]).toMatchObject({ status: "sent", providerId: "wamid.1" });
  });

  it("turns an API error into a failure", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid token" } }), { status: 401 }));
    const cloud = cloudProvider({ token: "bad", phoneNumberId: "555", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(sendWhatsApp(deps(cloud), msg)).rejects.toMatchObject({ status: 502 });
    expect(logs[0].error).toBe("Invalid token");
  });
});

describe("cleanParam", () => {
  it("removes line breaks, tabs and long space runs, which Meta rejects", () => {
    expect(cleanParam("a\nb\t\tc      d")).toBe("a | b | c   d");
    expect(cleanParam("x".repeat(2000))).toHaveLength(1000);
  });
});
