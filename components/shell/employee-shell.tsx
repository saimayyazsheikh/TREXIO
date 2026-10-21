"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/features/theme-toggle";
import { HourlyPrompt } from "@/components/features/journal/hourly-prompt";
import { Brand } from "@/components/shell/brand";
import { EMPLOYEE_NAV } from "@/components/shell/nav-config";
import { NavBadge } from "@/components/shell/nav-badge";
import { UserMenu } from "@/components/shell/user-menu";
import { useNavBadges } from "@/hooks/use-nav-badges";
import { cn } from "@/lib/utils";

export function EmployeeShell({ userName, uid, children }: { userName: string; uid: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const badges = useNavBadges({ uid, role: "employee" });
  const isActive = (href: string) => (href === "/me" ? pathname === "/me" : pathname.startsWith(href));
  const primary = EMPLOYEE_NAV.filter((i) => i.primary);
  const more = EMPLOYEE_NAV.filter((i) => !i.primary);
  const moreBadge = more.reduce((sum, i) => sum + (badges[i.href] ?? 0), 0);
  const moreActive = more.some((i) => isActive(i.href));

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-4 sm:px-6">
        <div className="flex items-center gap-4 lg:gap-6">
          <Brand compact className="lg:hidden" />
          <Brand className="hidden lg:inline-flex" />
          {/* Icons only until there is room for labels. */}
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {EMPLOYEE_NAV.map((item) => (
              <Tooltip key={item.href} label={item.hint}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  aria-label={item.label}
                  className={cn(
                    "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.href) ? "bg-brand-gradient text-white" : "hover:bg-surface-raised",
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  <span className="hidden lg:inline">{item.label}</span>
                  <NavBadge count={badges[item.href] ?? 0} />
                </Link>
              </Tooltip>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu name={userName} roleLabel="Team member" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      <HourlyPrompt uid={uid} />
      <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-30 flex border-x-0 border-b-0 md:hidden">
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
  );
}
