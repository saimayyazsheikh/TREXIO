"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/features/theme-toggle";
import { NotificationBell } from "@/components/features/notifications/notification-bell";
import { HourlyPrompt } from "@/components/features/journal/hourly-prompt";
import { PresencePill, goOffline } from "@/components/features/presence/presence-pill";
import { BrandLink } from "@/components/shell/brand";
import { IdleLogout } from "@/components/shell/idle-logout";
import { SystemIdlePrompt } from "@/components/features/presence/system-idle-prompt";
import { EMPLOYEE_NAV } from "@/components/shell/nav-config";
import { NavBadge } from "@/components/shell/nav-badge";
import { UserMenu } from "@/components/shell/user-menu";
import { useGlobalSettings } from "@/hooks/use-global-settings";
import { useMyHours } from "@/hooks/use-my-hours";
import { useNavBadges } from "@/hooks/use-nav-badges";
import { cn } from "@/lib/utils";

export function EmployeeShell({ userName, uid, children }: { userName: string; uid: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const hours = useMyHours(uid);
  const { settings } = useGlobalSettings();
  const badges = useNavBadges({ uid, role: "employee" });
  const [collapsed, setCollapsed] = useState(false);
  const isActive = (href: string) => (href === "/me" ? pathname === "/me" : pathname.startsWith(href));
  const primary = EMPLOYEE_NAV.filter((i) => i.primary);
  const more = EMPLOYEE_NAV.filter((i) => !i.primary);
  const moreBadge = more.reduce((sum, i) => sum + (badges[i.href] ?? 0), 0);
  const moreActive = more.some((i) => isActive(i.href));

  return (
    <div className="flex min-h-dvh pb-20 md:pb-0">
      <IdleLogout onBeforeSignOut={() => goOffline(uid)} />
      <SystemIdlePrompt idleMin={hours.user?.idleThresholdMin ?? settings.idleMin} />
      {/* From tablet width up the pages sit in a side panel, the same as the admin's; phones keep the tab bar below. */}
      <aside
        className={cn(
          "bg-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[var(--sidebar-line)] p-4 transition-[width] duration-200 md:flex print:!hidden",
          collapsed ? "w-[76px]" : "w-60",
        )}
      >
        <div className={cn("mb-6 flex", collapsed ? "flex-col items-center gap-3" : "items-center justify-between")}>
          <BrandLink href="/me" compact={collapsed} />
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-sidebar-muted hover:bg-[var(--sidebar-hover)] hover:text-sidebar-fg"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </Button>
          </Tooltip>
        </div>
        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {EMPLOYEE_NAV.map((item) => {
              const active = isActive(item.href);
              const tip = collapsed ? `${item.label}: ${item.hint}` : item.hint;
              return (
                <li key={item.href}>
                  <Tooltip label={tip} side="right">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-[var(--sidebar-active)] text-sidebar-fg before:absolute before:-left-4 before:bottom-2 before:top-2 before:w-1 before:rounded-r-full before:bg-sidebar-muted"
                          : "text-sidebar-muted hover:bg-[var(--sidebar-hover)] hover:text-sidebar-fg",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <item.icon className="size-[18px] shrink-0" aria-hidden />
                      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="flex-1">{item.label}</span>}
                      <NavBadge count={badges[item.href] ?? 0} className={collapsed ? "absolute right-1 top-1 min-w-4 px-1 text-[10px]" : undefined} />
                    </Link>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border-solid bg-surface-solid/90 px-4 backdrop-blur sm:px-6 print:hidden">
          <BrandLink href="/me" compact className="md:hidden" />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <PresencePill uid={uid} name={userName} idleMin={hours.user?.idleThresholdMin ?? settings.idleMin} />
            <NotificationBell uid={uid} role="employee" />
            <ThemeToggle />
            <UserMenu name={userName} roleLabel="Team member" onBeforeSignOut={() => goOffline(uid)} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
        <HourlyPrompt uid={uid} promptMinute={settings.promptMinute} />
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-solid bg-surface-solid md:hidden print:hidden">
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium", isActive(item.href) ? "text-brand-text" : "text-muted")}
            >
              <span className="relative">
                <item.icon className="size-5" aria-hidden />
                <NavBadge count={badges[item.href] ?? 0} className="absolute -right-3 -top-2 min-w-4 px-1 text-[10px]" />
              </span>
              {item.label}
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="More pages" className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium", moreActive ? "text-brand-text" : "text-muted")}>
                <span className="relative">
                  <Ellipsis className="size-5" aria-hidden />
                  <NavBadge count={moreBadge} className="absolute -right-3 -top-2 min-w-4 px-1 text-[10px]" />
                </span>
                More
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              {more.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} aria-current={isActive(item.href) ? "page" : undefined}>
                    <item.icon aria-hidden /> <span className="flex-1">{item.label}</span>
                    <NavBadge count={badges[item.href] ?? 0} />
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </div>
  );
}
