import { createClient } from '@/utils/supabase/server';
import BlocksPage from '@/app/components/blocks/BlocksPage';
import type { Block } from '@/app/components/blocks/types';

export const metadata = {
  title: 'Blocks — NutJob',
  description: 'Per-block live agronomic profile across soil & water, phenology, nutrition, pest & disease, and weather domains.',
};

/** Map a Supabase blocks row → our frontend Block type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBlock(row: any): Block {
  return {
    id:           row.id,
    name:         row.name,
    variety:      row.variety,
    area:         Number(row.area),
    areaUnit:     row.area_unit || 'Dunm',
    plantingYear: Number(row.planting_year),
    rootstock:    row.rootstock,
    treeCount:    Number(row.tree_count),
    rowSpacing:   Number(row.row_spacing),
    treeSpacing:  Number(row.tree_spacing),
    status:       'green',   // live status comes from sensor readings — default for now
    alerts:       [],
    mapPos: {
      col:     Number(row.map_col),
      row:     Number(row.map_row),
      colSpan: Number(row.map_col_span) || 1,
      rowSpan: Number(row.map_row_span) || 1,
    },
  };
}

export default async function BlocksRoute() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('blocks')
    .select('id, name, variety, area, area_unit, planting_year, rootstock, tree_count, row_spacing, tree_spacing, map_col, map_row, map_col_span, map_row_span')
    .order('map_row')
    .order('map_col');

  const initialBlocks: Block[] = error || !data ? [] : data.map(rowToBlock);

  return <BlocksPage initialBlocks={initialBlocks} />;
}
