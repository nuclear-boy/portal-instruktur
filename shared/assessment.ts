export interface AssessmentItem {
  key: string;
  label: string;
}

export interface AssessmentGroup {
  key: string;
  label: string;
  items: AssessmentItem[];
}

export const ASSESSMENT_GROUPS: AssessmentGroup[] = [
  {
    key: 'penampilan',
    label: 'Penampilan',
    items: [
      { key: 'suara', label: 'Suara' },
      { key: 'cara_berpakaian', label: 'Cara Berpakaian' },
      { key: 'sikap_gaya', label: 'Sikap & Gaya' },
      { key: 'ekspresi_wajah', label: 'Ekspresi Wajah' },
    ],
  },
  {
    key: 'bahasa',
    label: 'Bahasa',
    items: [
      { key: 'tata_bahasa', label: 'Tata Bahasa' },
      { key: 'kosa_kata', label: 'Pemilihan Kosa Kata' },
      { key: 'kemudahan_memahami', label: 'Kemudahan Memahami Kalimat' },
      { key: 'sistematika_kalimat', label: 'Sistematika Kalimat' },
    ],
  },
  {
    key: 'materi',
    label: 'Materi',
    items: [
      { key: 'penguasaan_materi', label: 'Penguasaan Materi' },
      { key: 'sistematika_pembahasan', label: 'Sistematika Pembahasan' },
      { key: 'metode_penyampaian', label: 'Metode Penyampaian' },
      { key: 'persiapan', label: 'Persiapan' },
    ],
  },
];

export const ASSESSMENT_ITEMS = ASSESSMENT_GROUPS.flatMap((group) => group.items);

export const ASSESSMENT_SCALE = [
  { value: 1, label: 'Sangat Kurang' },
  { value: 2, label: 'Kurang' },
  { value: 3, label: 'Cukup' },
  { value: 4, label: 'Baik' },
  { value: 5, label: 'Sangat Baik' },
];

export function assessmentGroupAverage(
  scores: Record<string, number>,
  group: AssessmentGroup,
): number {
  const values = group.items.map((item) => Number(scores[item.key]) || 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function assessmentOverall(scores: Record<string, number>): number {
  const values = ASSESSMENT_ITEMS.map((item) => Number(scores[item.key]) || 0);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function assessmentTone(score: number): string {
  if (score >= 4.5) return 'badge-green';
  if (score >= 3.5) return 'badge-blue';
  if (score >= 2.5) return 'badge-amber';
  return 'badge-red';
}
