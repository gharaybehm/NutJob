import { createClient } from '@/utils/supabase/server';
import BlocksPage from '@/app/components/blocks/BlocksPage';
import type { Block } from '@/app/components/blocks/types';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Blocks — NutJob',
  description: 'Per-block live agronomic profile across soil & water, phenology, nutrition, pest & disease, and weather domains.',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBlock(row: any): Block {
  return {
    id:           row.id,
    name:         row.name,
    cropType:     row.crop_type || 'Almond',
    variety:      row.variety,
    area:         Number(row.area),
    areaUnit:     row.area_unit || 'Dunm',
    plantingYear: Number(row.planting_year),
    rootstock:    row.rootstock,
    treeCount:    Number(row.tree_count),
    rowSpacing:   Number(row.row_spacing),
    treeSpacing:  Number(row.tree_spacing),
    status:       'green',
    alerts:       [],
    mapPos: {
      col:     Number(row.map_col),
      row:     Number(row.map_row),
      colSpan: Number(row.map_col_span) || 1,
      rowSpan: Number(row.map_row_span) || 1,
    },
    boundary: row.boundary ?? undefined,
  };
}

export default async function BlocksRoute({ params }: { params: Promise<{ farmId: string }> }) {
  const { farmId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('blocks') as any)
    .select('id, name, crop_type, variety, area, area_unit, planting_year, rootstock, tree_count, row_spacing, tree_spacing, map_col, map_row, map_col_span, map_row_span, boundary')
    .eq('farm_id', farmId)
    .order('map_row')
    .order('map_col');

  const initialBlocks: Block[] = error || !data ? [] : data.map(rowToBlock);

  // Fetch farm GPS center for the satellite map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farm } = await (supabase as any).from('farms')
    .select('gps_lat, gps_lng, gps_zoom')
    .eq('id', farmId)
    .single();
  const farmCenter = farm?.gps_lat != null && farm?.gps_lng != null
    ? { lat: farm.gps_lat as number, lng: farm.gps_lng as number, zoom: (farm.gps_zoom as number) ?? 15 }
    : undefined;

  return (
    <BlocksPage
      initialBlocks={initialBlocks}
      userRole={profile?.role || 'worker'}
      farmId={farmId}
      farmCenter={farmCenter}
    />
  );
}
