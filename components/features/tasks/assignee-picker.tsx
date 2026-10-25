"use client";

import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BusinessDoc, UserDoc, WithId } from "@/types/models";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  employees: WithId<UserDoc>[];
  businesses: WithId<BusinessDoc>[];
  error?: string;
  /** Creating: one, several or all businesses (each gets its own copy of the task). Editing keeps a task in its one business. */
  multi?: boolean;
};

export function AssigneePicker(props: Props) {
  return props.multi ? <MultiBusinessPicker {...props} /> : <SingleBusinessPicker {...props} />;
}

const person = (p: WithId<UserDoc>) => (
  <span className="text-sm">
    {p.name}
    {p.designation ? <span className="text-muted"> · {p.designation}</span> : null}
    {p.status === "disabled" ? <span className="text-danger"> (turned off)</span> : null}
  </span>
);

/** Several businesses at once, or all of them: tick a business to bring in its people, then adjust who exactly. */
function MultiBusinessPicker({ value, onChange, employees, businesses, error }: Props) {
  const active = (b: string) => employees.filter((e) => e.businessId === b && e.status === "active");
  const [picked, setPicked] = useState<string[]>(() => {
    const fromValue = [...new Set(employees.filter((e) => value.includes(e.id)).map((e) => e.businessId).filter((b): b is string => !!b))];
    return fromValue.length ? fromValue : businesses.length === 1 ? [businesses[0].id] : [];
  });

  const allPicked = businesses.length > 0 && picked.length === businesses.length;
  const everyone = (ids: string[]) => ids.flatMap((b) => active(b).map((e) => e.id));

  // A single business starts with its people ticked, the same as ticking it.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (value.length === 0 && picked.length === 1) onChange(everyone(picked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleBusiness(id: string) {
    if (picked.includes(id)) {
      setPicked(picked.filter((b) => b !== id));
      const theirs = new Set(employees.filter((e) => e.businessId === id).map((e) => e.id));
      onChange(value.filter((v) => !theirs.has(v)));
    } else {
      setPicked([...picked, id]);
      onChange([...new Set([...value, ...active(id).map((e) => e.id)])]);
    }
  }

  function toggleAll() {
    if (allPicked) {
      setPicked([]);
      onChange([]);
    } else {
      const ids = businesses.map((b) => b.id);
      setPicked(ids);
      onChange(everyone(ids));
    }
  }

  const toggleOne = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">
          Businesses <span aria-hidden className="text-danger">*</span>
        </legend>
        <p className="mb-2 text-sm text-muted">Pick one, several, or all. Each business gets its own copy of the task.</p>
        <div className="flex flex-wrap gap-2">
          <label className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors", allPicked ? "border-brand bg-brand-soft text-brand-text" : "border-border-solid hover:bg-surface-raised")}>
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={allPicked} onChange={toggleAll} />
            All businesses
          </label>
          {businesses.map((b) => {
            const on = picked.includes(b.id);
            const chosen = employees.filter((e) => e.businessId === b.id && value.includes(e.id)).length;
            return (
              <label key={b.id} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors", on ? "border-brand bg-brand-soft text-brand-text" : "border-border-solid hover:bg-surface-raised")}>
                <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={on} onChange={() => toggleBusiness(b.id)} />
                {b.name}
                {on ? <span className="num text-xs opacity-70">{chosen}/{active(b.id).length}</span> : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset aria-describedby={error ? "assignee-error" : undefined}>
        <legend className="mb-1.5 text-sm font-medium">
          Assign to <span aria-hidden className="text-danger">*</span>
        </legend>
        {picked.length === 0 ? (
          <p className="text-sm text-muted">Choose at least one business first.</p>
        ) : (
          <div className="space-y-4">
            {picked.map((bid) => {
              const biz = businesses.find((b) => b.id === bid);
              const people = employees.filter((e) => e.businessId === bid && (e.status === "active" || value.includes(e.id)));
              const ids = active(bid).map((e) => e.id);
              const all = ids.length > 0 && ids.every((i) => value.includes(i));
              return (
                <div key={bid}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{biz?.name ?? "Business"}</p>
                    {ids.length > 1 ? (
                      <button type="button" className="text-xs font-medium text-brand-text hover:underline" onClick={() => onChange(all ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])])}>
                        {all ? "Clear everyone" : "Select everyone"}
                      </button>
                    ) : null}
                  </div>
                  {people.length === 0 ? (
                    <p className="text-sm text-muted">No active team members in this business yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {people.map((p) => (
                        <li key={p.id}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 hover:bg-surface-raised">
                            <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={value.includes(p.id)} onChange={() => toggleOne(p.id)} />
                            {person(p)}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
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

/**
 * Pick one business, then one or more of its people. Everyone on a task belongs to the same business,
 * so switching business clears the selection.
 */
function SingleBusinessPicker({ value, onChange, employees, businesses, error }: Props) {
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
                    <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={checked} onChange={() => onChange(checked ? value.filter((id) => id !== p.id) : [...value, p.id])} />
                    {person(p)}
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
