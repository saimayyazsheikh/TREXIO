"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarClock, MessageCircleMore, Play } from "lucide-react";
import { collection, doc, limit, orderBy, query, setDoc, type Timestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { useCollection } from "@/hooks/use-collection";
import { useGlobalSettings } from "@/hooks/use-global-settings";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { DEFAULT_SETTINGS, SETTINGS_PATH, settingsSchema, type AutomationSettings } from "@/lib/domain/automation";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";

type LogDoc = { kind: "nudge" | "briefing" | "escalation"; provider: "mock" | "cloud"; toName: string; text: string; status: "sent" | "mock" | "failed"; error: string | null; createdAt: Timestamp };

const KIND = { nudge: "Nudge", briefing: "Morning briefing", escalation: "Late-task alert" } as const;
const STATUS = {
  sent: { label: "Sent", cls: "bg-success/15 text-success" },
  mock: { label: "Test mode", cls: "bg-info/15 text-info" },
  failed: { label: "Failed", cls: "bg-danger/15 text-danger" },
} as const;

type Draft = Omit<Record<keyof AutomationSettings, string>, "briefingEnabled" | "weeklySummaryWhatsApp"> & { briefingEnabled: boolean; weeklySummaryWhatsApp: boolean };
const toDraft = (s: AutomationSettings): Draft => ({
  escalationL1Min: String(s.escalationL1Min),
  escalationL2Min: String(s.escalationL2Min),
  briefingEnabled: s.briefingEnabled,
  weeklySummaryWhatsApp: s.weeklySummaryWhatsApp,
  promptMinute: String(s.promptMinute),
  idleMin: String(s.idleMin),
  adminPhone: s.adminPhone,
});

export function AutomationSettingsView() {
  const { db } = getFirebase();
  const { settings, loading, error: settingsError, retry } = useGlobalSettings();
  const logQ = useMemo(() => query(collection(db, "whatsappLogs"), orderBy("createdAt", "desc"), limit(15)), [db]);
  const logs = useCollection<LogDoc>(logQ);

  const [draft, setDraft] = useState<Draft>(toDraft(DEFAULT_SETTINGS));
  const [errors, setErrors] = useState<Partial<Record<keyof AutomationSettings, string>>>({});
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => setDraft(toDraft(settings)), [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse({
      escalationL1Min: draft.escalationL1Min.trim() === "" ? NaN : Number(draft.escalationL1Min),
      escalationL2Min: draft.escalationL2Min.trim() === "" ? NaN : Number(draft.escalationL2Min),
      briefingEnabled: draft.briefingEnabled,
      weeklySummaryWhatsApp: draft.weeklySummaryWhatsApp,
      promptMinute: draft.promptMinute.trim() === "" ? NaN : Number(draft.promptMinute),
      idleMin: draft.idleMin.trim() === "" ? NaN : Number(draft.idleMin),
      adminPhone: draft.adminPhone.trim(),
    });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof AutomationSettings] ??= Number.isNaN((issue as { received?: unknown }).received) || issue.code === "invalid_type" ? "Enter a number" : issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await setDoc(doc(db, SETTINGS_PATH), parsed.data);
      toast.success("Settings saved.");
    } catch {
      toast.error("Couldn't save the settings. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function run(job: "escalations" | "briefing") {
    setRunning(job);
    try {
      const r = await apiFetch<Record<string, number>>("/api/admin/automation/run", "POST", { job });
      toast.success(job === "escalations" ? `Checked ${r.checked} late tasks: ${r.level1} first alerts, ${r.level2} second alerts.` : `Briefing: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't run that right now.");
    } finally {
      setRunning(null);
    }
  }

  const mode = logs.data?.[0]?.provider;

  return (
    <>
      <PageHeader title="Automation" subtitle="When Traxio nudges people on its own: late-task alerts, the morning briefing, idle time and the journal prompt." />

      {settingsError ? (
        <ErrorState onRetry={retry} />
      ) : loading ? (
        <div aria-busy aria-label="Loading settings" className="space-y-3">
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : (
        <form onSubmit={save} noValidate className="space-y-6">
          <GlassCard className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
              <BellRing className="size-5 text-brand-text" aria-hidden /> Late-task alerts
            </h2>
            <p className="mb-4 text-sm text-muted">A task that is still To-Do or In Progress after its due time raises two alerts, each only once. Holidays, closures and approved leave pause them.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="l1" label="First alert after (minutes late)" required hint="Tells the person in the app." error={errors.escalationL1Min}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.escalationL1Min} onChange={(e) => set("escalationL1Min", e.target.value)} />}
              </Field>
              <Field id="l2" label="Second alert after (minutes late)" required hint="Tells you in the app and on WhatsApp." error={errors.escalationL2Min}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.escalationL2Min} onChange={(e) => set("escalationL2Min", e.target.value)} />}
              </Field>
              <div className="sm:col-span-2">
                <Field id="admin-phone" label="Your WhatsApp number" hint="International format, like +923001234567. Leave empty to get the second alert in the app only." error={errors.adminPhone}>
                  {(aria) => <Input {...aria} type="tel" autoComplete="tel" value={draft.adminPhone} onChange={(e) => set("adminPhone", e.target.value)} />}
                </Field>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
              <CalendarClock className="size-5 text-brand-text" aria-hidden /> Daily rhythm
            </h2>
            <p className="mb-4 text-sm text-muted">The briefing goes out at 9:00 AM Pakistan time on working days, to people who have a WhatsApp number and aren&apos;t on leave.</p>
            <label className="mb-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={draft.briefingEnabled} onChange={(e) => set("briefingEnabled", e.target.checked)} />
              Send the 9:00 AM briefing on WhatsApp
            </label>
            <label className="mb-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={draft.weeklySummaryWhatsApp} onChange={(e) => set("weeklySummaryWhatsApp", e.target.checked)} />
              Also send each weekly AI summary to my WhatsApp (needs your number above)
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="prompt-minute" label="Journal prompt at minute" required hint="At this minute of each working hour, an empty hour is asked about. 55 means 10:55, 11:55…" error={errors.promptMinute}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.promptMinute} onChange={(e) => set("promptMinute", e.target.value)} />}
              </Field>
              <Field id="idle-min" label="Idle after (minutes)" required hint="No activity inside Traxio for this long shows as Idle. A person's own setting wins." error={errors.idleMin}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.idleMin} onChange={(e) => set("idleMin", e.target.value)} />}
              </Field>
            </div>
          </GlassCard>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty ? (
              <Button type="button" variant="ghost" onClick={() => { setDraft(toDraft(settings)); setErrors({}); }}>
                Discard changes
              </Button>
            ) : null}
            <Button type="submit" loading={busy} disabled={!dirty}>
              Save settings
            </Button>
          </div>
        </form>
      )}

      <section aria-labelledby="run-now" className="mt-10">
        <h2 id="run-now" className="mb-1 font-display text-lg font-semibold">
          Run now
        </h2>
        <p className="mb-3 text-sm text-muted">These normally run by themselves. Running one early is safe: nothing is ever sent twice.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={running === "escalations"} onClick={() => run("escalations")}>
            <Play aria-hidden /> Check for late tasks
          </Button>
          <Button variant="secondary" loading={running === "briefing"} onClick={() => run("briefing")}>
            <Play aria-hidden /> Send today&apos;s briefing
          </Button>
        </div>
      </section>

      <section aria-labelledby="wa-log" className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="wa-log" className="flex items-center gap-2 font-display text-lg font-semibold">
            <MessageCircleMore className="size-5 text-brand-text" aria-hidden /> WhatsApp log
          </h2>
          {mode ? <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", mode === "mock" ? "bg-info/15 text-info" : "bg-success/15 text-success")}>{mode === "mock" ? "Test mode: messages are logged, not sent" : "Live: messages go through WhatsApp"}</span> : null}
        </div>
        {logs.error ? (
          <ErrorState onRetry={logs.retry} />
        ) : logs.loading ? (
          <Skeleton aria-busy aria-label="Loading the log" className="h-32 rounded-card" />
        ) : (logs.data?.length ?? 0) === 0 ? (
          <EmptyState icon={MessageCircleMore} title="No WhatsApp messages yet" description="Nudges you send from a task, the morning briefing and late-task alerts are recorded here." />
        ) : (
          <GlassCard className="divide-y p-0">
            {logs.data!.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {KIND[l.kind]} <span className="font-normal text-muted">to {l.toName}</span>
                  </p>
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[l.status].cls)}>{STATUS[l.status].label}</span>
                    <span className="num text-xs text-muted">{l.createdAt ? formatPkt(l.createdAt.toDate(), "d MMM, h:mm a") : ""}</span>
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted">{l.status === "failed" && l.error ? l.error : l.text}</p>
              </div>
            ))}
          </GlassCard>
        )}
      </section>
    </>
  );
}
