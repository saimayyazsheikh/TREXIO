export const ROLES = ["admin", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "under_review", "completed", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To-Do",
  in_progress: "In Progress",
  under_review: "Under Review",
  completed: "Completed",
  blocked: "Blocked",
};

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Sort weight: lower sorts first. */
export const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
