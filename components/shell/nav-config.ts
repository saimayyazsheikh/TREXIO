import { Bell, Building2, CircleHelp, Columns3, Inbox, LayoutDashboard, MessageCircle, Sun, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; hint: string };
export type NavGroup = { label: string; items: NavItem[]; /** Rendered at the bottom of the sidebar. */ pinned?: boolean };

/** Only routes that exist are listed; each phase appends its pages here (docs/06 layout groups). */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, hint: "Today across all your businesses" }],
  },
  {
    label: "Work",
    items: [
      { href: "/admin/kanban", label: "Kanban", icon: Columns3, hint: "Every task by status; drag cards to move them" },
      { href: "/admin/reminders", label: "Reminders", icon: Bell, hint: "Nudge the team and see who has read it" },
    ],
  },
  {
    label: "Communicate",
    items: [
      { href: "/admin/inbox", label: "Inbox", icon: Inbox, hint: "Questions from your team that need an answer" },
      { href: "/admin/chat", label: "Chat", icon: MessageCircle, hint: "Quick talk with one person or everyone" },
    ],
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

/** Five items so the mobile tab bar stays within the five-tab limit. */
export const EMPLOYEE_NAV: NavItem[] = [
  { href: "/me", label: "Today", icon: Sun, hint: "Your tasks for today" },
  { href: "/me/board", label: "My board", icon: Columns3, hint: "Your tasks by status" },
  { href: "/me/reminders", label: "Reminders", icon: Bell, hint: "Nudges from your admin" },
  { href: "/me/ask", label: "Ask", icon: CircleHelp, hint: "Ask your admin a question" },
  { href: "/me/chat", label: "Chat", icon: MessageCircle, hint: "Quick talk with your team" },
];
