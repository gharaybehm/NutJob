"use client";

import { useState, useTransition, useCallback } from "react";
import { Search, Filter, Droplets, Sprout, Bug, Scissors, FlaskConical, Activity, Leaf } from "lucide-react";
import { getActivityLog, type ActivityLogEntry } from "@/app/(dashboard)/activity/actions";

type ActivityType = ActivityLogEntry["activity_type"] | "all";

const ACTIVITY_TYPES: { id: ActivityType; label: string }[] = [
  { id: "all", label: "All Types" },
  { id: "irrigation", label: "Irrigation" },
  { id: "fertigation", label: "Fertigation" },
  { id: "spraying", label: "Spraying" },
  { id: "pruning", label: "Pruning" },
  { id: "scouting", label: "Scouting" },
  { id: "pollinating", label: "Pollinating" },
  { id: "tilling", label: "Tilling" },
  { id: "plowing", label: "Plowing" },
  { id: "weeding", label: "Weeding" },
  { id: "tissue-sample", label: "Tissue Sample" },
  { id: "other", label: "Other" },
];

const TYPE_CONFIG: Record<
  ActivityLogEntry["activity_type"],
  { icon: React.ElementType; bg: string; text: string; label: string }
> = {
  irrigation:     { icon: Droplets,    bg: "bg-blue-100 dark:bg-blue-900/40",    text: "text-blue-700 dark:text-blue-300",    label: "Irrigation" },
  fertigation:    { icon: Leaf,        bg: "bg-green-100 dark:bg-green-900/40",  text: "text-green-700 dark:text-green-300",  label: "Fertigation" },
  spraying:       { icon: Bug,         bg: "bg-red-100 dark:bg-red-900/40",      text: "text-red-700 dark:text-red-300",      label: "Spraying" },
  pruning:        { icon: Scissors,    bg: "bg-amber-100 dark:bg-amber-900/40",  text: "text-amber-700 dark:text-amber-300",  label: "Pruning" },
  scouting:       { icon: Sprout,      bg: "bg-teal-100 dark:bg-teal-900/40",    text: "text-teal-700 dark:text-teal-300",    label: "Scouting" },
  pollinating:    { icon: Sprout,      bg: "bg-yellow-100 dark:bg-yellow-900/40",text: "text-yellow-700 dark:text-yellow-300",label: "Pollinating" },
  tilling:        { icon: Activity,    bg: "bg-stone-100 dark:bg-stone-900/40",  text: "text-stone-700 dark:text-stone-300",  label: "Tilling" },
  plowing:        { icon: Activity,    bg: "bg-rose-100 dark:bg-rose-900/40",    text: "text-rose-700 dark:text-rose-300",    label: "Plowing" },
  weeding:        { icon: Scissors,    bg: "bg-lime-100 dark:bg-lime-900/40",    text: "text-lime-700 dark:text-lime-300",    label: "Weeding" },
  "tissue-sample":{ icon: FlaskConical,bg: "bg-purple-100 dark:bg-purple-900/40",text: "text-purple-700 dark:text-purple-300",label: "Tissue Sample" },
  other:          { icon: Activity,    bg: "bg-slate-100 dark:bg-slate-800",     text: "text-slate-600 dark:text-slate-400",  label: "Other" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Block { id: string; name: string }

interface Props {
  initialEntries: ActivityLogEntry[];
  initialTotal: number;
  blocks: Block[];
}

export default function ActivityLogClient({ initialEntries, initialTotal, blocks }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActivityType>("all");
  const [blockFilter, setBlockFilter] = useState("all");
  const [isPending, startTransition] = useTransition();

  const applyFilters = useCallback(
    (newSearch: string, newType: ActivityType, newBlock: string) => {
      startTransition(async () => {
        const result = await getActivityLog({
          search: newSearch || undefined,
          activity_type: newType !== "all" ? newType : undefined,
          block_id: newBlock !== "all" ? newBlock : undefined,
          limit: 50,
        });
        setEntries(result.entries);
        setTotal(result.total);
      });
    },
    []
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    applyFilters(value, typeFilter, blockFilter);
  };

  const handleType = (value: ActivityType) => {
    setTypeFilter(value);
    applyFilters(search, value, blockFilter);
  };

  const handleBlock = (value: string) => {
    setBlockFilter(value);
    applyFilters(search, typeFilter, value);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search activities…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={typeFilter}
            onChange={(e) => handleType(e.target.value as ActivityType)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Block filter */}
        <select
          value={blockFilter}
          onChange={(e) => handleBlock(e.target.value)}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
        >
          <option value="all">All Blocks</option>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Count */}
      <p className="text-sm text-slate-500 dark:text-slate-400 px-1">
        {isPending ? "Loading…" : `${total} ${total === 1 ? "entry" : "entries"}`}
      </p>

      {/* List */}
      {entries.length === 0 && !isPending ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-16 text-center flex flex-col items-center justify-center">
          <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No activity found</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Accept recommendations or log calendar events to start building your farm history.
          </p>
        </div>
      ) : (
        <div
          className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-opacity ${isPending ? "opacity-50" : "opacity-100"}`}
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map((entry) => {
              const cfg = TYPE_CONFIG[entry.activity_type];
              const Icon = cfg.icon;
              return (
                <li
                  key={entry.id}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  {/* Icon badge */}
                  <div className={`mt-0.5 h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`h-4.5 w-4.5 ${cfg.text}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug">
                        {entry.title}
                      </p>
                      <time
                        dateTime={entry.performed_at}
                        className="shrink-0 text-xs text-slate-400 dark:text-slate-500 mt-0.5"
                      >
                        {formatDate(entry.performed_at)}
                      </time>
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                      {entry.blocks?.name && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {entry.blocks.name}
                        </span>
                      )}
                      {entry.performed_by && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          · {entry.performed_by}
                        </span>
                      )}
                    </div>

                    {entry.description && (
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {entry.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
