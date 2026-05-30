import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getTranslations, getLocale } from "next-intl/server";
import { formatPercent } from "@/utils/format";

interface BlockStatusItem {
  id: string;
  name: string;
  variety: string;
  area: number;
  areaUnit: string;
  status: 'green' | 'amber' | 'red';
  moisture: number | null;
  issue: string | null;
}

async function getBlocks(farmId: string): Promise<BlockStatusItem[]> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: dbBlocks }, { data: soilLatest }, { data: activeAlerts }] = await Promise.all([
    (supabase.from("blocks") as any)
      .select("id, name, variety, area, area_unit")
      .eq("farm_id", farmId),
    supabase.from("soil_water_latest").select("block_id, soil_moisture"),
    supabase.from("block_alerts").select("id, severity, message, block_id").eq("resolved", false),
  ]);

  return (dbBlocks ?? []).map((b: { id: string; name: string; variety: string; area: number; area_unit: string }) => {
    const moistureRow = (soilLatest ?? []).find(s => s.block_id === b.id);
    const moisture = moistureRow?.soil_moisture != null ? moistureRow.soil_moisture : null;
    const blockAlerts = (activeAlerts ?? []).filter((a: { block_id: string; severity: string; message: string }) => a.block_id === b.id);
    let status: 'green' | 'amber' | 'red' = 'green';
    let issue: string | null = null;
    if (blockAlerts.some((a: { severity: string }) => a.severity === 'critical')) {
      status = 'red';
      issue = blockAlerts.find((a: { severity: string; message: string }) => a.severity === 'critical')?.message ?? null;
    } else if (blockAlerts.some((a: { severity: string }) => a.severity === 'warning')) {
      status = 'amber';
      issue = blockAlerts.find((a: { severity: string; message: string }) => a.severity === 'warning')?.message ?? null;
    }
    return { id: b.id, name: b.name, variety: b.variety, area: Number(b.area), areaUnit: b.area_unit || "Dunm", status, moisture, issue };
  });
}

export default async function BlockStatusGrid({ farmId }: { farmId: string }) {
  const [blocks, t, locale] = await Promise.all([getBlocks(farmId), getTranslations('dashboard.blockStatus'), getLocale()]);
  const count = blocks.length;
  const blocksHref = `/${farmId}/blocks`;

  return (
    <div className="flex flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('title')}</h2>
        <span className="text-sm text-slate-500">
          {count === 1 ? t('overview', { count }) : t('overviewPlural', { count })}
        </span>
      </div>
      <div className="p-4">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-2xl">🌱</span>
            <p className="mt-2 text-sm font-medium text-slate-500">{t('noBlocks')}</p>
            <Link
              href={blocksHref}
              className="mt-3 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              {t('goToBlocks')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {blocks.map((block) => (
              <Link
                key={block.id}
                href={blocksHref}
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
                  <span className="text-slate-600 dark:text-slate-300">{t('moisture', { value: block.moisture !== null ? formatPercent(block.moisture, locale) : 'N/A' })}</span>
                </div>
                {block.issue && (
                  <div className={`mt-2 text-xs font-medium truncate ${
                    block.status === 'red' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                  }`} title={block.issue}>
                    {t('issue', { text: block.issue })}
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
