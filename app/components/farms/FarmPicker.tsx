'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, MapPin, Layers, SquareStack, ArrowRight } from 'lucide-react';
import type { FarmWithMeta } from '@/utils/supabase/farm-types';
import CreateFarmWizard from './CreateFarmWizard';
import SignOutButton from '@/app/components/auth/SignOutButton';

interface Props {
  farms: FarmWithMeta[];
  userName?: string;
}

const roleStyles: Record<string, string> = {
  admin:      'bg-green-soft text-green',
  supervisor: 'bg-amber-soft text-amber',
  worker:     'bg-tile-2 text-ink-2',
};

const AVATAR_COLORS = ['#2F7D4F', '#3C7EA1', '#C4922E', '#8156A8', '#2E8E8E', '#C24B39'];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function FarmPicker({ farms, userName }: Props) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(farms.length === 0);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-line bg-paper-2 px-7">
        <Image src="/logo-dark-transparent.png" alt="RootLoot" width={140} height={44} className="h-11 w-auto object-contain" unoptimized />
        <div className="flex items-center gap-3.5">
          {userName && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-blue to-green font-heading text-[13px] font-semibold text-white">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-[13px] font-semibold text-ink">{userName}</span>
            </div>
          )}
          <SignOutButton compact />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center px-4 py-12">
        <div className="w-full max-w-4xl">
          <div className="mb-8">
            <h1 className="font-heading text-[28px] font-bold tracking-tight text-ink">Choose a farm</h1>
            <p className="mt-1.5 text-sm text-ink-2">
              Select a farm to continue, or create a new one. Switch anytime from the top bar — no re-login.
            </p>
          </div>

          {farms.length === 0 && !wizardOpen && (
            <div className="rounded-2xl border-2 border-dashed border-ink-4/30 p-12 text-center">
              <SquareStack className="h-10 w-10 text-ink-4 mx-auto mb-3" />
              <p className="text-ink-2 font-medium">No farms yet</p>
              <p className="text-sm text-ink-3 mt-1 mb-4">
                Create your first farm to get started.
              </p>
              <button
                onClick={() => setWizardOpen(true)}
                className="inline-flex items-center gap-2 rounded-[11px] bg-gradient-to-b from-[#37905C] to-green px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-4px_rgba(47,125,79,.5)] hover:brightness-105 transition"
              >
                <Plus className="h-4 w-4" />
                Create Farm
              </button>
            </div>
          )}

          {farms.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  onClick={() => router.push(`/${farm.id}/dashboard`)}
                  className="text-left rounded-2xl bg-surface border border-line p-[22px] hover:border-green hover:shadow-[0_12px_26px_-12px_rgba(47,125,79,.4)] transition-all group flex flex-col"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-[13px] font-heading text-xl font-bold text-white"
                      style={{ backgroundColor: avatarColor(farm.id) }}
                    >
                      {farm.name.charAt(0).toUpperCase()}
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${roleStyles[farm.userRole] ?? roleStyles.worker}`}>
                      {farm.userRole.charAt(0).toUpperCase() + farm.userRole.slice(1)}
                    </span>
                  </div>

                  <h2 className="font-heading text-lg font-bold text-ink leading-tight">
                    {farm.name}
                  </h2>

                  <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-ink-3">
                    <Layers className="h-3 w-3 shrink-0" />
                    <span>{farm.blockCount} {farm.blockCount === 1 ? 'BLOCK' : 'BLOCKS'}</span>
                    {farm.total_area && <span>· {farm.total_area} {farm.area_unit?.toUpperCase()}</span>}
                    {farm.address && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {farm.address}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3.5">
                    <span className="text-xs text-ink-3">Open in dashboard</span>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green">
                      Open
                      <ArrowRight className="h-[17px] w-[17px]" />
                    </span>
                  </div>
                </button>
              ))}

              {/* New Farm card */}
              <button
                onClick={() => setWizardOpen(true)}
                className="rounded-2xl border-[1.5px] border-dashed border-ink-4/40 p-[22px] hover:border-green hover:text-green transition-all flex flex-col items-center justify-center gap-2.5 text-ink-3 group min-h-[180px]"
              >
                <div className="h-12 w-12 rounded-[13px] bg-green-soft flex items-center justify-center">
                  <Plus className="h-6 w-6 text-green" />
                </div>
                <span className="text-sm font-semibold">
                  Create a new farm
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <CreateFarmWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
