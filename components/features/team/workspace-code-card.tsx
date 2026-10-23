"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/features/glass-card";
import { useWorkspace } from "@/hooks/use-workspace";

/** The one thing every team member needs besides their own username and password. */
export function WorkspaceCodeCard() {
  const { code, name } = useWorkspace();
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the code is shown on screen, so copying is only a shortcut */
    }
  }

  return (
    <GlassCard className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white">
        <KeyRound className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold">
          Your team signs in with the workspace code <code className="num rounded bg-surface-raised px-1.5 py-0.5 text-sm font-bold">{code}</code>, their username and their password.
        </p>
        <p className="text-sm text-muted">Share the code with everyone in {name ?? "your workspace"}. It is the same for all of them, and not a secret on its own.</p>
      </div>
      <Button variant="secondary" size="sm" onClick={copy}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy code"}
      </Button>
    </GlassCard>
  );
}
