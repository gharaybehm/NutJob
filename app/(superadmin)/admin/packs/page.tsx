import { Package } from "lucide-react";
import { getInstalledPacks } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard from "@/app/components/admin/AdminSectionCard";

export const metadata = { title: "Crop Packs — Admin" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function AdminPacksPage() {
  const { packs, error } = await getInstalledPacks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Crop Knowledge Packs</h1>
        <p className="mt-1 text-sm text-ink-3">
          The crop science the decision engine runs on. A pack is reviewed, then installed from the repository
          (<span className="font-mono">npm run install:pack</span>); an installed version is never changed. A farm admin links blocks to a version and moves them to a new one.
          These are separate from the guide documents the AI cites.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl bg-surface p-8 text-center text-sm text-red shadow-sm ring-1 ring-line">{error}</div>
      ) : !packs || packs.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8 text-center text-sm text-ink-4 shadow-sm ring-1 ring-line">No pack is installed.</div>
      ) : (
        packs.map((p) => (
          <AdminSectionCard
            key={`${p.packId}@${p.version}`}
            title={`${p.cropName} · ${p.packId} ${p.version}`}
            icon={Package}
            description={`Installed ${p.installedAt.slice(0, 10)} · ${plural(p.blocksBound, "block")} on ${plural(p.farmsBound, "farm")} · ${plural(p.liveSwitches, "engine")} switched to Live · pack tests ${p.testsPassed} of ${p.testsTotal} passed`}
          >
            <div className="space-y-5 text-sm">
              <div>
                <p className="font-semibold text-ink">Engines</p>
                <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {p.engines.map((e) => (
                    <li key={e.engineId} className="flex items-start justify-between gap-3 border-b border-line/60 py-1">
                      <span className="font-mono text-xs text-ink-2">{e.engineId}</span>
                      <span className={`text-end text-xs ${!e.hasContent ? "text-ink-4" : e.liveBlockedBy.length > 0 ? "text-amber-ink" : "text-green"}`}>
                        {!e.hasContent ? "no content" : e.liveBlockedBy.length > 0 ? `Shadow only: ${plural(e.liveBlockedBy.length, "value")} missing` : "may go Live"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <details>
                <summary className="cursor-pointer font-semibold text-ink">
                  Values to be sourced ({p.toBeSourced.length}), expert estimates ({p.expertEstimates})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-2">
                  {p.toBeSourced.map((v) => (
                    <li key={v.id}>
                      <span className="font-mono">{v.id}</span> [{v.unit}]{v.engines.length > 0 ? ` · ${v.engines.join(", ")}` : ""}{v.note ? ` · ${v.note}` : ""}
                    </li>
                  ))}
                </ul>
              </details>

              <details>
                <summary className="cursor-pointer font-semibold text-ink">Content not written yet ({p.pendingContent.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-2">
                  {p.pendingContent.map((c, i) => (
                    <li key={i}>
                      <span className="font-mono">{c.section}</span>: {c.item}
                    </li>
                  ))}
                </ul>
              </details>

              <details>
                <summary className="cursor-pointer font-semibold text-ink">For agronomist review ({p.reviewNotes.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-2">
                  {p.reviewNotes.map((n, i) => (
                    <li key={i}>
                      <span className="font-mono">{n.where}</span>: {n.note}
                    </li>
                  ))}
                </ul>
              </details>

              <p className="break-all font-mono text-[11px] text-ink-4">{p.digest}</p>
            </div>
          </AdminSectionCard>
        ))
      )}
    </div>
  );
}
