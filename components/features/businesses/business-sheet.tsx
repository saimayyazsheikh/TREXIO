"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ColorPicker } from "@/components/features/color-picker";
import { getFirebase } from "@/lib/firebase/client";
import { orgCollection, orgDocument } from "@/lib/firebase/org";
import { businessInputSchema, type BusinessInput } from "@/lib/domain/schemas";
import { WEEKDAYS } from "@/lib/domain/work-days";
import { cn } from "@/lib/utils";
import type { BusinessDoc, WithId } from "@/types/models";

const DEFAULTS: BusinessInput = { name: "", color: "indigo", workStart: "09:00", workEnd: "18:00", workDays: [1, 2, 3, 4, 5], active: true };

export function BusinessSheet({
  open,
  onOpenChange,
  business,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  business?: WithId<BusinessDoc>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BusinessInput>({ resolver: zodResolver(businessInputSchema), defaultValues: DEFAULTS });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    reset(
      business
        ? { name: business.name, color: business.color, workStart: business.workStart, workEnd: business.workEnd, workDays: business.workDays, active: business.active }
        : DEFAULTS,
    );
  }, [open, business, reset]);

  async function onSubmit(values: BusinessInput) {
    setFormError(null);
    try {
      const { db } = getFirebase();
      const ref = business ? orgDocument(db, "businesses", business.id) : doc(orgCollection(db, "businesses"));
      if (business) await updateDoc(ref, values);
      else await setDoc(ref, { ...values, createdAt: serverTimestamp() });
      toast.success(business ? "Business updated" : `${values.name} added`);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      setFormError("We couldn't save that. Check your connection and try again.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={business ? "Edit business" : "Add a business"}
        description="Its colour tags every task and employee, and its hours decide each day's schedule."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="business-form" loading={isSubmitting}>
              {business ? "Save changes" : "Add business"}
            </Button>
          </>
        }
      >
        <form id="business-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <Field id="biz-name" label="Business name" required error={errors.name?.message}>
            {(aria) => <Input {...aria} autoComplete="off" {...register("name")} />}
          </Field>

          <div className="flex flex-col gap-1.5">
            <span id="biz-color-label" className="text-sm font-medium">
              Colour
            </span>
            <Controller control={control} name="color" render={({ field }) => <ColorPicker value={field.value} onChange={field.onChange} labelledBy="biz-color-label" />} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="biz-start" label="Opens" required error={errors.workStart?.message}>
              {(aria) => <Input {...aria} type="time" {...register("workStart")} />}
            </Field>
            <Field id="biz-end" label="Closes" required error={errors.workEnd?.message}>
              {(aria) => <Input {...aria} type="time" {...register("workEnd")} />}
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Working days</legend>
            <Controller
              control={control}
              name="workDays"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = field.value.includes(d.n);
                    return (
                      <button
                        key={d.n}
                        type="button"
                        aria-pressed={on}
                        aria-label={d.long}
                        onClick={() => field.onChange(on ? field.value.filter((x) => x !== d.n) : [...field.value, d.n])}
                        className={cn(
                          "min-h-11 min-w-12 rounded-control border px-3 text-sm font-medium transition-colors",
                          on ? "border-transparent bg-brand-gradient text-white" : "border-input hover:bg-surface-raised",
                        )}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.workDays ? <p className="mt-1.5 text-sm text-danger">{errors.workDays.message}</p> : null}
          </fieldset>

          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--brand-from)]" {...register("active")} />
            <span>
              <span className="block text-sm font-medium">Active</span>
              <span className="block text-sm text-muted">Inactive businesses stop getting new daily tasks and are hidden from assignment lists.</span>
            </span>
          </label>

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
