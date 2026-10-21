/** Curated, contrast-verified swatches (see `--biz-*` tokens in globals.css). Admin picks one; never a free hex. */
export const BUSINESS_COLORS = [
  { id: "indigo", label: "Indigo" },
  { id: "violet", label: "Violet" },
  { id: "pink", label: "Pink" },
  { id: "rose", label: "Rose" },
  { id: "amber", label: "Amber" },
  { id: "emerald", label: "Emerald" },
  { id: "teal", label: "Teal" },
  { id: "sky", label: "Sky" },
] as const;

export type BusinessColorId = (typeof BUSINESS_COLORS)[number]["id"];

export const BUSINESS_COLOR_IDS = BUSINESS_COLORS.map((c) => c.id) as [BusinessColorId, ...BusinessColorId[]];

/** CSS colour for a stored swatch id; unknown ids fall back to indigo so old data never renders unstyled. */
export function businessColorVar(id: string): string {
  return `var(--biz-${BUSINESS_COLORS.some((c) => c.id === id) ? id : "indigo"})`;
}
