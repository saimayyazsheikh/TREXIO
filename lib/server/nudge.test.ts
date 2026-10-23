import { beforeEach, describe, expect, it } from "vitest";
import { nudgeSchema, sendTaskNudge } from "@/lib/server/nudge";
import { mockProvider, type WaLogEntry } from "@/lib/server/whatsapp";

let logs: WaLogEntry[];
const docs: Record<string, Record<string, unknown>> = {
  "tasks/t1": { title: "Count stock", assigneeIds: ["ali", "off"] },
  "users/ali": { name: "Ali Khan", role: "employee", status: "active", phone: "+923001234567" },
  "users/nophone": { name: "No Phone", role: "employee", status: "active", phone: null },
  "users/off": { name: "Off Person", role: "employee", status: "disabled", phone: "+923001234568" },
};
const deps = () => ({
  get: async (p: string) => docs[p] ?? null,
  wa: { provider: mockProvider(), templates: { nudge: "task_nudge", briefing: "", escalation: "" }, now: () => new Date("2026-10-21T08:00:00Z"), writeLog: async (e: WaLogEntry) => (logs.push(e), "log1") },
});
const input = (o: Record<string, unknown> = {}) => nudgeSchema.parse({ taskId: "t1", toUid: "ali", message: "Any update on the stock count?", ...o });

beforeEach(() => {
  logs = [];
});

describe("sendTaskNudge", () => {
  it("sends to the assignee's number and logs it against the task", async () => {
    await expect(sendTaskNudge(deps(), input())).resolves.toEqual({ status: "mock", logId: "log1" });
    expect(logs[0]).toMatchObject({ kind: "nudge", toUid: "ali", taskId: "t1", to: "+923001234567", text: "Any update on the stock count?" });
  });
  it("only reaches people who are on the task and active", async () => {
    await expect(sendTaskNudge(deps(), input({ taskId: "gone" }))).rejects.toMatchObject({ status: 404 });
    await expect(sendTaskNudge(deps(), input({ toUid: "nophone" }))).rejects.toMatchObject({ status: 400 });
    await expect(sendTaskNudge(deps(), input({ toUid: "off" }))).rejects.toMatchObject({ status: 409 });
  });
  it("explains a missing number", async () => {
    docs["tasks/t1"].assigneeIds = ["ali", "off", "nophone"];
    await expect(sendTaskNudge(deps(), input({ toUid: "nophone" }))).rejects.toThrow(/no valid WhatsApp number/);
    expect(logs).toHaveLength(0);
  });
  it("rejects an empty or huge message", () => {
    expect(nudgeSchema.safeParse({ taskId: "t1", toUid: "ali", message: " " }).success).toBe(false);
    expect(nudgeSchema.safeParse({ taskId: "t1", toUid: "ali", message: "x".repeat(601) }).success).toBe(false);
  });
});
