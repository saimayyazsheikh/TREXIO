import { Activity, Bell, Building2, CalendarDays, CalendarOff, CircleHelp, Columns3, Inbox, LayoutDashboard, MessageCircle, NotebookPen, ScrollText, Sun, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; hint: string; /** Shown as a tab on phones; the rest live under "More". */ primary?: boolean };
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
    label: "People",
    items: [
      { href: "/admin/presence", label: "Presence", icon: Activity, hint: "Who is working right now, and daily active and idle time" },
      { href: "/admin/journals", label: "Journals", icon: NotebookPen, hint: "Who has logged their hours, and what they wrote" },
      { href: "/admin/leave", label: "Leave", icon: CalendarOff, hint: "Approve or decline time off" },
    ],
  },
  {
    label: "Records",
    items: [{ href: "/admin/audit", label: "Audit log", icon: ScrollText, hint: "Every task change: who, what and when" }],
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
      { href: "/admin/settings/calendar", label: "Holidays", icon: CalendarDays, hint: "Holidays and closures when no tasks are created" },
    ],
  },
];

/** Phones show the four `primary` items as tabs and the rest under "More", keeping the tab bar within five slots. */
export const EMPLOYEE_NAV: NavItem[] = [
  { href: "/me", label: "Today", icon: Sun, hint: "Your tasks for today", primary: true },
  { href: "/me/board", label: "My board", icon: Columns3, hint: "Your tasks by status", primary: true },
  { href: "/me/journal", label: "Journal", icon: NotebookPen, hint: "Note what you worked on, hour by hour", primary: true },
  { href: "/me/reminders", label: "Reminders", icon: Bell, hint: "Nudges from your admin" },
  { href: "/me/leave", label: "Leave", icon: CalendarOff, hint: "Ask for time off and see your breaks" },
  { href: "/me/ask", label: "Ask", icon: CircleHelp, hint: "Ask your admin a question" },
  { href: "/me/chat", label: "Chat", icon: MessageCircle, hint: "Quick talk with your team", primary: true },
];