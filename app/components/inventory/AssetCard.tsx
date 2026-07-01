import { Asset } from './types';
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
      case 'machinery': return <Tractor className="h-5 w-5 text-ink-3" />;
      case 'vehicle': return <Truck className="h-5 w-5 text-ink-3" />;
      case 'tool': return <Tool className="h-5 w-5 text-ink-3" />;
      default: return <Settings className="h-5 w-5 text-ink-3" />;
    }
  };

  const getStatusColor = () => {
    switch (asset.status) {
      case 'operational': return 'bg-green-soft text-green';
      case 'needs-maintenance': return 'bg-amber-soft text-amber';
      case 'out-of-service': return 'bg-red-soft text-red';
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
    <div className="rounded-xl border border-line bg-surface p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-tile">
            {getIcon()}
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">{asset.name}</h3>
            <p className="text-xs text-ink-3 capitalize">{asset.category}</p>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor()}`}>
          {getStatusLabel()}
        </span>
      </div>

      <div className="flex-1 text-sm text-ink-2 space-y-2 mb-4">
        {asset.purchaseDate && (
          <div className="flex justify-between">
            <span className="text-ink-3">Purchased:</span>
            <span className="font-medium text-ink">
              {asset.purchaseDate.toLocaleDateString('en-GB')}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink-3">Last Maintenance:</span>
          <span className="font-medium text-ink">
            {lastMaintenance ? lastMaintenance.toLocaleDateString('en-GB') : 'Never'}
          </span>
        </div>
        {asset.notes && (
          <div className="mt-2 text-xs italic opacity-80 border-l-2 border-line pl-2">
            {asset.notes}
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-tile pt-4">
        <div className="flex items-center justify-between gap-2">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-green hover:text-green flex items-center gap-1"
          >
            {expanded ? 'Hide Log' : `View Log (${asset.maintenanceLog.length})`}
          </button>
          <button 
            onClick={() => onAddMaintenance(asset)}
            className="rounded-lg bg-tile px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-line transition-colors"
          >
            Log Maintenance
          </button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 max-h-48 overflow-y-auto pr-1 text-sm">
            {sortedLogs.length === 0 ? (
              <p className="text-xs text-center text-ink-3 italic py-2">No maintenance history</p>
            ) : (
              sortedLogs.map((log) => (
                <div key={log.id} className="relative pl-4 border-l-2 border-line pb-1">
                  <div className="absolute w-2 h-2 rounded-full bg-line -left-[5px] top-1.5" />
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-ink text-xs">{log.date.toLocaleDateString('en-GB')}</span>
                    <span className="text-[10px] uppercase tracking-wider text-ink-3 font-semibold px-1.5 bg-tile rounded">{log.type}</span>
                  </div>
                  <p className="text-xs text-ink-2">{log.description}</p>
                  {(log.cost || log.performedBy) && (
                    <div className="flex gap-2 mt-1 text-[10px] text-ink-3">
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
