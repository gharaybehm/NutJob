"use client";

import Image from "next/image";
import Link from "next/link";
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
import { STALE_AFTER_MIN, type DataFreshness } from "@/utils/data-freshness-shared";

interface SidebarProps {
  userEmail?: string;
  userName?: string;
  userRole?: "admin" | "supervisor" | "worker";
  farmId: string;
  pendingRecommendationCount?: number;
  freshness?: DataFreshness;
}

export default function Sidebar({
  userEmail,
  userName,
  userRole,
  farmId,
  pendingRecommendationCount = 0,
  freshness,
}: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tf = useTranslations("nav.freshness");

  const formatAge = (min: number | null) => {
    if (min === null) return tf("never");
    if (min < 60) return tf("minutes", { count: min });
    if (min < 48 * 60) return tf("hours", { count: Math.round(min / 60) });
    return tf("days", { count: Math.round(min / 1440) });
  };

  const freshnessRows = freshness
    ? [
        { key: "sensors", label: tf("sensors"), min: freshness.sensorsMin, staleAfter: STALE_AFTER_MIN.sensors },
        { key: "weather", label: tf("weather"), min: freshness.weatherMin, staleAfter: STALE_AFTER_MIN.weather },
        { key: "irrigation", label: tf("irrigationLog"), min: freshness.irrigationLogMin, staleAfter: STALE_AFTER_MIN.irrigationLog },
      ]
    : [];

  const opsNav = [
    { id: "dashboard", name: t("dashboard"), href: `/${farmId}/dashboard`, icon: LayoutDashboard },
    { id: "blocks", name: t("blocks"), href: `/${farmId}/blocks`, icon: Map },
    { id: "calendar", name: t("calendar"), href: `/${farmId}/calendar`, icon: CalendarDays },
    {
      id: "recommendations",
      name: t("recommendations"),
      href: `/${farmId}/recommendations`,
      icon: Lightbulb,
      badge: pendingRecommendationCount > 0 ? pendingRecommendationCount : undefined,
    },
  ].filter((item) => !(userRole === "worker" && item.id === "recommendations"));

  const recordsNav = [
    { id: "activity", name: t("activityLog"), href: `/${farmId}/activity`, icon: ActivitySquare },
    { id: "inventory", name: t("inventory"), href: `/${farmId}/inventory`, icon: Warehouse },
    { id: "settings", name: t("settings"), href: `/${farmId}/settings`, icon: Settings },
  ].filter((item) => !(userRole === "worker" && item.id === "settings"));

  const getInitials = () => {
    if (userName) {
      const parts = userName.split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return userName.substring(0, 2).toUpperCase();
    }
    if (userEmail) return userEmail.substring(0, 2).toUpperCase();
    return "U";
  };

  function NavRow({ item }: { item: (typeof opsNav)[number] & { badge?: number } }) {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.id}
        href={item.href}
        className={`group mb-0.5 flex items-center gap-3 rounded-[11px] px-3 py-[9px] transition-colors ${
          isActive ? "bg-[rgba(231,190,86,.15)]" : "hover:bg-white/5"
        }`}
      >
        <item.icon
          className={`h-5 w-5 shrink-0 ${isActive ? "text-gold-bright" : "text-sidebar-text-muted"}`}
          strokeWidth={isActive ? 2.25 : 2}
        />
        <span
          className={`flex-1 text-[13.5px] ${
            isActive ? "font-semibold text-white" : "font-medium text-sidebar-text"
          }`}
        >
          {item.name}
        </span>
        {item.badge !== undefined && (
          <span className="rounded-full bg-gold-bright px-[7px] py-[1px] font-mono text-[11px] font-semibold text-[#13241B]">
            {item.badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="hidden h-full w-[238px] shrink-0 flex-col bg-gradient-to-b from-sidebar-from to-sidebar-to px-4 py-[22px] md:flex">
      <div className="mb-3 px-2">
        <Image src="/logo-dark-transparent.png" alt="RootLoot" width={400} height={128} className="h-[80px] w-auto object-contain mix-blend-screen brightness-125" unoptimized />
      </div>

      <div className="px-2.5 pb-2 font-mono text-[11px] tracking-[1.5px] text-sidebar-text-muted">
        OPERATIONS
      </div>
      <nav>
        {opsNav.map((item) => (
          <NavRow key={item.id} item={item} />
        ))}
      </nav>

      <div className="px-2.5 pb-2 pt-4 font-mono text-[11px] tracking-[1.5px] text-sidebar-text-muted">
        RECORDS
      </div>
      <nav>
        {recordsNav.map((item) => (
          <NavRow key={item.id} item={item} />
        ))}
      </nav>

      <div className="flex-1" />

      {freshnessRows.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 rounded-[11px] border border-white/10 bg-white/[.04] px-3 py-2.5">
          <div className="font-mono text-[11px] tracking-[1px] text-sidebar-text-muted">{tf("title").toUpperCase()}</div>
          {freshnessRows.map((row) => {
            const stale = row.min === null || row.min > row.staleAfter;
            return (
              <div key={row.key} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 ${stale ? "rounded-[2px] bg-gold-bright" : "rounded-full bg-[#8FE0A8]"}`}
                />
                <span className="flex-1 truncate text-[12.5px] text-[#DCE6DE]">{row.label}</span>
                <span className={`font-mono text-[11px] ${stale ? "text-gold-bright" : "text-sidebar-text-muted"}`}>
                  {formatAge(row.min)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-blue to-green font-heading text-[13px] font-semibold text-white">
          {getInitials()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-white">{userName || "Farm Manager"}</div>
          <div className="font-mono text-[11px] tracking-[1px] text-sidebar-text-muted">
            {userRole ? `FARM ${userRole.toUpperCase()}` : userEmail}
          </div>
        </div>
        <div className="shrink-0">
          <SignOutButton compact />
        </div>
      </div>
    </div>
  );
}
