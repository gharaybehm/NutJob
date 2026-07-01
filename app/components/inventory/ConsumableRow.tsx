import { Consumable } from './types';
import { Package, Droplets, Leaf, Fuel, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export default function ConsumableRow({
  consumable,
  onLogUsage,
  onAddStock,
}: {
  consumable: Consumable;
  onLogUsage: (consumable: Consumable) => void;
  onAddStock: (consumable: Consumable) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  const getIcon = () => {
    switch (consumable.category) {
      case 'fertilizer': return <Leaf className="h-5 w-5 text-gold" />;
      case 'pesticide':
      case 'herbicide': return <Droplets className="h-5 w-5 text-purple" />;
      case 'fuel': return <Fuel className="h-5 w-5 text-ink-3" />;
      default: return <Package className="h-5 w-5 text-ink-3" />;
    }
  };

  const sortedLogs = [...consumable.usageLog].sort((a, b) => b.date.getTime() - a.date.getTime());
  
  const pctRemaining = consumable.startingBalance > 0 
    ? Math.max(0, Math.min(100, (consumable.currentBalance / consumable.startingBalance) * 100))
    : 0;

  const isLowStock = consumable.minimumStock !== undefined && consumable.currentBalance <= consumable.minimumStock;

  return (
    <div className={`rounded-xl border ${isLowStock ? 'border-red/30' : 'border-line'} bg-surface overflow-hidden`}>
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0 w-full">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tile">
            {getIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-ink truncate" title={consumable.name}>
                {consumable.name}
              </h3>
              {isLowStock && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 text-xs font-medium text-red">
                  <AlertTriangle className="h-3 w-3" />
                  Low Stock
                </span>
              )}
            </div>
            <p className="text-xs text-ink-3 capitalize truncate">{consumable.category}</p>
          </div>
        </div>

        {/* Balance & Bar */}
        <div className="w-full sm:w-64 flex flex-col shrink-0 gap-1.5">
          <div className="flex justify-between items-baseline text-sm">
            <span className="text-ink-3 text-xs">Current Balance</span>
            <div className="font-bold text-ink text-base">
              {consumable.currentBalance.toLocaleString('en-US', {maximumFractionDigits: 2})} <span className="text-xs font-normal text-ink-3">{consumable.unit}</span>
            </div>
          </div>
          <div className="h-2 w-full bg-tile rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isLowStock ? 'bg-red' : 'bg-green'}`}
              style={{ width: `${pctRemaining}%` }}
            />
          </div>
          {consumable.minimumStock !== undefined && (
            <div className="text-[10px] text-ink-4 text-right">
              Min: {consumable.minimumStock} {consumable.unit}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-end border-t sm:border-t-0 border-tile pt-3 sm:pt-0">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-ink-3 hover:text-ink-2"
          >
            {expanded ? 'Hide Log' : `View Log (${consumable.usageLog.length})`}
          </button>
          <button
            onClick={() => onAddStock(consumable)}
            className="rounded-lg bg-green-soft px-3 py-1.5 text-xs font-medium text-green hover:brightness-95 transition"
          >
            + Add Stock
          </button>
          <button
            onClick={() => onLogUsage(consumable)}
            className="rounded-lg bg-blue-soft px-3 py-1.5 text-xs font-medium text-blue hover:brightness-95 transition"
          >
            Log Usage
          </button>
        </div>
      </div>

      {/* Expanded Log */}
      {expanded && (
        <div className="border-t border-tile bg-tile p-4">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sortedLogs.length === 0 ? (
              <p className="text-sm text-center text-ink-3 italic py-4">No usage history recorded.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-ink-3 border-b border-line">
                    <th className="font-medium pb-2 w-24">Date</th>
                    <th className="font-medium pb-2 text-right pr-4">Quantity</th>
                    <th className="font-medium pb-2">Block</th>
                    <th className="font-medium pb-2 hidden sm:table-cell">Calendar Event</th>
                    <th className="font-medium pb-2 hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tile">
                  {sortedLogs.map(log => (
                    <tr key={log.id} className="text-ink-2">
                      <td className="py-2.5 whitespace-nowrap">{log.date.toLocaleDateString('en-GB')}</td>
                      <td className="py-2.5 text-right pr-4 font-medium text-red">
                        -{log.quantity} <span className="text-xs font-normal opacity-70">{consumable.unit}</span>
                      </td>
                      <td className="py-2.5">{log.block || '-'}</td>
                      <td className="py-2.5 hidden sm:table-cell">
                        {log.calendarEventId ? (
                          <Link href="/calendar" className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-xs font-medium text-green hover:underline border border-line">
                            <CalendarIcon className="h-3 w-3" />
                            {log.calendarEventTitle || 'View Event'}
                          </Link>
                        ) : '-'}
                      </td>
                      <td className="py-2.5 hidden md:table-cell text-xs opacity-80 truncate max-w-[200px]" title={log.notes}>
                        {log.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
