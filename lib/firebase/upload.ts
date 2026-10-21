"use client";

import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebase } from "@/lib/firebase/client";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/** Returns a friendly message if the file can't be used as a profile image/logo, else null. */
export function validateImage(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return "Use a PNG, JPG or WebP image.";
  if (file.size >= MAX_IMAGE_BYTES) return "That image is over 2 MB. Choose a smaller one.";
  return null;
}

export async function uploadImage(path: string, file: File): Promise<string> {
  const r = ref(getFirebase().storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}

/** Best effort: a missing object is fine. */
export async function removeImage(path: string): Promise<void> {
  await deleteObject(ref(getFirebase().storage, path)).catch(() => undefined);
}
