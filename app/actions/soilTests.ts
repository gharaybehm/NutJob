'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
// File upload is handled by /api/upload-lab-report before this action is called.

function numOrNull(v: string | null): number | null {
  if (!v || v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function logTestResult(
  formData: FormData,
): Promise<{ error?: string }> {
  const blockId      = formData.get('blockId')    as string | null;
  const testType     = (formData.get('testType')  as string) || 'soil';
  const recordedAt   = formData.get('recordedAt') as string;
  const labReference = formData.get('labReference') as string;
  const notes        = formData.get('notes')      as string;
  const fileUrl      = formData.get('fileUrl')    as string | null;

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

  const supabase = createAdminClient();

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

  const { error } = await supabase.from('soil_water_readings').insert(row);
  if (error) return { error: error.message };

  revalidatePath('/blocks');
  return {};
}

