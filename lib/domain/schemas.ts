import { z } from "zod";
import { BUSINESS_COLOR_IDS } from "@/lib/domain/business-colors";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time like 09:00");
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** ISO weekdays: 1 = Monday … 7 = Sunday. */
export const workDaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1, "Pick at least one working day")
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

export const businessInputSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a business name").max(60),
    color: z.enum(BUSINESS_COLOR_IDS),
    workStart: hhmm,
    workEnd: hhmm,
    workDays: workDaysSchema,
    active: z.boolean(),
  })
  .refine((b) => toMinutes(b.workEnd) > toMinutes(b.workStart), {
    path: ["workEnd"],
    message: "Closing time must be after opening time",
  });
export type BusinessInput = z.infer<typeof businessInputSchema>;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, "3–32 characters: letters, numbers, dot, dash or underscore");

/** International format, e.g. +923001234567. Optional until WhatsApp is used. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Use international format, like +923001234567");

export const passwordSchema = z.string().min(8, "At least 8 characters").max(128);

const employeeBase = {
  name: z.string().trim().min(2, "Enter the full name").max(80),
  contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email")]).transform((v) => v || null),
  phone: z.union([z.literal(""), phoneSchema]).transform((v) => v || null),
  businessId: z.string().min(1, "Choose a business"),
  designation: z.string().trim().max(60).default(""),
  workStart: z.union([z.literal(""), hhmm]).transform((v) => v || null),
  workEnd: z.union([z.literal(""), hhmm]).transform((v) => v || null),
};

type WithHours = { workStart: string | null; workEnd: string | null };
const hoursOk = (e: WithHours) => (e.workStart === null) === (e.workEnd === null) && (e.workStart === null || toMinutes(e.workEnd!) > toMinutes(e.workStart));
const hoursIssue = { path: ["workEnd"], message: "Set both times, with closing after opening" };

export const createEmployeeSchema = z
  .object({ ...employeeBase, username: usernameSchema, password: passwordSchema })
  .refine(hoursOk, hoursIssue);
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object(employeeBase).refine(hoursOk, hoursIssue);
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeStatusSchema = z.object({ status: z.enum(["active", "disabled"]) });
export const resetPasswordSchema = z.object({ password: passwordSchema });
