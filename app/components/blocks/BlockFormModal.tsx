"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Block } from './types';

export interface BlockFormValues {
  name: string;
  cropType: string;
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
  cropType: '',
  variety: '',
  area: '',
  areaUnit: 'Dunm',
  plantingYear: '',
  rootstock: '',
  treeCount: '',
  rowSpacing: '',
  treeSpacing: '',
};

type PlantOption = { id: number; commonName: string; scientificName: string };

// ─── Trefle live-search input ─────────────────────────────────────────────────

function PlantSearchInput({
  value,
  onSelect,
  label,
}: {
  value: string;
  onSelect: (plant: PlantOption) => void;
  label: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PlantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setIsOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/plant-search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data: PlantOption[] = await res.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setFocusedIndex(-1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 400);
  }

  function handleSelect(plant: PlantOption) {
    setQuery(plant.commonName);
    onSelect(plant);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[focusedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 relative" ref={wrapperRef}>
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <div className="relative">
        <input
          type="text"
          placeholder="Type to search (e.g. Almond, Apple…)"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 pr-8 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
        )}
      </div>
      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 top-[calc(100%+4px)] left-0 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-1">
          {results.map((plant, i) => (
            <li
              key={plant.scientificName}
              className={`cursor-pointer rounded-md px-3 py-2 text-sm transition-colors ${
                focusedIndex === i
                  ? 'bg-brand-50 dark:bg-slate-700 text-brand-700 dark:text-brand-300'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-brand-50 dark:hover:bg-slate-700 hover:text-brand-700'
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(plant)}
            >
              <span className="font-medium">{plant.commonName}</span>
              <span className="ml-1.5 text-xs text-slate-400 italic">{plant.scientificName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Generic autocomplete (used for Rootstock) ────────────────────────────────

function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  label,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(value.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      onChange(filtered[focusedIndex]);
      setIsOpen(false);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 relative" ref={wrapperRef}>
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); setFocusedIndex(-1); }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        autoComplete="off"
      />
      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-10 top-[calc(100%+4px)] left-0 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-1">
          {filtered.map((opt, i) => (
            <li
              key={opt}
              className={`cursor-pointer rounded-md px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-brand-50 dark:hover:bg-slate-700 hover:text-brand-700 dark:hover:text-brand-300 transition-colors ${focusedIndex === i ? 'bg-brand-50 dark:bg-slate-700 text-brand-700 dark:text-brand-300' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(opt); setIsOpen(false); }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function BlockFormModal({ open, onClose, onSave, initialData }: Props) {
  const [form, setForm] = useState<BlockFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState<number | null>(null);
  const [varietySuggestions, setVarietySuggestions] = useState<string[]>([]);
  const [varietyLoading, setVarietyLoading] = useState(false);

  async function fetchVarieties(plantId: number, commonName: string) {
    setVarietyLoading(true);
    setVarietySuggestions([]);
    try {
      const res = await fetch(
        `/api/plant-varieties?plantId=${plantId}&commonName=${encodeURIComponent(commonName)}`,
      );
      if (res.ok) {
        const data: string[] = await res.json();
        setVarietySuggestions(data);
      }
    } finally {
      setVarietyLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          name: initialData.name,
          cropType: initialData.cropType || '',
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
      setSelectedPlantId(null);
      setVarietySuggestions([]);
    }
  }, [open, initialData]);

  function handleSave() {
    if (!form.name.trim()) { setError('Block name is required.'); return; }
    if (!form.cropType.trim()) { setError('Plant / crop type is required.'); return; }
    if (!form.variety.trim()) { setError('Variety is required.'); return; }
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
              {isEdit
                ? 'Update block configuration details.'
                : 'Enter block details once — the system will track progress from here.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">

            {/* Block Name */}
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Block Name</label>
              <input
                type="text"
                placeholder="e.g. Block G"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Plant / Crop Type — live Trefle search */}
            <div className="col-span-2">
              <PlantSearchInput
                label="Plant / Crop Type"
                value={form.cropType}
                onSelect={(plant) => {
                  setForm(f => ({ ...f, cropType: plant.commonName, variety: '' }));
                  setSelectedPlantId(plant.id);
                  fetchVarieties(plant.id, plant.commonName);
                }}
              />
            </div>

            {/* Variety — autocomplete populated from Trefle + curated list */}
            <div className="col-span-2 relative">
              <AutocompleteInput
                label="Variety / Cultivar"
                placeholder={
                  varietyLoading
                    ? 'Loading varieties…'
                    : varietySuggestions.length > 0
                    ? 'Select or type a variety…'
                    : 'e.g. Nonpareil, Chandler…'
                }
                value={form.variety}
                onChange={(val) => setForm(f => ({ ...f, variety: val }))}
                options={varietySuggestions}
              />
              {varietyLoading && (
                <Loader2 className="absolute right-2.5 bottom-2.5 h-4 w-4 text-slate-400 animate-spin" />
              )}
            </div>

            {/* Area */}
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

            {/* Planting Year */}
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

            {/* Rootstock */}
            <AutocompleteInput
              label="Rootstock"
              placeholder="e.g. Nemaguard…"
              value={form.rootstock}
              onChange={(val) => setForm(f => ({ ...f, rootstock: val }))}
              options={['Nemaguard', 'Lovell', 'Hansen 536', 'Titan', 'Guardian', 'M9', 'MM106', 'Krymsk']}
            />

            {/* Tree Count */}
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tree Count</label>
              <input
                type="number"
                placeholder="e.g. 500"
                value={form.treeCount}
                onChange={e => setForm(f => ({ ...f, treeCount: e.target.value }))}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Row / Tree Spacing */}
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
            onClick={onClose}
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
