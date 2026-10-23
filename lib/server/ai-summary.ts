import { buildPrompt, buildSummaryStats, condense, summaryId, templateSummary, SYSTEM_PROMPT, type SummaryPeriod, type SummaryStats } from "@/lib/domain/ai-summary";
import { lastFullWeek, weekStartOf, type AnalyticsInput } from "@/lib/domain/analytics";
import type { AutomationSettings } from "@/lib/domain/automation";
import { dateStringFromDayIndex, dayIndexFromDateString, pktDateString } from "@/lib/time";
import type { AiProvider } from "@/lib/server/ai";
import type { Notice } from "@/lib/server/communication";
import type { WaMessage } from "@/lib/server/whatsapp";

export type SummaryDoc = {
  weekStart: string;
  weekEnd: string;
  partial: boolean;
  text: string;
  stats: SummaryStats;
  provider: AiProvider["name"];
  model: string;
  trigger: "cron" | "manual";
  createdAt: Date;
};

export type SummaryDeps = {
  now(): Date;
  provider: AiProvider;
  /** Everything for the period across all businesses (tasks, presence, journals, blocked reasons, calendar). */
  loadInput(period: SummaryPeriod): Promise<AnalyticsInput>;
  loadSettings(): Promise<AutomationSettings>;
  save(id: string, doc: SummaryDoc): Promise<void>;
  /** True only for the first caller for this key; the scheduled run uses it so overlapping runs write one summary. */
  claimRun(key: string): Promise<boolean>;
  releaseRun(key: string): Promise<void>;
  notify(notice: Notice): Promise<void>;
  sendWhatsApp(msg: WaMessage): Promise<unknown>;
};

export type SummaryRequest = { which: "last-week" | "this-week"; trigger: "cron" | "manual" };
export type SummaryResult = { id: string; skipped: boolean; provider: AiProvider["name"]; model: string; whatsapp: "sent" | "failed" | "off" };

const addDays = (date: string, n: number) => dateStringFromDayIndex(dayIndexFromDateString(date) + n);

/**
 * Writes one weekly summary. The scheduled run only ever writes a finished week, once; a manual run may also cover the
 * week so far (kept under its own id) or redo the last one. Only aggregated figures reach the provider.
 */
export async function generateWeeklySummary(deps: SummaryDeps, req: SummaryRequest): Promise<SummaryResult> {
  const now = deps.now();
  const today = pktDateString(now);
  const partial = req.which === "this-week";
  const period: SummaryPeriod = partial ? { from: weekStartOf(today), to: today } : lastFullWeek(today);
  const id = summaryId(period.from, partial);
  const base = { id, provider: deps.provider.name, model: deps.provider.model };

  const claimKey = `summary_${id}`;
  const scheduled = req.trigger === "cron";
  if (scheduled && !(await deps.claimRun(claimKey))) return { ...base, skipped: true, whatsapp: "off" };

  try {
    const [input, previous] = await Promise.all([
      deps.loadInput(period),
      partial ? Promise.resolve(null) : deps.loadInput({ from: addDays(period.from, -7), to: addDays(period.from, -1) }),
    ]);
    const stats = buildSummaryStats(input, previous, partial);
    const text = deps.provider.name === "mock" ? templateSummary(stats) : await deps.provider.generate({ system: SYSTEM_PROMPT, prompt: buildPrompt(stats) });
    await deps.save(id, { weekStart: period.from, weekEnd: period.to, partial, text, stats, provider: deps.provider.name, model: deps.provider.model, trigger: req.trigger, createdAt: now });

    let whatsapp: SummaryResult["whatsapp"] = "off";
    if (scheduled) {
      await deps.notify({ toUid: "admin", title: "Your weekly summary is ready", body: `Week of ${period.from}: ${stats.kpis.completedPct}% of tasks completed.`, link: "/admin/ai-summaries" });
      const settings = await deps.loadSettings();
      if (settings.weeklySummaryWhatsApp && settings.adminPhone) {
        try {
          await deps.sendWhatsApp({ kind: "summary", to: settings.adminPhone, toUid: null, toName: "Admin", text: condense(text), params: [period.from, condense(text)] });
          whatsapp = "sent";
        } catch {
          whatsapp = "failed";
        }
      }
    }
    return { ...base, skipped: false, whatsapp };
  } catch (error) {
    // A failed scheduled run must be retryable, so release its claim before reporting the failure.
    if (scheduled) await deps.releaseRun(claimKey).catch(() => undefined);
    throw error;
  }
}
