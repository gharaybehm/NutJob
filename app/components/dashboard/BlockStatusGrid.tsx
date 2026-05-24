import Link from "next/link";

interface BlockStatusItem {
  id: string;
  name: string;
  variety: string;
  area: number;
  areaUnit: string;
  status: 'green' | 'amber' | 'red';
  moisture: string;
  issue: string | null;
}

interface BlockStatusGridProps {
  blocks: BlockStatusItem[];
}

export default function BlockStatusGrid({ blocks = [] }: BlockStatusGridProps) {
  const count = blocks.length;

  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Block Status</h2>
        <span className="text-sm text-slate-500">Overview of {count} Block{count !== 1 ? 's' : ''}</span>
      </div>
      <div className="p-4">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-2xl">🌱</span>
            <p className="mt-2 text-sm font-medium text-slate-500">No blocks configured yet</p>
            <Link 
              href="/blocks" 
              className="mt-3 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              Go to Blocks page to configure
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {blocks.map((block) => (
              <Link
                key={block.id}
                href="/blocks"
                className={`relative flex flex-col rounded-lg border p-4 transition-all hover:shadow-md cursor-pointer ${
                  block.status === 'green' ? 'border-brand-200 bg-brand-50/10 hover:bg-brand-50/20 dark:border-brand-900/30' :
                  block.status === 'amber' ? 'border-amber-300 bg-amber-50/10 hover:bg-amber-50/20 dark:border-amber-900/30' :
                  'border-red-300 bg-red-50/10 hover:bg-red-50/20 dark:border-red-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-slate-900 dark:text-white">{block.name}</span>
                  <span className={`flex h-3 w-3 rounded-full ${
                    block.status === 'green' ? 'bg-brand-500' :
                    block.status === 'amber' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}></span>
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {block.variety} • {block.area} {block.areaUnit}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-600 dark:text-slate-300">Moisture: {block.moisture}</span>
                </div>
                {block.issue && (
                  <div className={`mt-2 text-xs font-medium truncate ${
                    block.status === 'red' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                  }`} title={block.issue}>
                    Issue: {block.issue}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
