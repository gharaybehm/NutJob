'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import type { BlockFormValues } from '@/app/components/blocks/BlockFormModal';
import type { Block, LatLng } from '@/app/components/blocks/types';

/** Derive a short, unique text ID from the block name. */
function deriveId(name: string, existing: string[]): string {
  const raw = name.trim().replace(/\s+/g, '').slice(0, 4).toUpperCase();
  if (raw && !existing.includes(raw)) return raw;
  return `BLK${Date.now()}`;
}

/** Auto-position the new block after the last one in the grid. */
function nextMapPos(existing: Block[]): { col: number; row: number } {
  if (existing.length === 0) return { col: 0, row: 0 };
  const last = existing[existing.length - 1];
  const lastCol = last.mapPos.col + (last.mapPos.colSpan ?? 1);
  if (lastCol > 2) return { col: 0, row: last.mapPos.row + 1 };
  return { col: lastCol, row: last.mapPos.row };
}

export async function createBlock(
  values: BlockFormValues,
  existingBlocks: Block[],
  farmId: string,
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();

  const id = deriveId(values.name, existingBlocks.map(b => b.id));
  const auto = nextMapPos(existingBlocks);
  const mapCol     = values.mapCol     ? Number(values.mapCol)     : auto.col;
  const mapRow     = values.mapRow     ? Number(values.mapRow)     : auto.row;
  const mapColSpan = values.mapColSpan ? Number(values.mapColSpan) : 1;
  const mapRowSpan = values.mapRowSpan ? Number(values.mapRowSpan) : 1;

  const boundary = values.boundary ? JSON.parse(values.boundary) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('blocks') as any).insert({
    id,
    farm_id:       farmId,
    name:          values.name.trim(),
    crop_type:     values.cropType,
    variety:       values.variety,
    area:          Number(values.area) || 0,
    area_unit:     values.areaUnit || 'Dunm',
    planting_year: Number(values.plantingYear) || new Date().getFullYear(),
    rootstock:     values.rootstock || 'Unknown',
    tree_count:    Number(values.treeCount) || 0,
    row_spacing:   Number(values.rowSpacing) || 6,
    tree_spacing:  Number(values.treeSpacing) || 5,
    map_col:       mapCol,
    map_row:       mapRow,
    map_col_span:  mapColSpan,
    map_row_span:  mapRowSpan,
    boundary,
  });

  if (error) return { error: error.message };

  revalidatePath(`/${farmId}/blocks`);
  return { id };
}

export async function updateBlock(
  id: string,
  values: BlockFormValues,
  farmId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const boundary = values.boundary ? JSON.parse(values.boundary) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('blocks') as any).update({
    name:          values.name.trim(),
    crop_type:     values.cropType,
    variety:       values.variety,
    area:          Number(values.area) || 0,
    area_unit:     values.areaUnit || 'Dunm',
    planting_year: Number(values.plantingYear) || new Date().getFullYear(),
    rootstock:     values.rootstock || 'Unknown',
    tree_count:    Number(values.treeCount) || 0,
    row_spacing:   Number(values.rowSpacing) || 6,
    tree_spacing:  Number(values.treeSpacing) || 5,
    ...(values.mapCol     !== '' && values.mapCol     != null && { map_col:      Number(values.mapCol) }),
    ...(values.mapRow     !== '' && values.mapRow     != null && { map_row:      Number(values.mapRow) }),
    ...(values.mapColSpan !== '' && values.mapColSpan != null && { map_col_span: Number(values.mapColSpan) }),
    ...(values.mapRowSpan !== '' && values.mapRowSpan != null && { map_row_span: Number(values.mapRowSpan) }),
    ...(boundary !== undefined && { boundary }),
  }).eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/${farmId}/blocks`);
  return {};
}

export async function updateBlockBoundary(
  id: string,
  boundary: LatLng[],
  farmId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('blocks') as any)
    .update({ boundary })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/${farmId}/blocks`);
  return {};
}

export async function deleteBlock(id: string, farmId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from('blocks').delete().eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/${farmId}/blocks`);
  return {};
}
