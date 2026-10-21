export const WEEKDAYS = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 7, short: "Sun", long: "Sunday" },
] as const;

/** "Mon–Fri", "Mon, Wed, Sat", "Every day". Consecutive runs of 3+ days are collapsed to a range. */
export function describeWorkDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  const name = (n: number) => WEEKDAYS[n - 1].short;
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${name(sorted[i])}–${name(sorted[j])}`);
    else for (let k = i; k <= j; k++) parts.push(name(sorted[k]));
    i = j + 1;
  }
  return parts.join(", ");
}
