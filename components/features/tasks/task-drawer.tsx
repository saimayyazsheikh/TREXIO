"use client";

import { useMemo, useState } from "react";
import { Check, Hand, Link2, MessageCircleMore, Paperclip, Pencil, Repeat } from "lucide-react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { BusinessChip, PriorityBadge, StatusBadge } from "@/components/features/badges";
import { DueChip } from "@/components/features/tasks/due-chip";
import { NudgeDialog } from "@/components/features/tasks/nudge-dialog";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { describeAudit } from "@/lib/domain/audit-text";
import { TASK_STATUS_LABEL, type Role, type TaskStatus } from "@/lib/domain/constants";
import { availableMoves } from "@/lib/domain/task-moves";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, TaskDoc, WithId } from "@/types/models";
import type { Timestamp } from "firebase/firestore";

type AuditDoc = { action: string; actorName: string; from: string | null; to: string | null; meta: Record<string, unknown>; createdAt: Timestamp };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Timeline({ taskId }: { taskId: string }) {
  const q = useMemo(() => query(collection(getFirebase().db, "auditLogs"), where("entityId", "==", taskId), orderBy("createdAt", "desc"), limit(30)), [taskId]);
  const log = useCollection<AuditDoc>(q);
  if (log.loading) return <Skeleton className="h-20 rounded-control" />;
  if (log.error) return <p className="text-sm text-danger">Couldn&apos;t load the history.</p>;
  if (!log.data?.length) return <p className="text-sm text-muted">No history yet.</p>;
  return (
    <ol className="space-y-2.5 border-l pl-4">
      {log.data.map((e) => (
        <li key={e.id} className="relative text-sm">
          <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-brand" />
          <p>{describeAudit(e)}</p>
          <p className="num text-xs text-muted">{formatPkt(e.createdAt.toDate(), "d MMM, h:mm a")}</p>
        </li>
      ))}
    </ol>
  );
}

export function TaskDrawer({
  task,
  status,
  viewer,
  business,
  now,
  today,
  savingSubtasks,
  onClose,
  onMove,
  onBlock,
  onToggleSubtask,
  onEdit,
}: {
  task: WithId<TaskDoc> | null;
  status: TaskStatus;
  viewer: { uid: string; role: Role };
  business?: WithId<BusinessDoc>;
  now: Date;
  today: string;
  savingSubtasks: ReadonlySet<string>;
  onClose: () => void;
  onMove: (task: WithId<TaskDoc>, status: TaskStatus, opts?: { kind?: "untick" }) => void;
  onBlock: (task: WithId<TaskDoc>) => void;
  onToggleSubtask: (task: WithId<TaskDoc>, subtaskId: string, done: boolean) => void;
  /** Admin only. */
  onEdit?: (task: WithId<TaskDoc>) => void;
}) {
  const moves = task ? availableMoves({ ...task, status }, viewer) : [];
  const locked = status === "completed" || status === "under_review";
  const waiting = task?.waitingOnIds ?? [];
  const [nudgeUid, setNudgeUid] = useState<string | null>(null);

  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      {task ? (
        <SheetContent
          title={task.title}
          description={task.kind === "daily" ? "Daily routine task" : "One-off task"}
          footer={
            <>
              {viewer.role === "admin" && onEdit && task.kind === "oneoff" ? (
                <Button variant="secondary" onClick={() => onEdit(task)}>
                  <Pencil aria-hidden /> Edit task
                </Button>
              ) : null}
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <PriorityBadge priority={task.priority} />
              <DueChip task={task} status={status} now={now} today={today} />
              {business ? <BusinessChip name={business.name} color={business.color} /> : null}
              {task.kind === "daily" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                  <Repeat className="size-3.5" aria-hidden /> Daily
                </span>
              ) : null}
            </div>

            {status === "blocked" && task.blockedReason ? <p className="rounded-control bg-status-blocked/15 px-3 py-2 text-sm text-status-blocked">Blocked: {task.blockedReason}</p> : null}
            {status === "under_review" ? <p className="rounded-control bg-status-review/15 px-3 py-2 text-sm text-status-review">Finished and waiting for review.</p> : null}

            <Section title="Move it">
              <div className="flex flex-wrap gap-2">
                {moves.length === 0 ? <p className="text-sm text-muted">{viewer.role === "employee" && status === "under_review" ? "Waiting for your admin to review it." : "No moves available right now."}</p> : null}
                {moves.map((m) => {
                  const label = m.kind === "untick" ? "Take back my part" : m.status === "blocked" ? "I'm blocked" : `Move to ${TASK_STATUS_LABEL[m.status]}`;
                  const button = (
                    <Button
                      key={`${m.status}-${m.kind ?? ""}`}
                      variant={m.status === "blocked" ? "ghost" : "secondary"}
                      size="sm"
                      aria-disabled={!m.enabled}
                      className={cn(!m.enabled && "opacity-60")}
                      onClick={() => (m.status === "blocked" && m.enabled ? onBlock(task) : onMove(task, m.status, m.kind ? { kind: m.kind } : undefined))}
                    >
                      {m.status === "blocked" ? <Hand aria-hidden /> : null}
                      {label}
                    </Button>
                  );
                  return m.reason ? (
                    <Tooltip key={`${m.status}-${m.kind ?? ""}`} label={m.reason}>
                      {button}
                    </Tooltip>
                  ) : (
                    button
                  );
                })}
              </div>
            </Section>

            {task.description ? (
              <Section title="Details">
                <p className="whitespace-pre-line text-sm">{task.description}</p>
              </Section>
            ) : null}

            <Section title={task.assigneeIds.length > 1 ? `People (${task.completionMode === "all" ? "everyone must finish" : "first to finish completes it"})` : "Assigned to"}>
              <ul className="space-y-1">
                {task.assigneeIds.map((uid) => (
                  <li key={uid} className="flex items-center gap-2 text-sm">
                    <span className={cn("flex size-5 items-center justify-center rounded-full", task.completion[uid]?.done ? "bg-success text-background" : "border border-input")}>
                      {task.completion[uid]?.done ? <Check className="size-3.5" aria-hidden /> : null}
                    </span>
                    {task.assigneeNames[uid] ?? "Teammate"}
                    {task.completion[uid]?.done ? <span className="text-muted">finished their part</span> : null}
                    {viewer.role === "admin" && status !== "completed" && !task.completion[uid]?.done ? (
                      <Tooltip label="Send a WhatsApp nudge">
                        <Button variant="ghost" size="icon" className="ml-auto size-9" aria-label={`Send ${task.assigneeNames[uid] ?? "them"} a WhatsApp nudge`} onClick={() => setNudgeUid(uid)}>
                          <MessageCircleMore aria-hidden />
                        </Button>
                      </Tooltip>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>

            {waiting.length > 0 || task.dependsOnIds.length > 0 ? (
              <Section title="Depends on">
                <ul className="space-y-1">
                  {task.dependsOnIds.map((id) => (
                    <li key={id} className="flex items-center gap-2 text-sm">
                      <Link2 className="size-4 text-muted" aria-hidden />
                      {task.linkTitles[id] ?? "Another task"}
                      <span className={cn("text-xs font-semibold", waiting.includes(id) ? "text-warning" : "text-success")}>{waiting.includes(id) ? "Not finished yet" : "Done"}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {task.relatedTaskIds.length > 0 ? (
              <Section title="Related tasks">
                <ul className="space-y-1">
                  {task.relatedTaskIds.map((id) => (
                    <li key={id} className="flex items-center gap-2 text-sm">
                      <Link2 className="size-4 text-muted" aria-hidden />
                      {task.linkTitles[id] ?? "Another task"}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {task.subtaskTotal > 0 ? (
              <Section title={`Checklist ${task.subtaskDone}/${task.subtaskTotal}`}>
                <ul className="space-y-1">
                  {task.subtasks.map((s) => (
                    <li key={s.id}>
                      <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-surface-raised", locked && "cursor-not-allowed opacity-70")}>
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--brand-from)]"
                          checked={s.done}
                          disabled={locked || savingSubtasks.has(s.id)}
                          onChange={(e) => onToggleSubtask(task, s.id, e.target.checked)}
                        />
                        <span className={cn("text-sm", s.done && "text-muted line-through")}>{s.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {locked ? <p className="mt-1 text-sm text-muted">Reopen the task to change its checklist.</p> : null}
              </Section>
            ) : null}

            {task.attachments.length > 0 ? (
              <Section title="Attachments">
                <ul className="flex flex-wrap gap-2">
                  {task.attachments.map((a) => (
                    <li key={a.url}>
                      <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-solid px-3 text-sm text-brand-text hover:bg-surface-raised">
                        <Paperclip className="size-3.5" aria-hidden /> {a.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {viewer.role === "admin" ? (
              <Section title="History">
                <Timeline taskId={task.id} />
              </Section>
            ) : null}
          </div>
        </SheetContent>
      ) : null}
      {task && viewer.role === "admin" ? <NudgeDialog task={task} open={nudgeUid !== null} onOpenChange={(o) => !o && setNudgeUid(null)} defaultUid={nudgeUid ?? undefined} /> : null}
    </Sheet>
  );
}
