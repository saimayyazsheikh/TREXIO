"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

/**
 * Pick one business, then one or more of its people. Everyone on a task belongs to the same business,
 * so switching business clears the selection.
 */
export function AssigneePicker({
  value,
  onChange,
  employees,
  businesses,
  error,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  employees: WithId<UserDoc>[];
  businesses: WithId<BusinessDoc>[];
  error?: string;
}) {
  const initialBusiness = employees.find((e) => e.id === value[0])?.businessId ?? (businesses.length === 1 ? businesses[0].id : "");
  const [businessId, setBusinessId] = useState(initialBusiness);
  const people = employees.filter((e) => e.businessId === businessId && (e.status === "active" || value.includes(e.id)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="assignee-business" className="text-sm font-medium">
          Business <span aria-hidden className="text-danger">*</span>
        </label>
        <Select
          id="assignee-business"
          value={businessId}
          onChange={(e) => {
            setBusinessId(e.target.value);
            onChange([]);
          }}
        >
          <option value="">Choose a business…</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>

      <fieldset aria-describedby={error ? "assignee-error" : undefined}>
        <legend className="mb-1.5 text-sm font-medium">
          Assign to <span aria-hidden className="text-danger">*</span>
        </legend>
        {!businessId ? (
          <p className="text-sm text-muted">Choose a business first, then pick one or more people.</p>
        ) : people.length === 0 ? (
          <p className="text-sm text-muted">No active team members in this business yet.</p>
        ) : (
          <ul className="space-y-1">
            {people.map((p) => {
              const checked = value.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-surface-raised">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--brand)]"
                      checked={checked}
                      onChange={() => onChange(checked ? value.filter((id) => id !== p.id) : [...value, p.id])}
                    />
                    <span className="text-sm">
                      {p.name}
                      {p.designation ? <span className="text-muted"> · {p.designation}</span> : null}
                      {p.status === "disabled" ? <span className="text-danger"> (turned off)</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {error ? (
          <p id="assignee-error" className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
