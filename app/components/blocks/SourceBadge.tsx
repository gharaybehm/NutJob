import type { DataSource } from './types';

const sourceConfig: Record<DataSource, { label: string; classes: string }> = {
  sensor:   { label: 'Sensor',   classes: 'bg-blue-soft text-blue' },
  manual:   { label: 'Manual',   classes: 'bg-purple-soft text-purple' },
  computed: { label: 'Computed', classes: 'bg-teal-soft text-teal' },
  forecast: { label: 'Forecast', classes: 'bg-gold-soft text-gold' },
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
        <span className="text-xs text-ink-4">
          {updatedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  );
}
