"use client";

import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebase } from "@/lib/firebase/client";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

export type UploadedFile = { name: string; url: string; size: number; type: string };

/** Returns a friendly message if the file can't be used as a profile image/logo, else null. */
export function validateImage(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Use a PNG, JPG or WebP image.";
  if (file.size >= MAX_IMAGE_BYTES) return "That image is over 2 MB. Choose a smaller one.";
  return null;
}

/** Returns a friendly message if the file is too big to attach, else null. */
export function validateAttachment(file: File): string | null {
  return file.size >= MAX_FILE_BYTES ? `${file.name} is over 10 MB.` : null;
}

export async function uploadImage(path: string, file: File): Promise<string> {
  const r = ref(getFirebase().storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}

/** Uploads any attachment under `folder` (no trailing slash) and returns the metadata the server stores. */
export async function uploadAttachment(folder: string, file: File): Promise<UploadedFile> {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const r = ref(getFirebase().storage, `${folder}/${Date.now()}-${safe}`);
  const type = file.type || "application/octet-stream";
  await uploadBytes(r, file, { contentType: type });
  return { name: file.name, url: await getDownloadURL(r), size: file.size, type };
}

/** Best effort: a missing object is fine. */
export async function removeImage(path: string): Promise<void> {
  await deleteObject(ref(getFirebase().storage, path)).catch(() => undefined);
}

/** A random alphanumeric id minted in the browser so files can be uploaded before their document exists. */
export function newClientId(length = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}
