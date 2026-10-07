"use client";

import { useTranslations } from "next-intl";

// When a recommendation's work happens: start time and duration. Shared by the
// Recommendations page and the field assistant's draft cards.

/** datetime-local value for the next full hour, in the browser's timezone. */
export function nextHourLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

/** Default hours booked for a category, as the server uses (utils/recommendation-effects.ts). */
export function defaultHoursFor(category: string): string {
  return String(category === "irrigate" ? 4 : category === "scout" ? 1 : 2);
}

export default function ScheduleFields({
  startLocal, setStartLocal, durationHours, setDurationHours,
}: {
  startLocal: string;
  setStartLocal: (v: string) => void;
  durationHours: string;
  setDurationHours: (v: string) => void;
}) {
  const t = useTranslations('recommendations');
  return (
    <div className="grid grid-cols-[1fr_110px] gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        {t('startTime')}
        <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green/30" />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        {t('durationHours')}
        <input type="number" min="0.5" step="0.5" value={durationHours} onChange={(e) => setDurationHours(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-green/30" />
      </label>
    </div>
  );
}
