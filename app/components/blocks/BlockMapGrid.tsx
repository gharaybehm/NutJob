import type { Block } from './types';

interface Props {
  blocks: Block[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const statusConfig = {
  green: {
    dot: 'bg-brand-500',
    card: 'border-brand-200 bg-brand-50/60 hover:bg-brand-50 dark:border-brand-800/50 dark:bg-brand-950/20',
    ring: 'ring-brand-400',
    label: 'bg-brand-100 text-brand-700',
  },
  amber: {
    dot: 'bg-amber-500',
    card: 'border-amber-300 bg-amber-50/60 hover:bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20',
    ring: 'ring-amber-400',
    label: 'bg-amber-100 text-amber-700',
  },
  red: {
    dot: 'bg-red-500',
    card: 'border-red-300 bg-red-50/60 hover:bg-red-50 dark:border-red-800/50 dark:bg-red-950/20',
    ring: 'ring-red-400',
    label: 'bg-red-100 text-red-700',
  },
};

export default function BlockMapGrid({ blocks, selectedId, onSelect }: Props) {
  const areaByUnit = blocks.reduce((acc, b) => {
    const unit = b.areaUnit || 'Dunm';
    acc[unit] = (acc[unit] || 0) + Number(b.area);
    return acc;
  }, {} as Record<string, number>);
  const areaSummary = Object.entries(areaByUnit).map(([unit, total]) => `${total} ${unit}`).join(' + ') || '0 Dunm';

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" />Good</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Warning</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Critical</span>
      </div>

      {/* Farm map grid */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, minmax(120px, auto))',
        }}
      >
        {blocks.map(block => {
          const cfg = statusConfig[block.status];
          const isSelected = block.id === selectedId;
          const alertCount = block.alerts.length;

          return (
            <button
              key={block.id}
              onClick={() => onSelect(block.id)}
              style={{
                gridColumnStart: block.mapPos.col + 1,
                gridColumnEnd: `span ${block.mapPos.colSpan ?? 1}`,
                gridRowStart: block.mapPos.row + 1,
                gridRowEnd: `span ${block.mapPos.rowSpan ?? 1}`,
              }}
              className={`relative flex flex-col rounded-xl border-2 p-3 text-left transition-all cursor-pointer ${cfg.card} ${
                isSelected ? `${cfg.ring} ring-2 shadow-md` : 'ring-0 shadow-sm hover:shadow-md'
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white leading-none truncate max-w-[120px]" title={block.name}>{block.name}</span>
                  {alertCount > 0 && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold leading-none">
                      {alertCount}
                    </span>
                  )}
                </div>
                <span className={`flex h-2.5 w-2.5 shrink-0 rounded-full mt-0.5 ${cfg.dot} ${isSelected ? 'animate-pulse' : ''}`} />
              </div>

              {/* Block info */}
              <div className="mt-2 flex flex-col gap-0.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{block.variety}</p>
                <p className="text-xs text-slate-500">{block.area} {block.areaUnit} · {block.plantingYear}</p>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="mt-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.label}`}>Viewing</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Farm summary */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Farm Summary</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">Total Area</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {areaSummary}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-slate-600 dark:text-slate-400">Total Trees</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {blocks.reduce((s, b) => s + b.treeCount, 0).toLocaleString()}
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          {(['green', 'amber', 'red'] as const).map(status => {
            const count = blocks.filter(b => b.status === status).length;
            const cfg = statusConfig[status];
            return count > 0 ? (
              <span key={status} className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.label}`}>
                {count} {status === 'green' ? 'Good' : status === 'amber' ? 'Warning' : 'Critical'}
              </span>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
