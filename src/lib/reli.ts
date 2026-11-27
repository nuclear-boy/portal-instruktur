import type { Session, SosiogramData } from '../../shared/types';

export type ReliValues = [number, number, number, number];
export type ReliKey = 'r' | 'e' | 'l' | 'i';

export const RELI_LABELS = ['Respon', 'Emosi', 'Logika', 'Integritas'] as const;

export const RELI_BAR_COLORS: [number, number, number][] = [
  [47, 111, 98],
  [194, 138, 43],
  [74, 111, 165],
  [168, 80, 107],
];

export const RELI_BAR_COLORS_CSS = RELI_BAR_COLORS.map(
  ([red, green, blue]) => `rgb(${red}, ${green}, ${blue})`,
);

export const RELI_SCORE_MIN = 0;
export const RELI_SCORE_MAX = 10;

export type ReliPredicateTone = 'green' | 'blue' | 'amber' | 'red' | 'neutral';

export interface ReliPredicate {
  label: string;
  short: string;
  tone: ReliPredicateTone;
  badgeClass: string;
  bgHex: string;
  textHex: string;
  rgb: [number, number, number];
  bgRgb: [number, number, number];
  minAvg: number;
}

export const RELI_PREDICATES: readonly ReliPredicate[] = [
  {
    label: 'Sangat Baik',
    short: 'SB',
    tone: 'green',
    badgeClass: 'badge-green',
    bgHex: '#dcfce7',
    textHex: '#166534',
    rgb: [22, 101, 52],
    bgRgb: [220, 252, 231],
    minAvg: 8.0,
  },
  {
    label: 'Baik',
    short: 'B',
    tone: 'blue',
    badgeClass: 'badge-blue',
    bgHex: '#dbeafe',
    textHex: '#1d4ed8',
    rgb: [29, 78, 216],
    bgRgb: [219, 234, 254],
    minAvg: 6.5,
  },
  {
    label: 'Cukup',
    short: 'C',
    tone: 'amber',
    badgeClass: 'badge-amber',
    bgHex: '#fef3c7',
    textHex: '#b45309',
    rgb: [180, 83, 9],
    bgRgb: [254, 243, 199],
    minAvg: 5.0,
  },
  {
    label: 'Perlu Pembinaan',
    short: 'PP',
    tone: 'red',
    badgeClass: 'badge-red',
    bgHex: '#fee2e2',
    textHex: '#b42318',
    rgb: [180, 35, 24],
    bgRgb: [254, 226, 226],
    minAvg: 0,
  },
];

export const RELI_PREDICATE_EMPTY: ReliPredicate = {
  label: 'Belum Dinilai',
  short: '—',
  tone: 'neutral',
  badgeClass: 'badge-neutral',
  bgHex: '#f1f5f9',
  textHex: '#475569',
  rgb: [71, 85, 105],
  bgRgb: [241, 245, 249],
  minAvg: -1,
};

export function reliPredicate(aspectAvg: number, scoredSessions = 1): ReliPredicate {
  if (scoredSessions <= 0 || !Number.isFinite(aspectAvg)) return RELI_PREDICATE_EMPTY;
  const rounded = Number(aspectAvg.toFixed(2));
  for (const item of RELI_PREDICATES) {
    if (rounded >= item.minAvg) return item;
  }
  return RELI_PREDICATES[RELI_PREDICATES.length - 1];
}

export const RELI_PREDICATE_LEGEND =
  'Predikat (rata-rata aspek 0–10): Sangat Baik ≥ 8.0 · Baik 6.5–7.9 · Cukup 5.0–6.4 · Perlu Pembinaan < 5.0';

export interface ReliMeta {
  key: ReliKey;
  short: 'R' | 'E' | 'L' | 'I';
  label: string;
  color: string;
  description: string;
}

export const RELI_META: readonly ReliMeta[] = [
  {
    key: 'r',
    short: 'R',
    label: RELI_LABELS[0],
    color: RELI_BAR_COLORS_CSS[0],
    description: 'Daya tanggap, antusiasme, dan inisiatif bertindak',
  },
  {
    key: 'e',
    short: 'E',
    label: RELI_LABELS[1],
    color: RELI_BAR_COLORS_CSS[1],
    description: 'Kematangan diri, menerima masukan, empati rekan',
  },
  {
    key: 'l',
    short: 'L',
    label: RELI_LABELS[2],
    color: RELI_BAR_COLORS_CSS[2],
    description: 'Runtut berpikir, argumentasi berdasar data/rujukan',
  },
  {
    key: 'i',
    short: 'I',
    label: RELI_LABELS[3],
    color: RELI_BAR_COLORS_CSS[3],
    description: 'Kejujuran sikap, kepedulian & keutuhan kelompok',
  },
];

export function parseReliScore(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return RELI_SCORE_MIN;
  return Math.min(RELI_SCORE_MAX, Math.max(RELI_SCORE_MIN, parsed));
}

export function normalizeReliScore(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return String(parseReliScore(text));
}

export interface ReliPersonRow {
  id?: string;
  name: string;
  values: ReliValues;
}

export function seatReliValues(sosiogram: SosiogramData, seatId: string): ReliValues {
  const totals: ReliValues = [0, 0, 0, 0];
  (sosiogram.scores[seatId] || []).forEach((value, index) => {
    totals[index % 4] += parseReliScore(value);
  });
  return totals;
}

export function peopleReliRows(sosiogram: SosiogramData): ReliPersonRow[] {
  return sosiogram.seats
    .filter((seat) => seat.name.trim())
    .map((seat) => ({
      id: seat.participantId,
      name: seat.name.trim(),
      values: seatReliValues(sosiogram, seat.id),
    }))
    .sort(
      (a, b) =>
        b.values.reduce((total, value) => total + value, 0) -
        a.values.reduce((total, value) => total + value, 0),
    );
}

export function sessionPdfFilename(session: Session): string {
  const topic =
    String(session.topic || '')
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'Materi';
  const dateValue = String(session.date || '').slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? dateValue : 'tanggal';
  const local = session.localId ? `L${session.localId}` : 'L0';
  return `${topic}-${date}-${local}.pdf`;
}
