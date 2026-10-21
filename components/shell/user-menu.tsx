"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { getFirebase } from "@/lib/firebase/client";

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(getFirebase().auth);
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-semibold leading-tight">{name}</p>
        <p className="text-xs text-muted">{roleLabel}</p>
      </div>
      <Avatar name={name} />
      <Tooltip label="Sign out">
        <Button variant="ghost" size="icon" aria-label="Sign out" loading={busy} onClick={logout}>
          <LogOut aria-hidden />
        </Button>
      </Tooltip>
    </div>
  );
}
