"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Map,
  CalendarDays,
  Lightbulb,
  ActivitySquare,
  Settings,
  Warehouse,
} from "lucide-react";
import SignOutButton from "./auth/SignOutButton";

interface SidebarProps {
  userEmail?: string;
  userName?: string;
  userRole?: "admin" | "supervisor" | "worker";
  farmId: string;
}

export default function Sidebar({ userEmail, userName, userRole, farmId }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  const navigation = [
    { id: "dashboard",       name: t("dashboard"),       href: `/${farmId}/dashboard`,       icon: LayoutDashboard },
    { id: "blocks",          name: t("blocks"),          href: `/${farmId}/blocks`,          icon: Map },
    { id: "calendar",        name: t("calendar"),        href: `/${farmId}/calendar`,        icon: CalendarDays },
    { id: "recommendations", name: t("recommendations"), href: `/${farmId}/recommendations`, icon: Lightbulb },
    { id: "activity",        name: t("activityLog"),     href: `/${farmId}/activity`,        icon: ActivitySquare },
    { id: "inventory",       name: t("inventory"),       href: `/${farmId}/inventory`,       icon: Warehouse },
    { id: "settings",        name: t("settings"),        href: `/${farmId}/settings`,        icon: Settings },
  ];

  const getInitials = () => {
    if (userName) {
      const parts = userName.split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return userName.substring(0, 2).toUpperCase();
    }
    if (userEmail) return userEmail.substring(0, 2).toUpperCase();
    return "U";
  };

  const visibleNavigation = navigation.filter((item) => {
    if (userRole === "worker" && (item.id === "recommendations" || item.id === "settings")) {
      return false;
    }
    return true;
  });

  return (
    <div className="hidden md:flex h-full w-64 flex-col border-e border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-6">
        <div className="flex items-center gap-2">
          <Image src="/icon.png" alt="NutJob" width={36} height={40} className="object-contain" />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 px-4 py-2">
          {visibleNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <item.icon
                  className={`me-3 h-5 w-5 flex-shrink-0 ${
                    isActive
                      ? "text-brand-600 dark:text-brand-400"
                      : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-300"
                  }`}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User profile footer */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-4">
          <SignOutButton />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-medium shrink-0">
            {getInitials()}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {userName || "Farm Manager"}
            </span>
            {userRole && (
              <span className={`text-[10px] font-bold tracking-wider uppercase inline-block max-w-max px-1.5 py-0.5 rounded-md mt-0.5 ${
                userRole === "admin"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400"
                  : userRole === "supervisor"
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
              }`}>
                {userRole}
              </span>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
              {userEmail || "Not logged in"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
