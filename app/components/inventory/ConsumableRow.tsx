import { Consumable } from './types';
import { Package, Droplets, Leaf, Fuel, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export default function ConsumableRow({ 
  consumable, 
  onLogUsage 
}: { 
  consumable: Consumable;
  onLogUsage: (consumable: Consumable) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  const getIcon = () => {
    switch (consumable.category) {
      case 'fertilizer': return <Leaf className="h-5 w-5 text-green-500" />;
      case 'pesticide': 
      case 'herbicide': return <Droplets className="h-5 w-5 text-amber-500" />;
      case 'fuel': return <Fuel className="h-5 w-5 text-slate-500" />;
      default: return <Package className="h-5 w-5 text-slate-500" />;
    }
  };

  const sortedLogs = [...consumable.usageLog].sort((a, b) => b.date.getTime() - a.date.getTime());
  
  const pctRemaining = consumable.startingBalance > 0 
    ? Math.max(0, Math.min(100, (consumable.currentBalance / consumable.startingBalance) * 100))
    : 0;

  const isLowStock = consumable.minimumStock !== undefined && consumable.currentBalance <= consumable.minimumStock;

  return (
    <div className={`rounded-xl border ${isLowStock ? 'border-red-200 dark:border-red-900/50' : 'border-slate-200 dark:border-slate-800'} bg-white shadow-sm dark:bg-slate-900 overflow-hidden`}>
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0 w-full">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            {getIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate" title={consumable.name}>
                {consumable.name}
              </h3>
              {isLowStock && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Low Stock
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 capitalize truncate">{consumable.category}</p>
          </div>
        </div>

        {/* Balance & Bar */}
        <div className="w-full sm:w-64 flex flex-col shrink-0 gap-1.5">
          <div className="flex justify-between items-baseline text-sm">
            <span className="text-slate-500 text-xs">Current Balance</span>
            <div className="font-bold text-slate-900 dark:text-white text-base">
              {consumable.currentBalance.toLocaleString('en-US', {maximumFractionDigits: 2})} <span className="text-xs font-normal text-slate-500">{consumable.unit}</span>
            </div>
          </div>
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${isLowStock ? 'bg-red-500' : 'bg-brand-500'}`}
              style={{ width: `${pctRemaining}%` }}
            />
          </div>
          {consumable.minimumStock !== undefined && (
            <div className="text-[10px] text-slate-400 text-right">
              Min: {consumable.minimumStock} {consumable.unit}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-end border-t sm:border-t-0 border-slate-100 dark:border-slate-800 pt-3 sm:pt-0">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
          >
            {expanded ? 'Hide Log' : `View Log (${consumable.usageLog.length})`}
          </button>
          <button 
            onClick={() => onLogUsage(consumable)}
            className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/40 transition-colors"
          >
            Log Usage
          </button>
        </div>
      </div>

      {/* Expanded Log */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sortedLogs.length === 0 ? (
              <p className="text-sm text-center text-slate-500 italic py-4">No usage history recorded.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="font-medium pb-2 w-24">Date</th>
                    <th className="font-medium pb-2 text-right pr-4">Quantity</th>
                    <th className="font-medium pb-2">Block</th>
                    <th className="font-medium pb-2 hidden sm:table-cell">Calendar Event</th>
                    <th className="font-medium pb-2 hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedLogs.map(log => (
                    <tr key={log.id} className="text-slate-700 dark:text-slate-300">
                      <td className="py-2.5 whitespace-nowrap">{log.date.toLocaleDateString('en-GB')}</td>
                      <td className="py-2.5 text-right pr-4 font-medium text-red-600 dark:text-red-400">
                        -{log.quantity} <span className="text-xs font-normal opacity-70">{consumable.unit}</span>
                      </td>
                      <td className="py-2.5">{log.block || '-'}</td>
                      <td className="py-2.5 hidden sm:table-cell">
                        {log.calendarEventId ? (
                          <Link href="/calendar" className="inline-flex items-center gap-1 rounded bg-white dark:bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline border border-slate-200 dark:border-slate-700">
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
