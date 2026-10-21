import { Building2, LayoutDashboard, Sun, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; hint: string };
export type NavGroup = { label: string; items: NavItem[]; /** Rendered at the bottom of the sidebar. */ pinned?: boolean };

/** Only routes that exist are listed; each phase appends its pages here (docs/06 layout groups). */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, hint: "Today across all your businesses" }],
  },
  {
    label: "Settings",
    pinned: true,
    items: [
      { href: "/admin/settings/team", label: "Team", icon: Users, hint: "Add and manage employees" },
      { href: "/admin/settings/businesses", label: "Businesses", icon: Building2, hint: "Your businesses, colours and hours" },
    ],
  },
];

export const EMPLOYEE_NAV: NavItem[] = [{ href: "/me", label: "Today", icon: Sun, hint: "Your tasks for today" }];
