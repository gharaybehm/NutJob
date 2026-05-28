"use client";

import { Bell, Search, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/blocks": "Blocks",
  "/calendar": "Calendar",
  "/recommendations": "Recommendations",
  "/activity": "Activity Log",
  "/inventory": "Inventory",
  "/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.keys(PAGE_TITLES).find((k) => k !== "/dashboard" && pathname.startsWith(k));
  return match ? PAGE_TITLES[match] : "";
}

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/dashboard";
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 dark:bg-slate-900 dark:border-slate-800">
      {/* Mobile header */}
      <div className="md:hidden flex flex-1 items-center gap-2">
        {isHome ? (
          <Image src="/icon.png" alt="NutJob" width={30} height={34} className="object-contain" />
        ) : (
          <>
            <button
              onClick={() => router.back()}
              className="h-11 w-11 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 -ml-2"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Go back</span>
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
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="search"
            name="search"
            id="search"
            className="block w-full rounded-md border-0 py-1.5 pl-10 pr-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700 dark:placeholder:text-slate-500"
            placeholder="Search blocks, actions, or recommendations..."
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Mobile: search icon on home only */}
        {isHome && (
          <button className="md:hidden h-11 w-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span className="sr-only">Search</span>
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {/* Notification bell — 44×44 tap target */}
        <button className="relative h-11 w-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors">
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            3
          </span>
          <span className="sr-only">View notifications</span>
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
