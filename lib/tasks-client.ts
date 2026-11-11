import { apiFetch } from "@/lib/api-client";
import type { TaskStatus } from "@/lib/domain/constants";

export const transitionTask = (taskId: string, status: TaskStatus, reason?: string) =>
  apiFetch("/api/tasks/transition", "POST", { taskId, status, ...(reason ? { reason } : {}) });

export const commentOnTask = (taskId: string, text: string, about: "comment" | "finish" | "step" = "comment", subtaskTitle?: string) =>
  apiFetch("/api/tasks/comment", "POST", { taskId, text, about, ...(subtaskTitle ? { subtaskTitle } : {}) });

export const explainMissed = (taskId: string, reason: string) => apiFetch("/api/tasks/reason", "POST", { taskId, reason });

export const toggleSubtask = (taskId: string, subtaskId: string, done: boolean) =>
  apiFetch("/api/tasks/subtask", "POST", { taskId, subtaskId, done });

export const setAllSubtasks = (taskId: string, done: boolean) => apiFetch("/api/tasks/subtask/all", "POST", { taskId, done });

export type PersonalStepCall = { op: "add"; title: string } | { op: "toggle"; stepId: string; done: boolean } | { op: "all"; done: boolean } | { op: "remove"; stepId: string };
export const changeMySteps = (taskId: string, call: PersonalStepCall) => apiFetch("/api/tasks/my-steps", "POST", { taskId, ...call });

export type SelfTaskForm = { title: string; description: string; priority: "high" | "medium" | "low"; date: string; dueTime: string };
export const addMyTask = (form: SelfTaskForm & { subtasks: string[] }) => apiFetch("/api/me/tasks", "POST", form);
export const editMyTask = (taskId: string, form: SelfTaskForm & { subtasks: { id?: string; title: string }[] }) => apiFetch("/api/me/tasks", "PATCH", { taskId, ...form });
export const deleteMyTask = (taskId: string) => apiFetch("/api/me/tasks", "DELETE", { taskId });
