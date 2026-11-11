"use client";

import { useMemo, useState } from "react";
import { Archive, CalendarClock, CalendarPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { addDoc, deleteDoc, limit, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { GlassCard } from "@/components/features/glass-card";
import { PageHeader } from "@/components/features/page-header";
import { pill } from "@/components/features/badges";
import { TaskSheet } from "@/components/features/tasks/task-sheet";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { formatPkt, pktDateString } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { BusinessDoc, DumpTaskDoc, UserDoc, WithId } from "@/types/models";

const dayLabel = (date: string) => formatPkt(new Date(`${date}T12:00:00+05:00`), "EEE d MMM");

type Editing = { item: WithId<DumpTaskDoc> | null };

/**
 * Dump tasks: the admin's own list of things remembered now but meant for later. Nothing here reaches the team. When the day
 * comes, "Schedule" turns an entry into a real task (pick the day and who), and it leaves the list.
 */
export function DumpView() {
  const { db } = getFirebase();
  const today = pktDateString();
  const dumpQ = useMemo(() => query(orgCollection(db, "dumpTasks"), orderBy("createdAt", "desc"), limit(300)), [db]);
  const usersQ = useMemo(() => query(orgCollection(db, "users"), where("role", "==", "employee")), [db]);
  const businessesQ = useMemo(() => query(orgCollection(db, "businesses"), orderBy("createdAt", "asc")), [db]);
  const dump = useCollection<DumpTaskDoc>(dumpQ);
  const users = useCollection<UserDoc>(usersQ);
  const businesses = useCollection<BusinessDoc>(businessesQ);

  const [title, setTitle] = useState("");
  const [remindOn, setRemindOn] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  // A copy taken when "Schedule" is pressed, so live updates to the list never reset the form while it is open.
  const [scheduling, setScheduling] = useState<{ dumpId: string; title: string; description: string; date: string } | null>(null);

  const items = dump.data ?? [];
  const due = items.filter((d) => d.remindOn && d.remindOn <= today).sort((a, b) => (a.remindOn ?? "").localeCompare(b.remindOn ?? ""));
  const later = items.filter((d) => d.remindOn && d.remindOn > today).sort((a, b) => (a.remindOn ?? "").localeCompare(b.remindOn ?? ""));
  const undated = items.filter((d) => !d.remindOn);

  const error = dump.error ?? users.error ?? businesses.error;
  const loading = dump.loading || users.loading || businesses.loading;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (t.length < 2) return toast.error("Write a few words about the task first.");
    setAdding(true);
    try {
      await addDoc(orgCollection(db, "dumpTasks"), { title: t, note: "", remindOn: remindOn || null, createdAt: serverTimestamp() });
      setTitle("");
      setRemindOn("");
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally {
      setAdding(false);
    }
  }

  async function remove(item: WithId<DumpTaskDoc>) {
    try {
      await deleteDoc(orgDocument(db, "dumpTasks", item.id));
      toast.success("Removed from the dump");
    } catch {
      toast.error("Couldn't remove that. Try again.");
    }
  }

  const row = (d: WithId<DumpTaskDoc>) => (
    <li key={d.id}>
      <GlassCard className="flex flex-wrap items-start gap-x-3 gap-y-2 p-4">
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold leading-snug">{d.title}</p>
          {d.note ? <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{d.note}</p> : null}
          {d.remindOn ? (
            <span className={cn(pill, "mt-2", d.remindOn <= today ? "bg-warning/15 text-warning" : "bg-surface-raised text-muted")}>
              <CalendarClock className="size-3.5" aria-hidden /> {d.remindOn < today ? `Was for ${dayLabel(d.remindOn)}` : d.remindOn === today ? "For today" : `Remind me ${dayLabel(d.remindOn)}`}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={() => setScheduling({ dumpId: d.id, title: d.title, description: d.note, date: d.remindOn && d.remindOn >= today ? d.remindOn : today })}>
            <CalendarPlus aria-hidden /> Schedule
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Edit “${d.title}”`} onClick={() => setEditing({ item: d })}>
            <Pencil aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Delete “${d.title}”`} onClick={() => void remove(d)}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </GlassCard>
    </li>
  );

  const section = (heading: string, hint: string, list: WithId<DumpTaskDoc>[], tone?: string) =>
    list.length > 0 ? (
      <section aria-label={heading}>
        <h2 className={cn("font-display text-lg font-semibold", tone)}>
          {heading} <span className="num text-sm font-normal text-muted">({list.length})</span>
        </h2>
        <p className="mb-3 text-sm text-muted">{hint}</p>
        <ul className="space-y-3">{list.map(row)}</ul>
      </section>
    ) : null;

  return (
    <>
      <PageHeader title="Dump tasks" subtitle="Write down things you remember now but will give out later. Your team never sees this list." />

      <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-border-solid p-4">
        <div className="min-w-0 flex-1 basis-60">
          <Field id="dump-title" label="What do you need to remember?">
            {(aria) => <Input {...aria} autoComplete="off" maxLength={120} placeholder="For example: ask Ahmed about the paint order" value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
        </div>
        <div className="w-44">
          <Field id="dump-date" label="Remind me on" hint="Optional">
            {(aria) => <Input {...aria} type="date" min={today} value={remindOn} onChange={(e) => setRemindOn(e.target.value)} />}
          </Field>
        </div>
        <Button type="submit" loading={adding} className="mb-[1.625rem]">
          <Plus aria-hidden /> Add to dump
        </Button>
      </form>

      {error ? (
        <ErrorState onRetry={() => { dump.retry(); users.retry(); businesses.retry(); }} />
      ) : loading ? (
        <div aria-busy aria-label="Loading your dump" className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Archive} title="Nothing in the dump" description="When a task crosses your mind but it isn't for today, write it above. When its day comes, press Schedule to hand it to someone." />
      ) : (
        <div className="space-y-8">
          {section("Time to schedule", "You asked to be reminded about these today or earlier.", due, "text-warning")}
          {section("Not dated yet", "Waiting until you decide the day and who it is for.", undated)}
          {section("Later", "Reminders you set for another day.", later)}
        </div>
      )}

      <DumpEditDialog target={editing} onClose={() => setEditing(null)} />
      <TaskSheet
        open={scheduling !== null}
        onOpenChange={(o) => !o && setScheduling(null)}
        employees={users.data ?? []}
        businesses={businesses.data ?? []}
        prefill={scheduling ?? undefined}
      />
    </>
  );
}

function DumpEditDialog({ target, onClose }: { target: Editing | null; onClose: () => void }) {
  const item = target?.item ?? null;
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Edit dump task</DialogTitle>
        <DialogDescription>Only you can see this.</DialogDescription>
        {/* Keyed by the entry, so each one opens with its own words. */}
        {item ? <DumpEditForm key={item.id} item={item} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DumpEditForm({ item, onClose }: { item: WithId<DumpTaskDoc>; onClose: () => void }) {
  const { db } = getFirebase();
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note);
  const [remindOn, setRemindOn] = useState(item.remindOn ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (title.trim().length < 2) return toast.error("Give it a short title.");
    setBusy(true);
    try {
      await updateDoc(orgDocument(db, "dumpTasks", item.id), { title: title.trim(), note: note.trim(), remindOn: remindOn || null });
      toast.success("Saved");
      onClose();
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-4">
        <Field id="dump-edit-title" label="Title" required>
          {(aria) => <Input {...aria} maxLength={120} autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field id="dump-edit-note" label="Details" hint="Optional. It carries over when you schedule it.">
          {(aria) => (
            <textarea
              {...aria}
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
            />
          )}
        </Field>
        <Field id="dump-edit-date" label="Remind me on" hint="Optional">
          {(aria) => <Input {...aria} type="date" value={remindOn} onChange={(e) => setRemindOn(e.target.value)} />}
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </>
  );
}
