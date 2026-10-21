"use client";

import { forwardRef, useState } from "react";
import { Copy, Eye, EyeOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";

/** Password field with show/hide, a generator and copy, so the admin can hand credentials over reliably. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { value: string; onGenerate: () => void }
>(({ value, onGenerate, ...props }, ref) => {
  const [shown, setShown] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Password copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  return (
    <div className="flex gap-2">
      <Input ref={ref} type={shown ? "text" : "password"} autoComplete="new-password" value={value} className="min-w-0 flex-1" {...props} />
      <Tooltip label={shown ? "Hide password" : "Show password"}>
        <Button type="button" variant="secondary" size="icon" aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </Tooltip>
      <Tooltip label="Generate a strong password">
        <Button type="button" variant="secondary" size="icon" aria-label="Generate a strong password" onClick={() => { onGenerate(); setShown(true); }}>
          <Wand2 aria-hidden />
        </Button>
      </Tooltip>
      <Tooltip label="Copy password">
        <Button type="button" variant="secondary" size="icon" aria-label="Copy password" disabled={!value} onClick={copy}>
          <Copy aria-hidden />
        </Button>
      </Tooltip>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
