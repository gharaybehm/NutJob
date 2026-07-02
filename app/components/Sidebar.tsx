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

interface SidebarProps {
  userEmail?: string;
  userName?: string;
  userRole?: "admin" | "supervisor" | "worker";
  farmId: string;
  pendingRecommendationCount?: number;
}

export default function Sidebar({
  userEmail,
  userName,
  userRole,
  farmId,
  pendingRecommendationCount = 0,
}: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

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
          <span className="rounded-full bg-gold-bright px-[7px] py-[1px] font-mono text-[10px] font-semibold text-[#13241B]">
            {item.badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="hidden h-full w-[238px] shrink-0 flex-col bg-gradient-to-b from-sidebar-from to-sidebar-to px-4 py-[22px] md:flex">
      <div className="mb-4 flex items-center gap-3 px-2 pb-2">
        <Image src="/logo-dark-transparent.png" alt="RootLoot" width={220} height={70} className="h-[52px] w-auto object-contain mix-blend-screen brightness-125" unoptimized />
      </div>

      <div className="px-2.5 pb-2 font-mono text-[9px] tracking-[1.5px] text-sidebar-text-muted">
        OPERATIONS
      </div>
      <nav>
        {opsNav.map((item) => (
          <NavRow key={item.id} item={item} />
        ))}
      </nav>

      <div className="px-2.5 pb-2 pt-4 font-mono text-[9px] tracking-[1.5px] text-sidebar-text-muted">
        RECORDS
      </div>
      <nav>
        {recordsNav.map((item) => (
          <NavRow key={item.id} item={item} />
        ))}
      </nav>

      <div className="flex-1" />

      <div className="mb-3 flex items-center gap-[9px] rounded-[11px] border border-[rgba(143,224,168,.18)] bg-[rgba(47,125,79,.16)] px-3 py-2.5">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#8FE0A8]" />
        <div className="flex-1">
          <div className="text-[11.5px] font-semibold text-[#DCE9DE]">AI engine active</div>
          <div className="font-mono text-[9px] tracking-[.5px] text-[#7E9184]">Synced live</div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-blue to-green font-heading text-[13px] font-semibold text-white">
          {getInitials()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-white">{userName || "Farm Manager"}</div>
          <div className="font-mono text-[9px] tracking-[1px] text-[#7E9184]">
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
