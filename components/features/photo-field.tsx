"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { validateImage } from "@/lib/firebase/upload";

/** Picks an image (PNG/JPG/WebP, < 2 MB) and previews it. Upload happens when the parent form is saved. */
export function PhotoField({
  label,
  name,
  currentUrl,
  file,
  removed,
  onChange,
}: {
  label: string;
  /** Name used for the initials fallback. */
  name: string;
  currentUrl: string | null;
  file: File | null;
  removed: boolean;
  onChange: (next: { file: File | null; removed: boolean }) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview ?? (removed ? null : currentUrl);

  function pick(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    const problem = validateImage(picked);
    setError(problem);
    if (!problem) onChange({ file: picked, removed: false });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || "?"} src={shown} size="lg" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => pick(e.target.files)}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden /> {shown ? "Change" : "Upload"}
          </Button>
          {shown ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ file: null, removed: true })}>
              <Trash2 aria-hidden /> Remove
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-muted">PNG, JPG or WebP, under 2 MB.</p>
        )}
      </div>
    </div>
  );
}
