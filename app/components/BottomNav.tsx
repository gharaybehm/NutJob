"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Map,
  CalendarDays,
  ActivitySquare,
  MoreHorizontal,
  Lightbulb,
  Warehouse,
  Settings,
  X,
} from "lucide-react";
import SignOutButton from "./auth/SignOutButton";
import type { FarmWithMeta } from "@/utils/supabase/farm-types";

interface BottomNavProps {
  userRole?: "admin" | "supervisor" | "worker";
  farmId: string;
  farms?: FarmWithMeta[];
}

const PAGE_SLUGS = ['dashboard', 'blocks', 'calendar', 'recommendations', 'activity', 'inventory', 'settings'];

export default function BottomNav({ userRole, farmId, farms = [] }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = useTranslations('nav');

  function switchFarm(targetFarmId: string) {
    if (targetFarmId === farmId) return;
    const segments = pathname.split('/').filter(Boolean);
    const lastSlug = segments[segments.length - 1] ?? 'dashboard';
    const pageSlug = PAGE_SLUGS.includes(lastSlug) ? lastSlug : 'dashboard';
    setDrawerOpen(false);
    router.push(`/${targetFarmId}/${pageSlug}`);
  }

  const primaryNav = [
    { id: "dashboard", name: t("dashboard"), href: `/${farmId}/dashboard`, icon: LayoutDashboard },
    { id: "blocks",    name: t("blocks"),    href: `/${farmId}/blocks`,    icon: Map },
    { id: "calendar",  name: t("calendar"),  href: `/${farmId}/calendar`,  icon: CalendarDays },
    { id: "activity",  name: t("activity"),  href: `/${farmId}/activity`,  icon: ActivitySquare },
  ];

  const secondaryNav = [
    { id: "recommendations", name: t("recommendations"), href: `/${farmId}/recommendations`, icon: Lightbulb,  workerHidden: true },
    { id: "inventory",       name: t("inventory"),       href: `/${farmId}/inventory`,       icon: Warehouse,  workerHidden: false },
    { id: "settings",        name: t("settings"),        href: `/${farmId}/settings`,        icon: Settings,   workerHidden: true },
  ];

  const visibleSecondary = secondaryNav.filter(
    (item) => !(item.workerHidden && userRole === "worker")
  );

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* More drawer — slides up above the nav bar */}
      <div
        className={`fixed start-0 end-0 z-50 md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 rounded-t-2xl shadow-xl transition-transform duration-200 ease-out ${
          drawerOpen ? "translate-y-0 pointer-events-auto" : "translate-y-full pointer-events-none"
        }`}
        style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("more")}</span>
            <button
              onClick={() => setDrawerOpen(false)}
              className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {visibleSecondary.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex flex-col items-center gap-2 rounded-xl p-3 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <item.icon className="h-6 w-6" />
                  {item.name}
                </Link>
              );
            })}
          </div>
          {farms.length > 1 && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mb-3">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{t("farms")}</p>
              <div className="flex flex-col gap-1">
                {farms.map((farm) => {
                  const isCurrentFarm = farm.id === farmId;
                  return (
                    <button
                      key={farm.id}
                      onClick={() => switchFarm(farm.id)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors ${
                        isCurrentFarm
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                          : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isCurrentFarm ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                      <span className="truncate">{farm.name}</span>
                      {isCurrentFarm && <span className="ms-auto text-xs text-brand-500">{t("current")}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 start-0 end-0 z-40 md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex h-16 items-stretch">
          {primaryNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 ${
                    isActive
                      ? "text-brand-600 dark:text-brand-400"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors min-h-[44px] ${
              drawerOpen
                ? "text-brand-600 dark:text-brand-400"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <MoreHorizontal
              className={`h-5 w-5 ${
                drawerOpen
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            />
            <span>{t("more")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
