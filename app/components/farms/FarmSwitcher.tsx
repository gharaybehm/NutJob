"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import type { FarmWithMeta } from "@/utils/supabase/farm-types";

const AVATAR_COLORS = ["#2F7D4F", "#3C7EA1", "#C4922E", "#8156A8", "#2E8E8E", "#C24B39"];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const PAGE_SLUGS = ["dashboard", "blocks", "calendar", "recommendations", "activity", "inventory", "settings"];

export default function FarmSwitcher({
  farmId,
  farms,
}: {
  farmId: string;
  farms: FarmWithMeta[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = farms.find((f) => f.id === farmId);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function switchFarm(targetId: string) {
    if (targetId === farmId) {
      setOpen(false);
      return;
    }
    const segments = pathname.split("/").filter(Boolean);
    const lastSlug = segments[segments.length - 1] ?? "dashboard";
    const pageSlug = PAGE_SLUGS.includes(lastSlug) ? lastSlug : "dashboard";
    setOpen(false);
    router.push(`/${targetId}/${pageSlug}`);
  }

  if (!current) return null;

  const initial = current.name.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-line bg-tile-2 py-1.5 ps-1.5 pe-2.5 transition hover:border-ink-4"
      >
        <div
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] font-heading text-sm font-bold text-white"
          style={{ backgroundColor: avatarColor(current.id) }}
        >
          {initial}
        </div>
        <div className="text-start">
          <div className="text-[13px] font-semibold leading-tight text-ink">{current.name}</div>
          <div className="font-mono text-[9px] tracking-wide text-ink-3">
            {current.userRole.toUpperCase()} · {current.blockCount} BLOCKS
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-3" />
      </button>

      {open && (
        <div className="absolute start-0 top-full z-50 mt-2 w-[280px] rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_22px_50px_-12px_rgba(20,37,27,.4)]">
          <div className="px-2.5 pb-1 pt-1.5 font-mono text-[9px] tracking-wide text-ink-4">
            SWITCH FARM
          </div>
          {farms.map((farm) => {
            const isCurrent = farm.id === farmId;
            return (
              <button
                key={farm.id}
                onClick={() => switchFarm(farm.id)}
                className={`flex w-full items-center gap-2.5 rounded-[10px] p-2 text-start transition ${
                  isCurrent ? "bg-green-soft" : "hover:bg-tile"
                }`}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-heading text-xs font-bold text-white"
                  style={{ backgroundColor: avatarColor(farm.id) }}
                >
                  {farm.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{farm.name}</div>
                  <div className="font-mono text-[9px] text-ink-3">
                    {farm.userRole.toUpperCase()} · {farm.blockCount} BLOCKS
                  </div>
                </div>
                {isCurrent && <Check className="h-[18px] w-[18px] shrink-0 text-green" />}
              </button>
            );
          })}
          <div className="my-1.5 h-px bg-line-soft" />
          <Link
            href="/farms"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-[10px] p-2 transition hover:bg-green-soft"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-soft">
              <Plus className="h-4 w-4 text-green" />
            </div>
            <span className="text-[13px] font-semibold text-green">Create new farm</span>
          </Link>
        </div>
      )}
    </div>
  );
}
