import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle, Sparkles, ArrowRight } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getTranslations } from "next-intl/server";
import { getFarmActor, atLeast } from "@/utils/supabase/farm-access";
import { CATEGORY_STYLES, type Category } from "@/app/components/ui/CategoryChip";
import { confidenceLevel } from "@/app/components/ui/ConfidenceBar";
import { notExpiredFilter } from "@/utils/recommendation-lifecycle";

/**
 * One ranked list of what needs doing, replacing the separate Active Alerts
 * panel. Alerts and AI recommendations used to be shown in different cards
 * (plus a KPI and the block tiles), so the same problem appeared several times
 * and nothing said which to do first.
 *
 * Order: critical alerts, then pending recommendations by confidence, then
 * warnings. An alert is dropped when a pending recommendation already covers
 * the same block and domain — the recommendation is the actionable form of it.
 */

type Severity = "critical" | "warning" | "info";
type Domain = "soil-water" | "phenology" | "nutrition" | "pest-disease" | "weather";

const CATEGORY_DOMAIN: Record<string, Domain | null> = {
  irrigate: "soil-water",
  fertilize: "nutrition",
  spray: "pest-disease",
  scout: "pest-disease",
  prune: "phenology",
  other: null,
};

interface PlanItem {
  key: string;
  kind: "alert" | "recommendation";
  severity: Severity;
  title: string;
  detail: string;
  blockName: string | null;
  category?: string;
  domain?: Domain;
  source?: string;
  confidence?: number | null;
  createdAt: string;
}

const MAX_ITEMS = 5;

async function getPlan(farmId: string, includeRecommendations: boolean): Promise<{ items: PlanItem[]; total: number }> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- farm_id predates the generated types
  const { data: farmBlocks } = await (supabase.from("blocks") as any).select("id").eq("farm_id", farmId);
  const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);

  const [{ data: alerts }, { data: recs }] = await Promise.all([
    blockIds.length > 0
      ? supabase
          .from("block_alerts")
          .select("id, message, severity, source, created_at, domain, block_id, blocks(name)")
          .in("block_id", blockIds)
          .eq("resolved", false)
          .in("severity", ["critical", "warning"])
      : Promise.resolve({ data: [] as never[] }),
    includeRecommendations
      ? supabase
          .from("recommendations")
          .select("id, title, rationale, category, confidence, created_at, block_id, blocks(name)")
          .eq("farm_id", farmId)
          .eq("status", "pending")
          .or(notExpiredFilter(new Date()))
          .order("confidence", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const covered = new Set(
    (recs ?? []).map((r) => `${r.block_id}|${CATEGORY_DOMAIN[r.category] ?? ""}`),
  );

  const alertItems: PlanItem[] = (alerts ?? [])
    .filter((a) => !covered.has(`${a.block_id}|${a.domain}`))
    .map((a) => ({
      key: `a-${a.id}`,
      kind: "alert",
      severity: a.severity as Severity,
      title: a.message,
      detail: "",
      blockName: (a.blocks as { name: string } | null)?.name ?? null,
      domain: a.domain as Domain,
      source: a.source,
      createdAt: a.created_at,
    }));

  const recItems: PlanItem[] = (recs ?? []).map((r) => ({
    key: `r-${r.id}`,
    kind: "recommendation",
    severity: "info",
    title: r.title,
    detail: r.rationale,
    blockName: (r.blocks as { name: string } | null)?.name ?? null,
    category: r.category,
    confidence: r.confidence,
    createdAt: r.created_at,
  }));

  const ordered = [
    ...alertItems.filter((i) => i.severity === "critical"),
    ...recItems,
    ...alertItems.filter((i) => i.severity === "warning"),
  ];
  return { items: ordered.slice(0, MAX_ITEMS), total: ordered.length };
}

export default async function TodayPlan({ farmId }: { farmId: string }) {
  const actor = await getFarmActor(farmId);
  const canSeeRecommendations = atLeast(actor?.role, "supervisor");
  const [{ items, total }, t, tAlerts, tCat] = await Promise.all([
    getPlan(farmId, canSeeRecommendations),
    getTranslations("dashboard.plan"),
    getTranslations("dashboard.alerts"),
    getTranslations("recommendations.categories"),
  ]);

  const recsHref = `/${farmId}/recommendations`;
  const blocksHref = `/${farmId}/blocks`;

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles className="h-5 w-5 shrink-0 text-gold-ink" aria-hidden="true" />
          <h2 className="whitespace-nowrap font-heading text-base font-semibold text-ink">{t("title")}</h2>
          <span className="hidden truncate text-[13px] text-ink-3 xl:inline">{t("subtitle")}</span>
        </div>
        {total > items.length && (
          <Link href={canSeeRecommendations ? recsHref : blocksHref} className="shrink-0 text-[13px] font-semibold text-green hover:underline">
            {t("viewAll", { count: total })}
          </Link>
        )}
      </div>

      <div className="p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <CheckCircle className="h-10 w-10 text-green" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">{t("emptyTitle")}</p>
            <p className="max-w-[320px] text-[13px] text-ink-3">{t("emptyDescription")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((item) => {
              const isCritical = item.severity === "critical";
              const isWarning = item.severity === "warning";
              const cat = item.category && item.category in CATEGORY_STYLES ? CATEGORY_STYLES[item.category as Category] : null;
              const confidencePct = item.confidence != null ? Math.round(item.confidence * 100) : null;
              const href = item.kind === "recommendation" ? recsHref : blocksHref;

              return (
                <li
                  key={item.key}
                  className={`flex gap-3 rounded-[13px] border p-3.5 ${
                    isCritical ? "border-[#F0D5CF] bg-[#FDF8F6]" : "border-line"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-1 shrink-0 rounded-full ${isCritical ? "bg-red" : isWarning ? "bg-amber" : "bg-gold"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCritical && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-red">
                          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("actToday").toUpperCase()}
                        </span>
                      )}
                      {isWarning && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-ink">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("watch").toUpperCase()}
                        </span>
                      )}
                      {cat && (
                        <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${cat.bg} ${cat.text}`}>
                          {tCat(item.category as Category).toUpperCase()}
                        </span>
                      )}
                      {item.domain && (
                        <span className="text-[13px] text-ink-2">{tAlerts(`domains.${item.domain}`)}</span>
                      )}
                      {item.blockName && (
                        <span className="font-heading text-[13px] font-bold text-ink">{item.blockName}</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[14.5px] font-semibold text-ink">{item.title}</p>
                    {item.detail && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{item.detail}</p>}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-ink-3">
                        {item.kind === "recommendation" && confidencePct !== null
                          ? t("confidence", { level: t(`level.${confidenceLevel(confidencePct)}`), value: confidencePct })
                          : item.source
                          ? t("source", { source: item.source.toUpperCase() })
                          : null}
                      </span>
                      <Link
                        href={href}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition ${
                          item.kind === "recommendation"
                            ? "bg-green text-white hover:brightness-105"
                            : "border border-line text-ink hover:border-ink-4"
                        }`}
                      >
                        {item.kind === "recommendation" ? t("review") : t("openBlock")}
                        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
