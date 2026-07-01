import { useState } from 'react';
import { Consumable, ConsumableCategory, CONSUMABLE_SUGGESTIONS } from './types';

export default function AddConsumableModal({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (data: Omit<Consumable, 'id' | 'usageLog' | 'currentBalance'>) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ConsumableCategory>('fertilizer');
  const [unit, setUnit] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [minimumStock, setMinimumStock] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !unit.trim() || !startingBalance) return;

    onSave({
      name: name.trim(),
      category,
      unit: unit.trim(),
      startingBalance: Number(startingBalance),
      minimumStock: minimumStock ? Number(minimumStock) : undefined
    });
    onClose();
  };

  const filteredSuggestions = CONSUMABLE_SUGGESTIONS.filter(s => 
    s.toLowerCase().includes(name.toLowerCase()) && s.toLowerCase() !== name.toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface shadow-2xl ring-1 ring-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line flex justify-between items-center">
          <h2 className="text-lg font-bold text-ink">Add Consumable</h2>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-3">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-ink-2 mb-1">Item Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              placeholder="e.g. Calcium Nitrate"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-md shadow-lg max-h-40 overflow-y-auto text-sm">
                {filteredSuggestions.map(suggestion => (
                  <li 
                    key={suggestion} 
                    className="px-3 py-2 cursor-pointer hover:bg-tile text-ink-2"
                    onClick={() => {
                      setName(suggestion);
                      setShowSuggestions(false);
                    }}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ConsumableCategory)}
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              >
                <option value="fertilizer">Fertilizer</option>
                <option value="pesticide">Pesticide</option>
                <option value="herbicide">Herbicide</option>
                <option value="fuel">Fuel</option>
                <option value="parts">Parts</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Unit of Measure *</label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kg, L, bags, etc."
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Starting Balance *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Min Stock Alert</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minimumStock}
                onChange={(e) => setMinimumStock(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 hover:bg-tile rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green hover:brightness-105 rounded-lg">
              Save Consumable
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
