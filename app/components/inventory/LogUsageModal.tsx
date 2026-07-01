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
  events: { id: string; title: string; date: Date; type: string }[];
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
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface shadow-2xl ring-1 ring-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-tile">
          <div>
            <h2 className="text-lg font-bold text-ink">Log Usage</h2>
            <p className="text-sm text-ink-3">{consumable.name}</p>
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
              <label className="block text-sm font-medium text-ink-2 mb-1">Quantity ({consumable.unit}) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              />
              <p className="mt-1 text-[10px] text-ink-3">
                Available: {consumable.currentBalance} {consumable.unit}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Link to Calendar Event</label>
            <select
              value={calendarEventId}
              onChange={(e) => setCalendarEventId(e.target.value)}
              className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
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
            <label className="block text-sm font-medium text-ink-2 mb-1">Applied to Block</label>
            <select
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
            >
              <option value="">-- Select block (optional) --</option>
              {blocks.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="All Blocks">All Blocks</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 hover:bg-tile rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green hover:brightness-105 rounded-lg">
              Log Usage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
