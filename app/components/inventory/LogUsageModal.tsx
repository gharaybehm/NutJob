import { useState } from 'react';
import { Consumable, UsageEntry } from './types';

export default function LogUsageModal({
  consumable,
  events,
  blocks,
  onClose,
  onSave
}: {
  consumable: Consumable;
  events: any[];
  blocks: string[];
  onClose: () => void;
  onSave: (data: Omit<UsageEntry, 'id' | 'consumableId' | 'calendarEventTitle' | 'loggedBy'>, eventTitle?: string) => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState('');
  const [calendarEventId, setCalendarEventId] = useState('');
  const [block, setBlock] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0 || !date) return;

    if (qty > consumable.currentBalance) {
      if (!window.confirm(`Warning: You are logging more usage (${qty} ${consumable.unit}) than the current balance (${consumable.currentBalance} ${consumable.unit}). Do you want to proceed?`)) {
        return;
      }
    }

    const selectedEvent = events.find(ev => ev.id === calendarEventId);

    onSave({
      date: new Date(date),
      quantity: qty,
      calendarEventId: calendarEventId || undefined,
      block: block || undefined,
      notes: notes.trim() || undefined
    }, selectedEvent?.title);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Log Usage</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{consumable.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantity ({consumable.unit}) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Available: {consumable.currentBalance} {consumable.unit}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link to Calendar Event</label>
            <select
              value={calendarEventId}
              onChange={(e) => setCalendarEventId(e.target.value)}
              className="w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
            >
              <option value="">-- No linked event --</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.date.toLocaleDateString('en-GB')} - {ev.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Applied to Block</label>
            <select
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
            >
              <option value="">-- Select block (optional) --</option>
              {blocks.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="All Blocks">All Blocks</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="w-full rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:ring-brand-500"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm">
              Log Usage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
