import type { DataSource } from './types';

const sourceConfig: Record<DataSource, { label: string; classes: string }> = {
  sensor:   { label: 'Sensor',   classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  manual:   { label: 'Manual',   classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  computed: { label: 'Computed', classes: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  forecast: { label: 'Forecast', classes: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
};

interface SourceBadgeProps {
  source: DataSource;
  updatedAt?: Date;
}

export default function SourceBadge({ source, updatedAt }: SourceBadgeProps) {
  const cfg = sourceConfig[source];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.classes}`}>
        {cfg.label}
      </span>
      {updatedAt && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {updatedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  );
}
