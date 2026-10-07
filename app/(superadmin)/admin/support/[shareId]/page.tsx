import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSharedConversation } from "@/app/(superadmin)/admin/actions";

// Opening this page logs a view (in getSharedConversation) before anything is shown.
export const dynamic = "force-dynamic";

export default async function SharedConversationPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const { conversation, error } = await getSharedConversation(shareId);

  const back = (
    <Link href="/admin/support" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Shared conversations
    </Link>
  );

  if (error || !conversation) {
    return (
      <div className="space-y-6">
        {back}
        <div className="rounded-2xl bg-surface p-8 text-center text-sm text-ink-3 ring-1 ring-line">
          {error === "Not found" ? "This conversation is not shared, or its share was withdrawn or has expired." : error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      <div>
        <h1 className="text-2xl font-semibold text-ink">{conversation.farmName}</h1>
        <p className="mt-1 text-sm text-ink-3">
          Shared {new Date(conversation.sharedAt).toLocaleString()} · readable until {new Date(conversation.expiresAt).toLocaleString()} · this view was logged
        </p>
      </div>
      <ol className="space-y-3">
        {conversation.messages.map((m, i) => (
          <li key={i} className={`rounded-2xl px-4 py-3 text-sm ring-1 ring-line ${m.role === "user" ? "bg-green-soft" : "bg-surface"}`}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-3">
              {m.role === "user" ? "Farm user" : "Assistant"} · {new Date(m.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap break-words text-ink">{m.content}</p>
            {m.citations.length > 0 && (
              <p className="mt-2 text-xs text-ink-4">
                Sources: {m.citations.map((c) => `[${c.n}] ${c.title}${c.section ? ` — ${c.section}` : ""}`).join("; ")}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
