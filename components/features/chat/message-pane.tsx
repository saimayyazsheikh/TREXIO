"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { collection, deleteDoc, doc, limit, orderBy, query, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/features/error-state";
import { MessageBubble } from "@/components/features/chat/message-bubble";
import { useCollection } from "@/hooks/use-collection";
import { useTick } from "@/hooks/use-tick";
import { apiFetch } from "@/lib/api-client";
import { getFirebase } from "@/lib/firebase/client";
import type { Role } from "@/lib/domain/constants";
import { formatPkt, pktDateString } from "@/lib/time";
import type { ChatMessageDoc } from "@/types/models";

const PAGE = 50;
const TYPING_WINDOW_MS = 6000;
const TYPING_REFRESH_MS = 2500;

type Pending = { tempId: string; body: string; status: "sending" | "failed"; messageId?: string; error?: string };
type Typing = { name: string; at: Timestamp | null };

export function MessagePane({
  chatId,
  title,
  subtitle,
  viewer,
  unread,
  onBack,
}: {
  chatId: string;
  title: string;
  subtitle: string;
  viewer: { uid: string; name: string; role: Role };
  unread: number;
  /** Mobile only: return to the channel list. */
  onBack: () => void;
}) {
  const { db } = getFirebase();
  const [limitN, setLimitN] = useState(PAGE);
  const messagesQ = useMemo(() => query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"), limit(limitN)), [db, chatId, limitN]);
  const typingCol = useMemo(() => collection(db, "chats", chatId, "typing"), [db, chatId]);
  const result = useCollection<ChatMessageDoc>(messagesQ);
  const typing = useCollection<Typing>(typingCol);
  useTick(2000);

  const messages = useMemo(() => [...(result.data ?? [])].reverse(), [result.data]);
  const hasMore = (result.data?.length ?? 0) >= limitN;

  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTypingWrite = useRef(0);
  const typingRef = useMemo(() => doc(db, "chats", chatId, "typing", viewer.uid), [db, chatId, viewer.uid]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending.length, result.loading]);

  // Opening a chat (or receiving messages in it) clears your unread count.
  const reading = useRef(false);
  useEffect(() => {
    if (unread > 0 && !reading.current) {
      reading.current = true;
      apiFetch("/api/chat", "POST", { action: "read", chatId })
        .catch(() => undefined)
        .finally(() => void (reading.current = false));
    }
  }, [unread, chatId]);

  // Once the live data contains a message we just sent, drop its placeholder. Checked whenever either side changes,
  // because the live update can arrive before OR after the server's reply tells us the new message's id.
  useEffect(() => {
    const ids = new Set(messages.map((m) => m.id));
    if (pending.some((x) => x.messageId && ids.has(x.messageId))) {
      setPending((p) => p.filter((x) => !(x.messageId && ids.has(x.messageId))));
    }
  }, [messages, pending]);

  const stopTyping = useCallback(() => {
    lastTypingWrite.current = 0;
    deleteDoc(typingRef).catch(() => undefined);
  }, [typingRef]);
  useEffect(() => stopTyping, [stopTyping]);

  function onType(value: string) {
    setText(value);
    const now = Date.now();
    if (value && now - lastTypingWrite.current > TYPING_REFRESH_MS) {
      lastTypingWrite.current = now;
      setDoc(typingRef, { name: viewer.name, at: serverTimestamp() }).catch(() => undefined);
    }
  }

  async function deliver(item: Pending) {
    try {
      const res = await apiFetch<{ messageId: string }>("/api/chat", "POST", { action: "send", chatId, body: item.body });
      setPending((p) => p.map((x) => (x.tempId === item.tempId ? { ...x, messageId: res.messageId } : x)));
    } catch (err) {
      setPending((p) => p.map((x) => (x.tempId === item.tempId ? { ...x, status: "failed", error: err instanceof Error ? err.message : "Couldn't send." } : x)));
    }
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    const item: Pending = { tempId: crypto.randomUUID(), body, status: "sending" };
    setPending((p) => [...p, item]);
    setText("");
    stopTyping();
    stick.current = true;
    void deliver(item);
  }

  function retry(item: Pending) {
    const again = { ...item, status: "sending" as const, error: undefined };
    setPending((p) => p.map((x) => (x.tempId === item.tempId ? again : x)));
    void deliver(again);
  }

  const typers = (typing.data ?? []).filter((t) => t.id !== viewer.uid && t.at && Date.now() - t.at.toMillis() < TYPING_WINDOW_MS).map((t) => t.name);

  return (
    <section aria-label={`Conversation: ${title}`} className="glass flex h-full min-h-0 flex-col rounded-card">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Back to conversations" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold">{title}</h2>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {result.error ? (
          <ErrorState onRetry={result.retry} />
        ) : result.loading ? (
          <div aria-busy aria-label="Loading messages" className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-2/3 rounded-card" />
            ))}
          </div>
        ) : (
          <>
            {hasMore ? (
              <div className="flex justify-center pb-2">
                <Button variant="secondary" size="sm" onClick={() => setLimitN((n) => n + PAGE)}>
                  Load earlier messages
                </Button>
              </div>
            ) : null}
            {messages.length === 0 && pending.length === 0 ? <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello!</p> : null}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const day = pktDateString(m.createdAt.toDate());
              const newDay = !prev || pktDateString(prev.createdAt.toDate()) !== day;
              const showAuthor = newDay || prev.authorId !== m.authorId || m.createdAt.toMillis() - prev.createdAt.toMillis() > 5 * 60_000;
              return (
                <Fragment key={m.id}>
                  {newDay ? (
                    <p className="num py-2 text-center text-xs font-semibold text-muted">
                      {day === pktDateString() ? "Today" : formatPkt(m.createdAt.toDate(), "EEEE, d MMMM")}
                    </p>
                  ) : null}
                  <MessageBubble message={m} chatId={chatId} viewerUid={viewer.uid} showAuthor={showAuthor} />
                </Fragment>
              );
            })}
            {pending.map((p) => (
              <div key={p.tempId} className="flex flex-row-reverse gap-2.5" aria-label={p.status === "failed" ? "Message not sent" : "Sending message"}>
                <div className="w-8 shrink-0" />
                <div className="flex max-w-[85%] flex-col items-end">
                  <div className="rounded-card bg-brand-gradient px-3.5 py-2 text-white opacity-70">
                    {p.body ? <p className="whitespace-pre-line break-words text-sm">{p.body}</p> : null}
                  </div>
                  {p.status === "sending" ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                      <Loader2 className="size-3 animate-spin" aria-hidden /> Sending…
                    </p>
                  ) : (
                    <div className="mt-1 flex items-center gap-2 text-xs text-danger">
                      <TriangleAlert className="size-3.5" aria-hidden /> {p.error}
                      <Button size="sm" variant="secondary" onClick={() => retry(p)}>
                        <RotateCcw aria-hidden /> Retry
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPending((x) => x.filter((i) => i.tempId !== p.tempId))}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="h-6 px-4 text-xs text-muted" aria-live="polite">
        {typers.length > 0 ? `${typers.join(", ")} ${typers.length === 1 ? "is" : "are"} typing…` : ""}
      </div>

      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            aria-label={`Message ${title}`}
            rows={2}
            maxLength={4000}
            value={text}
            placeholder="Write a message. Enter to send, Shift+Enter for a new line"
            onChange={(e) => onType(e.target.value)}
            onBlur={stopTyping}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="min-h-11 flex-1 resize-none rounded-control border border-input bg-surface-solid px-3 py-2.5 text-base text-foreground placeholder:text-muted transition-colors focus-visible:border-ring md:text-sm"
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={!text.trim()}>
            <Send aria-hidden />
          </Button>
        </div>
      </form>
    </section>
  );
}
