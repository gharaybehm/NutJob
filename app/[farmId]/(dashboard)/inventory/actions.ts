/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { createClient } from '@/utils/supabase/server';
import { requireFarmRole, getFarmMemberNames } from '@/utils/supabase/farm-access';
import { revalidatePath } from 'next/cache';
import { Asset, Consumable, MaintenanceEntry, UsageEntry, AssetCategory, AssetStatus, ConsumableCategory, MaintenanceType, LedgerEntryType } from '@/app/components/inventory/types';

export async function getAssets(farmId: string): Promise<Asset[]> {
  const supabase = await createClient();

  const { data: assetsData, error: assetsError } = await (supabase as any)
    .from('assets')
    .select('*')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: false });

  if (assetsError) {
    // Previously this returned demo assets ("John Deere Tractor"). Fabricated
    // rows in an inventory that exists to answer "who touched what" are worse
    // than an empty list, so a failure now reads as a failure.
    console.error('[Inventory] Failed to load assets:', assetsError.message);
    return [];
  }

  const assetIds = (assetsData || []).map((a: any) => a.id);
  const [{ data: maintData }, names] = await Promise.all([
    assetIds.length > 0
      ? (supabase as any)
          .from('asset_maintenance_log')
          .select('*')
          .in('asset_id', assetIds)
          .order('maintenance_date', { ascending: false })
      : Promise.resolve({ data: [] }),
    getFarmMemberNames(farmId),
  ]);

  return (assetsData || []).map((asset: any) => {
    const logs: MaintenanceEntry[] = (maintData || [])
      .filter((m: any) => m.asset_id === asset.id)
      .map((m: any) => ({
        id: m.id,
        assetId: m.asset_id,
        date: new Date(m.maintenance_date),
        type: m.maintenance_type as MaintenanceType,
        description: m.description,
        cost: m.cost || undefined,
        performedBy: m.performed_by || undefined,
        loggedBy: m.logged_by || undefined,
        loggedByName: m.logged_by ? names.get(m.logged_by) : undefined,
      }));

    return {
      id: asset.id,
      name: asset.name,
      category: asset.category as AssetCategory,
      status: asset.status as AssetStatus,
      purchaseDate: asset.purchase_date ? new Date(asset.purchase_date) : undefined,
      notes: asset.notes || undefined,
      createdBy: asset.created_by || undefined,
      createdByName: asset.created_by ? names.get(asset.created_by) : undefined,
      createdAt: asset.created_at ? new Date(asset.created_at) : undefined,
      maintenanceLog: logs,
    };
  });
}

export async function createAsset(
  data: Omit<Asset, 'id' | 'maintenanceLog'>,
  farmId: string,
): Promise<{ id?: string; error?: string }> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const actor = gate.actor;

  const supabase = await createClient();

  const { data: created, error } = await (supabase as any)
    .from('assets')
    .insert({
      farm_id: farmId,
      name: data.name,
      category: data.category,
      status: data.status,
      purchase_date: data.purchaseDate?.toISOString().split('T')[0],
      notes: data.notes,
      created_by: actor.userId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Inventory] Failed to insert asset:', error.message);
    return { error: 'Could not save the asset. Please try again.' };
  }

  revalidatePath(`/${farmId}/inventory`);
  return { id: created.id };
}

/**
 * Workers may record maintenance they carried out — see the role matrix in
 * 20260909000000_tenant_isolation.sql. `performedBy` is free text naming who
 * did the work (often a contractor); `logged_by` is the account that entered
 * the row, and it is the field that answers for the entry.
 */
export async function logMaintenance(
  assetId: string,
  data: Omit<MaintenanceEntry, 'id' | 'assetId' | 'loggedBy' | 'loggedByName'>,
  farmId: string,
): Promise<{ error?: string }> {
  const gate = await requireFarmRole(farmId, 'worker');
  if (!gate.ok) return { error: gate.error };
  const actor = gate.actor;

  const supabase = await createClient();

  const { error } = await (supabase as any)
    .from('asset_maintenance_log')
    .insert({
      asset_id: assetId,
      maintenance_date: data.date.toISOString().split('T')[0],
      maintenance_type: data.type,
      description: data.description,
      cost: data.cost,
      performed_by: data.performedBy,
      logged_by: actor.userId,
    });

  if (error) {
    console.error('[Inventory] Failed to insert maintenance log:', error.message);
    return { error: 'Could not save the maintenance entry.' };
  }

  revalidatePath(`/${farmId}/inventory`);
  return {};
}

export async function getConsumables(farmId: string): Promise<Consumable[]> {
  const supabase = await createClient();

  const { data: consumablesData, error: consError } = await (supabase as any)
    .from('consumables')
    .select('*')
    .eq('farm_id', farmId)
    .order('name', { ascending: true });

  if (consError) {
    console.error('[Inventory] Failed to load consumables:', consError.message);
    return [];
  }

  const consumableIds = (consumablesData || []).map((c: any) => c.id);
  const [{ data: usageData }, { data: calendarData }, names] = await Promise.all([
    consumableIds.length > 0
      ? (supabase as any)
          .from('consumable_usage_log')
          .select('*')
          .in('consumable_id', consumableIds)
          .order('usage_date', { ascending: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from('calendar_events').select('id, title'),
    getFarmMemberNames(farmId),
  ]);

  const calendarMap = new Map((calendarData || []).map(c => [c.id, c.title]));

  return (consumablesData || []).map((cons: any) => {
    const logs: UsageEntry[] = (usageData || [])
      .filter((u: any) => u.consumable_id === cons.id)
      .map((u: any) => ({
        id: u.id,
        consumableId: u.consumable_id,
        date: new Date(u.usage_date),
        quantity: Number(u.quantity),
        entryType: (u.entry_type ?? 'usage') as LedgerEntryType,
        balanceAfter: u.balance_after === null || u.balance_after === undefined ? undefined : Number(u.balance_after),
        calendarEventId: u.calendar_event_id || undefined,
        calendarEventTitle: u.calendar_event_id ? calendarMap.get(u.calendar_event_id) : undefined,
        block: u.block || undefined,
        notes: u.notes || undefined,
        loggedBy: u.logged_by || undefined,
        loggedByName: u.logged_by ? names.get(u.logged_by) : undefined,
      }));

    return {
      id: cons.id,
      name: cons.name,
      category: cons.category as ConsumableCategory,
      unit: cons.unit,
      startingBalance: Number(cons.starting_balance),
      currentBalance: Number(cons.current_balance),
      minimumStock: cons.minimum_stock ? Number(cons.minimum_stock) : undefined,
      createdBy: cons.created_by || undefined,
      createdByName: cons.created_by ? names.get(cons.created_by) : undefined,
      usageLog: logs,
    };
  });
}

export async function createConsumable(
  data: Omit<Consumable, 'id' | 'usageLog' | 'currentBalance'>,
  farmId: string,
): Promise<{ id?: string; error?: string }> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const actor = gate.actor;

  const supabase = await createClient();

  const { data: created, error } = await (supabase as any)
    .from('consumables')
    .insert({
      farm_id: farmId,
      name: data.name,
      category: data.category,
      unit: data.unit,
      starting_balance: data.startingBalance,
      current_balance: data.startingBalance,
      minimum_stock: data.minimumStock,
      created_by: actor.userId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Inventory] Failed to insert consumable:', error.message);
    return { error: 'Could not save the consumable. Please try again.' };
  }

  revalidatePath(`/${farmId}/inventory`);
  return { id: created.id };
}

export async function logUsage(
  consumableId: string,
  data: Omit<UsageEntry, 'id' | 'consumableId' | 'calendarEventTitle' | 'loggedBy' | 'loggedByName' | 'entryType' | 'balanceAfter'>,
  newBalance: number,
  farmId: string,
): Promise<{ error?: string }> {
  const gate = await requireFarmRole(farmId, 'worker');
  if (!gate.ok) return { error: gate.error };
  const actor = gate.actor;

  const supabase = await createClient();

  const { error: logError } = await (supabase as any)
    .from('consumable_usage_log')
    .insert({
      consumable_id: consumableId,
      usage_date: data.date.toISOString().split('T')[0],
      quantity: data.quantity,
      entry_type: 'usage',
      balance_after: newBalance,
      calendar_event_id: data.calendarEventId || null,
      block: data.block || null,
      notes: data.notes || null,
      logged_by: actor.userId,
    });

  if (logError) {
    console.error('[Inventory] Failed to insert usage log:', logError.message);
    return { error: 'Could not record the usage.' };
  }

  const { error: updateError } = await (supabase as any)
    .from('consumables')
    .update({ current_balance: newBalance })
    .eq('id', consumableId);

  if (updateError) {
    console.error('[Inventory] Failed to update consumable balance:', updateError.message);
    return { error: 'Usage was recorded but the balance did not update.' };
  }

  revalidatePath(`/${farmId}/inventory`);
  return {};
}

/**
 * Adding stock used to move both balances and leave no trace of who did it or
 * when. It now writes a 'restock' line to the same ledger as consumption, so
 * every movement in a consumable's balance has an author.
 */
export async function addStock(
  consumableId: string,
  quantity: number,
  farmId: string,
  notes?: string,
): Promise<{ error?: string }> {
  const gate = await requireFarmRole(farmId, 'supervisor');
  if (!gate.ok) return { error: gate.error };
  const actor = gate.actor;

  if (!(quantity > 0)) return { error: 'Quantity must be greater than zero.' };

  const supabase = await createClient();

  const { data: cons } = await (supabase as any)
    .from('consumables')
    .select('current_balance, starting_balance, farm_id')
    .eq('id', consumableId)
    .single();

  if (!cons) return { error: 'That consumable no longer exists.' };
  if (cons.farm_id !== farmId) return { error: 'That consumable belongs to another farm.' };

  const newCurrentBalance  = Number(cons.current_balance)  + quantity;
  const newStartingBalance = Number(cons.starting_balance) + quantity;

  const { error } = await (supabase as any)
    .from('consumables')
    .update({ current_balance: newCurrentBalance, starting_balance: newStartingBalance })
    .eq('id', consumableId);

  if (error) {
    console.error('[Inventory] Failed to add stock:', error.message);
    return { error: 'Could not add the stock.' };
  }

  const { error: ledgerError } = await (supabase as any)
    .from('consumable_usage_log')
    .insert({
      consumable_id: consumableId,
      usage_date: new Date().toISOString().split('T')[0],
      quantity,
      entry_type: 'restock',
      balance_after: newCurrentBalance,
      notes: notes || null,
      logged_by: actor.userId,
    });

  if (ledgerError) {
    // The balance moved but the ledger line did not land — say so rather than
    // leaving an unexplained jump in the stock level.
    console.error('[Inventory] Stock added but ledger entry failed:', ledgerError.message);
    revalidatePath(`/${farmId}/inventory`);
    return { error: 'Stock was added but could not be recorded in the log. Tell an admin.' };
  }

  revalidatePath(`/${farmId}/inventory`);
  return {};
}

export async function getRecentCalendarEvents(farmId?: string) {
  const supabase = await createClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let query = supabase
    .from('calendar_events')
    .select('id, title, start_date, type')
    .gte('start_date', thirtyDaysAgo.toISOString())
    .order('start_date', { ascending: false });

  // calendar_events carries farm_id since 20260909000000_tenant_isolation.sql,
  // so this no longer has to route through the farm's block ids — and no
  // longer pulls in other tenants' farm-wide (block_id IS NULL) events.
  if (farmId) query = (query as any).eq('farm_id', farmId);

  const { data, error } = await query;

  if (error) {
    console.warn('[Inventory] Failed to fetch calendar events', error);
    return [];
  }

  return data.map(d => ({
    id: d.id,
    title: d.title,
    date: new Date(d.start_date),
    type: d.type
  }));
}
