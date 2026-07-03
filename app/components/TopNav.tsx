"use client";

import { Bell, Search, ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useState, useRef, useEffect, useTransition } from "react";
import { setLocale } from "@/app/(dashboard)/settings/actions";
import FarmSwitcher from "@/app/components/farms/FarmSwitcher";
import type { FarmWithMeta } from "@/utils/supabase/farm-types";

interface TopNavProps {
  farmId: string;
  alertCount?: number;
  farms?: FarmWithMeta[];
}

const LOCALE_OPTIONS = [
  { value: 'en', label: 'English',  flag: '🇬🇧' },
  { value: 'ar', label: 'العربية',  flag: '🇸🇦' },
  { value: 'tr', label: 'Türkçe',   flag: '🇹🇷' },
];

export default function TopNav({ farmId, alertCount = 0, farms = [] }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('nav');
  const tTop = useTranslations('topNav');
  const locale = useLocale();
  const [langOpen, setLangOpen] = useState(false);
  const [, startTransition] = useTransition();
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLocaleSelect(newLocale: string) {
    if (newLocale === locale) { setLangOpen(false); return; }
    setLangOpen(false);
    startTransition(async () => {
      await setLocale(newLocale);
      window.location.reload();
    });
  }

  const PAGE_SLUG_TITLES: Record<string, string> = {
    dashboard:       t("dashboard"),
    blocks:          t("blocks"),
    calendar:        t("calendar"),
    recommendations: t("recommendations"),
    activity:        t("activityLog"),
    inventory:       t("inventory"),
    settings:        t("settings"),
  };

  const segments = pathname.split('/').filter(Boolean);
  const farmIndex = segments.indexOf(farmId);
  const pageSlug = farmIndex >= 0 ? segments[farmIndex + 1] : undefined;
  const pageTitle = pageSlug ? (PAGE_SLUG_TITLES[pageSlug] ?? '') : '';
  const isHome = pageSlug === 'dashboard';

  return (
    <header className="relative z-30 flex h-16 items-center justify-between border-b border-line bg-paper-2 px-4 gap-3.5 md:px-5">
      {/* Mobile header */}
      <div className="md:hidden flex flex-1 items-center gap-2">
        {isHome ? (
          <Image src="/icon.png" alt="RootLoot" width={30} height={23} className="object-contain" unoptimized />
        ) : (
          <>
            <button
              onClick={() => router.back()}
              className="h-11 w-11 flex items-center justify-center rounded-full text-ink-3 hover:bg-tile transition-colors shrink-0 -ms-2"
            >
              <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
              <span className="sr-only">{t("goBack")}</span>
            </button>
            <span className="text-base font-semibold text-ink truncate">
              {pageTitle}
            </span>
          </>
        )}
      </div>

      {/* Desktop: farm switcher + search */}
      <div className="hidden md:flex flex-1 items-center gap-3.5">
        <FarmSwitcher farmId={farmId} farms={farms} />
        <div className="w-[300px] shrink-0 relative">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <Search className="h-4 w-4 text-ink-3" />
          </div>
          <input
            type="search"
            name="search"
            id="search"
            className="block w-full rounded-[11px] border border-line bg-tile-2 py-2.5 ps-9 pe-3 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-green/30"
            placeholder={tTop("searchPlaceholder")}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Mobile: search icon on home only */}
        {isHome && (
          <button className="md:hidden h-11 w-11 flex items-center justify-center rounded-full text-ink-3 hover:bg-tile transition-colors">
            <span className="sr-only">{tTop("search")}</span>
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {/* Language switcher */}
        <div ref={langRef} className="relative">
          <button
            onClick={() => setLangOpen(v => !v)}
            aria-label={tTop("selectLanguage")}
            className={`relative h-10 w-10 flex items-center justify-center rounded-[11px] border border-line transition-colors ${
              langOpen ? 'bg-tile text-ink' : 'bg-tile-2 text-ink-2 hover:bg-tile'
            }`}
          >
            <Globe className="h-5 w-5" aria-hidden="true" />
          </button>

          {langOpen && (
            <div className="absolute end-0 top-full mt-2 w-40 rounded-xl border border-line bg-surface shadow-[0_22px_50px_-12px_rgba(20,37,27,.4)] overflow-hidden z-50">
              {LOCALE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleLocaleSelect(opt.value)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-start ${
                    locale === opt.value
                      ? 'bg-green-soft text-green font-medium'
                      : 'text-ink-2 hover:bg-tile'
                  }`}
                >
                  <span className="text-base leading-none">{opt.flag}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notification bell */}
        <Link
          href={`/${farmId}/dashboard`}
          className="relative h-10 w-10 flex items-center justify-center rounded-[11px] border border-line bg-tile-2 text-ink-2 hover:bg-tile transition-colors"
        >
          {alertCount > 0 && (
            <span className="absolute top-2 end-2.5 h-[7px] w-[7px] rounded-full bg-red ring-2 ring-paper-2" />
          )}
          <span className="sr-only">{tTop("viewNotifications")}</span>
          <Bell className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
