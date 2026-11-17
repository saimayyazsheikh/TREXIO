"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, UserRound, type LucideIcon } from "lucide-react";
import { query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { ADMIN_NAV, EMPLOYEE_NAV } from "@/components/shell/nav-config";
import { useCollection } from "@/hooks/use-collection";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection } from "@/lib/firebase/org";
import { matchScore } from "@/lib/domain/command-search";
import type { Role } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import type { UserDoc } from "@/types/models";

type Entry = { id: string; label: string; hint: string; href: string; icon: LucideIcon; group: "Pages" | "People"; keywords: string };

/** Admin only: the team list is read once the palette is first opened, so closed palettes cost nothing. */
function usePeople(enabled: boolean) {
  const q = useMemo(() => (enabled ? query(orgCollection(getFirebase().db, "users"), where("role", "==", "employee")) : null), [enabled]);
  return useCollection<UserDoc>(q).data ?? [];
}

/** The shortcut hint on the button: the platform's own modifier key. */
function useShortcutLabel() {
  const [label, setLabel] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setLabel("⌘ K");
  }, []);
  return label;
}

/**
 * Press Ctrl+K (or ⌘K) anywhere to jump to a page, or for the admin to a team member. Type a few letters, use the arrow
 * keys and Enter. It only navigates, so it can never change anything by accident.
 */
export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [wasOpened, setWasOpened] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const shortcut = useShortcutLabel();
  const people = usePeople(role === "admin" && wasOpened);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setWasOpened(true);
      setText("");
      setActive(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const pages = (role === "admin" ? ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))) : EMPLOYEE_NAV.map((i) => ({ ...i, group: "Menu" }))).map<Entry>((i) => ({
      id: i.href,
      label: i.label,
      hint: i.hint,
      href: i.href,
      icon: i.icon,
      group: "Pages",
      keywords: i.group,
    }));
    const team = people
      .filter((u) => u.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map<Entry>((u) => ({ id: u.id, label: u.name, hint: u.designation || "Team member", href: `/admin/employees/${u.id}`, icon: UserRound, group: "People", keywords: `${u.username ?? ""} ${u.designation ?? ""}` }));
    return [...pages, ...team];
  }, [role, people]);

  const results = useMemo(() => {
    const q = text.trim();
    if (!q) return entries.filter((e) => e.group === "Pages");
    return entries
      .map((e) => ({ e, s: matchScore(q, e.label, `${e.hint} ${e.keywords}`) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.e);
  }, [entries, text]);

  useEffect(() => setActive(0), [text]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    router.push(entry.href);
  }

  const groups = (["Pages", "People"] as const).map((g) => ({ g, items: results.filter((r) => r.group === g) })).filter((x) => x.items.length > 0);

  return (
    <>
      <Tooltip label={`Search or jump to a page (${shortcut})`}>
        <Button variant="secondary" className="hidden h-10 gap-2 px-3 text-muted sm:inline-flex" onClick={() => setOpen(true)} aria-label="Search or jump to a page">
          <Search aria-hidden />
          <span className="text-sm">Search</span>
          <kbd className="num rounded border border-border-solid px-1.5 py-0.5 text-[11px] font-medium">{shortcut}</kbd>
        </Button>
      </Tooltip>
      <Tooltip label="Search or jump to a page">
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search or jump to a page" onClick={() => setOpen(true)}>
          <Search aria-hidden />
        </Button>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 max-w-xl -translate-y-0 p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Type to find a page{role === "admin" ? " or a team member" : ""}. Use the arrow keys and Enter.</DialogDescription>
          <div className="flex items-center gap-3 border-b border-border-solid px-4">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={results[active] ? `palette-${results[active].group}-${results[active].id}` : undefined}
              aria-label="Search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder={role === "admin" ? "Search pages and people" : "Search pages"}
              className="h-14 min-w-0 flex-1 bg-transparent pr-10 text-base outline-none placeholder:text-muted"
            />
          </div>
          <ul id="palette-list" role="listbox" ref={listRef} className="max-h-[22rem] overflow-y-auto p-2">
            {results.length === 0 ? <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{text.trim()}”.</li> : null}
            {groups.map(({ g, items }) => (
              <li key={g} role="presentation">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</p>
                <ul role="presentation">
                  {items.map((e) => {
                    const index = results.indexOf(e);
                    const on = index === active;
                    return (
                      <li key={`${g}-${e.id}`} role="presentation">
                        <button
                          type="button"
                          role="option"
                          id={`palette-${e.group}-${e.id}`}
                          aria-selected={on}
                          data-index={index}
                          onMouseMove={() => setActive(index)}
                          onClick={() => go(e)}
                          className={cn("flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors", on ? "bg-surface-raised" : "hover:bg-surface-raised/60")}
                        >
                          <e.icon className="size-[18px] shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{e.label}</span>
                            <span className="block truncate text-xs text-muted">{e.hint}</span>
                          </span>
                          {on ? <CornerDownLeft className="size-4 shrink-0 text-muted" aria-hidden /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
