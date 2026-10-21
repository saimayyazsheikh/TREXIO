import { apiFetch } from "@/lib/api-client";
import type { TaskStatus } from "@/lib/domain/constants";

export const transitionTask = (taskId: string, status: TaskStatus, reason?: string) =>
  apiFetch("/api/tasks/transition", "POST", { taskId, status, ...(reason ? { reason } : {}) });

export const toggleSubtask = (taskId: string, subtaskId: string, done: boolean) =>
  apiFetch("/api/tasks/subtask", "POST", { taskId, subtaskId, done });
