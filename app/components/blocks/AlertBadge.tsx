import type { AlertSeverity } from './types';

interface AlertBadgeProps {
  severity: AlertSeverity;
  message: string;
  source?: string;
  timestamp?: Date;
  compact?: boolean;
}

const severityConfig = {
  info:     { bar: 'bg-brand-500',  bg: 'bg-brand-50 dark:bg-brand-950/40',  border: 'border-brand-200 dark:border-brand-800',  text: 'text-brand-800 dark:text-brand-200',  icon: '💡', label: 'Info' },
  warning:  { bar: 'bg-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/40',  border: 'border-amber-200 dark:border-amber-800',  text: 'text-amber-800 dark:text-amber-200',  icon: '⚠️', label: 'Warning' },
  critical: { bar: 'bg-red-500',    bg: 'bg-red-50 dark:bg-red-950/40',      border: 'border-red-200 dark:border-red-800',      text: 'text-red-800 dark:text-red-200',      icon: '🔴', label: 'Critical' },
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
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
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
