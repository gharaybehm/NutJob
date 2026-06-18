/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { Asset, Consumable, MaintenanceEntry, UsageEntry, AssetCategory, AssetStatus, ConsumableCategory, MaintenanceType } from '@/app/components/inventory/types';

// ============================================================================
// ASSETS
// ============================================================================

export async function getAssets(): Promise<Asset[]> {
  // Try to fetch from DB if tables exist, but since this is local-first,
  // we'll return some mock data if it fails.
  const supabase = await createClient();
  
  const { data: assetsData, error: assetsError } = await (supabase as any)
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });

  if (assetsError) {
    // Return mock data if tables don't exist yet
    return [
      {
        id: 'mock-asset-1',
        name: 'John Deere Tractor',
        category: 'vehicle',
        status: 'operational',
        purchaseDate: new Date('2023-01-15'),
        notes: 'Main tractor for block A and B',
        maintenanceLog: [
          {
            id: 'mock-maint-1',
            assetId: 'mock-asset-1',
            date: new Date('2024-02-10'),
            type: 'routine',
            description: 'Oil change and filter replacement',
            cost: 250,
            performedBy: 'Farm Manager'
          }
        ]
      },
      {
        id: 'mock-asset-2',
        name: 'Spraying Machine',
        category: 'machinery',
        status: 'needs-maintenance',
        notes: 'Nozzles might need replacement soon',
        maintenanceLog: []
      }
    ];
  }

  // Fetch maintenance logs
  const { data: maintData } = await (supabase as any)
    .from('asset_maintenance_log')
    .select('*')
    .order('maintenance_date', { ascending: false });

  // Map to Asset objects
  return (assetsData || []).map((asset: any) => {
    const logs = (maintData || [])
      .filter((m: any) => m.asset_id === asset.id)
      .map((m: any) => ({
        id: m.id,
        assetId: m.asset_id,
        date: new Date(m.maintenance_date),
        type: m.maintenance_type as MaintenanceType,
        description: m.description,
        cost: m.cost || undefined,
        performedBy: m.performed_by || undefined
      }));

    return {
      id: asset.id,
      name: asset.name,
      category: asset.category as AssetCategory,
      status: asset.status as AssetStatus,
      purchaseDate: asset.purchase_date ? new Date(asset.purchase_date) : undefined,
      notes: asset.notes || undefined,
      maintenanceLog: logs
    };
  });
}

export async function createAsset(data: Omit<Asset, 'id' | 'maintenanceLog'>): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: created, error } = await (supabase as any)
    .from('assets')
    .insert({
      name: data.name,
      category: data.category,
      status: data.status,
      purchase_date: data.purchaseDate?.toISOString().split('T')[0],
      notes: data.notes,
      created_by: user?.id
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[Inventory] Failed to insert asset to DB, returning mock ID', error);
    revalidatePath('/inventory');
    return { id: `mock-asset-${Date.now()}` };
  }

  revalidatePath('/inventory');
  return { id: created.id };
}

export async function logMaintenance(assetId: string, data: Omit<MaintenanceEntry, 'id' | 'assetId'>) {
  const supabase = await createClient();

  const { error } = await (supabase as any)
    .from('asset_maintenance_log')
    .insert({
      asset_id: assetId,
      maintenance_date: data.date.toISOString().split('T')[0],
      maintenance_type: data.type,
      description: data.description,
      cost: data.cost,
      performed_by: data.performedBy
    });

  if (error) {
    console.warn('[Inventory] Failed to insert maintenance log to DB', error);
  } else {
    // Optionally update asset status if needed, but keeping it simple for now
  }

  revalidatePath('/inventory');
}

// ============================================================================
// CONSUMABLES
// ============================================================================

export async function getConsumables(): Promise<Consumable[]> {
  const supabase = await createClient();
  
  const { data: consumablesData, error: consError } = await (supabase as any)
    .from('consumables')
    .select('*')
    .order('name', { ascending: true });

  if (consError) {
    // Return mock data if tables don't exist yet
    return [
      {
        id: 'mock-cons-1',
        name: 'Fertilizer (NPK)',
        category: 'fertilizer',
        unit: 'kg',
        startingBalance: 1000,
        currentBalance: 450,
        minimumStock: 200,
        usageLog: [
          {
            id: 'mock-usage-1',
            consumableId: 'mock-cons-1',
            date: new Date('2026-05-15'),
            quantity: 150,
            block: 'Block A',
            notes: 'Spring application'
          }
        ]
      },
      {
        id: 'mock-cons-2',
        name: 'Pesticide (Mancozeb)',
        category: 'pesticide',
        unit: 'L',
        startingBalance: 50,
        currentBalance: 5,
        minimumStock: 10,
        usageLog: []
      }
    ];
  }

  // Fetch usage logs with joined calendar event titles if possible
  // We'll just fetch the logs and calendar events separately for simplicity
  const { data: usageData } = await (supabase as any)
    .from('consumable_usage_log')
    .select('*')
    .order('usage_date', { ascending: false });

  const { data: calendarData } = await supabase
    .from('calendar_events')
    .select('id, title');

  const calendarMap = new Map((calendarData || []).map(c => [c.id, c.title]));

  // Map to Consumable objects
  return (consumablesData || []).map((cons: any) => {
    const logs = (usageData || [])
      .filter((u: any) => u.consumable_id === cons.id)
      .map((u: any) => ({
        id: u.id,
        consumableId: u.consumable_id,
        date: new Date(u.usage_date),
        quantity: Number(u.quantity),
        calendarEventId: u.calendar_event_id || undefined,
        calendarEventTitle: u.calendar_event_id ? calendarMap.get(u.calendar_event_id) : undefined,
        block: u.block || undefined,
        notes: u.notes || undefined,
        loggedBy: u.logged_by || undefined
      }));

    return {
      id: cons.id,
      name: cons.name,
      category: cons.category as ConsumableCategory,
      unit: cons.unit,
      startingBalance: Number(cons.starting_balance),
      currentBalance: Number(cons.current_balance),
      minimumStock: cons.minimum_stock ? Number(cons.minimum_stock) : undefined,
      usageLog: logs
    };
  });
}

export async function createConsumable(data: Omit<Consumable, 'id' | 'usageLog' | 'currentBalance'>): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: created, error } = await (supabase as any)
    .from('consumables')
    .insert({
      name: data.name,
      category: data.category,
      unit: data.unit,
      starting_balance: data.startingBalance,
      current_balance: data.startingBalance, // Initialize current = starting
      minimum_stock: data.minimumStock,
      created_by: user?.id
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[Inventory] Failed to insert consumable to DB, returning mock ID', error);
    revalidatePath('/inventory');
    return { id: `mock-cons-${Date.now()}` };
  }

  revalidatePath('/inventory');
  return { id: created.id };
}

export async function logUsage(consumableId: string, data: Omit<UsageEntry, 'id' | 'consumableId' | 'calendarEventTitle' | 'loggedBy'>, newBalance: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Insert log
  const { error: logError } = await (supabase as any)
    .from('consumable_usage_log')
    .insert({
      consumable_id: consumableId,
      usage_date: data.date.toISOString().split('T')[0],
      quantity: data.quantity,
      calendar_event_id: data.calendarEventId || null,
      block: data.block || null,
      notes: data.notes || null,
      logged_by: user?.id
    });

  if (logError) {
    console.warn('[Inventory] Failed to insert usage log to DB', logError);
  }

  // 2. Update current balance
  const { error: updateError } = await (supabase as any)
    .from('consumables')
    .update({ current_balance: newBalance })
    .eq('id', consumableId);

  if (updateError) {
    console.warn('[Inventory] Failed to update consumable balance in DB', updateError);
  }

  revalidatePath('/inventory');
}

export async function getRecentCalendarEvents() {
  const supabase = await createClient();
  
  // Fetch events from last 30 days and future 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, title, start_date, type')
    .gte('start_date', thirtyDaysAgo.toISOString())
    .order('start_date', { ascending: false });
    
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

export async function addStock(consumableId: string, quantity: number) {
  const supabase = await createClient();

  const { data: cons } = await (supabase as any)
    .from('consumables')
    .select('current_balance, starting_balance')
    .eq('id', consumableId)
    .single();

  if (!cons) return;

  const { error } = await (supabase as any)
    .from('consumables')
    .update({
      current_balance:  Number(cons.current_balance)  + quantity,
      starting_balance: Number(cons.starting_balance) + quantity,
    })
    .eq('id', consumableId);

  if (error) {
    console.warn('[Inventory] Failed to add stock:', error);
  }

  revalidatePath('/inventory');
}
