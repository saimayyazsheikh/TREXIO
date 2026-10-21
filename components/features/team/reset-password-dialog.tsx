"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/features/team/password-input";
import { apiFetch } from "@/lib/api-client";
import { generatePassword } from "@/lib/password";
import { passwordSchema } from "@/lib/domain/schemas";

export function ResetPasswordDialog({
  employee,
  onOpenChange,
}: {
  employee: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (employee) {
      setPassword(generatePassword());
      setError(null);
    }
  }, [employee]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    const check = passwordSchema.safeParse(password);
    if (!check.success) return setError(check.error.issues[0].message);
    setBusy(true);
    try {
      await apiFetch(`/api/admin/employees/${employee.id}/password`, "POST", { password });
      toast.success(`New password set for ${employee.name}. They've been signed out everywhere.`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!employee} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Reset password</DialogTitle>
        <DialogDescription>Set a new password for {employee?.name}. Copy it before you save so you can share it with them.</DialogDescription>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
          <Field id="reset-password" label="New password" required error={error ?? undefined}>
            {(aria) => <PasswordInput {...aria} value={password} onChange={(e) => setPassword(e.target.value)} onGenerate={() => setPassword(generatePassword())} />}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={busy}>
              Set password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
