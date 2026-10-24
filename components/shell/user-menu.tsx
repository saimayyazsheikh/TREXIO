"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getFirebase } from "@/lib/firebase/client";

/** Who is signed in. The name and role open a small menu with Sign out in it. */
export function UserMenu({ name, roleLabel, onBeforeSignOut }: { name: string; roleLabel: string; onBeforeSignOut?: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // The menu's generated ids differ between the server and the browser here, so it is switched on after the first browser render
  // (the same approach as the notification bell). Until then the same-looking pill is shown, without the menu.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function logout() {
    setBusy(true);
    try {
      await onBeforeSignOut?.();
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(getFirebase().auth);
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const pillClass = "group flex h-11 items-center gap-2.5 rounded-full border border-border-solid bg-surface-solid py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-raised data-[state=open]:bg-surface-raised sm:pr-3";
  const pill = (
    <>
      <Avatar name={name} />
      <span className="hidden min-w-0 text-left sm:block">
        <span className="block max-w-36 truncate text-sm font-semibold leading-tight">{name}</span>
        <span className="block text-xs leading-tight text-muted">{roleLabel}</span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180" aria-hidden />
    </>
  );

  if (!mounted) {
    return (
      <button type="button" aria-label={`Account menu for ${name}`} disabled className={pillClass}>
        {pill}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Account menu for ${name}`} className={pillClass}>
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-0">
        <div className="flex items-center gap-3 border-b border-border-solid p-3.5">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs text-muted">{roleLabel}</p>
          </div>
        </div>
        <div className="p-1.5">
          <DropdownMenuItem disabled={busy} onSelect={(e) => { e.preventDefault(); void logout(); }}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
