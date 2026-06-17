// ─── Activity Types ──────────────────────────────────────────────────────────

export type ActivityType =
  | 'irrigation'
  | 'fertigation'
  | 'spraying'
  | 'pruning'
  | 'scouting'
  | 'pollinating'
  | 'tilling'
  | 'plowing'
  | 'weeding'
  | 'weather-alert'
  | 'other';

// ─── Colour mapping ──────────────────────────────────────────────────────────

export const ACTIVITY_COLORS: Record<
  ActivityType,
  { bg: string; text: string; ring: string; dot: string }
> = {
  irrigation:    { bg: 'bg-blue-100',    text: 'text-blue-700',    ring: 'ring-blue-200',    dot: 'bg-blue-500' },
  fertigation:   { bg: 'bg-green-100',   text: 'text-green-700',   ring: 'ring-green-200',   dot: 'bg-green-600' },
  spraying:      { bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-200',   dot: 'bg-amber-500' },
  pruning:       { bg: 'bg-purple-100',  text: 'text-purple-700',  ring: 'ring-purple-200',  dot: 'bg-purple-500' },
  scouting:      { bg: 'bg-orange-100',  text: 'text-orange-700',  ring: 'ring-orange-200',  dot: 'bg-orange-500' },
  pollinating:   { bg: 'bg-yellow-100',  text: 'text-yellow-700',  ring: 'ring-yellow-200',  dot: 'bg-yellow-500' },
  tilling:       { bg: 'bg-stone-100',   text: 'text-stone-700',   ring: 'ring-stone-200',   dot: 'bg-stone-500' },
  plowing:       { bg: 'bg-rose-100',    text: 'text-rose-700',    ring: 'ring-rose-200',    dot: 'bg-rose-500' },
  weeding:       { bg: 'bg-lime-100',    text: 'text-lime-700',    ring: 'ring-lime-200',    dot: 'bg-lime-500' },
  'weather-alert': { bg: 'bg-red-100',   text: 'text-red-700',     ring: 'ring-red-200',     dot: 'bg-red-500' },
  other:         { bg: 'bg-slate-100',   text: 'text-slate-700',   ring: 'ring-slate-200',   dot: 'bg-slate-500' },
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  irrigation:      'Irrigation',
  fertigation:     'Fertigation',
  spraying:        'Spraying',
  pruning:         'Pruning',
  scouting:        'Scouting',
  pollinating:     'Pollinating',
  tilling:         'Tilling',
  plowing:         'Plowing',
  weeding:         'Weeding',
  'weather-alert': 'Weather Alert',
  other:           'Other',
};

// ─── Block list (mock — swap for Supabase query later) ───────────────────────

export const BLOCKS = ['Block A', 'Block B', 'Block C', 'Block D', 'Block E', 'Block F'];

// ─── Material types ──────────────────────────────────────────────────────────

export interface MaterialLine {
  id: string;
  consumableId: string;
  consumableName: string;
  unit: string;
  plannedQuantity: number;
  currentBalance: number;
}

export interface PlannedMaterial {
  consumableId: string;
  consumableName: string;
  unit: string;
  plannedQuantity: number;
}

// ─── Event interface ─────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  type: ActivityType;
  startDate: Date;
  endDate: Date;
  block?: string;
  notes?: string;
  completedAt?: Date;
  details?: {
    // Irrigation
    durationHours?: number;
    litresPerTree?: number;
    repeatDays?: number;
    // Fertigation
    fertilizerType?: string;
    amountKgPerTree?: number;
    growthStageNote?: string;
    // Spraying
    pesticideType?: string;
    amountLPerHa?: number;
    pestTarget?: string;
    // Pruning
    pruningType?: string;
  };
  materials?: MaterialLine[];
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function d(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

// ─── Mock events (May–June 2026) ─────────────────────────────────────────────

export const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Irrigation Run — Block A & B',
    type: 'irrigation',
    startDate: d(2026, 5, 9, 18, 0),
    endDate:   d(2026, 5, 9, 22, 0),
    block: 'Block A',
    details: { durationHours: 4, litresPerTree: 2, repeatDays: 14 },
    notes: 'Summer schedule: 4 h × 2 L/tree every 2 weeks',
  },
  {
    id: 'e2',
    title: 'Irrigation Run — Block C',
    type: 'irrigation',
    startDate: d(2026, 5, 12, 6, 0),
    endDate:   d(2026, 5, 12, 10, 0),
    block: 'Block C',
    details: { durationHours: 4, litresPerTree: 2.5, repeatDays: 14 },
  },
  {
    id: 'e3',
    title: 'Fertigation — Nitrogen (Block A)',
    type: 'fertigation',
    startDate: d(2026, 5, 10, 6, 0),
    endDate:   d(2026, 5, 10, 9, 0),
    block: 'Block A',
    details: {
      fertilizerType: 'Calcium Nitrate',
      amountKgPerTree: 0.3,
      growthStageNote: 'Nut fill — kernel development phase',
    },
  },
  {
    id: 'e4',
    title: 'Fungicide Spray — Block B',
    type: 'spraying',
    startDate: d(2026, 5, 11, 7, 0),
    endDate:   d(2026, 5, 11, 10, 0),
    block: 'Block B',
    details: {
      pesticideType: 'Mancozeb',
      amountLPerHa: 2.5,
      pestTarget: 'Alternaria leaf spot',
    },
    notes: 'Apply before 10:00 to avoid heat',
  },
  {
    id: 'e5',
    title: 'Orchard Scouting — All Blocks',
    type: 'scouting',
    startDate: d(2026, 5, 14, 8, 0),
    endDate:   d(2026, 5, 14, 12, 0),
    notes: 'Weekly pest & disease monitoring. Check for navel orangeworm.',
  },
  {
    id: 'e6',
    title: 'Irrigation Run — Block D & E',
    type: 'irrigation',
    startDate: d(2026, 5, 16, 18, 0),
    endDate:   d(2026, 5, 16, 22, 0),
    block: 'Block D',
    details: { durationHours: 4, litresPerTree: 2, repeatDays: 14 },
  },
  {
    id: 'e7',
    title: 'Fertigation — Potassium (Block C & D)',
    type: 'fertigation',
    startDate: d(2026, 5, 18, 6, 0),
    endDate:   d(2026, 5, 18, 9, 0),
    block: 'Block C',
    details: {
      fertilizerType: 'Potassium Sulphate',
      amountKgPerTree: 0.2,
      growthStageNote: 'Hull split preparation',
    },
  },
  {
    id: 'e8',
    title: 'Insecticide Spray — Block A',
    type: 'spraying',
    startDate: d(2026, 5, 20, 6, 30),
    endDate:   d(2026, 5, 20, 9, 0),
    block: 'Block A',
    details: {
      pesticideType: 'Chlorpyrifos',
      amountLPerHa: 1.5,
      pestTarget: 'Leaf-footed plant bug',
    },
  },
  {
    id: 'e9',
    title: 'Irrigation Run — Block A & B',
    type: 'irrigation',
    startDate: d(2026, 5, 23, 18, 0),
    endDate:   d(2026, 5, 23, 22, 0),
    block: 'Block A',
    details: { durationHours: 4, litresPerTree: 2, repeatDays: 14 },
  },
  {
    id: 'e10',
    title: 'Orchard Scouting — All Blocks',
    type: 'scouting',
    startDate: d(2026, 5, 21, 8, 0),
    endDate:   d(2026, 5, 21, 11, 0),
  },
  {
    id: 'e11',
    title: 'Irrigation Run — Block C',
    type: 'irrigation',
    startDate: d(2026, 5, 26, 6, 0),
    endDate:   d(2026, 5, 26, 10, 0),
    block: 'Block C',
    details: { durationHours: 4, litresPerTree: 2.5, repeatDays: 14 },
  },
  {
    id: 'e12',
    title: 'Fertigation — Boron Supplement',
    type: 'fertigation',
    startDate: d(2026, 5, 28, 6, 0),
    endDate:   d(2026, 5, 28, 8, 30),
    block: 'Block E',
    details: {
      fertilizerType: 'Solubor (Boron)',
      amountKgPerTree: 0.05,
      growthStageNote: 'Pre-hull split — kernel sizing',
    },
  },
  {
    id: 'e13',
    title: 'Irrigation Run — Block D & E',
    type: 'irrigation',
    startDate: d(2026, 5, 30, 18, 0),
    endDate:   d(2026, 5, 30, 22, 0),
    block: 'Block D',
    details: { durationHours: 4, litresPerTree: 2, repeatDays: 14 },
  },
  // June
  {
    id: 'e14',
    title: 'Irrigation Run — Block A & B',
    type: 'irrigation',
    startDate: d(2026, 6, 6, 18, 0),
    endDate:   d(2026, 6, 6, 22, 0),
    block: 'Block A',
    details: { durationHours: 4, litresPerTree: 2, repeatDays: 14 },
  },
  {
    id: 'e15',
    title: 'Hull Split Spray — Block A–D',
    type: 'spraying',
    startDate: d(2026, 6, 8, 6, 0),
    endDate:   d(2026, 6, 8, 11, 0),
    block: 'Block A',
    details: {
      pesticideType: 'Cyprodinil + Fludioxonil',
      amountLPerHa: 1.0,
      pestTarget: 'Hull rot (Botrytis / Rhizopus)',
    },
    notes: 'Critical timing — apply at 5–10% hull split',
  },
];
