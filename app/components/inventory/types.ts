export type AssetCategory = 'machinery' | 'vehicle' | 'tool' | 'equipment' | 'other';
export type AssetStatus = 'operational' | 'needs-maintenance' | 'out-of-service';
export type MaintenanceType = 'routine' | 'repair' | 'inspection';
export type ConsumableCategory = 'fertilizer' | 'pesticide' | 'herbicide' | 'fuel' | 'parts' | 'other';

export interface MaintenanceEntry {
  id: string;
  assetId: string;
  date: Date;
  type: MaintenanceType;
  description: string;
  cost?: number;
  performedBy?: string;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  purchaseDate?: Date;
  notes?: string;
  maintenanceLog: MaintenanceEntry[];
}

export interface UsageEntry {
  id: string;
  consumableId: string;
  date: Date;
  quantity: number;
  calendarEventId?: string;
  calendarEventTitle?: string;
  block?: string;
  notes?: string;
  loggedBy?: string;
}

export interface Consumable {
  id: string;
  name: string;
  category: ConsumableCategory;
  unit: string;
  startingBalance: number;
  currentBalance: number;
  minimumStock?: number;
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
