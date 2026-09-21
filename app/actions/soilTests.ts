'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { requireFarmRole } from '@/utils/supabase/farm-access';

function numOrNull(v: string | null): number | null {
  if (!v || v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function logTestResult(
  formData: FormData,
): Promise<{ error?: string }> {
  const id           = formData.get('id')         as string | null;
  const blockId      = formData.get('blockId')    as string | null;
  const formFarmId   = formData.get('farmId')     as string | null;
  const testType     = (formData.get('testType')  as string) || 'soil';
  const recordedAt   = formData.get('recordedAt') as string;
  const labReference = formData.get('labReference') as string;
  const notes        = formData.get('notes')      as string;
  let fileUrl        = formData.get('fileUrl')    as string | null;
  const file         = formData.get('file')       as File | null;

  // Core top-level columns
  const ph           = formData.get('ph')           as string;
  const soilEc       = formData.get('soilEc')       as string;
  const soilMoisture = formData.get('soilMoisture') as string;
  const rootZoneTemp = formData.get('rootZoneTemp') as string;
  const waterDeficit = formData.get('waterDeficit') as string;

  // Extended soil parameters → stored in parameters JSONB
  const params: Record<string, number | string | null> = {};
  const soilKeys: [string, string][] = [
    ['organic_matter',  'organicMatter'],
    ['phosphorus_p2o5', 'phosphorus'],
    ['potassium_k2o',   'potassium'],
    ['lime',            'lime'],
    ['calcium',         'calcium'],
    ['magnesium',       'magnesium'],
    ['sodium',          'sodium'],
    ['iron',            'iron'],
    ['zinc',            'zinc'],
    ['copper',          'copper'],
    ['manganese',       'manganese'],
    ['cec',             'cec'],
    ['boron',           'boron'],
    ['sand',            'sand'],
    ['clay',            'clay'],
    ['silt',            'silt'],
  ];
  for (const [jsonKey, formKey] of soilKeys) {
    const v = numOrNull(formData.get(formKey) as string);
    if (v !== null) params[jsonKey] = v;
  }
  const textureClass = formData.get('textureClass') as string;
  if (textureClass?.trim()) params['texture_class'] = textureClass.trim();

  // For water tests, store EC in µs/cm in parameters (top-level soil_ec stores ms/cm equiv)
  if (testType === 'water') {
    const waterEcRaw = formData.get('waterEc') as string;
    const waterEcUs = numOrNull(waterEcRaw);
    if (waterEcUs !== null) params['water_ec_us_cm'] = waterEcUs;
  }

  const supabase = await createClient();

  // Every test belongs to a farm, whether or not it names a block. A whole-farm
  // test with no farm cannot be read by anyone (row-level security) and must
  // never be applied to a farm it does not belong to.
  let farmId: string | null = formFarmId || null;
  if (blockId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: blk } = await (supabase.from('blocks') as any).select('farm_id').eq('id', blockId).maybeSingle();
    if (!blk?.farm_id) return { error: 'Block not found' };
    farmId = blk.farm_id;
  }
  if (!farmId) return { error: 'Missing farm: a whole-farm test needs to know which farm it belongs to.' };
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };

  // Handle file upload if present
  if (file && file.size > 0) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `reports/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('lab-reports')
      .upload(filePath, file);

    if (uploadError) {
      return { error: 'Failed to upload report: ' + uploadError.message };
    }
    fileUrl = filePath;
  }

  // Derive soil_ec for water tests: convert µs/cm → ms/cm (÷1000)
  let ecValue: number | null = numOrNull(soilEc);
  if (testType === 'water') {
    const waterEcUs = numOrNull(formData.get('waterEc') as string);
    if (waterEcUs !== null) ecValue = waterEcUs / 1000;
  }

  const row = {
    block_id:       blockId || null,
    farm_id:        farmId,
    test_type:      testType,
    recorded_at:    recordedAt || new Date().toISOString(),
    source:         'manual' as const,
    ph:             numOrNull(ph),
    soil_ec:        ecValue,
    soil_moisture:  numOrNull(soilMoisture),
    root_zone_temp: numOrNull(rootZoneTemp),
    water_deficit:  numOrNull(waterDeficit),
    lab_reference:  labReference || null,
    file_url:       fileUrl,
    notes:          notes || null,
    parameters:     Object.keys(params).length > 0 ? params : null,
  };

  let saveError;
  if (id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('soil_water_readings') as any)
      .update(row)
      .eq('id', id);
    saveError = error;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('soil_water_readings') as any)
      .insert(row);
    saveError = error;
  }

  if (saveError) {
    // 23505: the same lab report number is already saved for this block or farm.
    if ((saveError as { code?: string }).code === '23505') {
      return {
        error: `Lab report ${labReference || ''} is already saved for this ${blockId ? 'block' : 'farm'}. Open it in the history to correct it instead of saving it again.`.replace('  ', ' '),
      };
    }
    return { error: saveError.message };
  }

  revalidatePath('/blocks');
  return {};
}

export async function getLabReadings(blockId: string, farmId?: string): Promise<{
  data: {
    id: string;
    block_id: string | null;
    recorded_at: string;
    test_type: string | null;
    ph: number | null;
    soil_ec: number | null;
    soil_moisture: number | null;
    root_zone_temp: number | null;
    water_deficit: number | null;
    lab_reference: string | null;
    file_url: string | null;
    notes: string | null;
    parameters: Record<string, unknown> | null;
  }[] | null;
  error?: string;
}> {
  const supabase = await createClient();
  // Ids are interpolated into a filter, so accept only plain id characters.
  const safe = (v: string) => /^[A-Za-z0-9_-]+$/.test(v);
  if (!safe(blockId) || (farmId && !safe(farmId))) return { data: null, error: 'Invalid id' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase.from('soil_water_readings') as any)
    .select('id, block_id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters')
    .eq('source', 'manual');
  // This block's own tests plus the farm-wide tests of its farm.
  q = farmId ? q.or(`block_id.eq.${blockId},and(block_id.is.null,farm_id.eq.${farmId})`) : q.eq('block_id', blockId);
  const { data, error } = await q.order('recorded_at', { ascending: false }).limit(20);

  if (error) return { data: null, error: error.message };
  return { data };
}

export async function getLatestSoilReading(blockId: string | null, farmId?: string | null): Promise<{
  data: {
    id: string;
    recorded_at: string;
    test_type: string | null;
    ph: number | null;
    soil_ec: number | null;
    soil_moisture: number | null;
    root_zone_temp: number | null;
    water_deficit: number | null;
    lab_reference: string | null;
    file_url: string | null;
    notes: string | null;
    parameters: Record<string, unknown> | null;
  } | null;
  error?: string;
}> {
  const supabase = await createClient();
  let query = supabase
    .from('soil_water_readings')
    .select('id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters')
    .eq('source', 'manual')
    .eq('test_type', 'soil')
    .order('recorded_at', { ascending: false })
    .limit(1);

  if (blockId) {
    query = query.eq('block_id', blockId);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query.is('block_id', null) as any).eq('farm_id', farmId ?? '');
  }

  const { data, error } = await query.maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data };
}

export async function getFarmLabReadings(farmId: string): Promise<{
  data: {
    id: string;
    recorded_at: string;
    test_type: string | null;
    ph: number | null;
    soil_ec: number | null;
    soil_moisture: number | null;
    root_zone_temp: number | null;
    water_deficit: number | null;
    lab_reference: string | null;
    file_url: string | null;
    notes: string | null;
    parameters: Record<string, unknown> | null;
  }[] | null;
  error?: string;
}> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('soil_water_readings') as any)
    .select('id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters')
    .is('block_id', null)
    .eq('farm_id', farmId)
    .eq('source', 'manual')
    .order('recorded_at', { ascending: false })
    .limit(50);

  if (error) return { data: null, error: error.message };
  return { data };
}

