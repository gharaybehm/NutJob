import Link from "next/link";
import { Activity, ArrowLeft, BookOpen, Cpu, Layers, MessageSquare, Sparkles, Timer, Users } from "lucide-react";
import AssistantCountsGrid from "@/app/components/admin/AssistantCountsGrid";
import { COUNT_WINDOW_DAYS } from "@/utils/assistant/operator-counts";
import { getFarmHealthDetail } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard, { SubscriptionStatusBadge } from "@/app/components/admin/AdminSectionCard";
import HealthBadge from "@/app/components/admin/HealthBadge";
import { JOB_LABELS, STALE_AFTER_HOURS, describeAge } from "@/utils/farm-health";
import { HISTORY_DAYS } from "@/utils/recommendation-lifecycle";

const SKIP_REASON_LABELS: Record<string, string> = {
  already_done: "already done",
  disagree: "disagreed",
  no_resources: "no water or crew",
  no_reason: "no reason given",
};

const SENSOR_STATE: Record<string, { label: string; className: string }> = {
  reporting: { label: "Reporting", className: "bg-green-soft text-green" },
  silent: { label: "Silent", className: "bg-red-soft text-red" },
  never: { label: "Never reported", className: "bg-tile text-ink-3" },
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg bg-tile px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-4">{hint}</p>}
    </div>
  );
}

const TH = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-3";
const TD = "px-4 py-3 text-sm text-ink-3";

export default async function AdminFarmHealthPage({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const { detail, error } = await getFarmHealthDetail(farmId);

  const back = (
    <Link href="/admin/overview" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> All farms
    </Link>
  );

  if (error || !detail) {
    return (
      <div className="space-y-6">
        {back}
        <div className="rounded-2xl bg-surface p-8 text-center text-sm text-red ring-1 ring-line">{error ?? "Farm not found"}</div>
      </div>
    );
  }

  const { farm, report, members } = detail;
  const { signals, health, recommendations: recs } = report;
  const now = new Date(detail.checkedAt);
  const incomplete = report.blocks.filter((b) => b.missing.length > 0);
  const alertTotal = signals.openAlerts.critical + signals.openAlerts.warning + signals.openAlerts.info;
  const pct = (n: number) => (recs.total > 0 ? `${Math.round((n / recs.total) * 100)}%` : "—");

  return (
    <div className="space-y-6">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-ink">
            {farm.name} <HealthBadge level={health.level} />
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {farm.organizationName || "No organization"} · created {new Date(farm.createdAt).toLocaleDateString()} · read-only: counts, times and settings, not the farm&apos;s own records
          </p>
        </div>
        <SubscriptionStatusBadge status={farm.subscriptionStatus} />
      </div>

      <AdminSectionCard title="What needs a look" icon={Activity}
        description={health.issues.length === 0 ? "Nothing: the jobs are producing data and the farm is in use." : undefined}>
        {health.issues.length > 0 && (
          <ul className="space-y-2">
            {health.issues.map((issue) => (
              <li key={issue.message} className="flex items-start gap-2 text-sm text-ink-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${issue.level === "stalled" ? "bg-red" : "bg-amber"}`} />
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Last activity" value={describeAge(signals.lastActivity, now)} hint="Work logged or a recommendation acted on" />
          <Stat label="Open alerts" value={alertTotal}
            hint={alertTotal > 0 ? `${signals.openAlerts.critical} critical, ${signals.openAlerts.warning} warning, ${signals.openAlerts.info} info` : undefined} />
          <Stat label="Pending recommendations" value={signals.pendingRecommendations} />
          <Stat label="Blocks" value={signals.blocks} hint={incomplete.length > 0 ? `${incomplete.length} with setup missing` : "All set up"} />
        </div>
        {alertTotal > 0 && (
          <p className="mt-3 text-xs text-ink-4">
            Alerts by area: {Object.entries(report.alertsByDomain).map(([domain, n]) => `${domain} ${n}`).join(", ")}
          </p>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Scheduled jobs" icon={Timer} description="When each job last produced data for this farm.">
        <div className="-mx-2 overflow-x-auto">
          <table className="min-w-full divide-y divide-line">
            <thead>
              <tr>{["Job", "Last data", "Expected within", "State"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-tile">
              {health.jobs.map((j) => (
                <tr key={j.job}>
                  <td className="px-4 py-3 text-sm font-medium text-ink">{JOB_LABELS[j.job]}</td>
                  <td className={TD}>
                    {describeAge(j.lastRun, now)}
                    {j.lastRun && <span className="text-ink-4"> · {new Date(j.lastRun).toLocaleString()}</span>}
                  </td>
                  <td className={TD}>{STALE_AFTER_HOURS[j.job] >= 48 ? `${STALE_AFTER_HOURS[j.job] / 24} days` : `${STALE_AFTER_HOURS[j.job]} hours`}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${j.stale ? "bg-red-soft text-red" : "bg-green-soft text-green"}`}>
                      {j.stale ? (j.lastRun ? "Overdue" : "No data yet") : "On time"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-4">
          The daily snapshot is known by its date only, so its time shows as midnight UTC. A weekly AI run that returns nothing leaves no trace here.
          {!signals.hasLocation && " This farm has no GPS location, so weather and the daily calculations skip it."}
        </p>
      </AdminSectionCard>

      <AdminSectionCard title="Block setup" icon={Layers}
        description={incomplete.length === 0 ? `All ${report.blocks.length} blocks have their soil values, variety and planting date.` : `${incomplete.length} of ${report.blocks.length} blocks have something missing.`}>
        {report.blocks.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No blocks have been created.</div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>{["Block", "Crop", "Variety", "Missing"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {report.blocks.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 text-sm font-medium text-ink">{b.name}</td>
                    <td className={TD}>{b.crop || "—"}</td>
                    <td className={TD}>{b.variety || "—"}</td>
                    <td className={`px-4 py-3 text-sm ${b.missing.length > 0 ? "text-amber-ink" : "text-ink-4"}`}>{b.missing.join(", ") || "Nothing"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Sensors" icon={Cpu}
        description={signals.sensors.total === 0 ? "No sensors are registered." : `${signals.sensors.reporting} of ${signals.sensors.total} reporting.`}>
        {report.sensors.length > 0 && (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>{["Type", "State", "Last reading"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {report.sensors.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-sm font-medium text-ink">{s.type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${SENSOR_STATE[s.state].className}`}>{SENSOR_STATE[s.state].label}</span>
                    </td>
                    <td className={TD}>{describeAge(s.lastSeenAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="AI recommendations" icon={Sparkles} description={`Cards generated in the last ${HISTORY_DAYS} days and what became of them.`}>
        {recs.total === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">No recommendations were generated in this period.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Generated" value={recs.total} />
              <Stat label="Accepted" value={recs.accepted} hint={pct(recs.accepted)} />
              <Stat label="Skipped" value={recs.skipped} hint={pct(recs.skipped)} />
              <Stat label="Expired unanswered" value={recs.expired} hint={pct(recs.expired)} />
              <Stat label="Still open" value={recs.open} />
            </div>
            {recs.skipped > 0 && (
              <p className="mt-3 text-sm text-ink-2">
                Skip reasons: {Object.entries(recs.skipReasons).map(([reason, n]) => `${SKIP_REASON_LABELS[reason] ?? reason} ${n}`).join(", ")}
              </p>
            )}
            <p className="mt-2 text-sm text-ink-2">
              Not source-backed: {recs.notSourceBacked} of {recs.total}
              {recs.noGuidesLoaded > 0 && `, ${recs.noGuidesLoaded} because no guides are loaded for the crop`}
              {recs.lookupFailed > 0 && `, ${recs.lookupFailed} because the knowledge base lookup failed`}
              .
            </p>
          </>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Field assistant" icon={MessageSquare}
        description={`Counts for the last ${COUNT_WINDOW_DAYS} days. Conversations are the farm's own: none of their text is shown here, except one a user shares with support (Shared Conversations).`}>
        {detail.assistant ? (
          <AssistantCountsGrid counts={detail.assistant} />
        ) : (
          <div className="py-6 text-center text-sm text-ink-4">The assistant&apos;s counts could not be read.</div>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Knowledge gaps" icon={BookOpen}
        description={report.knowledgeGaps === null ? "The knowledge base could not be read." : report.knowledgeGaps.length === 0 ? "Every crop and variety on this farm has guides loaded." : "Crops and varieties grown here with no guides. Requests are handled under Knowledge Requests."}>
        {report.knowledgeGaps && report.knowledgeGaps.length > 0 && (
          <ul className="space-y-2">
            {report.knowledgeGaps.map((g) => (
              <li key={`${g.cropKey}|${g.varietyKey}`} className="text-sm text-ink-2">
                <span className="font-medium text-ink">{g.crop}{g.variety ? ` · ${g.variety}` : ""}</span>
                {" · "}{g.kind === "crop" ? "no guides for this crop" : "no guide on this variety"} · {g.blocks} block{g.blocks === 1 ? "" : "s"}
                {g.needsCropData && " · needs crop data too"}
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="People" icon={Users} description={`${members.length} member${members.length === 1 ? "" : "s"}.`}>
        {members.length > 0 && (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead>
                <tr>{["Name", "Email", "Role", "Last sign-in"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-tile">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-sm font-medium text-ink">{m.name || "—"}</td>
                    <td className={TD}>{m.email || "—"}</td>
                    <td className={TD}>{m.role}</td>
                    <td className={TD}>{describeAge(m.lastSignInAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}
