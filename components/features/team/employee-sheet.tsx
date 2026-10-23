"use client";

import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PasswordInput } from "@/components/features/team/password-input";
import { apiFetch } from "@/lib/api-client";
import { generatePassword } from "@/lib/password";
import { createEmployeeSchema, updateEmployeeSchema } from "@/lib/domain/schemas";
import { USERNAME_EMAIL_DOMAIN } from "@/lib/auth-identifier";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

type FormValues = {
  name: string;
  username: string;
  password: string;
  contactEmail: string;
  phone: string;
  businessId: string;
  designation: string;
  workStart: string;
  workEnd: string;
};

const EMPTY: FormValues = { name: "", username: "", password: "", contactEmail: "", phone: "", businessId: "", designation: "", workStart: "", workEnd: "" };

export function EmployeeSheet({
  open,
  onOpenChange,
  employee,
  businesses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  employee?: WithId<UserDoc>;
  businesses: WithId<BusinessDoc>[];
}) {
  const editing = !!employee;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(editing ? updateEmployeeSchema : createEmployeeSchema) as unknown as Resolver<FormValues>,
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    reset(
      employee
        ? {
            ...EMPTY,
            name: employee.name,
            contactEmail: employee.contactEmail ?? "",
            phone: employee.phone ?? "",
            businessId: employee.businessId ?? "",
            designation: employee.designation,
            workStart: employee.workStart ?? "",
            workEnd: employee.workEnd ?? "",
          }
        : { ...EMPTY, password: generatePassword() },
    );
  }, [open, employee, reset]);

  async function onSubmit() {
    setFormError(null);
    const raw = getValues();
    const common = {
      name: raw.name, contactEmail: raw.contactEmail, phone: raw.phone, businessId: raw.businessId,
      designation: raw.designation, workStart: raw.workStart, workEnd: raw.workEnd,
    };
    try {
      if (employee) await apiFetch(`/api/admin/employees/${employee.id}`, "PATCH", common);
      else await apiFetch("/api/admin/employees", "POST", { ...common, username: raw.username, password: raw.password });
      toast.success(editing ? "Changes saved" : `${raw.name} can now sign in as ${raw.username}`);
      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  const password = watch("password");
  const selectable = businesses.filter((b) => b.active || b.id === employee?.businessId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? `Edit ${employee.name}` : "Add a team member"}
        description={editing ? "Update their details. Changing business moves their tasks view to the new business." : "They sign in with the username and password you set here."}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="employee-form" loading={isSubmitting}>
              {editing ? "Save changes" : "Add team member"}
            </Button>
          </>
        }
      >
        <form id="employee-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <Field id="emp-name" label="Full name" required error={errors.name?.message}>
            {(aria) => <Input {...aria} autoComplete="off" {...register("name")} />}
          </Field>

          {editing ? (
            <div>
              <p className="text-sm font-medium">Username</p>
              <p className="mt-1 text-sm text-muted">
                {employee.username} <span className="text-muted">(the sign-in name can&apos;t be changed)</span>
              </p>
            </div>
          ) : (
            <>
              <Field id="emp-username" label="Username" required hint={`They sign in with this, no email needed. Behind the scenes it becomes ${watch("username") || "username"}@${USERNAME_EMAIL_DOMAIN}.`} error={errors.username?.message}>
                {(aria) => <Input {...aria} autoComplete="off" autoCapitalize="none" {...register("username")} />}
              </Field>
              <Field id="emp-password" label="Password" required hint="At least 8 characters. Copy it to share with them." error={errors.password?.message}>
                {(aria) => (
                  <PasswordInput {...aria} value={password} onGenerate={() => setValue("password", generatePassword(), { shouldValidate: true })} {...register("password")} />
                )}
              </Field>
            </>
          )}

          <Field id="emp-business" label="Business" required error={errors.businessId?.message}>
            {(aria) => (
              <Select {...aria} {...register("businessId")}>
                <option value="">Choose a business…</option>
                {selectable.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="emp-designation" label="Designation" hint="For example: Cashier, Accountant, Supervisor." error={errors.designation?.message}>
            {(aria) => <Input {...aria} autoComplete="off" {...register("designation")} />}
          </Field>

          <Field id="emp-phone" label="WhatsApp number" hint="International format, like +923001234567. Used for reminders and alerts." error={errors.phone?.message}>
            {(aria) => <Input {...aria} type="tel" autoComplete="off" inputMode="tel" {...register("phone")} />}
          </Field>

          <Field id="emp-email" label="Contact email" hint="Optional. For your records only; it isn't used to sign in." error={errors.contactEmail?.message}>
            {(aria) => <Input {...aria} type="email" autoComplete="off" {...register("contactEmail")} />}
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">Working hours</legend>
            <p className="mb-2 text-sm text-muted">Leave both blank to follow the business hours.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field id="emp-start" label="Starts" error={errors.workStart?.message}>
                {(aria) => <Input {...aria} type="time" {...register("workStart")} />}
              </Field>
              <Field id="emp-end" label="Ends" error={errors.workEnd?.message}>
                {(aria) => <Input {...aria} type="time" {...register("workEnd")} />}
              </Field>
            </div>
          </fieldset>

          {formError ? (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
