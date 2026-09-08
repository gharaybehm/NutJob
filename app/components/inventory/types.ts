export type AssetCategory = 'machinery' | 'vehicle' | 'tool' | 'equipment' | 'other';
export type AssetStatus = 'operational' | 'needs-maintenance' | 'out-of-service';
export type MaintenanceType = 'routine' | 'repair' | 'inspection';
export type ConsumableCategory = 'fertilizer' | 'pesticide' | 'herbicide' | 'fuel' | 'parts' | 'other';

/** Every balance movement is a ledger line, not just consumption. */
export type LedgerEntryType = 'usage' | 'restock' | 'correction';

export interface MaintenanceEntry {
  id: string;
  assetId: string;
  date: Date;
  type: MaintenanceType;
  description: string;
  cost?: number;
  /** Free text: who serviced it. Often a contractor with no account. */
  performedBy?: string;
  /** The account that recorded the entry. */
  loggedBy?: string;
  loggedByName?: string;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  purchaseDate?: Date;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: Date;
  maintenanceLog: MaintenanceEntry[];
}

export interface UsageEntry {
  id: string;
  consumableId: string;
  date: Date;
  quantity: number;
  entryType: LedgerEntryType;
  /** Balance immediately after this entry. Absent on pre-attribution rows. */
  balanceAfter?: number;
  calendarEventId?: string;
  calendarEventTitle?: string;
  block?: string;
  notes?: string;
  loggedBy?: string;
  loggedByName?: string;
}

export interface Consumable {
  id: string;
  name: string;
  category: ConsumableCategory;
  unit: string;
  startingBalance: number;
  currentBalance: number;
  minimumStock?: number;
  createdBy?: string;
  createdByName?: string;
  usageLog: UsageEntry[];
}

export const ASSET_SUGGESTIONS = [
  'Tractor', 
  'Spraying Machine', 
  'Irrigation Pump', 
  'Harvester', 
  'ATV/UTV', 
  'Chainsaw', 
  'Mower', 
  'Trailer', 
  'Fertilizer Spreader', 
  'Soil Sampler'
];

export const CONSUMABLE_SUGGESTIONS = [
  'Fertilizer (NPK)', 
  'Calcium Nitrate', 
  'Potassium Sulphate', 
  'Pesticide', 
  'Fungicide', 
  'Herbicide', 
  'Diesel', 
  'Engine Oil', 
  'Spray Nozzles', 
  'Irrigation Fittings', 
  'Tree Guards'
];
