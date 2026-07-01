"use client";

import { useState } from 'react';
import type { BlockProfile, AgroDomain } from './types';
import AlertBadge from './AlertBadge';
import SoilWaterTab from './tabs/SoilWaterTab';
import PhenologyTab from './tabs/PhenologyTab';
import NutritionTab from './tabs/NutritionTab';
import PestDiseaseTab from './tabs/PestDiseaseTab';
import WeatherTab from './tabs/WeatherTab';

interface Props {
  profile: BlockProfile;
  onEdit?: () => void;
  onDelete?: () => void;
  soilRefreshKey?: number;
}

const TABS: { id: AgroDomain; label: string; icon: string }[] = [
  { id: 'soil-water',    label: 'Soil & Water',    icon: '💧' },
  { id: 'phenology',     label: 'Phenology',        icon: '🌱' },
  { id: 'nutrition',     label: 'Nutrition',        icon: '🧪' },
  { id: 'pest-disease',  label: 'Pest & Disease',   icon: '🐛' },
  { id: 'weather',       label: 'Weather',          icon: '🌤' },
];

const statusConfig = {
  green: { badge: 'bg-green-soft text-green', dot: 'bg-green', label: 'Healthy' },
  amber: { badge: 'bg-amber-soft text-amber', dot: 'bg-amber', label: 'Attention' },
  red:   { badge: 'bg-red-soft text-red',     dot: 'bg-red',   label: 'Critical' },
};

function alertCountForDomain(profile: BlockProfile, domain: AgroDomain): number {
  switch (domain) {
    case 'soil-water':   return profile.soilWater.alerts.length;
    case 'phenology':    return profile.phenology.alerts.length;
    case 'nutrition':    return profile.nutrition.alerts.length;
    case 'pest-disease': return profile.pestDisease.alerts.length;
    case 'weather':      return profile.weather.alerts.length;
  }
}

export default function BlockDetailPanel({ profile, onEdit, onDelete, soilRefreshKey }: Props) {
  const [activeTab, setActiveTab] = useState<AgroDomain>('soil-water');
  const { block } = profile;
  const cfg = statusConfig[block.status];
  const allAlerts = block.alerts;

  return (
    <div className="flex flex-col gap-0 rounded-2xl border border-line bg-tile overflow-hidden h-full">
      {/* Block header */}
      <div className="bg-surface border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-xl font-bold text-ink">{block.name}</h2>
              <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>
            <p className="text-sm text-ink-2 mt-0.5">
              {block.cropType || 'Almond'} - {block.variety} · {block.area} {block.areaUnit} · Planted {block.plantingYear} · {block.rootstock} rootstock · {block.treeCount.toLocaleString()} trees
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {onEdit && (
                <button onClick={onEdit} className="text-xs font-medium text-ink-3 hover:text-green transition-colors">
                  Edit
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="text-xs font-medium text-ink-3 hover:text-red transition-colors">
                  Delete
                </button>
              )}
            </div>
            <div className="text-right text-xs text-ink-4">
              <p>{block.rowSpacing}m × {block.treeSpacing}m spacing</p>
            </div>
          </div>
        </div>

        {/* Block-level alerts */}
        {allAlerts.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {allAlerts.map(a => (
              <AlertBadge key={a.id} severity={a.severity} message={a.message} source={a.source} timestamp={a.timestamp} compact />
            ))}
          </div>
        )}
      </div>

      {/* Domain tab bar */}
      <div className="bg-surface border-b border-line px-5">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(tab => {
            const count = alertCountForDomain(profile, tab.id);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1 sm:gap-1.5 whitespace-nowrap border-b-2 px-2 sm:px-3 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-green text-green'
                    : 'border-transparent text-ink-3 hover:text-ink-2'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red text-white text-xs font-bold leading-none">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'soil-water'   && <SoilWaterTab   data={profile.soilWater}   blockId={profile.block.id} sensorCount={profile.sensorCount ?? 0} refreshKey={soilRefreshKey} />}
        {activeTab === 'phenology'    && <PhenologyTab    data={profile.phenology}    />}
        {activeTab === 'nutrition'    && <NutritionTab    data={profile.nutrition}    />}
        {activeTab === 'pest-disease' && <PestDiseaseTab  data={profile.pestDisease}  />}
        {activeTab === 'weather'      && <WeatherTab      data={profile.weather}      />}
      </div>
    </div>
  );
}
