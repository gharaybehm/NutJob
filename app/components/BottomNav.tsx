"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

interface BottomNavProps {
  userRole?: "admin" | "supervisor" | "worker";
  farmId: string;
}

export default function BottomNav({ userRole, farmId }: BottomNavProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const t = useTranslations('nav');

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
          drawerOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ bottom: "64px" }}
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
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 start-0 end-0 z-40 md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
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
