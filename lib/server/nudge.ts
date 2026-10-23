import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import { sendWhatsApp, type WaDeps } from "@/lib/server/whatsapp";

export const nudgeSchema = z.object({
  taskId: z.string().min(1).max(60),
  toUid: z.string().min(1).max(60),
  message: z.string().trim().min(3, "Write a short message").max(600, "Keep it under 600 characters"),
});
export type NudgeInput = z.infer<typeof nudgeSchema>;

type Doc = Record<string, unknown>;

/** Admin sends a WhatsApp nudge about one task to one of its assignees. Logged in whatsappLogs either way. */
export async function sendTaskNudge(deps: { get(path: string): Promise<Doc | null>; wa: WaDeps }, input: NudgeInput): Promise<{ status: "sent" | "mock"; logId: string }> {
  const task = await deps.get(`tasks/${input.taskId}`);
  if (!task) throw new DomainError("That task doesn't exist any more.", 404);
  if (!(task.assigneeIds as string[]).includes(input.toUid)) throw new DomainError("That person isn't assigned to this task.", 400);
  const user = await deps.get(`users/${input.toUid}`);
  if (!user || user.role !== "employee") throw new DomainError("That team member doesn't exist.", 404);
  if (user.status !== "active") throw new DomainError(`${String(user.name)} is turned off.`, 409);
  const name = String(user.name);
  return sendWhatsApp(deps.wa, {
    kind: "nudge",
    to: String(user.phone ?? ""),
    toUid: input.toUid,
    toName: name,
    text: input.message,
    taskId: input.taskId,
    params: [name.split(" ")[0], input.message],
  });
}
