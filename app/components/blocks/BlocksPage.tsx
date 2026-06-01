"use client";

import { useState, useTransition, useRef } from 'react';
import { Plus, FlaskConical, Map, Check, X as XIcon, Pencil } from 'lucide-react';
import type { Block, BlockProfile, LatLng } from './types';
import { BLOCK_PROFILES, makeDefaultProfile } from './mockData';
import type { BlockFormValues } from './BlockFormModal';
import { createBlock, updateBlock, deleteBlock, updateBlockBoundary } from '@/app/actions/blocks';
import BlockSatelliteMap from './BlockSatelliteMap';
import type { MapHandle } from './BlockSatelliteMap';
import GoToLocationBar from './GoToLocationBar';
import dynamic from 'next/dynamic';
const BlockDetailPanel = dynamic(() => import('./BlockDetailPanel'), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />,
});
const BlockFormModal = dynamic(() => import('./BlockFormModal'), { ssr: false });
const LogTestResultModal = dynamic(() => import('./LogTestResultModal'), { ssr: false });

interface Props {
  initialBlocks?: Block[];
  userRole?: "admin" | "supervisor" | "worker";
  farmId: string;
  farmCenter?: { lat: number; lng: number; zoom?: number };
}

export default function BlocksPage({ initialBlocks, userRole = "worker", farmId, farmCenter }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks ?? []);
  const [profiles, setProfiles] = useState<Record<string, BlockProfile>>(() => {
    const seed: Record<string, BlockProfile> = { ...BLOCK_PROFILES };
    (initialBlocks ?? []).forEach(b => {
      if (!seed[b.id]) seed[b.id] = makeDefaultProfile(b);
    });
    return seed;
  });

  const [prevInitialBlocks, setPrevInitialBlocks] = useState(initialBlocks);
  if (initialBlocks !== prevInitialBlocks) {
    setPrevInitialBlocks(initialBlocks);
    setBlocks(initialBlocks ?? []);
    setProfiles(() => {
      const seed: Record<string, BlockProfile> = { ...BLOCK_PROFILES };
      (initialBlocks ?? []).forEach(b => {
        if (!seed[b.id]) seed[b.id] = makeDefaultProfile(b);
      });
      return seed;
    });
  }

  const [selectedId, setSelectedId] = useState<string>(blocks[0]?.id ?? '');
  const [formOpen, setFormOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // ─── Map edit mode state ────────────────────────────────────────────────────
  const [isEditingMap, setIsEditingMap] = useState(false);
  // When true, user clicked New Block and we're waiting for them to draw on the map
  const [awaitingDraw, setAwaitingDraw] = useState(false);
  // Boundary changes made in the current edit session, not yet persisted
  const [pendingBoundaries, setPendingBoundaries] = useState<Record<string, LatLng[]>>({});
  // Boundary captured from the most recent draw gesture (passed into the form modal)
  const [drawnBoundary, setDrawnBoundary] = useState<LatLng[] | null>(null);
  // Ref to Leaflet map instance for flyTo navigation
  const mapHandleRef = useRef<MapHandle | null>(null);

  const selectedProfile = profiles[selectedId];

  // ─── Block form handlers ────────────────────────────────────────────────────

  function openNewBlock() {
    // Always draw the boundary first — enter edit mode and wait for the draw gesture
    setEditingBlock(null);
    setIsEditingMap(true);
    setAwaitingDraw(true);
  }

  function openEditBlock(block: Block) {
    setEditingBlock(block);
    setFormOpen(true);
  }

  function handleFormSave(values: BlockFormValues) {
    setSaveError(null);
    const boundary = values.boundary ? (JSON.parse(values.boundary) as LatLng[]) : undefined;

    if (editingBlock) {
      const updatedBlock: Block = {
        ...editingBlock,
        name: values.name.trim(),
        cropType: values.cropType,
        variety: values.variety,
        area: Number(values.area) || 0,
        areaUnit: values.areaUnit || 'Dunm',
        plantingYear: Number(values.plantingYear) || new Date().getFullYear(),
        rootstock: values.rootstock || 'Unknown',
        treeCount: Number(values.treeCount) || 0,
        rowSpacing: Number(values.rowSpacing) || 6,
        treeSpacing: Number(values.treeSpacing) || 5,
        mapPos: editingBlock.mapPos,
        boundary: boundary ?? editingBlock.boundary,
      };

      setBlocks(prev => prev.map(b => b.id === updatedBlock.id ? updatedBlock : b));
      setProfiles(prev => ({ ...prev, [updatedBlock.id]: makeDefaultProfile(updatedBlock) }));

      startTransition(async () => {
        const result = await updateBlock(updatedBlock.id, values, farmId);
        if (result.error) {
          setSaveError(result.error);
          setBlocks(prev => prev.map(b => b.id === editingBlock.id ? editingBlock : b));
          setProfiles(prev => ({ ...prev, [editingBlock.id]: makeDefaultProfile(editingBlock) }));
        }
      });
    } else {
      const tempId = crypto.randomUUID();
      const lastBlock = blocks[blocks.length - 1];
      const lastCol = (lastBlock?.mapPos.col ?? 0) + (lastBlock?.mapPos.colSpan ?? 1);
      const col = lastCol > 2 ? 0 : lastCol;
      const newRow = lastCol > 2 ? (lastBlock?.mapPos.row ?? 0) + 1 : (lastBlock?.mapPos.row ?? 0);

      const optimisticBlock: Block = {
        id: tempId,
        name: values.name.trim(),
        cropType: values.cropType,
        variety: values.variety,
        area: Number(values.area) || 0,
        areaUnit: values.areaUnit || 'Dunm',
        plantingYear: Number(values.plantingYear) || new Date().getFullYear(),
        rootstock: values.rootstock || 'Unknown',
        treeCount: Number(values.treeCount) || 0,
        rowSpacing: Number(values.rowSpacing) || 6,
        treeSpacing: Number(values.treeSpacing) || 5,
        status: 'green',
        alerts: [],
        mapPos: { col, row: newRow, colSpan: 1, rowSpan: 1 },
        boundary,
      };

      setBlocks(prev => [...prev, optimisticBlock]);
      setProfiles(prev => ({ ...prev, [tempId]: makeDefaultProfile(optimisticBlock) }));
      setSelectedId(tempId);
      // New block boundary is saved directly with the record — no "Accept Changes" needed
      if (Object.keys(pendingBoundaries).length === 0) setIsEditingMap(false);

      startTransition(async () => {
        const result = await createBlock(values, blocks, farmId);
        if (result.error) {
          setSaveError(result.error);
          setBlocks(prev => prev.filter(b => b.id !== tempId));
          setProfiles(prev => { const next = { ...prev }; delete next[tempId]; return next; });
          setSelectedId(blocks[blocks.length - 1]?.id ?? '');
        } else if (result.id && result.id !== tempId) {
          const newId = result.id;
          setBlocks(prev => prev.map(b => b.id === tempId ? { ...b, id: newId } : b));
          setProfiles(prev => {
            const next = { ...prev };
            const profile = next[tempId];
            if (profile) {
              next[newId] = {
                ...profile,
                block: { ...profile.block, id: newId }
              };
              delete next[tempId];
            }
            return next;
          });
          setSelectedId(prev => prev === tempId ? newId : prev);
        }
      });
    }
  }

  // ─── Delete handlers ────────────────────────────────────────────────────────

  function confirmDeleteBlock(id: string) {
    setDeleteConfirmId(id);
  }

  function executeDeleteBlock() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);

    const blockToDelete = blocks.find(b => b.id === id);
    if (!blockToDelete) return;

    setBlocks(prev => prev.filter(b => b.id !== id));
    setProfiles(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (selectedId === id) {
      const remaining = blocks.filter(b => b.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[0].id : '');
    }

    startTransition(async () => {
      const result = await deleteBlock(id, farmId);
      if (result.error) {
        setSaveError(result.error);
        setBlocks(prev => [...prev, blockToDelete].sort((a, b) => a.mapPos.row - b.mapPos.row || a.mapPos.col - b.mapPos.col));
        setProfiles(prev => ({ ...prev, [id]: makeDefaultProfile(blockToDelete) }));
        setSelectedId(id);
      }
    });
  }

  // ─── Map edit mode handlers ─────────────────────────────────────────────────

  function handleDrawComplete(boundary: LatLng[]) {
    setAwaitingDraw(false);
    setDrawnBoundary(boundary);
    setEditingBlock(null);
    setFormOpen(true);
  }

  function handleBoundaryEdit(id: string, boundary: LatLng[]) {
    setPendingBoundaries(prev => ({ ...prev, [id]: boundary }));
  }

  function handleBoundaryDelete(id: string) {
    setPendingBoundaries(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // Mark the block as having its boundary cleared
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, boundary: undefined } : b));
  }

  function handleAcceptChanges() {
    const entries = Object.entries(pendingBoundaries);
    if (entries.length === 0) {
      setIsEditingMap(false);
      return;
    }

    startTransition(async () => {
      const results = await Promise.all(
        entries.map(([id, boundary]) => updateBlockBoundary(id, boundary, farmId)),
      );
      const firstError = results.find(r => r.error);
      if (firstError) {
        setSaveError(firstError.error ?? 'Failed to save boundaries.');
        return;
      }
      // Apply pending boundaries to local state
      setBlocks(prev => prev.map(b =>
        pendingBoundaries[b.id] ? { ...b, boundary: pendingBoundaries[b.id] } : b,
      ));
      setPendingBoundaries({});
      setIsEditingMap(false);
    });
  }

  function handleCancelEdit() {
    setPendingBoundaries({});
    setAwaitingDraw(false);
    setIsEditingMap(false);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Blocks</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Per-block live agronomic profile — select a block to view its full status.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEditingMap ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={isPending}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-60"
                >
                  <XIcon className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  onClick={handleAcceptChanges}
                  disabled={isPending}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  {isPending ? 'Saving…' : 'Accept Changes'}
                </button>
              </>
            ) : (
              userRole !== "worker" && (
                <>
                  <button
                    onClick={() => setIsEditingMap(true)}
                    disabled={isPending}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-60"
                  >
                    <Map className="h-4 w-4" />
                    Edit Farm Map
                  </button>
                  <button
                    onClick={openNewBlock}
                    id="new-block-btn"
                    disabled={isPending}
                    className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    New Block
                  </button>
                </>
              )
            )}
          </div>
        </div>

        {/* Edit mode banner */}
        {isEditingMap && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            awaitingDraw
              ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30 text-brand-800 dark:text-brand-200'
              : 'border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'
          }`}>
            {awaitingDraw ? (
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white">
                  <Pencil className="h-3.5 w-3.5" />
                </span>
                <span>
                  <span className="font-semibold">Draw your block now.</span>{' '}
                  Click the <span className="inline-flex items-center gap-1 rounded border border-brand-300 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-700">⬡ polygon</span> button in the <span className="font-semibold">top-left of the map</span>, then click on the map to place boundary points. Double-click to finish.
                </span>
              </span>
            ) : (
              <span>
                <span className="font-semibold">Edit mode active.</span> Draw a block boundary using the <span className="font-semibold">⬡ polygon tool</span> in the top-left of the map, or reshape existing polygons. Click <span className="font-semibold">Accept Changes</span> when done.
              </span>
            )}
          </div>
        )}

        {/* Save error banner */}
        {saveError && (
          <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            Failed to save: {saveError}
          </div>
        )}

        {/* Farm map + Go to location bar */}
        <div className="flex flex-col gap-3">
          {isEditingMap && (
            <GoToLocationBar mapHandleRef={mapHandleRef} />
          )}

          {/* Map wrapper — relative so the draw-hint callout can be overlaid */}
          <div className="relative">
            {awaitingDraw && (
              <div className="absolute top-2 left-[52px] z-[1000] flex items-center gap-2 pointer-events-none animate-pulse">
                {/* Arrow pointing left toward the toolbar */}
                <svg width="28" height="20" viewBox="0 0 28 20" className="text-brand-500 shrink-0">
                  <path d="M28 10 L8 10 M8 10 L16 4 M8 10 L16 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg whitespace-nowrap">
                  Click ⬡ here to start drawing
                </span>
              </div>
            )}

          <BlockSatelliteMap
            blocks={blocks}
            selectedId={selectedId}
            isEditing={isEditingMap}
            pendingBoundaries={pendingBoundaries}
            onSelect={setSelectedId}
            onDrawComplete={handleDrawComplete}
            onBoundaryEdit={handleBoundaryEdit}
            onBoundaryDelete={handleBoundaryDelete}
            mapHandleRef={mapHandleRef}
            farmCenter={farmCenter}
          />
          </div>{/* end map relative wrapper */}

          {/* Block list pills below map (for blocks without boundaries yet) */}
          {blocks.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {blocks.map(block => (
                <button
                  key={block.id}
                  onClick={() => setSelectedId(block.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                    block.id === selectedId
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-brand-400'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    block.status === 'red' ? 'bg-red-500' : block.status === 'amber' ? 'bg-amber-500' : 'bg-brand-500'
                  }`} />
                  {block.name}
                  {!block.boundary && (
                    <span className="ml-0.5 opacity-60" title="No boundary drawn">○</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Block detail panel */}
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-24 text-center">
            <div className="text-4xl">🌱</div>
            <div>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No blocks yet</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Click <span className="font-medium">New Block</span> to outline your first block on the satellite map.
              </p>
            </div>
            <button
              onClick={openNewBlock}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" />
              New Block
            </button>
          </div>
        ) : selectedProfile ? (
          <BlockDetailPanel
            profile={selectedProfile}
            onEdit={userRole !== "worker" ? () => openEditBlock(selectedProfile.block) : undefined}
            onDelete={userRole === "admin" ? () => confirmDeleteBlock(selectedProfile.block.id) : undefined}
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
            Select a block to view its profile
          </div>
        )}
      </div>

      <BlockFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setDrawnBoundary(null); }}
        onSave={handleFormSave}
        initialData={editingBlock || undefined}
        initialBoundary={drawnBoundary ?? undefined}
      />

      <LogTestResultModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        blocks={blocks}
        defaultBlockId={selectedId}
      />

      {/* Log Test Result FAB */}
      {blocks.length > 0 && userRole !== "worker" && (
        <button
          onClick={() => setTestModalOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-700 active:scale-95 transition-all"
        >
          <FlaskConical className="h-4 w-4" />
          Log Test Result
        </button>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col p-6 border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Delete Block</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Are you sure you want to delete this block? This action cannot be undone and will remove all associated agronomic data.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteBlock}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
