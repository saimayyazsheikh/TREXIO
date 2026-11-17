import { DomainError } from "@/lib/domain/errors";
import { PAGES, mergeSettings, type RunActionInput } from "@/lib/domain/assistant-actions";
import { resolveSettings, type AutomationSettings } from "@/lib/domain/automation";
import { taskEditInput } from "@/lib/domain/bulk";
import { calendarId } from "@/lib/domain/timeoff";
import { businessInputSchema, createEmployeeSchema, updateEmployeeSchema } from "@/lib/domain/schemas";
import { createTemplateSchema, updateTaskSchema, updateTemplateSchema } from "@/lib/domain/task-schemas";
import type { Actor } from "@/lib/domain/tasks";
import { sendReminder, type DocDb } from "@/lib/server/communication";
import { createEmployee, resetEmployeePassword, setEmployeeStatus, updateEmployee, type Deps as EmployeeDeps } from "@/lib/server/employees";
import { handleLeave } from "@/lib/server/time-off";
import { createTemplate, deleteTemplate, updateTemplate } from "@/lib/server/templates";
import { deleteTask, transitionTask, updateOneOffTask, type TaskDb } from "@/lib/server/task-store";
import type { UserDoc } from "@/types/models";

type Employee = Pick<UserDoc, "name" | "contactEmail" | "phone" | "businessId" | "designation" | "workStart" | "workEnd">;
type BusinessRecord = { name: string; color: string; workStart: string; workEnd: string; workDays: number[]; active: boolean };

/** Everything the confirmed actions touch, so the same code runs for real and in tests. */
export type RunDeps = {
  actor: Actor;
  taskDb: TaskDb;
  docDb: DocDb;
  employees: EmployeeDeps;
  newId(): string;
  getEmployee(uid: string): Promise<Employee | null>;
  /** Gives today's copy of a routine to its person right away (instead of waiting for the nightly job). */
  afterRoutineChange(employeeId: string): Promise<void>;
  getSettings(): Promise<unknown>;
  saveSettings(settings: AutomationSettings): Promise<void>;
  setCalendar(id: string, data: { date: string; name: string; type: "holiday" | "closure"; businessId: string | null }): Promise<void>;
  deleteCalendar(id: string): Promise<boolean>;
  createBusiness(data: BusinessRecord): Promise<string>;
  getBusiness(id: string): Promise<BusinessRecord | null>;
  updateBusiness(id: string, data: BusinessRecord): Promise<void>;
};

export type RunResult = { message: string; href?: string };

/**
 * Runs one action the admin confirmed. The payload is checked again by the caller's schema, and every change then goes through the
 * same function the normal screen uses, so each of those functions' own rules (who may do it, what is allowed) still apply.
 * Passwords arrive only here, typed into the card; they are never part of what the AI saw.
 */
export async function runAssistantAction(deps: RunDeps, input: RunActionInput): Promise<RunResult> {
  if (deps.actor.role !== "admin") throw new DomainError("Only the admin can do this.", 403);
  const { action, password } = input;

  switch (action.kind) {
    case "task.update": {
      const task = await deps.taskDb.transaction((tx) => tx.getTask(action.taskId));
      if (!task) throw new DomainError("That task doesn't exist any more.", 404);
      await updateOneOffTask(deps.taskDb, deps.actor, updateTaskSchema.parse(taskEditInput(task, action.taskId, action.changes)));
      return { message: `Updated “${action.changes.title ?? task.title}”.` };
    }
    case "task.delete": {
      const task = await deps.taskDb.transaction((tx) => tx.getTask(action.taskId));
      await deleteTask(deps.taskDb, deps.actor, action.taskId);
      return { message: `Deleted “${task?.title ?? "the task"}”.` };
    }
    case "task.status": {
      const task = await deps.taskDb.transaction((tx) => tx.getTask(action.taskId));
      await transitionTask(deps.taskDb, deps.actor, { taskId: action.taskId, status: action.status });
      return { message: `“${task?.title ?? "The task"}” is now ${action.status === "completed" ? "done" : action.status === "in_progress" ? "in progress" : "to-do"}.` };
    }

    case "reminder.send": {
      const result = await sendReminder(deps.docDb, deps.actor, { id: deps.newId(), body: action.message, toUids: action.toUids, toAll: action.toAll, taskId: null });
      return { message: `Reminder sent to ${result.recipients} ${result.recipients === 1 ? "person" : "people"}.` };
    }
    case "leave.decide": {
      await handleLeave(deps.docDb, deps.actor, { action: "decide", requestId: action.requestId, decision: action.decision, note: action.note });
      return { message: action.decision === "approve" ? "Leave approved." : "Leave rejected." };
    }

    case "routine.create": {
      const parsed = createTemplateSchema.parse({
        employeeId: action.employeeId,
        title: action.title,
        description: action.description,
        priority: action.priority,
        dueTime: action.dueTime,
        subtasks: action.steps.map((title) => ({ title })),
        activeDays: action.activeDays,
        active: true,
      });
      await createTemplate(deps.taskDb, deps.actor, parsed);
      await deps.afterRoutineChange(action.employeeId);
      return { message: `Daily routine “${action.title}” added.` };
    }
    case "routine.update": {
      const current = await deps.taskDb.transaction((tx) => tx.getTemplate(action.templateId));
      if (!current) throw new DomainError("That routine doesn't exist any more.", 404);
      const c = action.changes;
      // Steps keep their ids when the wording is unchanged, so today's progress on them isn't lost.
      const subtasks = c.steps ? c.steps.map((title) => ({ id: current.subtasks.find((s) => s.title === title)?.id, title })) : current.subtasks.map((s) => ({ id: s.id, title: s.title }));
      const parsed = updateTemplateSchema.parse({
        templateId: action.templateId,
        title: c.title ?? current.title,
        description: c.description ?? current.description,
        priority: c.priority ?? current.priority,
        dueTime: c.dueTime !== undefined ? c.dueTime : (current.dueTime ?? ""),
        subtasks,
        activeDays: c.activeDays ?? current.activeDays,
        active: c.active ?? current.active,
      });
      await updateTemplate(deps.taskDb, deps.actor, parsed);
      await deps.afterRoutineChange(current.employeeId);
      return { message: c.active === false && Object.keys(c).length === 1 ? `Paused “${current.title}”.` : c.active === true && Object.keys(c).length === 1 ? `Resumed “${current.title}”.` : `Updated the routine “${c.title ?? current.title}”.` };
    }
    case "routine.delete": {
      const current = await deps.taskDb.transaction((tx) => tx.getTemplate(action.templateId));
      await deleteTemplate(deps.taskDb, deps.actor, action.templateId);
      return { message: `Deleted the routine “${current?.title ?? ""}”.`.replace(" “”", "") };
    }

    case "employee.create": {
      if (!password) throw new DomainError("Choose a password for them first.", 400);
      const parsed = createEmployeeSchema.parse({ name: action.name, contactEmail: "", phone: action.phone, businessId: action.businessId, designation: action.designation, workStart: "", workEnd: "", username: action.username, password });
      await createEmployee(deps.employees, parsed);
      return { message: `${action.name} added. They sign in with the workspace code and the username “${parsed.username}”.` };
    }
    case "employee.update": {
      const current = await deps.getEmployee(action.employeeId);
      if (!current) throw new DomainError("That team member doesn't exist.", 404);
      const c = action.changes;
      const parsed = updateEmployeeSchema.parse({
        name: c.name ?? current.name,
        contactEmail: current.contactEmail ?? "",
        phone: c.phone !== undefined ? c.phone : (current.phone ?? ""),
        businessId: c.businessId ?? current.businessId ?? "",
        designation: c.designation !== undefined ? c.designation : current.designation,
        workStart: c.workStart !== undefined ? c.workStart : (current.workStart ?? ""),
        workEnd: c.workEnd !== undefined ? c.workEnd : (current.workEnd ?? ""),
      });
      await updateEmployee(deps.employees, action.employeeId, parsed);
      return { message: `Updated ${parsed.name}.` };
    }
    case "employee.status": {
      await setEmployeeStatus(deps.employees, action.employeeId, action.status);
      return { message: action.status === "disabled" ? "Turned off. They are signed out." : "Turned back on." };
    }
    case "employee.password": {
      if (!password) throw new DomainError("Choose the new password first.", 400);
      await resetEmployeePassword(deps.employees, action.employeeId, password);
      return { message: "Password changed. They are signed out everywhere." };
    }

    case "holiday.add": {
      await deps.setCalendar(calendarId(action.date, action.businessId), { date: action.date, name: action.name, type: action.businessId === null ? "holiday" : "closure", businessId: action.businessId });
      return { message: `${action.name} added for ${action.date}.` };
    }
    case "holiday.remove": {
      const removed = await deps.deleteCalendar(calendarId(action.date, action.businessId));
      if (!removed) throw new DomainError("There is no holiday or closure like that on that day.", 404);
      return { message: "Removed." };
    }

    case "business.create": {
      const parsed = businessInputSchema.parse({ name: action.name, color: action.color, workStart: action.workStart, workEnd: action.workEnd, workDays: action.workDays, active: true });
      await deps.createBusiness(parsed);
      return { message: `${parsed.name} added.` };
    }
    case "business.update": {
      const current = await deps.getBusiness(action.businessId);
      if (!current) throw new DomainError("That business doesn't exist.", 404);
      const parsed = businessInputSchema.parse({ ...current, ...action.changes });
      await deps.updateBusiness(action.businessId, parsed);
      return { message: `Updated ${parsed.name}.` };
    }

    case "settings.update": {
      const merged = mergeSettings(resolveSettings(await deps.getSettings()), action.changes);
      if (!merged.ok) throw new DomainError(merged.message, 400);
      await deps.saveSettings(merged.settings);
      return { message: "Settings saved." };
    }

    case "open.page":
      return { message: `Opening ${PAGES[action.page].label}.`, href: PAGES[action.page].href };
  }
}
