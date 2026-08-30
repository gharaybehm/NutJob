"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Building2, ShieldAlert } from "lucide-react";
import SignOutButton from "@/app/components/auth/SignOutButton";

interface AdminNavProps {
  userEmail?: string;
  userName?: string;
}

const navItems = [
  { id: "overview", name: "Cross-Farm Overview", href: "/admin/overview", icon: LayoutGrid },
  { id: "subscribers", name: "Subscribers", href: "/admin/subscribers", icon: Building2 },
];

export default function AdminNav({ userEmail, userName }: AdminNavProps) {
  const pathname = usePathname();

  const getInitials = () => {
    if (userName) {
      const parts = userName.split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return userName.substring(0, 2).toUpperCase();
    }
    if (userEmail) return userEmail.substring(0, 2).toUpperCase();
    return "SA";
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-text">
      <div className="flex items-center gap-2 px-5 py-6">
        <ShieldAlert className="h-6 w-6 text-gold-bright" strokeWidth={2.25} />
        <div>
          <p className="text-sm font-semibold tracking-wide text-white">Super Admin</p>
          <p className="text-[11px] text-sidebar-text-muted">Platform oversight</p>
        </div>
      </div>

      <nav className="flex-1 px-3">
        {navItems.map((item) => {
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
              <span className={`flex-1 text-[13.5px] ${isActive ? "font-semibold text-white" : "text-sidebar-text-muted"}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-bright/20 text-xs font-semibold text-gold-bright">
          {getInitials()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white">{userName || userEmail}</p>
        </div>
        <SignOutButton compact />
      </div>
    </aside>
  );
}
