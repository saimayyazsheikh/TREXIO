"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { validateAttachment } from "@/lib/firebase/upload";
import { formatBytes } from "@/lib/utils";

/** The files chosen so far, each removable. */
export function PickedFiles({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="space-y-1">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="num text-muted">{formatBytes(f.size)}</span>
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
            <X aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Files chosen but not yet uploaded; the parent uploads them on submit.
 * `compact` renders just an icon button (the parent shows `PickedFiles` wherever it likes).
 */
export function AttachmentPicker({ files, onChange, max, label = "Attach files", compact = false }: { files: File[]; onChange: (files: File[]) => void; max: number; label?: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function add(list: FileList | null) {
    const incoming = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    const bad = incoming.map(validateAttachment).find(Boolean);
    if (bad) return setError(bad);
    if (files.length + incoming.length > max) return setError(`You can attach up to ${max} files.`);
    setError(null);
    onChange([...files, ...incoming]);
  }

  const hidden = <input ref={input} type="file" multiple className="sr-only" aria-label={label} tabIndex={-1} onChange={(e) => add(e.target.files)} />;
  const errorLine = error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;

  if (compact) {
    return (
      <div className="flex flex-col items-center">
        {hidden}
        <Tooltip label={label}>
          <Button type="button" variant="secondary" size="icon" aria-label={label} disabled={files.length >= max} onClick={() => input.current?.click()}>
            <Paperclip aria-hidden />
          </Button>
        </Tooltip>
        {errorLine}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <PickedFiles files={files} onChange={onChange} />
      {hidden}
      <Button type="button" variant="secondary" size="sm" className="self-start" disabled={files.length >= max} onClick={() => input.current?.click()}>
        <Paperclip aria-hidden /> {label}
      </Button>
      {errorLine ?? <p className="text-sm text-muted">Up to {max} files, 10 MB each.</p>}
    </div>
  );
}

/** Saved attachments as links (images get a small preview). */
export function AttachmentLinks({ files }: { files: { name: string; url: string; type: string }[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((a) => (
        <li key={a.url}>
          {a.type.startsWith("image/") ? (
            <a href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-control border border-border-solid" aria-label={`Open image ${a.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage URLs, not optimisable by next/image */}
              <img src={a.url} alt={a.name} className="max-h-40 max-w-56 object-cover" />
            </a>
          ) : (
            <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border-solid px-3 text-sm text-brand-text hover:bg-surface-raised">
              <Paperclip className="size-3.5" aria-hidden /> {a.name}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
