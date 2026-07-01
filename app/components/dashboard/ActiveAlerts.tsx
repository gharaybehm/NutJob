import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getTranslations } from "next-intl/server";

interface AlertItem {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
  domain: 'soil-water' | 'phenology' | 'nutrition' | 'pest-disease' | 'weather';
  blockName: string | null;
}

function getAlertIcon(severity: string) {
  if (severity === 'critical') return AlertCircle;
  if (severity === 'warning') return AlertTriangle;
  return Info;
}

async function getAlerts(farmId: string): Promise<AlertItem[]> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmBlocks } = await (supabase.from("blocks") as any)
    .select("id")
    .eq("farm_id", farmId);
  const blockIds: string[] = (farmBlocks ?? []).map((b: { id: string }) => b.id);
  if (blockIds.length === 0) return [];

  const { data } = await supabase
    .from("block_alerts")
    .select("id, message, severity, created_at, domain, blocks(name)")
    .in("block_id", blockIds)
    .eq("resolved", false)
    .order("created_at", { ascending: false });

  return (data ?? []).map(a => ({
    id: a.id,
    message: a.message,
    severity: a.severity as AlertItem['severity'],
    created_at: a.created_at,
    domain: a.domain as AlertItem['domain'],
    blockName: (a.blocks as { name: string } | null)?.name ?? null,
  }));
}

function getRelativeTimeParts(dateStr: string) {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const days = Math.floor(diffHrs / 24);
  return { diffMins, diffHrs, days };
}

export default async function ActiveAlerts({ farmId }: { farmId: string }) {
  const [alerts, t] = await Promise.all([
    getAlerts(farmId),
    getTranslations('dashboard.alerts'),
  ]);
  const count = alerts.length;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-heading text-base font-semibold text-ink">{t('title')}</h2>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold ${
          count > 0 ? 'bg-red-soft text-red' : 'bg-green-soft text-green'
        }`}>
          {(count > 0 ? t('statusActive', { count }) : t('statusClear')).toString().toUpperCase()}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 min-h-[200px]">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center gap-2">
            <CheckCircle className="h-10 w-10 text-green" />
            <p className="text-sm font-semibold text-ink">{t('allNominal')}</p>
            <p className="text-xs text-ink-3 max-w-[280px]">{t('nominalDescription')}</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {alerts.map((alert) => {
              const Icon = getAlertIcon(alert.severity);
              const isCritical = alert.severity === 'critical';
              const DOMAIN_KEYS = {
                'soil-water': 'domains.soil-water',
                'phenology': 'domains.phenology',
                'nutrition': 'domains.nutrition',
                'pest-disease': 'domains.pest-disease',
                'weather': 'domains.weather',
              } as const;
              const domainLabel = alert.domain in DOMAIN_KEYS
                ? t(DOMAIN_KEYS[alert.domain as keyof typeof DOMAIN_KEYS])
                : t('domains.system');
              const blockStr = alert.blockName ? ` · ${alert.blockName}` : "";

              return (
                <li key={alert.id} className={`flex gap-[11px] rounded-[11px] border p-[11px] ${
                  isCritical
                    ? 'border-[#F2E1DC] bg-[#FDF7F5]'
                    : alert.severity === 'warning'
                    ? 'border-[#EEE6D3] bg-[#FDFAF2]'
                    : 'border-line-soft bg-tile'
                }`}>
                  <span className={`w-[3px] shrink-0 rounded-full ${
                    isCritical ? 'bg-red' : alert.severity === 'warning' ? 'bg-amber' : 'bg-blue'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                        isCritical ? 'text-red' : alert.severity === 'warning' ? 'text-amber' : 'text-blue'
                      }`} />
                      <h3 className="text-[13px] font-semibold text-ink">
                        {domainLabel}{blockStr}
                      </h3>
                    </div>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {alert.message}
                    </p>
                    <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-ink-4">
                      {(() => {
                        const { diffMins, diffHrs, days } = getRelativeTimeParts(alert.created_at);
                        if (diffHrs >= 24) return days === 1 ? t('timeYesterday') : t('timeDaysAgo', { count: days });
                        if (diffHrs > 0) return diffHrs === 1 ? t('timeHoursAgo', { count: diffHrs }) : t('timeHoursAgoPlural', { count: diffHrs });
                        if (diffMins > 0) return diffMins === 1 ? t('timeMinutesAgo', { count: diffMins }) : t('timeMinutesAgoPlural', { count: diffMins });
                        return t('timeJustNow');
                      })()}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
