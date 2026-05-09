'use client';

import { ActivityType, ACTIVITY_COLORS, ACTIVITY_LABELS } from './types';

interface EventPillProps {
  title: string;
  type: ActivityType;
  compact?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
}

export default function EventPill({ title, type, compact = false, onClick }: EventPillProps) {
  const colors = ACTIVITY_COLORS[type];

  if (compact) {
    return (
      <button
        onClick={onClick}
        title={`${ACTIVITY_LABELS[type]}: ${title}`}
        className={`flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs font-medium ring-1 ring-inset transition-opacity hover:opacity-80 ${colors.bg} ${colors.text} ${colors.ring}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />
        <span className="truncate">{title}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium ring-1 ring-inset transition-all hover:opacity-80 active:scale-95 ${colors.bg} ${colors.text} ${colors.ring}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
      <span className="truncate">{title}</span>
    </button>
  );
}
