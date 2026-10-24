"use client";

import { useEffect, useState } from "react";
import { BellRing, CalendarClock, CircleCheck, Info, MessageCircleMore, Play } from "lucide-react";
import { setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ManualBriefing } from "@/components/features/automation/manual-briefing";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { useGlobalSettings } from "@/hooks/use-global-settings";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgDocument } from "@/lib/firebase/org";
import { DEFAULT_SETTINGS, SETTINGS_PATH, settingsSchema, type AutomationSettings } from "@/lib/domain/automation";

type Draft = Omit<Record<keyof AutomationSettings, string>, "briefingEnabled"> & { briefingEnabled: boolean };
const toDraft = (s: AutomationSettings): Draft => ({
  escalationL1Min: String(s.escalationL1Min),
  escalationL2Min: String(s.escalationL2Min),
  briefingEnabled: s.briefingEnabled,
  promptMinute: String(s.promptMinute),
  idleMin: String(s.idleMin),
});

const num = (text: string) => (text.trim() === "" ? NaN : Number(text));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Outcome = { done: boolean; text: string };

/** Says in plain words what a "Run now" press did, including when the honest answer is "nothing to do". */
function lateTasksOutcome(r: Record<string, number>): Outcome {
  if (r.checked === 0) return { done: false, text: "No late tasks right now, so nobody needed an alert." };
  const head = `Looked at ${plural(r.checked, "late task", "late tasks")}.`;
  if (r.level1 + r.level2 === 0) return { done: false, text: `${head} Everyone was already alerted, or is on leave or a day off, so nothing new was sent.` };
  return { done: true, text: `${head} Sent ${plural(r.level1, "first alert", "first alerts")} to the people and ${plural(r.level2, "second alert", "second alerts")} to you.` };
}

function briefingOutcome(r: Record<string, number>): Outcome {
  if (r.eligible + r.skipped === 0) return { done: false, text: "Nobody to brief. Check that the 9:00 AM briefing is switched on above and that you have active team members." };
  const failed = r.failed > 0 ? ` ${plural(r.failed, "person couldn't", "people couldn't")} be reached.` : "";
  if (r.sent === 0) return { done: false, text: `Nobody new to brief: the ${plural(r.skipped, "person was", "people were")} already briefed today, on leave, or not working today.${failed}` };
  const skipped = r.skipped > 0 ? ` ${plural(r.skipped, "person was", "people were")} skipped (already briefed, on leave, or not working today).` : "";
  return { done: true, text: `Briefing sent to ${plural(r.sent, "person", "people")}.${skipped}${failed}` };
}

export function AutomationSettingsView() {
  const { db } = getFirebase();
  const { settings, loading, error: settingsError, retry } = useGlobalSettings();

  const [draft, setDraft] = useState<Draft>(toDraft(DEFAULT_SETTINGS));
  const [errors, setErrors] = useState<Partial<Record<keyof AutomationSettings, string>>>({});
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => setDraft(toDraft(settings)), [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse({
      escalationL1Min: num(draft.escalationL1Min),
      escalationL2Min: num(draft.escalationL2Min),
      briefingEnabled: draft.briefingEnabled,
      promptMinute: num(draft.promptMinute),
      idleMin: num(draft.idleMin),
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
      await setDoc(orgDocument(db, SETTINGS_PATH), parsed.data);
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
      const result = job === "escalations" ? lateTasksOutcome(r) : briefingOutcome(r);
      setOutcome(result);
      toast.success(result.text);
    } catch (err) {
      setOutcome(null);
      toast.error(err instanceof Error ? err.message : "Couldn't run that right now.");
    } finally {
      setRunning(null);
    }
  }

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
            <p className="mb-4 text-sm text-muted">A task that is still To-Do or In Progress after its due time raises two alerts, each only once. Holidays, closures and approved leave pause them. Alerts show in the bell, and as a browser notification for anyone who turned those on.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="l1" label="First alert after (minutes late)" required hint="Tells the person." error={errors.escalationL1Min}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.escalationL1Min} onChange={(e) => set("escalationL1Min", e.target.value)} />}
              </Field>
              <Field id="l2" label="Second alert after (minutes late)" required hint="Tells you." error={errors.escalationL2Min}>
                {(aria) => <Input {...aria} inputMode="numeric" value={draft.escalationL2Min} onChange={(e) => set("escalationL2Min", e.target.value)} />}
              </Field>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
              <CalendarClock className="size-5 text-brand-text" aria-hidden /> Daily rhythm
            </h2>
            <p className="mb-4 text-sm text-muted">At 9:00 AM Pakistan time on working days, each person who isn&apos;t on leave gets a notification with what is on for the day.</p>
            <label className="mb-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={draft.briefingEnabled} onChange={(e) => set("briefingEnabled", e.target.checked)} />
              Send the 9:00 AM briefing
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
        <p className="mb-3 text-sm text-muted">These normally run by themselves. Running one early is safe: nobody is told twice.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={running === "escalations"} onClick={() => run("escalations")}>
            <Play aria-hidden /> Check for late tasks
          </Button>
          <Button variant="secondary" loading={running === "briefing"} onClick={() => run("briefing")}>
            <Play aria-hidden /> Send today&apos;s briefing
          </Button>
        </div>
        {outcome ? (
          <p role="status" className="mt-3 flex items-start gap-2.5 rounded-control border border-border-solid bg-surface-solid px-3.5 py-3 text-sm">
            {outcome.done ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />}
            <span>{outcome.text}</span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="wa-briefing" className="mt-10">
        <h2 id="wa-briefing" className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
          <MessageCircleMore className="size-5 text-brand-text" aria-hidden /> Briefing on WhatsApp
        </h2>
        <p className="mb-3 text-sm text-muted">Traxio doesn&apos;t send WhatsApp messages by itself. Press a person&apos;s button and WhatsApp opens on their chat with today&apos;s list typed in; you just press send.</p>
        <ManualBriefing />
      </section>
    </>
  );
}
