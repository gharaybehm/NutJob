'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, MapPin, Layers, SquareStack } from 'lucide-react';
import type { FarmWithMeta } from '@/utils/supabase/farm-types';
import CreateFarmWizard from './CreateFarmWizard';

interface Props {
  farms: FarmWithMeta[];
}

const roleStyles: Record<string, string> = {
  admin:      'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400',
  supervisor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400',
  worker:     'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400',
};

export default function FarmPicker({ farms }: Props) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(farms.length === 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center px-4 py-12">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <Image src="/icon.png" alt="RootLoot" width={44} height={48} className="object-contain" />
        <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">RootLoot</span>
      </div>

      <div className="w-full max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Your Farms</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select a farm to continue, or create a new one.
          </p>
        </div>

        {farms.length === 0 && !wizardOpen && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
            <SquareStack className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No farms yet</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-4">
              Create your first farm to get started.
            </p>
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Farm
            </button>
          </div>
        )}

        {farms.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {farms.map((farm) => (
              <button
                key={farm.id}
                onClick={() => router.push(`/${farm.id}/dashboard`)}
                className="text-left rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-6 hover:shadow-lg hover:ring-brand-300 dark:hover:ring-brand-700 transition-all group"
              >
                {/* Farm name + role */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors leading-tight">
                    {farm.name}
                  </h2>
                  <span className={`text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md shrink-0 ${roleStyles[farm.userRole] ?? roleStyles.worker}`}>
                    {farm.userRole}
                  </span>
                </div>

                {/* Location */}
                {farm.address && (
                  <div className="flex items-center gap-1.5 mb-3 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{farm.address}</span>
                  </div>
                )}
                {!farm.address && farm.gps_lat && farm.gps_lng && (
                  <div className="flex items-center gap-1.5 mb-3 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{farm.gps_lat.toFixed(4)}, {farm.gps_lng.toFixed(4)}</span>
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3 mt-auto">
                  <div className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    <span>{farm.blockCount} {farm.blockCount === 1 ? 'block' : 'blocks'}</span>
                  </div>
                  {farm.total_area && (
                    <div className="text-slate-400">
                      {farm.total_area} {farm.area_unit}
                    </div>
                  )}
                </div>
              </button>
            ))}

            {/* New Farm card */}
            <button
              onClick={() => setWizardOpen(true)}
              className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 hover:border-brand-400 dark:hover:border-brand-600 hover:bg-brand-50/50 dark:hover:bg-brand-900/10 transition-all flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 group min-h-[140px]"
            >
              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/30 flex items-center justify-center transition-colors">
                <Plus className="h-5 w-5 group-hover:text-brand-600 transition-colors" />
              </div>
              <span className="text-sm font-medium group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                New Farm
              </span>
            </button>
          </div>
        )}
      </div>

      <CreateFarmWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
