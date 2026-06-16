'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';

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
    const { error } = await supabase
      .from('soil_water_readings')
      .update(row)
      .eq('id', id);
    saveError = error;
  } else {
    const { error } = await supabase
      .from('soil_water_readings')
      .insert(row);
    saveError = error;
  }

  if (saveError) return { error: saveError.message };

  revalidatePath('/blocks');
  return {};
}

export async function getLabReadings(blockId: string): Promise<{
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
  const { data, error } = await supabase
    .from('soil_water_readings')
    .select('id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters')
    .eq('block_id', blockId)
    .eq('source', 'manual')
    .order('recorded_at', { ascending: false })
    .limit(20);

  if (error) return { data: null, error: error.message };
  return { data };
}

export async function getLatestSoilReading(blockId: string | null): Promise<{
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
    query = query.is('block_id', null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data };
}

export async function getFarmLabReadings(): Promise<{
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
  const { data, error } = await supabase
    .from('soil_water_readings')
    .select('id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters')
    .is('block_id', null)
    .eq('source', 'manual')
    .order('recorded_at', { ascending: false })
    .limit(50);

  if (error) return { data: null, error: error.message };
  return { data };
}

