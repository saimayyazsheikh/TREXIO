import { phoneSchema } from "@/lib/domain/schemas";

/** wa.me links break past a couple of thousand characters, so the message is cut to fit once it is percent-encoded. */
export const MAX_ENCODED_TEXT = 1800;

/** Digits only, no plus sign, which is what wa.me wants. Null when the stored number isn't a valid international number. */
export function waDigits(phone: string | null | undefined): string | null {
  const parsed = phoneSchema.safeParse((phone ?? "").trim());
  return parsed.success ? parsed.data.slice(1) : null;
}

/** Shortens `text` until its encoded form fits, never cutting a character in half. */
export function fitForLink(text: string, maxEncoded = MAX_ENCODED_TEXT): string {
  const flat = text.trim();
  if (encodeURIComponent(flat).length <= maxEncoded) return flat;
  const chars = [...flat];
  let end = chars.length;
  while (end > 0 && encodeURIComponent(`${chars.slice(0, end).join("")}…`).length > maxEncoded) end--;
  return `${chars.slice(0, end).join("").trimEnd()}…`;
}

/**
 * The link that opens WhatsApp (app or web) on a chat with `phone` and the message already typed in. The admin just
 * presses send. Null when there is no usable number. With no phone at all, `shareLink` opens the chat chooser instead.
 */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const digits = waDigits(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(fitForLink(text))}` : null;
}

/** Opens WhatsApp's own "choose a chat" screen with the text ready, for sharing a summary with anyone. */
export const shareLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(fitForLink(text))}`;
