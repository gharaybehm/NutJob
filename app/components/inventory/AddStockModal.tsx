'use client';

import { useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { Consumable } from './types';

export default function AddStockModal({
  consumable,
  onClose,
  onSave,
}: {
  consumable: Consumable;
  onClose: () => void;
  onSave: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState('');

  const fieldCls = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:ring-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) return;
    onSave(qty);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Stock</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{consumable.name}</p>
            <p className="text-xs text-slate-500 capitalize">{consumable.category} · Current balance: {consumable.currentBalance} {consumable.unit}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Quantity to Add ({consumable.unit})
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              autoFocus
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={fieldCls}
              placeholder={`e.g. 500 ${consumable.unit}`}
            />
            {quantity && Number(quantity) > 0 && (
              <p className="mt-1.5 text-xs text-slate-500">
                New balance: <span className="font-semibold text-slate-700 dark:text-slate-300">{consumable.currentBalance + Number(quantity)} {consumable.unit}</span>
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all">
              Add Stock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
