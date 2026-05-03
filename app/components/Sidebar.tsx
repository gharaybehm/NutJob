"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Map, 
  CalendarDays, 
  Lightbulb, 
  ActivitySquare, 
  Settings 
} from "lucide-react";
import SignOutButton from "./auth/SignOutButton";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Blocks", href: "/blocks", icon: Map },
  { name: "Calendar", href: "/calendar", icon: CalendarDays },
  { name: "Recommendations", href: "/recommendations", icon: Lightbulb },
  { name: "Activity Log", href: "/activity", icon: ActivitySquare },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  userEmail?: string;
  userName?: string;
}

export default function Sidebar({ userEmail, userName }: SidebarProps) {
  const pathname = usePathname();
  
  // Create initials from name or email
  const getInitials = () => {
    if (userName) {
      const parts = userName.split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return userName.substring(0, 2).toUpperCase();
    }
    if (userEmail) {
      return userEmail.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800">
      <div className="flex h-16 shrink-0 items-center px-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-xl">
            N
          </div>
          <span className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            NutJob
          </span>
        </div>
      </div>
      
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 px-4 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
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
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {userEmail || "Not logged in"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
