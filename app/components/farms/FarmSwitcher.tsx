'use client';

import Link from 'next/link';
import { Building2, ChevronDown } from 'lucide-react';

interface Props {
  farmId: string;
  farmName: string;
}

export default function FarmSwitcher({ farmName }: Props) {
  return (
    <div className="px-4 pb-1">
      <Link
        href="/farms"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
      >
        <Building2 className="h-4 w-4 shrink-0 text-brand-500" />
        <span className="truncate flex-1">{farmName}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
      </Link>
    </div>
  );
}
