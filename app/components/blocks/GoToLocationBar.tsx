"use client";

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { MapHandle } from './BlockSatelliteMapClient';

interface Props {
  mapHandleRef: React.MutableRefObject<MapHandle | null>;
}

export default function GoToLocationBar({ mapHandleRef }: Props) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState('');

  function handleGo() {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      setError('Enter valid coordinates (lat −90 to 90, lng −180 to 180)');
      return;
    }
    setError('');
    mapHandleRef.current?.flyTo(latNum, lngNum, 15);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Navigate to a distant plot — enter GPS coordinates to jump to its location
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Latitude (e.g. 38.08)"
          value={lat}
          onChange={e => { setLat(e.target.value); setError(''); }}
          step="any"
          className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="number"
          placeholder="Longitude (e.g. 33.57)"
          value={lng}
          onChange={e => { setLng(e.target.value); setError(''); }}
          step="any"
          className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={handleGo}
          className="shrink-0 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600 active:scale-95 transition-all"
        >
          Go
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
