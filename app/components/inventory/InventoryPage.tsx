'use client';

import { useState, useTransition } from 'react';
import { Asset, Consumable, MaintenanceEntry, UsageEntry } from './types';
import AssetCard from './AssetCard';
import ConsumableRow from './ConsumableRow';
import { Search, Plus, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';
const AddAssetModal = dynamic(() => import('./AddAssetModal'), { ssr: false });
const AddConsumableModal = dynamic(() => import('./AddConsumableModal'), { ssr: false });
const LogMaintenanceModal = dynamic(() => import('./LogMaintenanceModal'), { ssr: false });
const LogUsageModal = dynamic(() => import('./LogUsageModal'), { ssr: false });
import { createAsset, createConsumable, logMaintenance, logUsage } from '@/app/(dashboard)/inventory/actions';

export default function InventoryPage({
  initialAssets,
  initialConsumables,
  recentCalendarEvents,
  userRole,
  blocks,
  farmId: _farmId,
}: {
  initialAssets: Asset[];
  initialConsumables: Consumable[];
  recentCalendarEvents: { id: string; title: string; date: Date; type: string }[];
  userRole: 'admin' | 'supervisor' | 'worker';
  blocks: string[];
  farmId?: string;
}) {
  const [activeTab, setActiveTab] = useState<'assets' | 'consumables'>('assets');
  const [searchQuery, setSearchQuery] = useState('');
  
  // State
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [consumables, setConsumables] = useState<Consumable[]>(initialConsumables);
  const [, startTransition] = useTransition();

  // Modals
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddConsumable, setShowAddConsumable] = useState(false);
  const [maintAsset, setMaintAsset] = useState<Asset | null>(null);
  const [usageConsumable, setUsageConsumable] = useState<Consumable | null>(null);

  // Filters
  const filteredAssets = assets.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.category.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredConsumables = consumables.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const assetsNeedingMaint = assets.filter(a => a.status !== 'operational').length;
  const lowStockCount = consumables.filter(c => c.minimumStock !== undefined && c.currentBalance <= c.minimumStock).length;

  // Handlers
  const handleSaveAsset = (data: Omit<Asset, 'id' | 'maintenanceLog'>) => {
    // Optimistic
    const tempAsset: Asset = { ...data, id: `temp-a-${Date.now()}`, maintenanceLog: [] };
    setAssets(prev => [tempAsset, ...prev]);
    
    startTransition(async () => {
      const { id } = await createAsset(data);
      setAssets(prev => prev.map(a => a.id === tempAsset.id ? { ...a, id } : a));
    });
  };

  const handleSaveConsumable = (data: Omit<Consumable, 'id' | 'usageLog' | 'currentBalance'>) => {
    // Optimistic
    const tempCons: Consumable = { 
      ...data, 
      id: `temp-c-${Date.now()}`, 
      currentBalance: data.startingBalance,
      usageLog: [] 
    };
    setConsumables(prev => [...prev, tempCons].sort((a,b) => a.name.localeCompare(b.name)));
    
    startTransition(async () => {
      const { id } = await createConsumable(data);
      setConsumables(prev => prev.map(c => c.id === tempCons.id ? { ...c, id } : c));
    });
  };

  const handleSaveMaintenance = (data: Omit<MaintenanceEntry, 'id' | 'assetId'>) => {
    if (!maintAsset) return;
    
    // Optimistic update
    const tempEntry: MaintenanceEntry = {
      ...data,
      id: `temp-m-${Date.now()}`,
      assetId: maintAsset.id
    };
    
    setAssets(prev => prev.map(a => 
      a.id === maintAsset.id 
        ? { ...a, maintenanceLog: [tempEntry, ...a.maintenanceLog] }
        : a
    ));
    
    startTransition(async () => {
      await logMaintenance(maintAsset.id, data);
    });
  };

  const handleSaveUsage = (data: Omit<UsageEntry, 'id' | 'consumableId' | 'calendarEventTitle' | 'loggedBy'>, eventTitle?: string) => {
    if (!usageConsumable) return;
    
    const newBalance = usageConsumable.currentBalance - data.quantity;
    
    // Optimistic
    const tempEntry: UsageEntry = {
      ...data,
      id: `temp-u-${Date.now()}`,
      consumableId: usageConsumable.id,
      calendarEventTitle: eventTitle
    };
    
    setConsumables(prev => prev.map(c => 
      c.id === usageConsumable.id 
        ? { ...c, currentBalance: newBalance, usageLog: [tempEntry, ...c.usageLog] }
        : c
    ));
    
    startTransition(async () => {
      await logUsage(usageConsumable.id, data, newBalance);
    });
  };

  const canAdd = userRole === 'admin' || userRole === 'supervisor';

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inventory</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage farm assets, maintenance, and consumable materials.</p>
        </div>
        
        {/* Top actions */}
        <div className="flex gap-2">
          {activeTab === 'assets' && canAdd && (
            <button
              onClick={() => setShowAddAsset(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Add Asset
            </button>
          )}
          {activeTab === 'consumables' && canAdd && (
            <button
              onClick={() => setShowAddConsumable(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Add Consumable
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Assets</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{assets.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Needs Maintenance</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`text-2xl font-semibold ${assetsNeedingMaint > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-900 dark:text-white'}`}>
              {assetsNeedingMaint}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Consumables</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{consumables.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
            Low Stock Alerts
            {lowStockCount > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`text-2xl font-semibold ${lowStockCount > 0 ? 'text-red-600 dark:text-red-500' : 'text-slate-900 dark:text-white'}`}>
              {lowStockCount}
            </p>
          </div>
        </div>
      </div>

      {/* Controls: Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'assets'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'
            }`}
          >
            Assets
          </button>
          <button
            onClick={() => setActiveTab('consumables')}
            className={`flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'consumables'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50'
            }`}
          >
            Consumables
            {lowStockCount > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-700 dark:bg-red-900/50 dark:text-red-400">
                {lowStockCount}
              </span>
            )}
          </button>
        </div>
        
        <div className="w-full sm:w-72 relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full rounded-lg border-0 py-2 pl-9 pr-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 dark:bg-slate-800 dark:text-white dark:ring-slate-700 dark:focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'assets' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAssets.length === 0 ? (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <p className="text-slate-500 dark:text-slate-400">No assets found.</p>
              </div>
            ) : (
              filteredAssets.map(asset => (
                <AssetCard key={asset.id} asset={asset} onAddMaintenance={setMaintAsset} />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredConsumables.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <p className="text-slate-500 dark:text-slate-400">No consumables found.</p>
              </div>
            ) : (
              filteredConsumables.map(cons => (
                <ConsumableRow key={cons.id} consumable={cons} onLogUsage={setUsageConsumable} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddAsset && (
        <AddAssetModal onClose={() => setShowAddAsset(false)} onSave={handleSaveAsset} />
      )}
      
      {showAddConsumable && (
        <AddConsumableModal onClose={() => setShowAddConsumable(false)} onSave={handleSaveConsumable} />
      )}
      
      {maintAsset && (
        <LogMaintenanceModal 
          asset={maintAsset} 
          onClose={() => setMaintAsset(null)} 
          onSave={(data) => { handleSaveMaintenance(data); setMaintAsset(null); }} 
        />
      )}
      
      {usageConsumable && (
        <LogUsageModal 
          consumable={usageConsumable} 
          events={recentCalendarEvents}
          blocks={blocks}
          onClose={() => setUsageConsumable(null)} 
          onSave={(data, eventTitle) => { handleSaveUsage(data, eventTitle); setUsageConsumable(null); }} 
        />
      )}
    </div>
  );
}
