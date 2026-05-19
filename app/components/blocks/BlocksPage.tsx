"use client";

import { useState, useTransition, useEffect } from 'react';
import { Plus, FlaskConical } from 'lucide-react';
import type { Block, BlockProfile } from './types';
import { BLOCK_PROFILES, makeDefaultProfile } from './mockData';
import type { BlockFormValues } from './BlockFormModal';
import { createBlock, updateBlock, deleteBlock } from '@/app/actions/blocks';
import BlockMapGrid from './BlockMapGrid';
import BlockDetailPanel from './BlockDetailPanel';
import BlockFormModal from './BlockFormModal';
import LogTestResultModal from './LogTestResultModal';

interface Props {
  initialBlocks?: Block[];
}

export default function BlocksPage({ initialBlocks }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks ?? []);
  // profiles are derived client-side from the default factory; agronomic data
  // will be fetched per-block in a future iteration
  const [profiles, setProfiles] = useState<Record<string, BlockProfile>>({});

  useEffect(() => {
    const seed: Record<string, BlockProfile> = { ...BLOCK_PROFILES };
    (initialBlocks ?? []).forEach(b => {
      if (!seed[b.id]) seed[b.id] = makeDefaultProfile(b);
    });
    setProfiles(seed);
  }, [initialBlocks]);

  const [selectedId, setSelectedId] = useState<string>(blocks[0]?.id ?? '');
  const [formOpen, setFormOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedProfile = profiles[selectedId];

  function openNewBlock() {
    setEditingBlock(null);
    setFormOpen(true);
  }

  function openEditBlock(block: Block) {
    setEditingBlock(block);
    setFormOpen(true);
  }

  function handleFormSave(values: BlockFormValues) {
    setSaveError(null);

    if (editingBlock) {
      // Optimistic update for edit
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
        mapPos: {
          col:     values.mapCol     ? Number(values.mapCol)     : editingBlock.mapPos.col,
          row:     values.mapRow     ? Number(values.mapRow)     : editingBlock.mapPos.row,
          colSpan: values.mapColSpan ? Number(values.mapColSpan) : editingBlock.mapPos.colSpan,
          rowSpan: values.mapRowSpan ? Number(values.mapRowSpan) : editingBlock.mapPos.rowSpan,
        },
      };

      setBlocks(prev => prev.map(b => b.id === updatedBlock.id ? updatedBlock : b));
      setProfiles(prev => ({ ...prev, [updatedBlock.id]: makeDefaultProfile(updatedBlock) }));

      startTransition(async () => {
        const result = await updateBlock(updatedBlock.id, values);
        if (result.error) {
          // Rollback on error
          setSaveError(result.error);
          setBlocks(prev => prev.map(b => b.id === editingBlock.id ? editingBlock : b));
          setProfiles(prev => ({ ...prev, [editingBlock.id]: makeDefaultProfile(editingBlock) }));
        }
      });
    } else {
      // Optimistic update for create
      const tempId = values.name.trim().replace(/\s+/g, '').slice(0, 4).toUpperCase()
        || `BLK${Date.now()}`;
      const lastBlock = blocks[blocks.length - 1];
      const lastCol = (lastBlock?.mapPos.col ?? 0) + (lastBlock?.mapPos.colSpan ?? 1);
      const col = lastCol > 2 ? 0 : lastCol;
      const newRow = lastCol > 2 ? (lastBlock?.mapPos.row ?? 0) + 1 : (lastBlock?.mapPos.row ?? 0);

      const optimisticBlock: Block = {
        id:           tempId,
        name:         values.name.trim(),
        cropType:     values.cropType,
        variety:      values.variety,
        area:         Number(values.area) || 0,
        areaUnit:     values.areaUnit || 'Dunm',
        plantingYear: Number(values.plantingYear) || new Date().getFullYear(),
        rootstock:    values.rootstock || 'Unknown',
        treeCount:    Number(values.treeCount) || 0,
        rowSpacing:   Number(values.rowSpacing) || 6,
        treeSpacing:  Number(values.treeSpacing) || 5,
        status:       'green',
        alerts:       [],
        mapPos: {
          col:     values.mapCol     ? Number(values.mapCol)     : col,
          row:     values.mapRow     ? Number(values.mapRow)     : newRow,
          colSpan: values.mapColSpan ? Number(values.mapColSpan) : 1,
          rowSpan: values.mapRowSpan ? Number(values.mapRowSpan) : 1,
        },
      };

      setBlocks(prev => [...prev, optimisticBlock]);
      setProfiles(prev => ({ ...prev, [tempId]: makeDefaultProfile(optimisticBlock) }));
      setSelectedId(tempId);

      // Persist to Supabase
      startTransition(async () => {
        const result = await createBlock(values, blocks);
        if (result.error) {
          // Roll back optimistic update
          setSaveError(result.error);
          setBlocks(prev => prev.filter(b => b.id !== tempId));
          setProfiles(prev => { const next = { ...prev }; delete next[tempId]; return next; });
          setSelectedId(blocks[blocks.length - 1]?.id ?? '');
        }
      });
    }
  }

  function confirmDeleteBlock(id: string) {
    setDeleteConfirmId(id);
  }

  function executeDeleteBlock() {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);

    // Optimistic delete
    const blockToDelete = blocks.find(b => b.id === id);
    if (!blockToDelete) return;

    setBlocks(prev => prev.filter(b => b.id !== id));
    setProfiles(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (selectedId === id) {
      const remaining = blocks.filter(b => b.id !== id);
      setSelectedId(remaining.length > 0 ? remaining[0].id : '');
    }

    startTransition(async () => {
      const result = await deleteBlock(id);
      if (result.error) {
        // Rollback on error
        setSaveError(result.error);
        setBlocks(prev => [...prev, blockToDelete].sort((a, b) => a.mapPos.row - b.mapPos.row || a.mapPos.col - b.mapPos.col));
        setProfiles(prev => ({ ...prev, [id]: makeDefaultProfile(blockToDelete) }));
        setSelectedId(id);
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Blocks</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Per-block live agronomic profile — select a block to view its full status.
            </p>
          </div>
          <button
            onClick={openNewBlock}
            id="new-block-btn"
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            New Block
          </button>
        </div>

        {/* Save error banner */}
        {saveError && (
          <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            Failed to save block: {saveError}
          </div>
        )}

        {/* Two-column layout: Map | Detail — or empty state */}
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-24 text-center">
            <div className="text-4xl">🌱</div>
            <div>
              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No blocks yet</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create your first block to start tracking agronomic data.</p>
            </div>
            <button
              onClick={openNewBlock}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" />
              New Block
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
            {/* Left: Farm map grid */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Farm Map</h2>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {blocks.length} blocks
                </span>
              </div>
              <BlockMapGrid
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>

            {/* Right: Block detail panel */}
            <div className="min-h-[600px]">
              {selectedProfile ? (
                <BlockDetailPanel 
                  profile={selectedProfile} 
                  onEdit={() => openEditBlock(selectedProfile.block)}
                  onDelete={() => confirmDeleteBlock(selectedProfile.block.id)}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                  Select a block to view its profile
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <BlockFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleFormSave}
        initialData={editingBlock || undefined}
      />

      <LogTestResultModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        blocks={blocks}
        defaultBlockId={selectedId}
      />

      {/* Log Test Result FAB */}
      {blocks.length > 0 && (
        <button
          onClick={() => setTestModalOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-700 active:scale-95 transition-all"
        >
          <FlaskConical className="h-4 w-4" />
          Log Test Result
        </button>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
