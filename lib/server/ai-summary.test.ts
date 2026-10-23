import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsInput } from "@/lib/domain/analytics";
import { DEFAULT_SETTINGS, type AutomationSettings } from "@/lib/domain/automation";
import { generateWeeklySummary, type SummaryDeps, type SummaryDoc } from "@/lib/server/ai-summary";
import type { AiProvider } from "@/lib/server/ai";
import type { Notice } from "@/lib/server/communication";
import type { WaMessage } from "@/lib/server/whatsapp";

const now = new Date("2026-10-21T08:00:00Z"); // Wednesday 21 Oct 2026 in PKT
const input = (from: string, to: string): AnalyticsInput => ({
  from, to, businessId: "", nowMs: now.getTime(),
  people: [{ id: "ali", name: "Ali Khan", businessId: "b1", workStart: null, workEnd: null }],
  businesses: [{ id: "b1", name: "Alpha", workDays: [1, 2, 3, 4, 5, 6], workStart: "09:00", workEnd: "12:00" }],
  tasks: [{ date: from, businessId: "b1", assigneeIds: ["ali"], doneBy: ["ali"], status: "completed", dueAtMs: 2, completedAtMs: 1 }],
  presence: [], journals: [], blocked: [], closed: [],
});

let saved: Map<string, SummaryDoc>;
let claims: Set<string>;
let notices: Notice[];
let sent: WaMessage[];
let loads: { from: string; to: string }[];
let settings: AutomationSettings;
let generate: ReturnType<typeof vi.fn>;
let failLoad: boolean;
let failWhatsApp: boolean;

const claude = (): AiProvider => ({ name: "anthropic", model: "claude-opus-5-5", generate: (generate as unknown as AiProvider["generate"]) });
const mock = (): AiProvider => ({ name: "mock", model: "template", generate: async () => "unused" });
const deps = (provider: AiProvider): SummaryDeps => ({
  now: () => now,
  provider,
  loadInput: async (p) => {
    loads.push(p);
    if (failLoad) throw new Error("db down");
    return input(p.from, p.to);
  },
  loadSettings: async () => settings,
  save: async (id, doc) => void saved.set(id, doc),
  claimRun: async (k) => (claims.has(k) ? false : (claims.add(k), true)),
  releaseRun: async (k) => void claims.delete(k),
  notify: async (n) => void notices.push(n),
  sendWhatsApp: async (m) => {
    if (failWhatsApp) throw new Error("wa down");
    sent.push(m);
  },
});

beforeEach(() => {
  saved = new Map();
  claims = new Set();
  notices = [];
  sent = [];
  loads = [];
  settings = { ...DEFAULT_SETTINGS, adminPhone: "+923009999999" };
  generate = vi.fn(async () => "## Highlights\n- A good week");
  failLoad = false;
  failWhatsApp = false;
});

describe("generateWeeklySummary", () => {
  it("summarises the last finished week and compares it with the one before", async () => {
    const r = await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "manual" });
    expect(r).toMatchObject({ id: "week_2026-10-12", skipped: false, provider: "anthropic", model: "claude-opus-5-5" });
    expect(loads).toEqual([{ from: "2026-10-12", to: "2026-10-18" }, { from: "2026-10-05", to: "2026-10-11" }]);
    expect(saved.get("week_2026-10-12")).toMatchObject({ weekStart: "2026-10-12", weekEnd: "2026-10-18", partial: false, text: "## Highlights\n- A good week", trigger: "manual", createdAt: now });
    expect(saved.get("week_2026-10-12")!.stats.previous).not.toBeNull();
  });

  it("sends the model only figures: the prompt carries the numbers and the rules, never raw records", async () => {
    await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "manual" });
    const arg = (generate.mock.calls[0] as unknown[])[0] as { system: string; prompt: string };
    expect(arg.system).toContain("never invent");
    expect(arg.prompt).toContain("2026-10-12 to 2026-10-18");
    expect(arg.prompt).toContain('"completedPct"');
    expect(arg.prompt).not.toContain("slots");
  });

  it("the week so far is stored under its own id, with no previous-week comparison", async () => {
    await generateWeeklySummary(deps(claude()), { which: "this-week", trigger: "manual" });
    expect(loads).toEqual([{ from: "2026-10-19", to: "2026-10-21" }]);
    expect(saved.get("week_2026-10-19_live")).toMatchObject({ partial: true, weekEnd: "2026-10-21" });
    expect(saved.get("week_2026-10-19_live")!.stats.previous).toBeNull();
    expect(saved.has("week_2026-10-19")).toBe(false);
  });

  it("with no AI configured the built-in template writes it, and no provider call is made", async () => {
    const r = await generateWeeklySummary(deps(mock()), { which: "last-week", trigger: "manual" });
    expect(r.provider).toBe("mock");
    expect(saved.get(r.id)!.text).toContain("## Highlights");
    expect(saved.get(r.id)!.model).toBe("template");
    expect(generate).not.toHaveBeenCalled();
  });

  it("a manual run doesn't notify or message anyone, and can be repeated to redo the week", async () => {
    await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "manual" });
    await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "manual" });
    expect(notices).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe("scheduled runs", () => {
  it("write the week once, tell the admin in the app, and skip when it already ran", async () => {
    const first = await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" });
    const second = await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" });
    expect(first.skipped).toBe(false);
    expect(second).toMatchObject({ skipped: true, id: "week_2026-10-12" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([expect.objectContaining({ toUid: "admin", title: "Your weekly summary is ready", link: "/admin/ai-summaries" })]);
  });

  it("send it on WhatsApp only when that setting is on and a number is saved", async () => {
    expect((await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" })).whatsapp).toBe("off");
    claims.clear();
    settings = { ...settings, weeklySummaryWhatsApp: true };
    const r = await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" });
    expect(r.whatsapp).toBe("sent");
    expect(sent[0]).toMatchObject({ kind: "summary", to: "+923009999999" });
    expect(sent[0].text).toContain("Highlights");
    expect(sent[0].text).not.toContain("##");
    claims.clear();
    settings = { ...settings, adminPhone: "" };
    expect((await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" })).whatsapp).toBe("off");
  });

  it("a WhatsApp failure doesn't lose the saved summary", async () => {
    settings = { ...settings, weeklySummaryWhatsApp: true };
    failWhatsApp = true;
    const r = await generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" });
    expect(r.whatsapp).toBe("failed");
    expect(saved.has("week_2026-10-12")).toBe(true);
  });

  it("a failed run gives its claim back so the next attempt can try again", async () => {
    failLoad = true;
    await expect(generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" })).rejects.toThrow("db down");
    expect(claims.size).toBe(0);
    failLoad = false;
    await expect(generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" })).resolves.toMatchObject({ skipped: false });
    expect(saved.has("week_2026-10-12")).toBe(true);
  });

  it("a provider failure is reported and nothing half-written is saved", async () => {
    generate = vi.fn(async () => Promise.reject(new Error("model down")));
    await expect(generateWeeklySummary(deps(claude()), { which: "last-week", trigger: "cron" })).rejects.toThrow("model down");
    expect(saved.size).toBe(0);
    expect(notices).toHaveLength(0);
    expect(claims.size).toBe(0);
  });
});
