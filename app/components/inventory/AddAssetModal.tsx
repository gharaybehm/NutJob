import { useState } from 'react';
import { Asset, AssetCategory, AssetStatus, ASSET_SUGGESTIONS } from './types';

export default function AddAssetModal({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (data: Omit<Asset, 'id' | 'maintenanceLog'>) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('machinery');
  const [status, setStatus] = useState<AssetStatus>('operational');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      category,
      status,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
      notes: notes.trim() || undefined
    });
    onClose();
  };

  const filteredSuggestions = ASSET_SUGGESTIONS.filter(s => 
    s.toLowerCase().includes(name.toLowerCase()) && s.toLowerCase() !== name.toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface shadow-2xl ring-1 ring-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line flex justify-between items-center">
          <h2 className="text-lg font-bold text-ink">Add New Asset</h2>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-3">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-ink-2 mb-1">Asset Name *</label>
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
              placeholder="e.g. John Deere Tractor"
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
                onChange={(e) => setCategory(e.target.value as AssetCategory)}
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              >
                <option value="machinery">Machinery</option>
                <option value="vehicle">Vehicle</option>
                <option value="tool">Tool</option>
                <option value="equipment">Equipment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
                className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              >
                <option value="operational">Operational</option>
                <option value="needs-maintenance">Needs Maintenance</option>
                <option value="out-of-service">Out of Service</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Purchase Date</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border-line bg-surface px-3 py-2 text-sm text-ink focus:border-green focus:ring-green"
              placeholder="Any additional details..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-2 hover:bg-tile rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green hover:brightness-105 rounded-lg">
              Save Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
