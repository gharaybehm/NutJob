'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Asset, Consumable, MaintenanceEntry, UsageEntry } from './types';
import AssetCard from './AssetCard';
import ConsumableRow from './ConsumableRow';
import { Search, Plus, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';
const AddAssetModal = dynamic(() => import('./AddAssetModal'), { ssr: false });
const AddConsumableModal = dynamic(() => import('./AddConsumableModal'), { ssr: false });
const AddStockModal = dynamic(() => import('./AddStockModal'), { ssr: false });
const LogMaintenanceModal = dynamic(() => import('./LogMaintenanceModal'), { ssr: false });
const LogUsageModal = dynamic(() => import('./LogUsageModal'), { ssr: false });
import { createAsset, createConsumable, logMaintenance, logUsage, addStock } from '@/app/[farmId]/(dashboard)/inventory/actions';

export default function InventoryPage({
  initialAssets,
  initialConsumables,
  recentCalendarEvents,
  userRole,
  currentUserName,
  blocks,
  farmId,
}: {
  initialAssets: Asset[];
  initialConsumables: Consumable[];
  recentCalendarEvents: { id: string; title: string; date: Date; type: string }[];
  userRole: 'admin' | 'supervisor' | 'worker';
  /** Stamped onto optimistic ledger rows so attribution shows before the refetch. */
  currentUserName: string;
  blocks: string[];
  farmId: string;
}) {
  const t = useTranslations('inventory');
  const [activeTab, setActiveTab] = useState<'assets' | 'consumables'>('assets');
  const [searchQuery, setSearchQuery] = useState('');
  
  // State
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [consumables, setConsumables] = useState<Consumable[]>(initialConsumables);
  const [, startTransition] = useTransition();
  // Server actions are role-gated, so a rejected write has to be shown rather
  // than swallowed — otherwise an optimistic row lingers as a phantom entry.
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddConsumable, setShowAddConsumable] = useState(false);
  const [maintAsset, setMaintAsset] = useState<Asset | null>(null);
  const [usageConsumable, setUsageConsumable] = useState<Consumable | null>(null);
  const [stockConsumable, setStockConsumable] = useState<Consumable | null>(null);

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
    setActionError(null);

    startTransition(async () => {
      const { id, error } = await createAsset(data, farmId);
      if (error || !id) {
        setAssets(prev => prev.filter(a => a.id !== tempAsset.id));
        setActionError(error ?? 'Could not save the asset.');
        return;
      }
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
    setActionError(null);

    startTransition(async () => {
      const { id, error } = await createConsumable(data, farmId);
      if (error || !id) {
        setConsumables(prev => prev.filter(c => c.id !== tempCons.id));
        setActionError(error ?? 'Could not save the consumable.');
        return;
      }
      setConsumables(prev => prev.map(c => c.id === tempCons.id ? { ...c, id } : c));
    });
  };

  const handleSaveMaintenance = (data: Omit<MaintenanceEntry, 'id' | 'assetId'>) => {
    if (!maintAsset) return;
    
    // Optimistic update
    const tempEntry: MaintenanceEntry = {
      ...data,
      id: `temp-m-${Date.now()}`,
      assetId: maintAsset.id,
      loggedByName: currentUserName,
    };
    const assetId = maintAsset.id;

    setAssets(prev => prev.map(a =>
      a.id === assetId
        ? { ...a, maintenanceLog: [tempEntry, ...a.maintenanceLog] }
        : a
    ));
    setActionError(null);

    startTransition(async () => {
      const { error } = await logMaintenance(assetId, data, farmId);
      if (error) {
        setAssets(prev => prev.map(a =>
          a.id === assetId
            ? { ...a, maintenanceLog: a.maintenanceLog.filter(m => m.id !== tempEntry.id) }
            : a
        ));
        setActionError(error);
      }
    });
  };

  const handleAddStock = (consumable: Consumable, quantity: number) => {
    const restockEntry: UsageEntry = {
      id: `temp-r-${Date.now()}`,
      consumableId: consumable.id,
      date: new Date(),
      quantity,
      entryType: 'restock',
      balanceAfter: consumable.currentBalance + quantity,
      loggedByName: currentUserName,
    };

    setConsumables(prev => prev.map(c =>
      c.id === consumable.id
        ? {
            ...c,
            currentBalance: c.currentBalance + quantity,
            startingBalance: c.startingBalance + quantity,
            usageLog: [restockEntry, ...c.usageLog],
          }
        : c
    ));
    setActionError(null);

    startTransition(async () => {
      const { error } = await addStock(consumable.id, quantity, farmId);
      if (error) {
        setConsumables(prev => prev.map(c =>
          c.id === consumable.id
            ? {
                ...c,
                currentBalance: c.currentBalance - quantity,
                startingBalance: c.startingBalance - quantity,
                usageLog: c.usageLog.filter(u => u.id !== restockEntry.id),
              }
            : c
        ));
        setActionError(error);
      }
    });
  };

  const handleSaveUsage = (
    data: Omit<UsageEntry, 'id' | 'consumableId' | 'calendarEventTitle' | 'loggedBy' | 'loggedByName' | 'entryType' | 'balanceAfter'>,
    eventTitle?: string,
  ) => {
    if (!usageConsumable) return;

    const consumableId = usageConsumable.id;
    const previousBalance = usageConsumable.currentBalance;
    const newBalance = previousBalance - data.quantity;

    // Optimistic
    const tempEntry: UsageEntry = {
      ...data,
      id: `temp-u-${Date.now()}`,
      consumableId,
      entryType: 'usage',
      balanceAfter: newBalance,
      calendarEventTitle: eventTitle,
      loggedByName: currentUserName,
    };

    setConsumables(prev => prev.map(c =>
      c.id === consumableId
        ? { ...c, currentBalance: newBalance, usageLog: [tempEntry, ...c.usageLog] }
        : c
    ));
    setActionError(null);

    startTransition(async () => {
      const { error } = await logUsage(consumableId, data, newBalance, farmId);
      if (error) {
        setConsumables(prev => prev.map(c =>
          c.id === consumableId
            ? { ...c, currentBalance: previousBalance, usageLog: c.usageLog.filter(u => u.id !== tempEntry.id) }
            : c
        ));
        setActionError(error);
      }
    });
  };

  const canAdd = userRole === 'admin' || userRole === 'supervisor';

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red/30 bg-red-soft px-4 py-3 text-sm text-red"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="text-sm text-ink-3 mt-1">{t('description')}</p>
        </div>

        {/* Top actions */}
        <div className="flex gap-2">
          {activeTab === 'assets' && canAdd && (
            <button
              onClick={() => setShowAddAsset(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-105"
            >
              <Plus className="h-4 w-4" /> {t('addAsset')}
            </button>
          )}
          {activeTab === 'consumables' && canAdd && (
            <button
              onClick={() => setShowAddConsumable(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-green px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-105"
            >
              <Plus className="h-4 w-4" /> {t('addConsumable')}
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-3 uppercase tracking-wider">{t('stats.totalAssets')}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{assets.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-3 uppercase tracking-wider">{t('stats.needsMaintenance')}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`text-2xl font-semibold ${assetsNeedingMaint > 0 ? 'text-amber' : 'text-ink'}`}>
              {assetsNeedingMaint}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-3 uppercase tracking-wider">{t('stats.consumables')}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{consumables.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-3 uppercase tracking-wider flex items-center gap-1">
            {t('stats.lowStockAlerts')}
            {lowStockCount > 0 && <AlertTriangle className="h-3 w-3 text-red" />}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`text-2xl font-semibold ${lowStockCount > 0 ? 'text-red' : 'text-ink'}`}>
              {lowStockCount}
            </p>
          </div>
        </div>
      </div>

      {/* Controls: Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-surface p-1.5 rounded-xl border border-line">
        <div className="flex gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'assets'
                ? 'bg-green-soft text-green'
                : 'text-ink-2 hover:bg-tile'
            }`}
          >
            {t('tabs.assets')}
          </button>
          <button
            onClick={() => setActiveTab('consumables')}
            className={`flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'consumables'
                ? 'bg-green-soft text-green'
                : 'text-ink-2 hover:bg-tile'
            }`}
          >
            {t('tabs.consumables')}
            {lowStockCount > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-soft text-[10px] font-bold text-red">
                {lowStockCount}
              </span>
            )}
          </button>
        </div>
        
        <div className="w-full sm:w-72 relative">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <Search className="h-4 w-4 text-ink-4" />
          </div>
          <input
            type="text"
            placeholder={activeTab === 'assets' ? t('searchAssetsPlaceholder') : t('searchConsumablesPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full rounded-lg border-0 py-2 ps-9 pe-3 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-ink-4 focus:ring-2 focus:ring-inset focus:ring-green"
          />
        </div>
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'assets' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAssets.length === 0 ? (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-line rounded-xl">
                <p className="text-ink-3">{t('noAssetsFound')}</p>
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
              <div className="py-12 text-center border-2 border-dashed border-line rounded-xl">
                <p className="text-ink-3">{t('noConsumablesFound')}</p>
              </div>
            ) : (
              filteredConsumables.map(cons => (
                <ConsumableRow key={cons.id} consumable={cons} onLogUsage={setUsageConsumable} onAddStock={setStockConsumable} />
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

      {stockConsumable && (
        <AddStockModal
          consumable={stockConsumable}
          onClose={() => setStockConsumable(null)}
          onSave={(qty) => { handleAddStock(stockConsumable, qty); setStockConsumable(null); }}
        />
      )}
    </div>
  );
}
