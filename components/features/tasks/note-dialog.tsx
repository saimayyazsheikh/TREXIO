"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { commentOnTask } from "@/lib/tasks-client";
import type { TaskDoc, WithId } from "@/types/models";

const MAX = 500;

export type NoteTarget = { task: WithId<TaskDoc>; about: "comment" | "finish" | "step"; subtaskTitle?: string };

/** A short note on a task: after finishing it, after ticking a step, or any time. It reaches your admin with the task. */
export function NoteDialog({ target, onClose }: { target: NoteTarget | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setText("");
  }, [target]);

  const what = target?.about === "step" ? `the step “${target.subtaskTitle}”` : target ? `“${target.task.title}”` : "";

  async function save() {
    if (!target || !text.trim()) return;
    setBusy(true);
    try {
      await commentOnTask(target.task.id, text, target.about, target.subtaskTitle);
      toast.success("Note added.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Add a note</DialogTitle>
        <DialogDescription>{target ? `About ${what}. Your admin will see it on the task.` : ""}</DialogDescription>
        <label htmlFor="task-note" className="sr-only">
          Your note
        </label>
        <textarea
          id="task-note"
          rows={4}
          maxLength={MAX}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="What should they know?"
          className="mt-4 w-full rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
        />
        <p className="num mt-1 text-right text-xs text-muted">
          {text.length}/{MAX}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button loading={busy} disabled={!text.trim()} onClick={save}>
            Save note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
