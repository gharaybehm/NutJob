"use client";

import dynamic from 'next/dynamic';
import type { BlockSatelliteMapClientProps, MapHandle } from './BlockSatelliteMapClient';
import type { Block, LatLng } from './types';

// Leaflet must not run on the server — dynamic import with ssr: false ensures
// the entire component tree (including leaflet CSS) only loads in the browser.
const BlockSatelliteMapClient = dynamic(
  () => import('./BlockSatelliteMapClient'),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-pulse"
        style={{ height: '480px' }}
      >
        <span className="text-sm text-slate-400">Loading map…</span>
      </div>
    ),
  },
);

interface Props {
  blocks: Block[];
  selectedId: string;
  isEditing: boolean;
  pendingBoundaries: Record<string, LatLng[]>;
  onSelect: (id: string) => void;
  onDrawComplete: (boundary: LatLng[]) => void;
  onBoundaryEdit: (id: string, boundary: LatLng[]) => void;
  onBoundaryDelete: (id: string) => void;
  mapHandleRef: React.MutableRefObject<MapHandle | null>;
}

export type { MapHandle };

export default function BlockSatelliteMap(props: Props) {
  return <BlockSatelliteMapClient {...(props as BlockSatelliteMapClientProps)} />;
}
