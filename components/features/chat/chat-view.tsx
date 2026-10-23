"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Search, Users } from "lucide-react";
import { collection, doc, orderBy, query, where } from "firebase/firestore";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/features/empty-state";
import { ErrorState } from "@/components/features/error-state";
import { PageHeader } from "@/components/features/page-header";
import { MessagePane } from "@/components/features/chat/message-pane";
import { useCollection } from "@/hooks/use-collection";
import { useDocument } from "@/hooks/use-document";
import { getFirebase } from "@/lib/firebase/client";
import { EVERYONE_CHAT, dmChatId, unreadKey } from "@/lib/domain/communication";
import type { Role } from "@/lib/domain/constants";
import { formatPkt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ChatDoc, UserDoc } from "@/types/models";

type Channel = { id: string; title: string; kind: "group" | "direct"; subtitle: string; preview: string; lastAtMs: number; unread: number };

/** Quick conversation: Everyone plus direct chats. Admin sees every employee; an employee sees Everyone and their admin. */
export function ChatView({ viewer }: { viewer: { uid: string; name: string; role: Role } }) {
  const { db } = getFirebase();
  const isAdmin = viewer.role === "admin";
  const key = unreadKey(viewer);

  const usersQ = useMemo(() => (isAdmin ? query(collection(db, "users"), where("role", "==", "employee")) : null), [db, isAdmin]);
  const chatsQ = useMemo(() => (isAdmin ? query(collection(db, "chats"), orderBy("lastAt", "desc")) : null), [db, isAdmin]);
  const everyoneRef = useMemo(() => (isAdmin ? null : doc(db, "chats", EVERYONE_CHAT)), [db, isAdmin]);
  const dmRef = useMemo(() => (isAdmin ? null : doc(db, "chats", dmChatId(viewer.uid))), [db, isAdmin, viewer.uid]);
  const users = useCollection<UserDoc>(usersQ);
  const chats = useCollection<ChatDoc>(chatsQ);
  const everyone = useDocument<ChatDoc>(everyoneRef);
  const dm = useDocument<ChatDoc>(dmRef);

  const [selected, setSelected] = useState<string>(EVERYONE_CHAT);
  const [mobileChat, setMobileChat] = useState(false);
  const [search, setSearch] = useState("");

  const channels: Channel[] = useMemo(() => {
    const toChannel = (id: string, title: string, kind: Channel["kind"], subtitle: string, c: ChatDoc | null | undefined): Channel => ({
      id, title, kind, subtitle,
      preview: c?.lastMessage ? `${c.lastMessage.authorName}: ${c.lastMessage.text}` : "No messages yet",
      lastAtMs: c?.lastAt?.toMillis() ?? 0,
      unread: c?.unread?.[key] ?? 0,
    });
    if (isAdmin) {
      const byId = new Map((chats.data ?? []).map((c) => [c.id, c]));
      const list = [
        toChannel(EVERYONE_CHAT, "Everyone", "group", "All active team members", byId.get(EVERYONE_CHAT)),
        ...(users.data ?? [])
          .filter((u) => u.status === "active")
          .map((u) => toChannel(dmChatId(u.id), u.name, "direct", [u.designation, "Direct message"].filter(Boolean).join(" · "), byId.get(dmChatId(u.id)))),
      ];
      const [first, ...rest] = list;
      return [first, ...rest.sort((a, b) => b.lastAtMs - a.lastAtMs || a.title.localeCompare(b.title))];
    }
    return [toChannel(EVERYONE_CHAT, "Everyone", "group", "The whole team", everyone.data), toChannel(dmChatId(viewer.uid), "Your admin", "direct", "Private chat", dm.data)];
  }, [isAdmin, chats.data, users.data, everyone.data, dm.data, key, viewer.uid]);

  const error = users.error ?? chats.error ?? everyone.error ?? dm.error;
  const loading = users.loading || chats.loading || everyone.loading || dm.loading;
  const term = search.trim().toLowerCase();
  const visible = channels.filter((c) => !term || c.title.toLowerCase().includes(term));
  const current = channels.find((c) => c.id === selected) ?? channels[0];

  function pick(id: string) {
    setSelected(id);
    setMobileChat(true);
  }

  return (
    <>
      <PageHeader title="Chat" subtitle="Quick talk with your team. For help that needs an answer on record, use Questions instead." />
      {error ? (
        <ErrorState onRetry={() => { users.retry(); chats.retry(); everyone.retry(); dm.retry(); }} />
      ) : loading ? (
        <div aria-busy aria-label="Loading chat" className="grid gap-4 lg:grid-cols-[19rem_1fr]">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="hidden h-96 rounded-card lg:block" />
        </div>
      ) : (
        <div className="grid h-[calc(100dvh-12rem)] min-h-[30rem] gap-4 lg:grid-cols-[19rem_1fr]">
          <nav aria-label="Conversations" className={cn("glass flex min-h-0 flex-col rounded-card", mobileChat && "hidden lg:flex")}>
            {isAdmin ? (
              <div className="relative border-b p-2.5">
                <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input aria-label="Find a person" placeholder="Find a person" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            ) : null}
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {visible.length === 0 ? <li className="p-4 text-sm text-muted">{isAdmin && (users.data?.length ?? 0) === 0 ? "Add team members to start chatting." : "No one matches that."}</li> : null}
              {visible.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={c.id === current.id ? "true" : undefined}
                    onClick={() => pick(c.id)}
                    className={cn("flex min-h-14 w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-surface-raised", c.id === current.id && "bg-surface-raised")}
                  >
                    {c.kind === "group" ? (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                        <Users className="size-4" aria-hidden />
                      </span>
                    ) : (
                      <Avatar name={c.title} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm", c.unread > 0 ? "font-bold" : "font-semibold")}>{c.title}</span>
                        {c.lastAtMs ? <span className="num shrink-0 text-xs text-muted">{formatPkt(new Date(c.lastAtMs), "h:mm a")}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">{c.preview}</span>
                    </span>
                    {c.unread > 0 ? (
                      <span className="num flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-gradient px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`${c.unread} unread`}>
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className={cn("min-h-0", !mobileChat && "hidden lg:block")}>
            {current ? (
              <MessagePane key={current.id} chatId={current.id} title={current.title} subtitle={current.subtitle} viewer={viewer} unread={current.unread} onBack={() => setMobileChat(false)} />
            ) : (
              <EmptyState icon={MessageCircle} title="Pick a conversation" description="Choose someone on the left to start chatting." />
            )}
          </div>
        </div>
      )}
    </>
  );
}
