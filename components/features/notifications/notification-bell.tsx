"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, BellRing, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useNotificationAlert } from "@/hooks/use-notification-alert";
import { useNotifications } from "@/hooks/use-notifications";
import { usePush } from "@/hooks/use-push";
import { useNow } from "@/hooks/use-now";
import { timeAgo } from "@/lib/domain/audit-log";
import type { Role } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

/** The bell in the top bar: everything addressed to you, newest first, with a number for what you haven't seen. */
export function NotificationBell({ uid, role }: { uid: string; role: Role }) {
  // Everything in the bell is live, per-user data, so there is nothing useful to render on the server.
  // Holding the menu back until mount also keeps the menu's generated ids identical between server and browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Notifications" disabled className="rounded-full">
        <Bell aria-hidden />
      </Button>
    );
  }
  return <BellMenu uid={uid} role={role} />;
}

function BellMenu({ uid, role }: { uid: string; role: Role }) {
  const n = useNotifications({ uid, role });
  const push = usePush();
  const now = useNow();
  const count = n.unread.length;
  const alert = useNotificationAlert(n.unread, !n.loading);

  async function togglePush() {
    const problem = push.state === "on" ? await push.disable() : await push.enable();
    if (problem) toast.error(problem);
    else toast.success(push.state === "on" ? "Notifications turned off on this device." : "Notifications turned on for this device.");
  }

  return (
    <DropdownMenu>
      <Tooltip label="Notifications">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={count ? `Notifications, ${count} unread` : "Notifications"} className="relative rounded-full">
            <Bell aria-hidden />
            {count > 0 ? (
              <span aria-hidden className="num absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface-solid">
                {count > 9 ? "9+" : count}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex items-center justify-between border-b px-2.5">
          <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
          {count > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => void n.markRead(n.unread.map((x) => x.id))}>
              <CheckCheck aria-hidden /> Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[22rem] overflow-y-auto p-1.5">
          {n.error ? (
            <p className="px-2.5 py-6 text-center text-sm text-danger">Couldn&apos;t load your notifications.</p>
          ) : n.loading ? (
            <div aria-busy aria-label="Loading notifications" className="space-y-2 p-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-control" />
              ))}
            </div>
          ) : (n.data?.length ?? 0) === 0 ? (
            <p className="px-2.5 py-8 text-center text-sm text-muted">Nothing yet. Reminders, replies and alerts will show up here.</p>
          ) : (
            n.data!.map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <Link href={item.link} onClick={() => !item.readAt && void n.markRead([item.id])} className="h-auto min-h-11 items-start py-2">
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-brand")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", item.readAt ? "font-medium" : "font-semibold")}>{item.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted">{item.body}</span>
                    <span className="num mt-0.5 block text-xs text-muted">{item.createdAt ? timeAgo(item.createdAt.toMillis(), now.getTime()) : ""}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <div className="border-t p-1.5">
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); alert.toggleSound(); }}>
            {alert.sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            <span className="flex-1">Notification sound</span>
            <span className="text-xs font-semibold text-muted">{alert.sound ? "On" : "Off"}</span>
          </DropdownMenuItem>
        </div>

        {push.state !== "unsupported" ? (
          <div className="border-t p-1.5">
            {push.state === "blocked" ? (
              <p className="flex gap-2 px-2.5 py-2 text-xs text-muted">
                <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Notifications are blocked for this site. Allow them in your browser settings to get alerts when Traxio is closed.
              </p>
            ) : (
              <Button variant="ghost" className="w-full justify-start" loading={push.busy} onClick={togglePush}>
                {push.state === "on" ? <BellOff aria-hidden /> : <BellRing aria-hidden />}
                {push.state === "on" ? "Turn off alerts on this device" : "Get alerts on this device"}
              </Button>
            )}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
