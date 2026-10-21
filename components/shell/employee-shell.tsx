"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/features/theme-toggle";
import { Brand } from "@/components/shell/brand";
import { UserMenu } from "@/components/shell/user-menu";
import { EMPLOYEE_NAV } from "@/components/shell/nav-config";
import { cn } from "@/lib/utils";

export function EmployeeShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/me" ? pathname === "/me" : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-x-0 border-t-0 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Brand />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {EMPLOYEE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href) ? "bg-brand-gradient text-white" : "hover:bg-surface-raised",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
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
      <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-30 flex border-x-0 border-b-0 md:hidden">
        {EMPLOYEE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
              isActive(item.href) ? "text-brand-text" : "text-muted",
            )}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
