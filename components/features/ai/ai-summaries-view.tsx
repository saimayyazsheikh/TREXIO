"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ExternalLink, Info, MessageCircleMore, Sparkles } from "lucide-react";
import { limit, orderBy, query, type Timestamp } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { condense, parseSummary, type SummaryStats } from "@/lib/domain/ai-summary";
import { shareLink } from "@/lib/domain/whatsapp-link";
import { formatPkt, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";

type SummaryDoc = {
  weekStart: string;
  weekEnd: string;
  partial: boolean;
  text: string;
  stats: SummaryStats;
  provider: "anthropic" | "gemini" | "mock";
  model: string;
  trigger: "cron" | "manual";
  createdAt: Timestamp;
};

const day = (date: string) => formatPkt(pktInstant(date, "12:00"), "d MMM");

/** The model's text rendered as headings and bullets only. It is never inserted as HTML. */
function SummaryText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parseSummary(text).map((b, i) =>
        b.type === "heading" ? (
          <h3 key={i} className="mt-4 font-display text-base font-semibold first:mt-0">
            {b.text}
          </h3>
        ) : b.type === "bullets" ? (
          <ul key={i} className="list-disc space-y-1.5 pl-5 text-sm marker:text-muted">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-sm">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}

function Figures({ stats }: { stats: SummaryStats }) {
  const k = stats.kpis;
  const items = [
    ["Completed", `${k.completedPct}%`],
    ["On time", `${k.onTimePct}%`],
    ["Active per day", `${k.avgActiveHours}h`],
    ["Journals", `${k.journalPct}%`],
    ["Blocked", String(k.blocked)],
  ];
  return (
    <dl className="my-3 flex flex-wrap gap-x-6 gap-y-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="num font-display text-lg font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Meta({ s }: { s: SummaryDoc }) {
  return (
    <p className="num text-xs text-muted">
      {s.provider === "mock" ? "Written by the built-in template" : `Written by ${s.model}`} · {s.trigger === "cron" ? "scheduled" : "on request"} · {s.createdAt ? formatPkt(s.createdAt.toDate(), "EEE d MMM, h:mm a") : ""}
    </p>
  );
}

export function AiSummariesView() {
  const { db } = getFirebase();
  const q = useMemo(() => query(orgCollection(db, "aiSummaries"), orderBy("createdAt", "desc"), limit(20)), [db]);
  const list = useCollection<SummaryDoc>(q);
  const [busy, setBusy] = useState<"last-week" | "this-week" | null>(null);

  async function generate(which: "last-week" | "this-week") {
    setBusy(which);
    try {
      await apiFetch("/api/admin/ai-summaries", "POST", { which });
      toast.success(which === "last-week" ? "Last week's summary is ready." : "Summary of this week so far is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't write the summary. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const [latest, ...older] = list.data ?? [];
  const mock = latest?.provider === "mock";

  return (
    <>
      <PageHeader
        title="AI summaries"
        subtitle="A short weekly read on how the teams did: highlights, bottlenecks and what to do next. Written every Monday."
        actions={
          <>
            <Button variant="secondary" loading={busy === "this-week"} disabled={busy !== null} onClick={() => generate("this-week")}>
              <CalendarRange aria-hidden /> Week so far
            </Button>
            <Button loading={busy === "last-week"} disabled={busy !== null} onClick={() => generate("last-week")}>
              <Sparkles aria-hidden /> Summarize last week
            </Button>
          </>
        }
      />

      {mock ? (
        <p role="note" className="mb-4 flex gap-2 rounded-control bg-info/10 px-3 py-2 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          No AI key is set, so these are written by a built-in template from your real figures. Add an ANTHROPIC_API_KEY or GEMINI_API_KEY on the server for written-by-AI summaries.
        </p>
      ) : null}

      {list.error ? (
        <ErrorState onRetry={list.retry} />
      ) : list.loading ? (
        <div aria-busy aria-label="Loading summaries" className="space-y-3">
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : !latest ? (
        <EmptyState
          icon={Sparkles}
          title="No summaries yet"
          description="The first one is written on Monday morning. You can also write one now from last week's figures."
          action={
            <Button loading={busy === "last-week"} disabled={busy !== null} onClick={() => generate("last-week")}>
              <Sparkles aria-hidden /> Summarize last week
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <GlassCard className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold">
                {day(latest.weekStart)} to {day(latest.weekEnd)}
              </h2>
              {latest.partial ? <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">Week so far</span> : null}
            </div>
            <Meta s={latest} />
            <Figures stats={latest.stats} />
            <SummaryText text={latest.text} />
            <Button asChild variant="secondary" size="sm" className="mt-5">
              <a href={shareLink(`Traxio weekly summary, ${day(latest.weekStart)} to ${day(latest.weekEnd)}: ${condense(latest.text, 1200)}`)} target="_blank" rel="noopener noreferrer">
                <MessageCircleMore aria-hidden /> Share on WhatsApp <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
          </GlassCard>

          {older.length > 0 ? (
            <section aria-labelledby="earlier">
              <h2 id="earlier" className="mb-2 font-display text-lg font-semibold">
                Earlier weeks
              </h2>
              <ul className="space-y-2">
                {older.map((s) => (
                  <li key={s.id}>
                    <GlassCard className="p-0">
                      <details className="group">
                        <summary className={cn("flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3")}>
                          <span className="font-medium">
                            {day(s.weekStart)} to {day(s.weekEnd)}
                            {s.partial ? <span className="ml-2 text-xs font-semibold text-warning">week so far</span> : null}
                          </span>
                          <span className="num text-sm text-muted">{s.stats.kpis.completedPct}% completed</span>
                        </summary>
                        <div className="border-t border-border-solid px-4 pb-4 pt-2">
                          <Meta s={s} />
                          <Figures stats={s.stats} />
                          <SummaryText text={s.text} />
                        </div>
                      </details>
                    </GlassCard>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
