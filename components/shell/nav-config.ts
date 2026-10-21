import { LayoutDashboard, Sun, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; hint: string };
export type NavGroup = { label: string; items: NavItem[] };

/** Only routes that exist are listed; each phase appends its pages here (docs/06 layout groups). */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, hint: "Today across all your businesses" }],
  },
];

export const EMPLOYEE_NAV: NavItem[] = [{ href: "/me", label: "Today", icon: Sun, hint: "Your tasks for today" }];
