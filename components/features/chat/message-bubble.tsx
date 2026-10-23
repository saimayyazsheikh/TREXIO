"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api-client";
import { REACTIONS } from "@/lib/domain/communication";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ChatMessageDoc, WithId } from "@/types/models";

async function act(body: Record<string, unknown>) {
  try {
    await apiFetch("/api/chat", "POST", body);
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Something went wrong.");
    return false;
  }
}

export function MessageBubble({ message, chatId, viewerUid, showAuthor }: { message: WithId<ChatMessageDoc>; chatId: string; viewerUid: string; showAuthor: boolean }) {
  const mine = message.authorId === viewerUid;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);

  async function saveEdit() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    if (await act({ action: "edit", chatId, messageId: message.id, body: text })) setEditing(false);
    setBusy(false);
  }

  const react = (emoji: string) => void act({ action: "react", chatId, messageId: message.id, emoji });
  const reactions = Object.entries(message.reactions ?? {});

  return (
    <div className={cn("group flex gap-2.5", mine && "flex-row-reverse")}>
      <div className="w-8 shrink-0">{showAuthor ? <Avatar name={message.authorName} size="sm" /> : null}</div>
      <div className={cn("flex min-w-0 max-w-[85%] flex-col", mine && "items-end")}>
        {showAuthor ? (
          <p className="mb-0.5 px-1 text-xs text-muted">
            <span className="font-semibold text-foreground">{message.authorName}</span>
            {message.authorRole === "admin" ? " (admin)" : ""} · <span className="num">{formatPkt(message.createdAt.toDate(), "h:mm a")}</span>
          </p>
        ) : null}

        <div className={cn("flex items-start gap-1", mine && "flex-row-reverse")}>
          <div className={cn("rounded-card px-3.5 py-2", message.deleted ? "border border-dashed border-border-solid text-muted" : mine ? "bg-brand-gradient text-white" : "bg-surface-raised")}>
            {message.deleted ? (
              <p className="text-sm italic">This message was deleted.</p>
            ) : editing ? (
              <div className="flex min-w-60 flex-col gap-2">
                <textarea
                  aria-label="Edit your message"
                  autoFocus
                  rows={2}
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void saveEdit();
                    }
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-full rounded-lg bg-surface-solid px-2.5 py-1.5 text-sm text-foreground"
                />
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" loading={busy} onClick={saveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {message.body ? <p className="whitespace-pre-line break-words text-sm">{message.body}</p> : null}
                {message.editedAt ? <p className={cn("text-[11px]", mine ? "text-white/80" : "text-muted")}>edited</p> : null}
              </>
            )}
          </div>

          {!message.deleted && !editing ? (
            <div className="flex opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
              <DropdownMenu>
                <Tooltip label="Add a reaction">
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-9" aria-label="Add a reaction">
                      <SmilePlus aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align={mine ? "end" : "start"} className="flex min-w-0 gap-1 p-1.5">
                  {REACTIONS.map((e) => (
                    <DropdownMenuItem key={e} aria-label={`React with ${e}`} className="min-h-11 min-w-11 justify-center text-xl" onSelect={() => react(e)}>
                      {e}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {mine ? (
                <DropdownMenu>
                  <Tooltip label="Edit or delete">
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-9" aria-label="Message options">
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                  </Tooltip>
                  <DropdownMenuContent align="end">
                    {message.body ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          setDraft(message.body);
                          setEditing(true);
                        }}
                      >
                        <Pencil aria-hidden /> Edit
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => void act({ action: "delete", chatId, messageId: message.id })} className="text-danger">
                      <Trash2 aria-hidden /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ) : null}
        </div>

        {reactions.length > 0 && !message.deleted ? (
          <ul className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>
            {reactions.map(([emoji, uids]) => {
              const reacted = uids.includes(viewerUid);
              return (
                <li key={emoji}>
                  <button
                    type="button"
                    aria-pressed={reacted}
                    aria-label={`${emoji} ${uids.length} ${uids.length === 1 ? "reaction" : "reactions"}${reacted ? ", including yours" : ""}`}
                    onClick={() => react(emoji)}
                    className={cn("num inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors", reacted ? "border-ring bg-surface-raised" : "border-border-solid hover:bg-surface-raised")}
                  >
                    <span aria-hidden>{emoji}</span> {uids.length}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
