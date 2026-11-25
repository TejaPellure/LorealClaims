/** Lower-case a benefit label into a stable tag: "Acne / Blemishes" -> "acne-blemishes". Formatting only. */
export function normalizeBenefit(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
