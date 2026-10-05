import { BookOpen } from "lucide-react";
import { getKnowledgeQueue } from "@/app/(superadmin)/admin/actions";
import AdminSectionCard from "@/app/components/admin/AdminSectionCard";
import KnowledgeRequestRow from "@/app/components/admin/KnowledgeRequestRow";

export default async function AdminKnowledgePage() {
  const { queue, error } = await getKnowledgeQueue();
  const gaps = queue?.gaps ?? [];
  const requested = gaps.filter((g) => g.requests.length > 0).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Knowledge Requests</h1>
        <p className="mt-1 text-sm text-ink-3">
          Crops and varieties grown on any farm that have no guides in the knowledge base, and the farms that asked for them.
        </p>
      </div>

      <AdminSectionCard title="Gaps" icon={BookOpen}
        description={`${plural(gaps.length, "gap")}, ${requested} requested. A gap leaves this list once its guides are ingested (npm run ingest:kb).`}>
        {error ? (
          <div className="py-6 text-center text-sm text-red">{error}</div>
        ) : gaps.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-4">Every crop and variety on every farm has guides loaded.</div>
        ) : (
          <div className="space-y-4">
            {gaps.map((g) => (
              <div key={`${g.cropKey}|${g.varietyKey}`} className="rounded-xl border border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {g.crop}{g.variety ? ` · ${g.variety}` : ""}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-3">
                      {g.kind === "crop" ? "No guides for this crop" : "No guide on this variety (the crop has general guides)"}
                      {" · "}{plural(g.blocks, "block")} on {g.farms.join(", ")}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-4">
                      Ingest under crop <span className="font-mono">{g.cropKey}</span>
                      {g.kind === "variety" ? <> with <span className="font-mono">{g.variety}</span> in variety_applicability</> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {g.needsCropData && (
                      <span className="rounded-md bg-amber-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-ink">Needs crop data too</span>
                    )}
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${g.requests.length > 0 ? "bg-green-soft text-green" : "bg-tile text-ink-3"}`}>
                      {g.requests.length > 0 ? plural(g.requests.length, "request") : "Not requested"}
                    </span>
                  </div>
                </div>
                {g.requests.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {g.requests.map((r) => (
                      <KnowledgeRequestRow key={r.id} request={r}
                        requesterName={(r.requested_by && queue?.requesterNames[r.requested_by]) || "Unknown user"} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}
