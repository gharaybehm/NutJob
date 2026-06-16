import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const blockId = req.nextUrl.searchParams.get('blockId');
  if (!blockId) return NextResponse.json({ data: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('soil_water_readings')
    .select('id, recorded_at, test_type, ph, soil_ec, soil_moisture, root_zone_temp, water_deficit, lab_reference, file_url, notes, parameters')
    .or(`block_id.eq.${blockId},block_id.is.null`)
    .eq('source', 'manual')
    .order('recorded_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
