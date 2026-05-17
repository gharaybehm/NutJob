const blocks = [
  { id: "A", name: "Block A", variety: "Nonpareil", area: 45, areaUnit: "Dunm", status: "green", moisture: "32%", issue: null },
  { id: "B", name: "Block B", variety: "Monterey", area: 30, areaUnit: "Dunm", status: "green", moisture: "29%", issue: null },
  { id: "C", name: "Block C", variety: "Nonpareil", area: 50, areaUnit: "Dunm", status: "red", moisture: "14%", issue: "Low Moisture" },
  { id: "D", name: "Block D", variety: "Fritz", area: 25, areaUnit: "Dunm", status: "amber", moisture: "22%", issue: "Pest Risk" },
  { id: "E", name: "Block E", variety: "Monterey", area: 40, areaUnit: "Dunm", status: "green", moisture: "28%", issue: null },
  { id: "F", name: "Block F", variety: "Nonpareil", area: 35, areaUnit: "Dunm", status: "green", moisture: "30%", issue: null },
];

export default function BlockStatusGrid() {
  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Block Status</h2>
        <span className="text-sm text-slate-500">Overview of 6 Blocks</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {blocks.map((block) => (
            <div
              key={block.id}
              className={`relative flex flex-col rounded-lg border p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${
                block.status === 'green' ? 'border-brand-200 bg-brand-50/30 dark:border-brand-900/30' :
                block.status === 'amber' ? 'border-amber-300 bg-amber-50 dark:border-amber-900/50' :
                'border-red-300 bg-red-50 dark:border-red-900/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900 dark:text-white">{block.id}</span>
                <span className={`flex h-3 w-3 rounded-full ${
                  block.status === 'green' ? 'bg-brand-500' :
                  block.status === 'amber' ? 'bg-amber-500' :
                  'bg-red-500'
                }`}></span>
              </div>
              <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {block.variety} • {block.area} {block.areaUnit}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-medium">
                <span className="text-slate-600 dark:text-slate-300">Moisture: {block.moisture}</span>
              </div>
              {block.issue && (
                <div className={`mt-2 text-xs font-medium ${
                  block.status === 'red' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                }`}>
                  Issue: {block.issue}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
