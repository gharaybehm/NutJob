import { Asset, ASSET_SUGGESTIONS } from './types';
import { Settings, Toolbox as Tool, Truck, Tractor } from 'lucide-react';
import { useState } from 'react';

export default function AssetCard({ 
  asset, 
  onAddMaintenance 
}: { 
  asset: Asset; 
  onAddMaintenance: (asset: Asset) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  const getIcon = () => {
    switch (asset.category) {
      case 'machinery': return <Tractor className="h-5 w-5 text-slate-500" />;
      case 'vehicle': return <Truck className="h-5 w-5 text-slate-500" />;
      case 'tool': return <Tool className="h-5 w-5 text-slate-500" />;
      default: return <Settings className="h-5 w-5 text-slate-500" />;
    }
  };

  const getStatusColor = () => {
    switch (asset.status) {
      case 'operational': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'needs-maintenance': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'out-of-service': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  const getStatusLabel = () => {
    switch (asset.status) {
      case 'operational': return 'Operational';
      case 'needs-maintenance': return 'Needs Maintenance';
      case 'out-of-service': return 'Out of Service';
    }
  };

  const sortedLogs = [...asset.maintenanceLog].sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastMaintenance = sortedLogs.length > 0 ? sortedLogs[0].date : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
            {getIcon()}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{asset.name}</h3>
            <p className="text-xs text-slate-500 capitalize">{asset.category}</p>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor()}`}>
          {getStatusLabel()}
        </span>
      </div>

      <div className="flex-1 text-sm text-slate-600 dark:text-slate-400 space-y-2 mb-4">
        {asset.purchaseDate && (
          <div className="flex justify-between">
            <span className="text-slate-500">Purchased:</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {asset.purchaseDate.toLocaleDateString('en-GB')}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-500">Last Maintenance:</span>
          <span className="font-medium text-slate-900 dark:text-white">
            {lastMaintenance ? lastMaintenance.toLocaleDateString('en-GB') : 'Never'}
          </span>
        </div>
        {asset.notes && (
          <div className="mt-2 text-xs italic opacity-80 border-l-2 border-slate-200 dark:border-slate-700 pl-2">
            {asset.notes}
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 flex items-center gap-1"
          >
            {expanded ? 'Hide Log' : `View Log (${asset.maintenanceLog.length})`}
          </button>
          <button 
            onClick={() => onAddMaintenance(asset)}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Log Maintenance
          </button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 max-h-48 overflow-y-auto pr-1 text-sm">
            {sortedLogs.length === 0 ? (
              <p className="text-xs text-center text-slate-500 italic py-2">No maintenance history</p>
            ) : (
              sortedLogs.map((log) => (
                <div key={log.id} className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 pb-1">
                  <div className="absolute w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 -left-[5px] top-1.5" />
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-slate-900 dark:text-white text-xs">{log.date.toLocaleDateString('en-GB')}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1.5 bg-slate-100 dark:bg-slate-800 rounded">{log.type}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{log.description}</p>
                  {(log.cost || log.performedBy) && (
                    <div className="flex gap-2 mt-1 text-[10px] text-slate-500">
                      {log.cost && <span>Cost: ${log.cost}</span>}
                      {log.performedBy && <span>By: {log.performedBy}</span>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
