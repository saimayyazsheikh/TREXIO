import { z } from "zod";
import { pktHour, pktMinute } from "@/lib/time";

export type QuietHours = { from: string; to: string };

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 22:00");

/** What a person saves: switch it on or off, and the two times. */
export const quietHoursSchema = z
  .object({ enabled: z.boolean(), from: hhmm, to: hhmm })
  .refine((q) => !q.enabled || q.from !== q.to, { path: ["to"], message: "Pick two different times" });
export type QuietHoursInput = z.infer<typeof quietHoursSchema>;

const minutes = (hhmmText: string) => Number(hhmmText.slice(0, 2)) * 60 + Number(hhmmText.slice(3));

/**
 * Whether `now` (Pakistan time) falls inside the quiet window. A window may cross midnight: 22:00 to 07:00 is quiet from
 * ten at night until seven in the morning. Quiet hours only hold back phone and browser alerts; the bell still fills up.
 */
export function isQuiet(now: Date, quiet: QuietHours | null | undefined): boolean {
  if (!quiet) return false;
  const at = pktHour(now) * 60 + pktMinute(now);
  const from = minutes(quiet.from);
  const to = minutes(quiet.to);
  if (from === to) return false;
  return from < to ? at >= from && at < to : at >= from || at < to;
}

/** The push tokens to send to: everyone's devices except the people who are in their quiet hours right now. */
export function pushTokensFor(users: { fcmTokens?: string[]; quietHours?: QuietHours | null }[], now: Date): string[] {
  return users.filter((u) => !isQuiet(now, u.quietHours)).flatMap((u) => u.fcmTokens ?? []);
}
