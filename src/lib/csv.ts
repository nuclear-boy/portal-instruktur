import { ASSESSMENT_GROUPS, ASSESSMENT_ITEMS } from '../../shared/assessment';
import { localLabel } from '../../shared/locals';
import type { Participant, Session, Speaker } from '../../shared/types';
import { communicationMatrixOf } from './communicationFrequency';
import { peopleReliRows, reliPredicate } from './reli';
import {
  buildParticipantReportData,
  buildRecapReportData,
  getParticipantSessionNote,
} from './reportData';
import { attendanceLabel, fmtDate } from './utils';

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ];
  // UTF-8 BOM so Microsoft Excel reads Indonesian characters cleanly
  return `\uFEFF${lines.join('\r\n')}`;
}

export function buildRecapCsv(
  sessions: Session[],
  participants: Participant[],
  speakers: Speaker[],
): string {
  const data = buildRecapReportData(sessions, participants, speakers);
  const headers = [
    'No',
    'Nama Peserta',
    'Lokal',
    'Asal',
    'Sesi Dinilai',
    'Hadir',
    'Terlambat',
    'Izin/Sakit',
    'Alpa',
    'Kehadiran (%)',
    'Rata-rata R',
    'Rata-rata E',
    'Rata-rata L',
    'Rata-rata I',
    'Rata-rata Aspek (0-10)',
    'Rata-rata Total (0-40)',
    'Predikat',
    'Total Akumulasi RELI',
    'Gaya Komunikasi',
    'Rekomendasi Potensi',
    'Catatan Observer',
  ];

  const rows = data.participantRows.map((row, index) => [
    index + 1,
    row.name,
    localLabel(row.localId),
    row.origin || '-',
    row.scoredSessions,
    row.attendance.hadir,
    row.attendance.terlambat,
    row.attendance.izinSakit,
    row.attendance.alpa,
    row.attendance.rate,
    row.avgValues[0].toFixed(1),
    row.avgValues[1].toFixed(1),
    row.avgValues[2].toFixed(1),
    row.avgValues[3].toFixed(1),
    row.aspectAvg.toFixed(2),
    row.totalAvg.toFixed(1),
    row.predicate.label,
    row.totalSum.toFixed(1),
    row.insight?.styleLabel || '-',
    row.insight?.potentialRecommendation || '-',
    row.observerNoteEntries.length
      ? row.observerNoteEntries
          .map((entry) => `[${fmtDate(entry.date, { day: 'numeric', month: 'short' })} · ${entry.topic}] ${entry.note}`)
          .join('; ')
      : '-',
  ]);

  return toCsv(headers, rows);
}

export function buildSessionCsv(session: Session, participants: Participant[]): string {
  const people = peopleReliRows(session.sosiogram);
  const matrix = communicationMatrixOf(session.sosiogram);
  const matrixByName = new Map(matrix.rows.map((row) => [row.name, row]));

  const headers = [
    'No',
    'Nama Peserta',
    'Kehadiran',
    'R',
    'E',
    'L',
    'I',
    'Total (0-40)',
    'Rata-rata Aspek',
    'Predikat',
    'Komunikasi Teman',
    'Komunikasi Pemateri',
    'Catatan Observer',
  ];

  const rows = people.map((person, index) => {
    const att = person.id
      ? session.attendance.find((item) => item.participantId === person.id)?.status
      : undefined;
    const total = person.values.reduce((sum, val) => sum + val, 0);
    const aspectAvg = total / 4;
    const pred = reliPredicate(aspectAvg, 1);
    const comm = matrixByName.get(person.name);
    const participantObj = person.id
      ? participants.find((item) => item.id === person.id)
      : undefined;
    const note = person.id
      ? getParticipantSessionNote(session, person.id)
      : session.sosiogram.seats.find((s) => s.name.trim() === person.name)?.note || '';

    return [
      index + 1,
      participantObj?.name || person.name,
      att ? attendanceLabel(att) : '-',
      person.values[0].toFixed(1),
      person.values[1].toFixed(1),
      person.values[2].toFixed(1),
      person.values[3].toFixed(1),
      total.toFixed(1),
      aspectAvg.toFixed(2),
      pred.label,
      comm?.teman || 0,
      comm?.pemateri || 0,
      note || '-',
    ];
  });

  return toCsv(headers, rows);
}

export function buildParticipantCsv(
  participant: Participant,
  sessions: Session[],
  speakers: Speaker[],
): string {
  const data = buildParticipantReportData(participant, sessions, speakers);
  const headers = [
    'Tanggal',
    'No Sesi',
    'Materi',
    'Pemateri',
    'Kehadiran',
    'R',
    'E',
    'L',
    'I',
    'Total (0-40)',
    'Rata-rata Lokal',
    'Predikat',
    'Interaksi Komunikasi',
    'Catatan Observer',
  ];

  const rows = data.history.map((item) => [
    fmtDate(item.session.date),
    item.session.no || '-',
    item.session.topic,
    item.speakers.join('; ') || '-',
    item.attendance ? attendanceLabel(item.attendance) : '-',
    item.values ? item.values[0].toFixed(1) : '-',
    item.values ? item.values[1].toFixed(1) : '-',
    item.values ? item.values[2].toFixed(1) : '-',
    item.values ? item.values[3].toFixed(1) : '-',
    item.total !== null ? item.total.toFixed(1) : '-',
    item.localAvgTotal !== null ? item.localAvgTotal.toFixed(1) : '-',
    item.predicate.label,
    item.interactions,
    item.observerNote || '-',
  ]);

  return toCsv(headers, rows);
}

export function buildAssessmentsCsv(
  sessions: Session[],
  participants: Participant[],
  speakers: Speaker[],
): string {
  const data = buildRecapReportData(sessions, participants, speakers);
  const headers = [
    'Tanggal',
    'Waktu',
    'Lokal',
    'Materi',
    'Pemateri',
    'Observer',
    ...ASSESSMENT_GROUPS.map((group) => `Rata-rata ${group.label}`),
    'Nilai Akhir',
    ...ASSESSMENT_ITEMS.map((item) => item.label),
    'Catatan Umum',
    'Rekomendasi',
  ];

  const rows = data.assessmentDetails.map((item) => [
    fmtDate(item.assessment.date),
    item.assessment.time || '-',
    localLabel(item.session.localId),
    item.session.topic,
    item.speakerName,
    item.assessment.observerName,
    ...ASSESSMENT_GROUPS.map((group) => (item.groupAverages[group.key] || 0).toFixed(2)),
    item.overall.toFixed(2),
    ...ASSESSMENT_ITEMS.map((aspect) => item.assessment.scores[aspect.key] || 0),
    item.assessment.generalNotes || '-',
    item.assessment.recommendations || '-',
  ]);

  return toCsv(headers, rows);
}
