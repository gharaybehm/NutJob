/* eslint-disable @typescript-eslint/no-explicit-any -- tissue_samples.nutrients is loosely typed Json */
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { requireFarmRole } from '@/utils/supabase/farm-access';
import { leafFormFields } from '@/engines/nutrition';

export interface TissueSampleRow {
  id: string;
  sampledAt: string;
  labReference: string | null;
  notes: string | null;
  nutrients: Record<string, number>;
}

export interface LastFertigation {
  performedAt: string;
  product: string | null;
  amountPerTree: number | null;
  unit: string | null;
  notes: string | null;
}

// Sanity ceilings: a percentage cannot pass 10 and a micronutrient in the
// thousands of ppm is a units slip (a % typed into a ppm box), not a leaf.
const MAX_PCT = 10;
const MAX_PPM = 2000;

/** Only numeric entries, keyed by nutrient. Non-numeric or blank entries are dropped. */
function cleanNutrients(nutrients: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!nutrients || typeof nutrients !== 'object' || Array.isArray(nutrients)) return out;
  for (const [k, v] of Object.entries(nutrients as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export async function logTissueSample(formData: FormData): Promise<{ error?: string }> {
  const farmId       = ((formData.get('farmId')       as string) || '').trim();
  const blockId      = ((formData.get('blockId')      as string) || '').trim();
  const sampledAt    = ((formData.get('sampledAt')    as string) || '').trim();
  const labReference = ((formData.get('labReference') as string) || '').trim();
  const notes        = ((formData.get('notes')        as string) || '').trim();
  const rawValues    = (formData.get('values')        as string) || '{}';

  if (!farmId || !blockId) return { error: 'Missing farm or block.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sampledAt)) return { error: 'A sample date is required.' };
  if (sampledAt > new Date().toISOString().split('T')[0]) return { error: 'Sample date cannot be in the future.' };

  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };

  const supabase = await createClient();

  // The block must belong to this farm, and its crop decides which nutrients are valid.
  const { data: block } = await (supabase as any)
    .from('blocks').select('id, crop_type').eq('id', blockId).eq('farm_id', farmId).maybeSingle();
  if (!block) return { error: 'That block is not on this farm.' };

  let parsed: unknown;
  try { parsed = JSON.parse(rawValues); } catch { return { error: 'The values could not be read.' }; }
  const values = cleanNutrients(parsed);

  const fields = leafFormFields(block.crop_type);
  if (fields.length === 0) {
    return { error: `No leaf-tissue nutrients are defined for "${block.crop_type}" yet, so a sample cannot be recorded.` };
  }
  const nutrients: Record<string, number> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined) continue;
    if (v < 0) return { error: `${f.label} cannot be negative.` };
    if (v > (f.unit === '%' ? MAX_PCT : MAX_PPM)) {
      return { error: `${f.label} of ${v} ${f.unit} is not plausible for a leaf: check the unit.` };
    }
    nutrients[f.key] = v;
  }
  if (Object.keys(nutrients).length === 0) return { error: 'Enter at least one nutrient value.' };

  const { error } = await (supabase as any).from('tissue_samples').insert({
    block_id: blockId,
    sampled_at: sampledAt,
    lab_reference: labReference || null,
    nutrients,
    notes: notes || null,
    entered_by: gate.actor.userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/${farmId}/blocks`);
  return {};
}

export async function getNutritionHistory(blockId: string): Promise<{
  samples: TissueSampleRow[];
  lastFertigation: LastFertigation | null;
  error?: string;
}> {
  const supabase = await createClient();
  const [samplesRes, fertRes] = await Promise.all([
    (supabase as any)
      .from('tissue_samples')
      .select('id, sampled_at, lab_reference, notes, nutrients')
      .eq('block_id', blockId)
      .order('sampled_at', { ascending: false })
      .limit(10),
    (supabase as any)
      .from('activity_log')
      .select('performed_at, description, details')
      .eq('block_id', blockId)
      .eq('activity_type', 'fertigation')
      .order('performed_at', { ascending: false })
      .limit(1),
  ]);

  if (samplesRes.error) return { samples: [], lastFertigation: null, error: samplesRes.error.message };

  const samples: TissueSampleRow[] = (samplesRes.data ?? []).map((r: any) => ({
    id: r.id,
    sampledAt: r.sampled_at,
    labReference: r.lab_reference ?? null,
    notes: r.notes ?? null,
    nutrients: cleanNutrients(r.nutrients),
  }));

  const f = fertRes.data?.[0];
  const d = (f?.details ?? {}) as Record<string, unknown>;
  const lastFertigation: LastFertigation | null = f
    ? {
        performedAt: f.performed_at,
        product: typeof d.product_name === 'string' ? d.product_name : null,
        amountPerTree: typeof d.amount_per_tree === 'number' ? d.amount_per_tree : null,
        unit: typeof d.amount_unit === 'string' ? d.amount_unit : null,
        notes: f.description ?? null,
      }
    : null;

  return { samples, lastFertigation };
}

export async function deleteTissueSample(id: string, farmId: string): Promise<{ error?: string }> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await (supabase as any).from('tissue_samples').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/${farmId}/blocks`);
  return {};
}
