import type { AlertSeverity } from './types';

interface AlertBadgeProps {
  severity: AlertSeverity;
  message: string;
  source?: string;
  timestamp?: Date;
  compact?: boolean;
}

const severityConfig = {
  info:     { bar: 'bg-blue',  bg: 'bg-blue-soft',  border: 'border-blue/20',  text: 'text-blue',  icon: '💡', label: 'Info' },
  warning:  { bar: 'bg-amber', bg: 'bg-amber-soft', border: 'border-amber/20', text: 'text-amber', icon: '⚠️', label: 'Warning' },
  critical: { bar: 'bg-red',   bg: 'bg-red-soft',   border: 'border-red/20',   text: 'text-red',   icon: '🔴', label: 'Critical' },
};

export default function AlertBadge({ severity, message, source, timestamp, compact = false }: AlertBadgeProps) {
  const cfg = severityConfig[severity];

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
        <span>{cfg.icon}</span>
        <span>{message}</span>
      </span>
    );
  }

  return (
    <div className={`flex overflow-hidden rounded-lg border ${cfg.bg} ${cfg.border}`}>
      <div className={`w-1 shrink-0 ${cfg.bar}`} />
      <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-medium leading-snug ${cfg.text}`}>{message}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          {source && <span>Source: <span className="font-medium capitalize">{source}</span></span>}
          {source && timestamp && <span>·</span>}
          {timestamp && (
            <span>
              {timestamp.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
