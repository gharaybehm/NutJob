"use client";

import { Bell, Search, ArrowLeft, Globe } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useState, useRef, useEffect, useTransition } from "react";
import { setLocale } from "@/app/(dashboard)/settings/actions";

interface TopNavProps {
  farmId: string;
  alertCount?: number;
}

const LOCALE_OPTIONS = [
  { value: 'en', label: 'English',  flag: '🇬🇧' },
  { value: 'ar', label: 'العربية',  flag: '🇸🇦' },
  { value: 'tr', label: 'Türkçe',   flag: '🇹🇷' },
];

export default function TopNav({ farmId, alertCount = 0 }: TopNavProps) {
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
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 dark:bg-slate-900 dark:border-slate-800">
      {/* Mobile header */}
      <div className="md:hidden flex flex-1 items-center gap-2">
        {isHome ? (
          <Image src="/icon.png" alt="RootLoot" width={30} height={34} className="object-contain" />
        ) : (
          <>
            <button
              onClick={() => router.back()}
              className="h-11 w-11 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 -ms-2"
            >
              <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
              <span className="sr-only">{t("goBack")}</span>
            </button>
            <span className="text-base font-semibold text-slate-800 dark:text-white truncate">
              {pageTitle}
            </span>
          </>
        )}
      </div>

      {/* Desktop: search bar */}
      <div className="hidden md:flex flex-1 items-center gap-4">
        <div className="w-full max-w-md relative">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="search"
            name="search"
            id="search"
            className="block w-full rounded-md border-0 py-1.5 ps-10 pe-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700 dark:placeholder:text-slate-500"
            placeholder={tTop("searchPlaceholder")}
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Mobile: search icon on home only */}
        {isHome && (
          <button className="md:hidden h-11 w-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span className="sr-only">{tTop("search")}</span>
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {/* Language switcher */}
        <div ref={langRef} className="relative">
          <button
            onClick={() => setLangOpen(v => !v)}
            aria-label={tTop("selectLanguage")}
            className={`relative h-11 w-11 flex items-center justify-center rounded-full transition-colors ${
              langOpen
                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                : 'text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Globe className="h-5 w-5" aria-hidden="true" />
          </button>

          {langOpen && (
            <div className="absolute end-0 top-full mt-1 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden z-50">
              {LOCALE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleLocaleSelect(opt.value)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-start ${
                    locale === opt.value
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
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
          className="relative h-11 w-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors"
        >
          {alertCount > 0 && (
            <span className="absolute top-1.5 end-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
              {alertCount > 99 ? '99+' : alertCount}
            </span>
          )}
          <span className="sr-only">{tTop("viewNotifications")}</span>
          <Bell className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
