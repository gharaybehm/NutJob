import Link from "next/link";
import { Workflow } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/utils/supabase/server";
import { engineTile, type EngineTile } from "@/utils/decision/plan-view";

/**
 * The decision engine's latest view of each block: growth phase, how close
 * the root zone is to the refill point, the coldest night ahead, the expected
 * yield, and how many engines are still waiting for data. Shadow output, for
 * supervisors and admins; row-level security returns nothing to a worker, and
 * the card is then not shown.
 */
async function getTiles(farmId: string): Promise<{ date: string; tiles: (EngineTile & { blockId: string; name: string })[] } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data: latest } = await supabase.from("block_engine_state").select("state_date").eq("farm_id", farmId).order("state_date", { ascending: false }).limit(1).maybeSingle();
  if (!latest?.state_date) return null;
  const [{ data: states }, { data: blocks }] = await Promise.all([
    supabase.from("block_engine_state").select("block_id, state, engines").eq("farm_id", farmId).eq("state_date", latest.state_date),
    supabase.from("blocks").select("id, name").eq("farm_id", farmId).order("name"),
  ]);
  const byBlock = new Map<string, { state: unknown; engines: unknown }>((states ?? []).map((s: { block_id: string; state: unknown; engines: unknown }) => [s.block_id, s]));
  const tiles = ((blocks ?? []) as { id: string; name: string }[]).flatMap((b) => {
    const s = byBlock.get(b.id);
    return s ? [{ blockId: b.id, name: b.name, ...engineTile(s.state, s.engines) }] : [];
  });
  return tiles.length > 0 ? { date: String(latest.state_date).slice(0, 10), tiles } : null;
}

export default async function EngineStatus({ farmId }: { farmId: string }) {
  const data = await getTiles(farmId);
  if (!data) return null;
  const [t, locale] = await Promise.all([getTranslations("dashboard.engine"), getLocale()]);
  const day = (date: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const flags = new Set(data.tiles.flatMap((x) => x.flags)).size;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-ink">
            <Workflow className="h-4 w-4 text-green" />
            {t("title")}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">{t("subtitle", { date: day(data.date) })}</p>
        </div>
        <Link href={`/${farmId}/recommendations`} className="shrink-0 text-xs font-semibold text-green hover:underline">
          {t("seePlan")}
        </Link>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.tiles.map((x) => (
          <li key={x.blockId} className="rounded-xl border border-line p-3">
            <p className="text-sm font-semibold text-ink">{x.name}</p>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">{t("phase")}</dt>
                <dd className="font-medium text-ink-2">{x.phase ?? t("unknown")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">{t("water")}</dt>
                <dd className={`text-end font-medium ${x.depletionPct !== null && x.depletionPct >= 100 ? "text-red" : "text-ink-2"}`}>
                  {x.depletionPct === null ? t("notComputed") : t("ofRefillPoint", { pct: Math.round(x.depletionPct) })}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">{t("coldestNight")}</dt>
                <dd className="font-medium text-ink-2">{x.coldestNight ? t("tempOn", { temp: Math.round(x.coldestNight.minC * 10) / 10, date: day(x.coldestNight.date) }) : t("unknown")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">{t("yield")}</dt>
                <dd className="font-medium text-ink-2">{x.expectedYield === null ? t("noEstimate") : `${Math.round(x.expectedYield)} ${x.yieldUnit ?? ""}`}</dd>
              </div>
            </dl>
            {x.waiting > 0 && <p className="mt-2 text-[11px] text-amber-ink">{t("waiting", { count: x.waiting })}</p>}
          </li>
        ))}
      </ul>

      {flags > 0 && <p className="mt-3 text-[11px] text-ink-4">{t("dataQuality", { count: flags })}</p>}
    </section>
  );
}
