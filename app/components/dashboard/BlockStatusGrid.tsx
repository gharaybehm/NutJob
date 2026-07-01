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

  const STATUS_DOT: Record<BlockStatusItem['status'], string> = {
    green: 'bg-green shadow-[0_0_0_3px_var(--color-green-soft)]',
    amber: 'bg-amber shadow-[0_0_0_3px_var(--color-amber-soft)]',
    red: 'bg-red shadow-[0_0_0_3px_var(--color-red-soft)]',
  };
  const STATUS_BORDER: Record<BlockStatusItem['status'], string> = {
    green: 'border-line hover:border-green',
    amber: 'border-line hover:border-amber',
    red: 'border-[#F0DCD6] bg-[#FDF7F5] hover:border-red',
  };

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-heading text-base font-semibold text-ink">{t('title')}</h2>
        <span className="text-sm text-ink-3">
          {count === 1 ? t('overview', { count }) : t('overviewPlural', { count })}
        </span>
      </div>
      <div className="p-4">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-2xl">🌱</span>
            <p className="mt-2 text-sm font-medium text-ink-3">{t('noBlocks')}</p>
            <Link
              href={blocksHref}
              className="mt-3 text-xs font-semibold text-green hover:underline"
            >
              {t('goToBlocks')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {blocks.map((block) => (
              <Link
                key={block.id}
                href={blocksHref}
                className={`relative flex flex-col rounded-[13px] border p-[13px] transition-all cursor-pointer ${STATUS_BORDER[block.status]}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading text-[15px] font-bold text-ink">{block.name}</span>
                  <span className={`h-[11px] w-[11px] rounded-full ${STATUS_DOT[block.status]}`}></span>
                </div>
                <div className="text-xs text-ink-2">
                  {block.variety} · {block.area} {block.areaUnit}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs font-medium">
                  <span className="text-ink-2">{t('moisture', { value: block.moisture !== null ? formatPercent(block.moisture, locale) : 'N/A' })}</span>
                </div>
                {block.issue && (
                  <div className={`mt-2 text-xs font-medium truncate ${
                    block.status === 'red' ? 'text-red' : 'text-amber'
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
