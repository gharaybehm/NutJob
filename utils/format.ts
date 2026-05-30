/**
 * Locale-aware formatting utilities.
 *
 * Uses the Intl API so numbers, percentages, and dates automatically
 * adapt to Arabic (Eastern Arabic numerals), Turkish (comma decimals),
 * and English conventions.
 */

/** Format an integer or decimal number for display (e.g. 1,234 → ١٬٢٣٤ in ar) */
export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Format a percentage value (0–100 input) → "45%" / "٤٥٪" */
export function formatPercent(value: number, locale: string, fractionDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'percent',
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Format a temperature with ° symbol: 32 → "32°" / "٣٢°" */
export function formatTemp(value: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}°`;
}

/** Format a measurement value with a unit suffix, e.g. "12 mm" */
export function formatMeasurement(value: number, unit: string, locale: string, fractionDigits = 0): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: fractionDigits }).format(value)} ${unit}`;
}

/** Locale-aware short date: "30 May" / "٣٠ مايو" */
export function formatShortDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

/** Locale-aware weekday: "Mon" / "الاثنين" */
export function formatWeekday(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
}

/** Locale-aware full month + year: "May 2026" / "مايو ٢٠٢٦" */
export function formatMonthYear(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
}

/** Map locale codes to full language names for AI prompts */
export function localeToLanguageName(locale: string): string {
  const map: Record<string, string> = {
    en: 'English',
    ar: 'Arabic',
    tr: 'Turkish',
  };
  return map[locale] ?? 'English';
}
