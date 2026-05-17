"use client";

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Block } from './types';

export interface BlockFormValues {
  name: string;
  variety: string;
  area: string;
  areaUnit: string;
  plantingYear: string;
  rootstock: string;
  treeCount: string;
  rowSpacing: string;
  treeSpacing: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (values: BlockFormValues) => void;
  initialData?: Block;
}

const EMPTY_FORM: BlockFormValues = {
  name: '',
  variety: '',
  area: '',
  areaUnit: 'Dunm',
  plantingYear: '',
  rootstock: '',
  treeCount: '',
  rowSpacing: '',
  treeSpacing: '',
};

export default function BlockFormModal({ open, onClose, onSave, initialData }: Props) {
  const [form, setForm] = useState<BlockFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          name: initialData.name,
          variety: initialData.variety,
          area: String(initialData.area),
          areaUnit: initialData.areaUnit || 'Dunm',
          plantingYear: String(initialData.plantingYear),
          rootstock: initialData.rootstock,
          treeCount: String(initialData.treeCount),
          rowSpacing: String(initialData.rowSpacing),
          treeSpacing: String(initialData.treeSpacing),
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setError(null);
    }
  }, [open, initialData]);

  function handleClose() {
    onClose();
  }

  function handleSave() {
    if (!form.name.trim()) { setError('Block name is required.'); return; }
    if (!form.variety) { setError('Please select a variety.'); return; }
    if (!form.area || Number(form.area) <= 0) { setError('Please enter a valid area.'); return; }
    setError(null);
    onSave(form);
    onClose();
  }

  if (!open) return null;

  const isEdit = !!initialData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {isEdit ? 'Edit Block' : 'New Block'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {isEdit ? 'Update block configuration details.' : 'Enter block details once — the system will track progress from here.'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Block Name</label>
              <input
                type="text"
                placeholder="e.g. Block G"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Variety</label>
              <select
                value={form.variety}
                onChange={e => setForm(f => ({ ...f, variety: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select variety</option>
                <option>Nonpareil</option>
                <option>Monterey</option>
                <option>Fritz</option>
                <option>Carmel</option>
                <option>Price</option>
                <option>Other</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Area</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="e.g. 40"
                  value={form.area}
                  onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <select
                  value={form.areaUnit}
                  onChange={e => setForm(f => ({ ...f, areaUnit: e.target.value }))}
                  className="w-1/3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="Dunm">Dunm</option>
                  <option value="Acre">Acre</option>
                  <option value="Hectare">Hectare</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Planting Year</label>
              <input
                type="number"
                placeholder="e.g. 2015"
                value={form.plantingYear}
                onChange={e => setForm(f => ({ ...f, plantingYear: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Rootstock</label>
              <select
                value={form.rootstock}
                onChange={e => setForm(f => ({ ...f, rootstock: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select rootstock</option>
                <option>Nemaguard</option>
                <option>Lovell</option>
                <option>Hansen 536</option>
                <option>Titan</option>
                <option>Guardian</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tree Count</label>
              <input
                type="number"
                placeholder="e.g. 500"
                value={form.treeCount}
                onChange={e => setForm(f => ({ ...f, treeCount: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Row Spacing (m)</label>
              <input
                type="number"
                placeholder="e.g. 6"
                value={form.rowSpacing}
                onChange={e => setForm(f => ({ ...f, rowSpacing: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tree Spacing (m)</label>
              <input
                type="number"
                placeholder="e.g. 5"
                value={form.treeSpacing}
                onChange={e => setForm(f => ({ ...f, treeSpacing: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Coming soon notice */}
          {!isEdit && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              📄 <strong>PDF upload</strong> (soil/water test results) will be available in a future release. You can enter initial data manually above for now.
            </div>
          )}
        </div>

        {/* Validation error */}
        {error && (
          <div className="mx-6 mb-0 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700 px-6 py-4 mt-auto">
          <button
            onClick={handleClose}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            {isEdit ? 'Save Changes' : 'Create Block'}
          </button>
        </div>
      </div>
    </div>
  );
}
