export type TextPart = { text: string; href?: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
/** Punctuation that usually ends a sentence rather than the address ("see https://a.com/x." keeps the dot out). */
const TRAILING = /[.,;:!?)\]}]+$/;

/** Splits plain text into pieces, marking the web addresses so they can be shown as links. Nothing else in the text changes. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const trimmed = raw.replace(TRAILING, "");
    if (trimmed.length <= "https://".length) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: trimmed, href: trimmed });
    last = start + trimmed.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}
