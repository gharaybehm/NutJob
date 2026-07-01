import { useState } from 'react';
import { Asset, MaintenanceEntry, MaintenanceType } from './types';

export default function LogMaintenanceModal({
  asset,
  onClose,
  onSave
}: {
  asset: Asset;
  onClose: () => void;
  onSave: (data: Omit<MaintenanceEntry, 'id' | 'assetId'>) => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<MaintenanceType>('routine');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [performedBy, setPerformedBy] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !date) return;

    onSave({
      date: new Date(date),
      type,
      description: description.trim(),
      cost: cost ? Number(cost) : undefined,
      performedBy: performedBy.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface shadow-2xl ring-1 ring-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-tile">
          <div>
            <h2 className="text-lg font-bold text-ink">Log Maintenance</h2>
            <p className="text-sm text-ink-3">{asset.name}</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-3">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Type *</label>
              <select
                required
                value={type}
                onChange={(e) => setType(e.target.value as MaintenanceType)}
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              >
                <option value="routine">Routine</option>
                <option value="repair">Repair</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Description *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was done?"
              className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Cost ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Performed By</label>
              <input
                type="text"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                placeholder="Optional name/company"
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 hover:bg-tile rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green hover:brightness-105 rounded-lg">
              Save Log
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
