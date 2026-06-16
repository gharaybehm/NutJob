import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function GET(req: NextRequest) {
  const blockId = req.nextUrl.searchParams.get('blockId');

  const supabase = createAdminClient();

  let query = supabase
    .from('soil_water_readings')
    .select(
      'id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters',
    )
    .eq('source', 'manual')
    .order('recorded_at', { ascending: false })
    .limit(20);

  if (blockId) {
    query = query.or(`block_id.eq.${blockId},block_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
