"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, CalendarDays, Check, Clock, Flame, Minus, ArrowDown, Pencil, Send, Sparkles, UserRound, X } from "lucide-react";
import { addDoc, limit, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { pill } from "@/components/features/badges";
import { ActionCard } from "@/components/features/assistant/action-card";
import { TaskSheet } from "@/components/features/tasks/task-sheet";
import { useCollection } from "@/hooks/use-collection";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { MAX_ASSISTANT_MESSAGE, type AssistantAnswer, type ProposedAlert, type ProposedTask } from "@/lib/domain/assistant";
import type { ProposedAction } from "@/lib/domain/assistant-actions";
import { PRIORITY_LABEL, type Priority } from "@/lib/domain/constants";
import { formatPkt, pktDateString, pktInstant } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, UserDoc } from "@/types/models";

export const OPEN_ASSISTANT_EVENT = "traxio:open-assistant";

const EXAMPLES = [
  "Kal subah 10 baje Ali ko stock count karwana hai, high priority",
  "Remind me to ask Ahmed about the paint order",
  "Agar Sara ka invoices wala task 15 minute late ho to mujhe batana",
  "Sara ko Friday tak invoices bhejne hain: check, send, confirm",
  "Sara ki leave approve kar do",
  "Sab ko bata do kal dukan band hai",
  "Daily report kholo",
  "Who has the most free time this week?",
];

const PRIORITY_ICON = { high: Flame, medium: Minus, low: ArrowDown } as const;

type Status = "ready" | "creating" | "created" | "failed" | "skipped";
type Entry = { id: number; text: string; answer?: AssistantAnswer; error?: string; status: Record<string, Status>; failure: Record<string, string>; done: Record<string, string> };

/** "Confirm all" only takes the harmless cards: nothing that deletes, turns someone off, or needs a password. Those are pressed one by one. */
const canConfirmAll = (a: ProposedAction) => !!a.payload && a.issues.length === 0 && !a.danger && !a.needsPassword && a.kind !== "open.page";

const dayLabel = (date: string) => formatPkt(pktInstant(date, "12:00"), "EEE d MMM");

function ProposalCard({ p, status, failure, busy, onCreate, onEdit, onSkip }: { p: ProposedTask; status: Status; failure?: string; busy: boolean; onCreate: () => void; onEdit: () => void; onSkip: () => void }) {
  const Icon = PRIORITY_ICON[p.priority];
  const blocked = p.issues.length > 0;
  return (
    <li className={cn("rounded-card border p-3", status === "created" ? "border-success/40 bg-success/6" : status === "skipped" ? "border-border-solid opacity-60" : blocked || status === "failed" ? "border-danger/40" : "border-border-solid")}>
      <div className="flex items-start gap-2">
        <p className={cn("min-w-0 flex-1 font-semibold leading-snug", status === "skipped" && "line-through")}>{p.title}</p>
        {status === "created" ? (
          <span className={cn(pill, "bg-success/14 text-success")}>
            <Check className="size-3.5" aria-hidden /> {p.dump ? "In dump" : "Created"}
          </span>
        ) : null}
      </div>
      {p.description ? <p className="mt-0.5 text-sm text-muted">{p.description}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {p.dump ? (
          <>
            <span className={cn(pill, "bg-surface-raised text-muted")}>Goes to Dump tasks</span>
            {p.remindOn ? (
              <span className={cn(pill, "bg-surface-raised")}>
                <CalendarDays className="size-3.5" aria-hidden /> Remind me {dayLabel(p.remindOn)}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className={cn(pill, "bg-surface-raised")}>
              <CalendarDays className="size-3.5" aria-hidden /> {p.date ? dayLabel(p.date) : "No day"}
            </span>
            {p.dueTime ? (
              <span className={cn(pill, "bg-surface-raised")}>
                <Clock className="size-3.5" aria-hidden /> {p.dueTime}
              </span>
            ) : null}
            <span className={cn(pill, "bg-surface-raised")}>
              <Icon className="size-3.5" aria-hidden /> {PRIORITY_LABEL[p.priority as Priority]}
            </span>
            <span className={cn(pill, "bg-surface-raised")}>
              <UserRound className="size-3.5" aria-hidden /> {p.assigneeNames.length ? p.assigneeNames.join(", ") : "Nobody yet"}
            </span>
          </>
        )}
      </div>
      {p.steps.length > 0 ? <p className="mt-2 text-xs text-muted">Steps: {p.steps.join(" · ")}</p> : null}

      {p.issues.map((issue) => (
        <p key={issue} className="mt-2 rounded-control bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          {issue}
        </p>
      ))}
      {failure ? <p className="mt-2 rounded-control bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{failure}</p> : null}

      {status !== "created" && status !== "skipped" ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
            <X aria-hidden /> Skip
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={onEdit}>
            <Pencil aria-hidden /> Edit
          </Button>
          <Button size="sm" loading={status === "creating"} disabled={busy || blocked} onClick={onCreate}>
            <Check aria-hidden /> {p.dump ? "Add to dump" : "Create"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function AlertCard({ a, minutes, onMinutes, status, failure, busy, onCreate, onSkip }: { a: ProposedAlert; minutes: number; onMinutes: (m: number) => void; status: Status; failure?: string; busy: boolean; onCreate: () => void; onSkip: () => void }) {
  const invalid = a.issues.length > 0 || !(minutes >= 5 && minutes <= 1440);
  return (
    <li className={cn("rounded-card border p-3", status === "created" ? "border-success/40 bg-success/6" : status === "skipped" ? "border-border-solid opacity-60" : invalid || status === "failed" ? "border-danger/40" : "border-border-solid")}>
      <div className="flex items-start gap-2">
        <AlarmClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tell me when this is late</p>
          <p className={cn("font-semibold leading-snug", status === "skipped" && "line-through")}>{a.taskTitle}</p>
        </div>
        {status === "created" ? (
          <span className={cn(pill, "bg-success/14 text-success")}>
            <Check className="size-3.5" aria-hidden /> Alert set
          </span>
        ) : null}
      </div>
      {a.assigneeNames.length || a.dueLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {a.assigneeNames.length ? (
            <span className={cn(pill, "bg-surface-raised")}>
              <UserRound className="size-3.5" aria-hidden /> {a.assigneeNames.join(", ")}
            </span>
          ) : null}
          {a.dueLabel ? (
            <span className={cn(pill, "bg-surface-raised")}>
              <Clock className="size-3.5" aria-hidden /> Due {a.dueLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {a.taskId && status !== "created" && status !== "skipped" ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          Alert me when it is
          <Input type="number" inputMode="numeric" min={5} max={1440} value={minutes} onChange={(e) => onMinutes(Number(e.target.value))} className="w-24" aria-label="Minutes late" />
          minutes late
        </label>
      ) : null}

      {a.issues.map((issue) => (
        <p key={issue} className="mt-2 rounded-control bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          {issue}
        </p>
      ))}
      {failure ? <p className="mt-2 rounded-control bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{failure}</p> : null}

      {status !== "created" && status !== "skipped" ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
            <X aria-hidden /> Skip
          </Button>
          <Button size="sm" loading={status === "creating"} disabled={busy || invalid || !a.taskId} onClick={onCreate}>
            <Check aria-hidden /> Set alert
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Write what you need in plain words (English, Urdu or Roman Urdu). The assistant lays out the tasks it understood, and nothing
 * is created until you press Create. Every task goes through the same checks as the normal Assign form.
 */
export function AssistantPanel() {
  const { db } = getFirebase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<{ entry: number; p: ProposedTask } | null>(null);
  const [wasOpened, setWasOpened] = useState(false);
  /** Minutes the admin typed on an alert card, keyed by entry and alert. */
  const [alertMinutes, setAlertMinutes] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // The team is only read once the panel has been opened (the Edit form needs it).
  const usersQ = useMemo(() => (wasOpened ? query(orgCollection(db, "users"), where("role", "==", "employee")) : null), [db, wasOpened]);
  const businessesQ = useMemo(() => (wasOpened ? query(orgCollection(db, "businesses"), orderBy("createdAt", "asc"), limit(50)) : null), [db, wasOpened]);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (open) setWasOpened(true);
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [entries.length, busy]);

  // Kept stable while the form is open, so a refresh of the team list never wipes what you are typing there.
  const editPrefill = useMemo(
    () =>
      editing
        ? { title: editing.p.title, description: editing.p.description, date: editing.p.date ?? pktDateString(), priority: editing.p.priority, dueTime: editing.p.dueTime, assigneeIds: editing.p.assigneeIds, subtasks: editing.p.steps, onCreated: () => setStatus(editing.entry, editing.p.key, "created") }
        : undefined,
    // setStatus only touches state, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing],
  );

  const patch = (id: number, fn: (e: Entry) => Entry) => setEntries((list) => list.map((e) => (e.id === id ? fn(e) : e)));
  const setStatus = (id: number, key: string, status: Status, failure = "") => patch(id, (e) => ({ ...e, status: { ...e.status, [key]: status }, failure: { ...e.failure, [key]: failure } }));

  async function send(message: string) {
    const t = message.trim();
    if (!t || busy) return;
    const id = nextId.current++;
    setText("");
    setBusy(true);
    setEntries((list) => [...list, { id, text: t, status: {}, failure: {}, done: {} }]);
    try {
      const answer = await apiFetch<AssistantAnswer>("/api/admin/assistant", "POST", { message: t });
      patch(id, (e) => ({ ...e, answer, status: Object.fromEntries([...answer.proposals, ...answer.alerts, ...answer.actions].map((p) => [p.key, "ready" as Status])) }));
    } catch (error) {
      patch(id, (e) => ({ ...e, error: error instanceof Error ? error.message : "Something went wrong. Please try again." }));
    } finally {
      setBusy(false);
    }
  }

  /** One proposal becomes a real task (through the normal route) or a dump entry. Returns whether it worked. */
  async function create(entryId: number, p: ProposedTask): Promise<boolean> {
    setStatus(entryId, p.key, "creating");
    try {
      if (p.dump) {
        await addDoc(orgCollection(db, "dumpTasks"), { title: p.title, note: p.description, remindOn: p.remindOn, businessId: null, createdAt: serverTimestamp() });
      } else {
        await apiFetch("/api/admin/tasks", "POST", {
          title: p.title,
          description: p.description,
          priority: p.priority,
          date: p.date,
          dueTime: p.dueTime,
          assigneeIds: p.assigneeIds,
          subtasks: p.steps,
          requiresReview: false,
          completionMode: "all",
          dependsOnIds: [],
          relatedTaskIds: [],
        });
      }
      setStatus(entryId, p.key, "created");
      return true;
    } catch (error) {
      setStatus(entryId, p.key, "failed", error instanceof Error ? error.message : "Couldn't create it.");
      return false;
    }
  }

  /** One confirmed card (a change to something that exists, people, holidays, settings…). The server checks it again and runs it. */
  async function runAction(entryId: number, a: ProposedAction, password?: string): Promise<boolean> {
    if (!a.payload) return false;
    if (a.payload.kind === "open.page") {
      setStatus(entryId, a.key, "created");
      setOpen(false);
      router.push(a.href ?? "/admin");
      return true;
    }
    setStatus(entryId, a.key, "creating");
    try {
      const result = await apiFetch<{ message: string }>("/api/admin/assistant/do", "POST", { action: a.payload, ...(password ? { password } : {}) });
      patch(entryId, (e) => ({ ...e, status: { ...e.status, [a.key]: "created" }, failure: { ...e.failure, [a.key]: "" }, done: { ...e.done, [a.key]: result.message } }));
      return true;
    } catch (error) {
      setStatus(entryId, a.key, "failed", error instanceof Error ? error.message : "Couldn't do that.");
      return false;
    }
  }

  const minutesOf = (entryId: number, a: ProposedAlert) => alertMinutes[`${entryId}:${a.key}`] ?? a.minutes;

  /** One proposed late alert is set on its task. Returns whether it worked. */
  async function setAlert(entryId: number, a: ProposedAlert): Promise<boolean> {
    setStatus(entryId, a.key, "creating");
    try {
      await apiFetch("/api/admin/tasks/alert", "POST", { taskId: a.taskId, minutes: minutesOf(entryId, a) });
      setStatus(entryId, a.key, "created");
      return true;
    } catch (error) {
      setStatus(entryId, a.key, "failed", error instanceof Error ? error.message : "Couldn't set the alert.");
      return false;
    }
  }

  async function createAll(entry: Entry) {
    const open = (key: string) => ["ready", "failed"].includes(entry.status[key]);
    const todo = (entry.answer?.proposals ?? []).filter((p) => p.issues.length === 0 && open(p.key));
    const alerts = (entry.answer?.alerts ?? []).filter((a) => a.issues.length === 0 && open(a.key));
    const actions = (entry.answer?.actions ?? []).filter((a) => canConfirmAll(a) && open(a.key));
    setCreating(true);
    let ok = 0;
    for (const p of todo) if (await create(entry.id, p)) ok++;
    for (const a of alerts) if (await setAlert(entry.id, a)) ok++;
    for (const a of actions) if (await runAction(entry.id, a)) ok++;
    setCreating(false);
    const total = todo.length + alerts.length + actions.length;
    if (total > 0) toast[ok === total ? "success" : "warning"](`${ok} of ${total} done`);
  }

  const form = (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send(text);
      }}
    >
      <label htmlFor="assistant-input" className="sr-only">
        What do you need?
      </label>
      <textarea
        id="assistant-input"
        rows={2}
        value={text}
        maxLength={MAX_ASSISTANT_MESSAGE}
        placeholder="For example: kal subah Ali ko stock count karwana hai"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send(text);
          }
        }}
        className="w-full resize-none rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">Enter to send, Shift+Enter for a new line</p>
        <Button type="submit" loading={busy} disabled={!text.trim()}>
          <Send aria-hidden /> Send
        </Button>
      </div>
    </form>
  );

  return (
    <>
      <Tooltip label="Write tasks in plain words and let the assistant lay them out">
        <Button variant="secondary" className="hidden h-10 gap-2 px-3 md:inline-flex" onClick={() => setOpen(true)} aria-label="Open the assistant">
          <Sparkles aria-hidden /> <span className="text-sm">Assistant</span>
        </Button>
      </Tooltip>
      <Tooltip label="Assistant">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open the assistant">
          <Sparkles aria-hidden />
        </Button>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Assistant" description="Say what you need in English, Urdu or Roman Urdu. Nothing happens until you confirm it." footer={form}>
          <div className="flex flex-col gap-5" aria-live="polite">
            {entries.length === 0 ? (
              <div>
                <p className="mb-3 text-sm font-medium">Try one of these</p>
                <div className="flex flex-col gap-2">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" onClick={() => void send(ex)} className="rounded-control border border-border-solid px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-raised">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {entries.map((entry) => {
              const ready = [...(entry.answer?.proposals ?? []), ...(entry.answer?.alerts ?? []), ...(entry.answer?.actions ?? []).filter(canConfirmAll)].filter((p) => p.issues.length === 0 && ["ready", "failed"].includes(entry.status[p.key]));
              return (
                <div key={entry.id} className="flex flex-col gap-3">
                  <p className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-brand-fg">{entry.text}</p>
                  {!entry.answer && !entry.error ? <p className="text-sm text-muted">Thinking…</p> : null}
                  {entry.error ? <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">{entry.error}</p> : null}
                  {entry.answer ? (
                    <div className="flex flex-col gap-3">
                      <p className="max-w-[92%] whitespace-pre-line rounded-2xl rounded-bl-md bg-surface-raised px-3.5 py-2 text-sm">{entry.answer.reply}</p>
                      {entry.answer.proposals.length > 0 ? (
                        <ul className="flex flex-col gap-2.5">
                          {entry.answer.proposals.map((p) => (
                            <ProposalCard
                              key={p.key}
                              p={p}
                              status={entry.status[p.key] ?? "ready"}
                              failure={entry.failure[p.key]}
                              busy={creating}
                              onCreate={() => void create(entry.id, p)}
                              onEdit={() => setEditing({ entry: entry.id, p })}
                              onSkip={() => setStatus(entry.id, p.key, "skipped")}
                            />
                          ))}
                        </ul>
                      ) : null}
                      {entry.answer.alerts.length > 0 ? (
                        <ul className="flex flex-col gap-2.5">
                          {entry.answer.alerts.map((a) => (
                            <AlertCard
                              key={a.key}
                              a={a}
                              minutes={minutesOf(entry.id, a)}
                              onMinutes={(m) => setAlertMinutes((s) => ({ ...s, [`${entry.id}:${a.key}`]: m }))}
                              status={entry.status[a.key] ?? "ready"}
                              failure={entry.failure[a.key]}
                              busy={creating}
                              onCreate={() => void setAlert(entry.id, a)}
                              onSkip={() => setStatus(entry.id, a.key, "skipped")}
                            />
                          ))}
                        </ul>
                      ) : null}
                      {entry.answer.actions.length > 0 ? (
                        <ul className="flex flex-col gap-2.5">
                          {entry.answer.actions.map((a) => (
                            <ActionCard
                              key={a.key}
                              a={a}
                              status={entry.status[a.key] ?? "ready"}
                              failure={entry.failure[a.key]}
                              doneMessage={entry.done[a.key]}
                              busy={creating}
                              onConfirm={(password) => void runAction(entry.id, a, password)}
                              onSkip={() => setStatus(entry.id, a.key, "skipped")}
                            />
                          ))}
                        </ul>
                      ) : null}
                      {ready.length > 1 ? (
                        <Button loading={creating} onClick={() => void createAll(entry)}>
                          <Check aria-hidden /> Confirm all {ready.length}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        </SheetContent>
      </Sheet>

      <TaskSheet
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o && editing) setEditing(null);
        }}
        employees={users.data ?? []}
        businesses={businesses.data ?? []}
        prefill={editPrefill}
      />
    </>
  );
}
