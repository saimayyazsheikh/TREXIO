/**
 * How well a typed phrase matches a title and its extra words. 0 means no match. Every typed word must appear somewhere;
 * a title that starts with the phrase beats one that merely contains it, and a title beats the extra words.
 */
export function matchScore(phrase: string, title: string, extra = ""): number {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const t = title.toLowerCase();
  const x = extra.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (t.startsWith(w)) score += 6;
    else if (t.split(/[\s\-/]+/).some((part) => part.startsWith(w))) score += 4;
    else if (t.includes(w)) score += 2;
    else if (x.includes(w)) score += 1;
    else return 0;
  }
  if (t === phrase.trim().toLowerCase()) score += 10;
  return score;
}
