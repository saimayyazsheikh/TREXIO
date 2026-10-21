"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/features/theme-toggle";
import { Brand } from "@/components/shell/brand";
import { NavBadge } from "@/components/shell/nav-badge";
import { UserMenu } from "@/components/shell/user-menu";
import { useNavBadges } from "@/hooks/use-nav-badges";
import { ADMIN_NAV } from "@/components/shell/nav-config";
import { cn } from "@/lib/utils";

function NavList({ collapsed, onNavigate, badges }: { collapsed: boolean; onNavigate?: () => void; badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5">
      {ADMIN_NAV.map((group) => (
        <div key={group.label} className={group.pinned ? "mt-auto" : undefined}>
          {collapsed ? null : (
            <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{group.label}</p>
          )}
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const count = badges[item.href] ?? 0;
              const tip = collapsed ? `${item.label}: ${item.hint}` : item.hint;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-brand-gradient text-white shadow-[var(--shadow-1)]" : "hover:bg-surface-raised",
                    collapsed && "relative justify-center px-0",
                  )}
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  {collapsed ? <span className="sr-only">{item.label}</span> : <span className="flex-1">{item.label}</span>}
                  <NavBadge count={count} className={collapsed ? "absolute right-1 top-1 min-w-4 px-1 text-[10px]" : undefined} />
                </Link>
              );
              return (
                <li key={item.href}>
                  <Tooltip label={tip} side="right">
                    {link}
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ userName, uid, children }: { userName: string; uid: string; children: React.ReactNode }) {
  const badges = useNavBadges({ uid, role: "admin" });
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "glass sticky top-0 hidden h-dvh shrink-0 flex-col border-y-0 border-l-0 p-4 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className={cn("mb-6 flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <Brand compact={collapsed} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <NavList collapsed={collapsed} badges={badges} />
        </div>
        <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
          <Button
            variant="ghost"
            size="icon"
            className="self-start"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          </Button>
        </Tooltip>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <Tooltip label="Open menu">
              <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
                <Menu aria-hidden />
              </Button>
            </Tooltip>
            <Brand compact />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={userName} roleLabel="Admin" />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none rounded-r-card">
          <DialogTitle className="mb-6">
            <Brand />
          </DialogTitle>
          <NavList collapsed={false} badges={badges} onNavigate={() => setDrawerOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
