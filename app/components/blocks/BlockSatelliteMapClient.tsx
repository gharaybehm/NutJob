"use client";

// All Leaflet imports MUST be at the module level because this file is loaded
// client-side only (ssr: false in the wrapper). Importing leaflet-draw here is
// safe and ensures it patches L.Control before any component mounts.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import type { Block, LatLng } from './types';

// Fix Leaflet's broken default icon paths in webpack/turbopack environments
// @ts-expect-error — Leaflet internal
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Per-block colour palette ─────────────────────────────────────────────────
// Each block gets a stable colour derived from its ID so adjacent blocks are
// always visually distinct regardless of health status.

const BLOCK_PALETTE: Array<{ fill: string; stroke: string }> = [
  { fill: '#2F7D4F', stroke: '#1E5637' },  // green
  { fill: '#3C7EA1', stroke: '#2A5A75' },  // blue
  { fill: '#DDA02A', stroke: '#B57F16' },  // amber
  { fill: '#8156A8', stroke: '#603E80' },  // purple
  { fill: '#2E8E8E', stroke: '#20696A' },  // teal
  { fill: '#C4922E', stroke: '#96701F' },  // gold
  { fill: '#C24B39', stroke: '#9B3728' },  // red
  { fill: '#5F9E6E', stroke: '#417050' },  // sage
  { fill: '#6A8FAE', stroke: '#4A667F' },  // steel blue
  { fill: '#A8703F', stroke: '#7C512D' },  // ochre
];

function blockColor(index: number) {
  return BLOCK_PALETTE[index % BLOCK_PALETTE.length];
}

// ─── DrawControl — mounts leaflet-draw edit toolbar ──────────────────────────

interface DrawControlProps {
  blocks: Block[];
  pendingBoundaries: Record<string, LatLng[]>;
  onDrawComplete: (boundary: LatLng[]) => void;
  onBoundaryEdit: (id: string, boundary: LatLng[]) => void;
  onBoundaryDelete: (id: string) => void;
}

// Keep stable callback refs so the one-time effect always sees the latest values
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; });
  return ref;
}

function DrawControl({ blocks, pendingBoundaries, onDrawComplete, onBoundaryEdit, onBoundaryDelete }: DrawControlProps) {
  const map = useMap();
  const onDrawCompleteRef = useLatest(onDrawComplete);
  const onBoundaryEditRef = useLatest(onBoundaryEdit);
  const onBoundaryDeleteRef = useLatest(onBoundaryDelete);

  useEffect(() => {
    // Verify leaflet-draw patched L correctly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DrawControlClass = (L.Control as any).Draw;
    if (!DrawControlClass) {
      console.error('[BlockMap] leaflet-draw did not patch L.Control — drawing unavailable');
      return;
    }

    // Feature group holds editable layers
    const featureGroup = new L.FeatureGroup();
    map.addLayer(featureGroup);

    // Seed feature group with existing block boundaries so they are editable
    const layerToBlockId = new Map<L.Layer, string>();
    blocks.forEach((block, idx) => {
      const boundary = pendingBoundaries[block.id] ?? block.boundary;
      if (!boundary || boundary.length < 3) return;
      const colors = blockColor(idx);
      const poly = L.polygon(
        boundary.map(p => [p.lat, p.lng] as [number, number]),
        { color: colors.stroke, fillColor: colors.fill, fillOpacity: 0.35, weight: 2 },
      );
      featureGroup.addLayer(poly);
      layerToBlockId.set(poly, block.id);
    });

    // Create the draw toolbar
    const drawControl = new DrawControlClass({
      edit: { featureGroup },
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.35, weight: 2 },
          guidelineDistance: 20,
          metric: true,
          repeatMode: false,
        },
        polyline:     false,
        rectangle:    false,
        circle:       false,
        circlemarker: false,
        marker:       false,
      },
    });
    map.addControl(drawControl);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DrawEvent = (L as any).Draw?.Event;
    if (!DrawEvent) {
      console.error('[BlockMap] L.Draw.Event not found after leaflet-draw import');
      return () => {
        map.removeControl(drawControl);
        map.removeLayer(featureGroup);
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function onCreated(e: any) {
      const layer: L.Polygon = e.layer;
      const coords = (layer.getLatLngs()[0] as L.LatLng[]).map(p => ({ lat: p.lat, lng: p.lng }));
      // Remove the temporary draw layer — the block polygon will be shown once saved
      featureGroup.removeLayer(layer);
      onDrawCompleteRef.current(coords);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function onEdited(e: any) {
      e.layers.eachLayer((layer: L.Layer) => {
        const bid = layerToBlockId.get(layer);
        if (!bid) return;
        const coords = ((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]).map(p => ({ lat: p.lat, lng: p.lng }));
        onBoundaryEditRef.current(bid, coords);
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function onDeleted(e: any) {
      e.layers.eachLayer((layer: L.Layer) => {
        const bid = layerToBlockId.get(layer);
        if (bid) onBoundaryDeleteRef.current(bid);
      });
    }

    map.on(DrawEvent.CREATED, onCreated);
    map.on(DrawEvent.EDITED, onEdited);
    map.on(DrawEvent.DELETED, onDeleted);

    return () => {
      map.off(DrawEvent.CREATED, onCreated);
      map.off(DrawEvent.EDITED, onEdited);
      map.off(DrawEvent.DELETED, onDeleted);
      map.removeControl(drawControl);
      map.removeLayer(featureGroup);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

// ─── MapFlyToController ───────────────────────────────────────────────────────

export interface MapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

function MapFlyToController({ handleRef }: { handleRef: React.MutableRefObject<MapHandle | null> }) {
  const map = useMap();
  useEffect(() => {
    handleRef.current = {
      flyTo(lat, lng, zoom = 15) {
        map.flyTo([lat, lng], zoom, { animate: true, duration: 1.2 });
      },
    };
    return () => { handleRef.current = null; };
  }, [map, handleRef]);
  return null;
}

// ─── Main exported component ──────────────────────────────────────────────────

export interface BlockSatelliteMapClientProps {
  blocks: Block[];
  selectedId: string;
  isEditing: boolean;
  pendingBoundaries: Record<string, LatLng[]>;
  onSelect: (id: string) => void;
  onDrawComplete: (boundary: LatLng[]) => void;
  onBoundaryEdit: (id: string, boundary: LatLng[]) => void;
  onBoundaryDelete: (id: string) => void;
  mapHandleRef: React.MutableRefObject<MapHandle | null>;
  farmCenter?: { lat: number; lng: number; zoom?: number };
}

const DEFAULT_CENTER: [number, number] = [0, 0];
const DEFAULT_ZOOM = 2;

/** Fit the map view to block boundaries on mount */
function AutoFitBounds({ blocks }: { blocks: Block[] }) {
  const map = useMap();

  useEffect(() => {
    const allPoints: [number, number][] = [];
    for (const block of blocks) {
      if (block.boundary && block.boundary.length >= 3) {
        for (const p of block.boundary) {
          allPoints.push([p.lat, p.lng]);
        }
      }
    }
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18, animate: false });
    }
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function BlockSatelliteMapClient({
  blocks,
  selectedId,
  isEditing,
  pendingBoundaries,
  onSelect,
  onDrawComplete,
  onBoundaryEdit,
  onBoundaryDelete,
  mapHandleRef,
  farmCenter,
}: BlockSatelliteMapClientProps) {
  // Compute initial center: block boundaries centroid > farm GPS > default
  const { center, zoom } = useMemo(() => {
    // First try: centroid of all block boundaries
    const allPoints: [number, number][] = [];
    for (const block of blocks) {
      if (block.boundary && block.boundary.length >= 3) {
        for (const p of block.boundary) {
          allPoints.push([p.lat, p.lng]);
        }
      }
    }
    if (allPoints.length > 0) {
      const lat = allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length;
      const lng = allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length;
      return { center: [lat, lng] as [number, number], zoom: 15 };
    }
    // Second try: farm GPS
    if (farmCenter) {
      return { center: [farmCenter.lat, farmCenter.lng] as [number, number], zoom: farmCenter.zoom ?? 15 };
    }
    // Fallback
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    // isolation:isolate creates a self-contained stacking context for the map,
    // so Leaflet's internal z-indexes (200–1000) never compete with page modals.
    <div style={{ borderRadius: '12px', overflow: 'hidden', isolation: 'isolate' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '480px', width: '100%' }}
      >
        {/* Esri World Imagery — free satellite tiles, no API key */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community'
          maxZoom={19}
        />

        {/* Static polygon overlays (view mode only) */}
        {!isEditing && blocks.map((block, idx) => {
          const boundary = block.boundary;
          if (!boundary || boundary.length < 3) return null;
          const colors = blockColor(idx);
          const isSelected = block.id === selectedId;
          return (
            <Polygon
              key={block.id}
              positions={boundary.map(p => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: colors.stroke,
                fillColor: colors.fill,
                fillOpacity: isSelected ? 0.55 : 0.35,
                weight: isSelected ? 3 : 2,
              }}
              eventHandlers={{ click: () => onSelect(block.id) }}
            >
              <Tooltip sticky direction="center">
                <span className="text-xs font-semibold">{block.name}</span>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Drawing / editing tools (edit mode only) */}
        {isEditing && (
          <DrawControl
            blocks={blocks}
            pendingBoundaries={pendingBoundaries}
            onDrawComplete={onDrawComplete}
            onBoundaryEdit={onBoundaryEdit}
            onBoundaryDelete={onBoundaryDelete}
          />
        )}

        {/* Auto-fit to block boundaries on mount */}
        <AutoFitBounds blocks={blocks} />

        <MapFlyToController handleRef={mapHandleRef} />
      </MapContainer>
    </div>
  );
}
