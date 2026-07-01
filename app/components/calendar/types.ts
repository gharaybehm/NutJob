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
  irrigation:      { bg: 'bg-blue-soft',   text: 'text-blue',   ring: 'ring-blue/20',   dot: 'bg-blue' },
  fertigation:     { bg: 'bg-gold-soft',   text: 'text-gold',   ring: 'ring-gold/20',   dot: 'bg-gold' },
  spraying:        { bg: 'bg-purple-soft', text: 'text-purple', ring: 'ring-purple/20', dot: 'bg-purple' },
  pruning:         { bg: 'bg-teal-soft',   text: 'text-teal',   ring: 'ring-teal/20',   dot: 'bg-teal' },
  scouting:        { bg: 'bg-green-soft',  text: 'text-green',  ring: 'ring-green/20',  dot: 'bg-green' },
  pollinating:     { bg: 'bg-amber-soft',  text: 'text-amber',  ring: 'ring-amber/20',  dot: 'bg-amber' },
  tilling:         { bg: 'bg-tile-2',      text: 'text-ink-2',  ring: 'ring-ink-4/20',  dot: 'bg-ink-3' },
  plowing:         { bg: 'bg-tile-2',      text: 'text-ink-2',  ring: 'ring-ink-4/20',  dot: 'bg-ink-3' },
  weeding:         { bg: 'bg-tile-2',      text: 'text-ink-2',  ring: 'ring-ink-4/20',  dot: 'bg-ink-3' },
  'weather-alert': { bg: 'bg-red-soft',    text: 'text-red',    ring: 'ring-red/20',    dot: 'bg-red' },
  other:           { bg: 'bg-tile-2',      text: 'text-ink-2',  ring: 'ring-ink-4/20',  dot: 'bg-ink-3' },
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
