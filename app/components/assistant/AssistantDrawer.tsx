"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  X, Plus, History, Send, Sparkles, BookOpen, BookDashed, Trash2, WifiOff, Pin, ArrowLeft, Info,
} from "lucide-react";
import {
  deleteAssistantThread, getAssistantStart, getAssistantThread, listAssistantThreads, type AssistantStartData,
} from "@/app/actions/assistant";
import type {
  AssistantMessage, AssistantPins, AssistantStreamEvent, AssistantThreadSummary,
} from "@/utils/assistant/types";
import { useOnlineStatus } from "./useOnlineStatus";
import AnswerText from "./AnswerText";

const ERROR_CODES = ["unavailable", "limit_user", "limit_farm", "bad_request", "forbidden", "not_configured", "unauthorized", "not_found"] as const;
type ErrorCode = (typeof ERROR_CODES)[number];
const asErrorCode = (c: unknown): ErrorCode => (ERROR_CODES.includes(c as ErrorCode) ? (c as ErrorCode) : "unavailable");

interface Props {
  farmId: string;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  initialPins: AssistantPins;
}

export default function AssistantDrawer({ farmId, isAdmin, open, onClose, initialPins }: Props) {
  const t = useTranslations("assistant");
  const tRec = useTranslations("recommendations");
  const online = useOnlineStatus();
  const titleId = useId();

  const [view, setView] = useState<"chat" | "list">("chat");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [mine, setMine] = useState(true);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pins, setPins] = useState<AssistantPins>(initialPins);
  const [start, setStart] = useState<AssistantStartData | null>(null);
  const [threads, setThreads] = useState<AssistantThreadSummary[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pinEditor, setPinEditor] = useState<"block" | "dates" | "card" | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const newConversation = useCallback((withPins: AssistantPins = {}) => {
    abortRef.current?.abort();
    setThreadId(null);
    setMine(true);
    setOwnerName(null);
    setMessages([]);
    setPins(withPins);
    setError(null);
    setBusy(false);
    setView("chat");
  }, []);

  // Pickers and suggestions, refreshed when the pinned block changes.
  useEffect(() => {
    if (!open || !online) return;
    let cancelled = false;
    getAssistantStart(farmId, pins.blockId ?? null).then((r) => {
      if (!cancelled && !("error" in r)) setStart(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, online, farmId, pins.blockId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function showList() {
    setView("list");
    const r = await listAssistantThreads(farmId);
    setThreads(r.threads ?? []);
  }

  async function openThread(th: AssistantThreadSummary) {
    abortRef.current?.abort();
    const r = await getAssistantThread(farmId, th.id);
    if (r.error || !r.messages) return;
    setThreadId(th.id);
    setMine(Boolean(r.mine));
    setOwnerName(th.ownerName ?? null);
    setMessages(r.messages);
    setPins((r.pins ?? {}) as AssistantPins);
    setError(null);
    setView("chat");
  }

  async function removeThread(th: AssistantThreadSummary) {
    if (!window.confirm(t("deleteConfirm"))) return;
    const r = await deleteAssistantThread(farmId, th.id);
    if (r.ok) {
      setThreads((list) => (list ?? []).filter((x) => x.id !== th.id));
      if (threadId === th.id) newConversation();
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy || !online || !mine) return;
    setBusy(true);
    setError(null);
    setDraft("");
    const now = new Date().toISOString();
    const pendingId = `pending-${now}`;
    setMessages((m) => [
      ...m,
      { id: `user-${now}`, role: "user", content: q, kind: "answer", citations: [], referenceStatus: null, recordRefs: [], createdAt: now },
      { id: pendingId, role: "assistant", content: "", kind: "answer", citations: [], referenceStatus: null, recordRefs: [], createdAt: now },
    ]);
    const patch = (fn: (m: AssistantMessage) => AssistantMessage) =>
      setMessages((list) => list.map((m) => (m.id === pendingId ? fn(m) : m)));
    const dropPending = () => setMessages((list) => list.filter((m) => m.id !== pendingId || m.content.length > 0));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/farms/${encodeURIComponent(farmId)}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, threadId, pins }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(asErrorCode((j as { error?: string }).error));
        dropPending();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let ev: AssistantStreamEvent;
          try {
            ev = JSON.parse(part.slice(6));
          } catch {
            continue;
          }
          if (ev.type === "meta") setThreadId(ev.threadId);
          else if (ev.type === "delta") patch((m) => ({ ...m, content: m.content + ev.text }));
          else if (ev.type === "replace") patch((m) => ({ ...m, content: ev.text }));
          else if (ev.type === "done") {
            finished = true;
            patch((m) => ({
              ...m,
              id: ev.messageId ?? m.id,
              kind: ev.kind,
              citations: ev.citations,
              referenceStatus: ev.referenceStatus,
              recordRefs: ev.recordRefs,
            }));
          } else if (ev.type === "error") {
            finished = true;
            setError(asErrorCode(ev.code));
            dropPending();
          }
        }
      }
      if (!finished) {
        setError("unavailable");
        dropPending();
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setError("unavailable");
        dropPending();
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  if (!open) return null;

  const blockName = (id?: string) => start?.blocks.find((b) => b.id === id)?.name ?? "…";
  const cardTitle = (id?: string) => start?.recommendations.find((r) => r.id === id)?.title ?? t("pins.recommendation");
  const canAsk = online && mine && !busy;
  const readOnlyThread = !mine;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="presentation">
      <div className="absolute inset-0 hidden bg-ink/40 md:block" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full flex-col bg-surface shadow-[0_22px_50px_-12px_rgba(20,37,27,.4)] md:w-[460px] md:border-s md:border-line"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-paper-2 px-3">
          {view === "list" ? (
            <button type="button" onClick={() => setView("chat")} className="h-10 w-10 flex items-center justify-center rounded-full text-ink-3 hover:bg-tile" aria-label={t("back")}>
              <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
            </button>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-green-soft text-green">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <h2 id={titleId} className="flex-1 truncate font-heading text-base font-semibold text-ink">
            {view === "list" ? t("conversations") : t("title")}
          </h2>
          <button type="button" onClick={showList} className="h-10 w-10 flex items-center justify-center rounded-full text-ink-3 hover:bg-tile" aria-label={t("conversations")} title={t("conversations")}>
            <History className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => newConversation()} disabled={!online} className="h-10 w-10 flex items-center justify-center rounded-full text-ink-3 hover:bg-tile disabled:opacity-40" aria-label={t("newConversation")} title={t("newConversation")}>
            <Plus className="h-5 w-5" />
          </button>
          <button type="button" onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full text-ink-3 hover:bg-tile" aria-label={t("close")}>
            <X className="h-5 w-5" />
          </button>
        </header>

        {!online && (
          <div role="status" className="flex items-center gap-2 border-b border-line bg-amber-soft px-4 py-2 text-xs text-amber-ink">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("offline")}
          </div>
        )}

        {view === "list" ? (
          <div className="flex-1 overflow-y-auto p-3">
            {threads === null ? (
              <p className="p-3 text-sm text-ink-3">…</p>
            ) : threads.length === 0 ? (
              <p className="p-3 text-sm text-ink-3">{t("noConversations")}</p>
            ) : (
              <>
                {[true, false].map((own) => {
                  const list = threads.filter((th) => th.mine === own);
                  if (list.length === 0) return null;
                  return (
                    <div key={String(own)} className="mb-4">
                      {isAdmin && <p className="px-2 pb-1 text-xs font-semibold text-ink-3">{own ? t("conversations") : t("teamConversations")}</p>}
                      <ul className="flex flex-col gap-1">
                        {list.map((th) => (
                          <li key={th.id} className="flex items-center gap-1 rounded-lg hover:bg-tile">
                            <button type="button" onClick={() => openThread(th)} className="min-w-0 flex-1 px-3 py-2 text-start">
                              <span className="block truncate text-sm text-ink">{th.title}</span>
                              <span className="block text-[11px] text-ink-4">
                                {th.ownerName ? `${th.ownerName} · ` : ""}
                                {new Date(th.lastActivityAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </button>
                            {th.mine && (
                              <button type="button" onClick={() => removeThread(th)} className="h-9 w-9 flex items-center justify-center rounded-full text-ink-4 hover:text-red" aria-label={t("delete")} title={t("delete")}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}
            <p className="mt-2 flex items-start gap-1.5 px-2 text-[11px] text-ink-4">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("adminNotice")}
            </p>
          </div>
        ) : (
          <>
            {/* Pins */}
            <div className="shrink-0 border-b border-line-soft px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Pin className="h-3.5 w-3.5 text-ink-4" aria-label={t("pins.title")} />
                {pins.blockId && (
                  <Chip label={`${t("pins.block")}: ${blockName(pins.blockId)}`} onRemove={mine && !busy ? () => setPins(({ blockId: _b, ...rest }) => rest) : undefined} removeLabel={t("pins.remove")} />
                )}
                {(pins.from || pins.to) && (
                  <Chip label={`${t("pins.dates")}: ${pins.from ?? "…"} – ${pins.to ?? "…"}`} onRemove={mine && !busy ? () => setPins(({ from: _f, to: _t, ...rest }) => rest) : undefined} removeLabel={t("pins.remove")} />
                )}
                {pins.recommendationId && (
                  <Chip label={`${t("pins.recommendation")}: ${cardTitle(pins.recommendationId)}`} onRemove={mine && !busy ? () => setPins(({ recommendationId: _r, ...rest }) => rest) : undefined} removeLabel={t("pins.remove")} />
                )}
                {mine && !busy && online && (
                  <>
                    {!pins.blockId && <PinButton label={t("pins.pinBlock")} onClick={() => setPinEditor(pinEditor === "block" ? null : "block")} />}
                    {!pins.from && !pins.to && <PinButton label={t("pins.pinDates")} onClick={() => setPinEditor(pinEditor === "dates" ? null : "dates")} />}
                    {!pins.recommendationId && (start?.recommendations.length ?? 0) > 0 && <PinButton label={t("pins.pinCard")} onClick={() => setPinEditor(pinEditor === "card" ? null : "card")} />}
                  </>
                )}
              </div>
              {pinEditor === "block" && (
                <select
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) setPins((p) => ({ ...p, blockId: e.target.value }));
                    setPinEditor(null);
                  }}
                >
                  <option value="">{t("pins.pinBlock")}</option>
                  {start?.blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              {pinEditor === "dates" && <DatePins t={t} onDone={(from, to) => { setPins((p) => ({ ...p, ...(from ? { from } : {}), ...(to ? { to } : {}) })); setPinEditor(null); }} />}
              {pinEditor === "card" && (
                <select
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                  defaultValue=""
                  onChange={(e) => {
                    const rec = start?.recommendations.find((r) => r.id === e.target.value);
                    if (rec) setPins((p) => ({ ...p, recommendationId: rec.id, ...(rec.blockId && !p.blockId ? { blockId: rec.blockId } : {}) }));
                    setPinEditor(null);
                  }}
                >
                  <option value="">{t("pins.pinCard")}</option>
                  {start?.recommendations.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-4" aria-live="polite">
              {messages.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-ink-2">{t("adviceOnly")}</p>
                  {start && start.suggestions.length > 0 && online && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-ink-3">{t("suggestedTitle")}</p>
                      <div className="flex flex-col gap-1.5">
                        {start.suggestions.map((s, i) => {
                          const text = t(`suggest.${s.key}`, s.values);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setPins((p) => ({ ...p, ...s.pins }));
                                setDraft(text);
                                inputRef.current?.focus();
                              }}
                              className="rounded-xl border border-line bg-tile-2 px-3 py-2 text-start text-sm text-ink-2 hover:bg-tile"
                            >
                              {text}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <p className="flex items-start gap-1.5 text-[11px] text-ink-4">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t("adminNotice")}
                  </p>
                </div>
              ) : (
                <ol className="flex flex-col gap-3">
                  {messages.map((m) => (
                    <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          m.role === "user" ? "bg-green text-white" : "border border-line bg-paper text-ink"
                        }`}
                      >
                        <span className="sr-only">{m.role === "user" ? t("you") : t("assistantLabel")}: </span>
                        {m.role === "assistant" && m.content.length === 0 ? (
                          <span className="text-ink-3">{t("thinking")}</span>
                        ) : m.role === "assistant" ? (
                          <AnswerText text={m.content} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        )}
                        {m.role === "assistant" && m.kind === "answer" && m.content.length > 0 && !m.id.startsWith("pending-") && (
                          <AnswerFooter m={m} t={t} tRec={tRec} />
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div ref={endRef} />
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-line bg-paper-2 p-3">
              {error && <p role="alert" className="mb-2 text-xs text-red">{t(`errors.${error}`)}</p>}
              {readOnlyThread ? (
                <p className="text-xs text-ink-3">{t("readOnlyThread", { name: ownerName ?? "—" })}</p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(draft);
                  }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        ask(draft);
                      }
                    }}
                    maxLength={2000}
                    rows={2}
                    disabled={!online}
                    placeholder={t("placeholder")}
                    aria-label={t("placeholder")}
                    className="min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:border-green focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!canAsk || draft.trim().length === 0}
                    className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl bg-green text-white disabled:opacity-40"
                    aria-label={t("send")}
                  >
                    <Send className="h-5 w-5 rtl:-scale-x-100" />
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function Chip({ label, onRemove, removeLabel }: { label: string; onRemove?: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-green-soft px-2.5 py-1 text-xs font-medium text-green">
      <span className="truncate">{label}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="-me-1 rounded-full p-0.5 hover:bg-green/10">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function PinButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-3 hover:bg-tile">
      <Plus className="h-3 w-3" />
      {label}
    </button>
  );
}

function DatePins({ t, onDone }: { t: T; onDone: (from: string | null, to: string | null) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs text-ink-3">
        {t("pins.from")}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 block rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink" />
      </label>
      <label className="text-xs text-ink-3">
        {t("pins.to")}
        <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-0.5 block rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink" />
      </label>
      <button type="button" onClick={() => onDone(from || null, to || null)} disabled={!from && !to} className="rounded-lg bg-green px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
        <Pin className="h-3.5 w-3.5" aria-label={t("pins.title")} />
      </button>
    </div>
  );
}

function AnswerFooter({ m, t, tRec }: { m: AssistantMessage; t: T; tRec: T }) {
  const reason = m.referenceStatus;
  return (
    <div className="mt-2 space-y-1 border-t border-line-soft pt-2 text-[11px]">
      {m.citations.length > 0 ? (
        <div className="text-ink-3">
          <p className="flex items-center gap-1 font-semibold">
            <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
            {t("sources")}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {m.citations.map((c) => (
              <li key={c.n}>
                [{c.n}] {c.title}
                {c.section ? ` — ${c.section}` : ""}
                {c.page ? `, p. ${c.page}` : ""}
                <span className="block text-ink-4">{c.origin}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        reason && (
          <p className={`flex items-center gap-1 ${reason === "none_loaded" || reason === "error" ? "text-amber-ink" : "text-ink-4"}`}>
            <BookDashed className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              {t("notSourceBacked")}
              {reason === "none_loaded" || reason === "error" ? `: ${tRec(`referenceReasons.${reason}`)}` : `: ${tRec("referenceReasons.no_match")}`}
            </span>
          </p>
        )
      )}
      {m.recordRefs.length > 0 && (
        <p className="text-ink-4">
          {t("usedRecords")}: {m.recordRefs.map((r) => t(`records.${r.kind}`, { label: r.label })).join(", ")}
        </p>
      )}
    </div>
  );
}
