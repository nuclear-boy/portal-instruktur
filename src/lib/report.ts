import { ASSESSMENT_GROUPS, assessmentGroupAverage, assessmentOverall } from '../../shared/assessment';
import { localLabel } from '../../shared/locals';
import { findMaterialByTopic } from '../../shared/materials';
import type { LocalId, Meta, Participant, Session, SosiogramData, Speaker } from '../../shared/types';
import {
  communicationMatricesByLocal,
  communicationMatrixOf,
  type CommunicationMatrix,
} from './communicationFrequency';
import {
  peopleReliRows,
  RELI_BAR_COLORS_CSS,
  RELI_LABELS,
  RELI_META,
  RELI_PREDICATE_LEGEND,
  reliPredicate,
  type ReliPredicate,
} from './reli';
import {
  buildHeatmapInitials,
  groupedVerticalBarsSvg,
  heatmapSvg,
  participantTrendSvg,
  reliChartSeries,
} from './reportCharts';
import { getLogoPath } from './logoAsset';
import {
  buildParticipantReportData,
  buildRecapReportData,
  fmtDurationDiff,
  fmtDurationShort,
  getParticipantSessionNote,
  sessionDurationSummary,
} from './reportData';
import { fmtDate, fmtDateTime } from './utils';

const STATUS_LABEL: Record<string, string> = {
  hadir: 'Hadir',
  terlambat: 'Terlambat',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa',
};

const SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Terjadwal',
  in_progress: 'Berlangsung',
  completed: 'Selesai',
};

export type ReportPerChart = 6 | 8 | 12;

export interface ReportOptions {
  perChart?: ReportPerChart;
  meta?: Meta | null;
  localId?: LocalId | null;
  scopeLabel?: string;
  dateRangeLabel?: string;
  logoDataUrl?: string | null;
}

function normalizePerChart(value?: ReportPerChart): ReportPerChart {
  return value === 6 || value === 8 || value === 12 ? value : 8;
}

const REPORT_CSS = `
*{box-sizing:border-box}
body{font:12.5px/1.55 "Inter",system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:20px;background:#eef2f6;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{max-width:1160px;margin:0 auto;background:#ffffff;border:1px solid #d7e0ea;border-radius:14px;overflow:hidden;box-shadow:0 12px 32px rgba(11,37,69,.08)}
.kop{background:linear-gradient(125deg,#800020 0%,#5f0a21 48%,#0b2545 100%);color:#ffffff;padding:18px 26px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.kop-brand{display:flex;align-items:center;gap:14px;min-width:0}
.kop-logo{width:50px;height:50px;object-fit:contain;background:#ffffff;border-radius:10px;padding:4px;flex:none;box-shadow:0 4px 12px rgba(0,0,0,.18)}
.kop-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.14em;opacity:.82;font-weight:700}
.kop h1{font-size:21px;margin:4px 0 3px;letter-spacing:-.02em;line-height:1.2}
.kop-sub{font-size:12px;opacity:.9}
.kop-meta{text-align:right;font-size:11px;opacity:.9;line-height:1.6}
.sheet-body{padding:22px 26px 28px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#0b2545;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #e2e8f0;display:flex;align-items:center;gap:8px}
h2::before{content:"";width:4px;height:14px;border-radius:2px;background:#800020;display:inline-block}
h3{font-size:13.5px;margin:14px 0 6px;color:#0f172a}
.muted{color:#64748b}
.kpi-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:4px 0 18px}
.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #800020;border-radius:10px;padding:10px 12px}
.kpi.navy{border-left-color:#0b2545}
.kpi.teal{border-left-color:#2f6f62}
.kpi.gold{border-left-color:#c28a2b}
.kpi-label{font-size:10.5px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.kpi-val{font-size:20px;font-weight:800;color:#0f172a;line-height:1.2;margin-top:2px;font-variant-numeric:tabular-nums}
.kpi-hint{font-size:10.5px;color:#64748b;margin-top:2px}
table{border-collapse:collapse;width:100%;font-size:11.8px;margin-bottom:6px}
th,td{border:1px solid #dbe3ec;padding:6px 8px;text-align:center;vertical-align:top}
th:first-child,td:first-child{text-align:left}
td.left,th.left{text-align:left}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
th{background:#f1f5f9;color:#0f172a;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
tbody tr:nth-child(even){background:#fafcff}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;white-space:nowrap}
.badge-green{background:#dcfce7;color:#166534}
.badge-blue{background:#dbeafe;color:#1d4ed8}
.badge-amber{background:#fef3c7;color:#b45309}
.badge-red{background:#fee2e2;color:#b42318}
.badge-neutral{background:#f1f5f9;color:#475569}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#475569;margin:6px 0 8px}
.legend span{display:inline-flex;align-items:center;gap:5px;font-weight:600}
.legend i{width:10px;height:10px;border-radius:2.5px;display:inline-block}
.note{white-space:pre-wrap;background:#f8fafc;border:1px solid #dbe3ec;border-left:3px solid #0b2545;border-radius:8px;padding:10px 12px;font-size:12px}
.info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:8px 0 12px}
.info-card{background:#f8fafc;border:1px solid #dbe3ec;border-radius:10px;padding:10px 12px}
.info-card small{display:block;font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.info-card strong{display:block;font-size:12.5px;color:#0f172a;margin-top:2px}
.chart-block{margin:10px 0 18px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;break-inside:avoid}
.chart-caption{font-size:11px;color:#64748b;margin:2px 0 8px}
.chart-note{font-size:10.8px;color:#64748b;margin:6px 0 0}
.initials-box{margin-top:10px;padding:10px 12px;background:#f8fafc;border:1px solid #dbe3ec;border-radius:8px;break-inside:avoid}
.initials-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin-bottom:6px}
.initials-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(195px,1fr));gap:5px 12px;font-size:11px}
.init-item{display:flex;align-items:center;gap:6px;min-width:0}
.init-code{display:inline-block;min-width:34px;text-align:center;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700;background:#eef2ff;color:#1e3a8a;border:1px solid #c7d2fe;flex:none}
.init-code.box{background:#ffe4e6;color:#800020;border-color:#fda4af}
.init-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1e293b}
.sign-block{margin-top:28px;display:flex;justify-content:space-between;gap:24px;break-inside:avoid;padding-top:12px;border-top:1px dashed #cbd5e1}
.sign-block.single{justify-content:flex-end}
.sign-col{width:240px;text-align:center;font-size:11.5px;color:#475569}
.sign-col .sign-role{font-weight:700;color:#0f172a;margin-bottom:4px}
.sign-col .sign-line{height:58px;border-bottom:1px solid #94a3b8;margin-bottom:6px}
.doc-foot{margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10.5px;color:#64748b;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media print{
  @page{size:A4 landscape;margin:8mm}
  body{background:#ffffff;padding:0}
  .sheet{max-width:none;border:0;border-radius:0;box-shadow:none}
  .sheet-body{padding:14px 4px 10px}
  .chart-block,.sign-block,.initials-box,.info-card{break-inside:avoid}
}
`;

function esc(value: unknown): string {
  return String(value == null ? '' : value).replace(/[&<>"]/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return map[char];
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function predicateBadgeHtml(predicate: ReliPredicate): string {
  return `<span class="badge ${predicate.badgeClass}">${esc(predicate.label)}</span>`;
}

function kopHtml(title: string, subtitle: string, options?: ReportOptions): string {
  const meta = options?.meta;
  const eventName = meta?.eventName || 'Leadership Basic Training PII';
  const period =
    meta?.startDate && meta?.endDate
      ? `${fmtDate(meta.startDate)} – ${fmtDate(meta.endDate)}`
      : meta?.startDate
        ? fmtDate(meta.startDate)
        : '';
  const printedAt = fmtDateTime(new Date().toISOString());
  const logoSrc = options?.logoDataUrl || (typeof window !== 'undefined' ? `${window.location.origin}${getLogoPath()}` : '');
  const logoTag = logoSrc
    ? `<img class="kop-logo" src="${esc(logoSrc)}" alt="Logo PII" onerror="this.style.display='none'" />`
    : '';

  return `<header class="kop">
  <div class="kop-brand">
    ${logoTag}
    <div>
      <div class="kop-eyebrow">Portal Instruktur LBT PII · ${esc(eventName)}</div>
      <h1>${esc(title)}</h1>
      <div class="kop-sub">${esc(subtitle)}</div>
    </div>
  </div>
  <div class="kop-meta">
    ${meta?.location ? `<div>${esc(meta.location)}</div>` : ''}
    ${period ? `<div>Periode: ${esc(period)}</div>` : ''}
    ${options?.dateRangeLabel ? `<div>Filter: ${esc(options.dateRangeLabel)}</div>` : ''}
    <div>Dicetak: ${esc(printedAt)}</div>
  </div>
</header>`;
}

function signatureHtml(leftLabel: string | null, rightLabel: string): string {
  if (!leftLabel) {
    return `<div class="sign-block single">
  <div class="sign-col">
    <div class="sign-role">${esc(rightLabel)}</div>
    <div class="sign-line"></div>
    <div>Nama &amp; Tanda Tangan</div>
  </div>
</div>`;
  }
  return `<div class="sign-block">
  <div class="sign-col">
    <div class="sign-role">${esc(leftLabel)}</div>
    <div class="sign-line"></div>
    <div>Nama &amp; Tanda Tangan</div>
  </div>
  <div class="sign-col">
    <div class="sign-role">${esc(rightLabel)}</div>
    <div class="sign-line"></div>
    <div>Nama &amp; Tanda Tangan</div>
  </div>
</div>`;
}

function documentShell(title: string, kop: string, body: string, portrait = false): string {
  const pageOverride = portrait ? '@media print{@page{size:A4 portrait;margin:10mm}}' : '';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${REPORT_CSS}${pageOverride}</style></head><body><div class="sheet">${kop}<div class="sheet-body">${body}<div class="doc-foot"><span>${esc(RELI_PREDICATE_LEGEND)}</span><span>Dokumen otomatis · Portal Instruktur LBT PII</span></div></div></div></body></html>`;
}

function barsSvg(rows: { label: string; values: number[]; color?: string }[]): string {
  if (!rows.length) return '<p class="muted">Belum ada data.</p>';
  const max = Math.max(1, ...rows.map((row) => sum(row.values)));
  const labelWidth = 200;
  const barWidth = 460;
  const rowHeight = 26;
  const width = labelWidth + barWidth + 76;
  const height = rows.length * rowHeight + 6;

  const body = rows
    .map((row, index) => {
      let x = labelWidth;
      const y = index * rowHeight + 3;
      const segments = row.values
        .map((value, valueIndex) => {
          const w = (value / max) * barWidth;
          const rect = `<rect x="${x}" y="${y + 3}" width="${w}" height="${rowHeight - 8}" rx="3" fill="${row.color || RELI_BAR_COLORS_CSS[valueIndex % 4]}"/>`;
          x += w;
          return rect;
        })
        .join('');
      return (
        `<rect x="${labelWidth}" y="${y + 3}" width="${barWidth}" height="${rowHeight - 8}" rx="3" fill="#f1f5f9"/>` +
        `<text x="${labelWidth - 10}" y="${y + 16}" text-anchor="end" font-size="11" font-weight="500" fill="#1e293b">${esc(row.label.slice(0, 32))}</text>` +
        segments +
        `<text x="${x + 8}" y="${y + 16}" font-size="11" font-weight="700" fill="#0f172a">${sum(row.values).toFixed(1)}</text>`
      );
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:780px;display:block">${body}</svg>`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function reliChartsHtml(
  rows: { name: string; values: number[] }[],
  options?: { maxValue?: number; perChart?: ReportPerChart },
): string {
  if (!rows.length) return '<p class="muted">Belum ada nilai.</p>';
  const series = reliChartSeries();
  const perChart = normalizePerChart(options?.perChart);
  return chunk(rows, perChart)
    .map(
      (part, index) =>
        `<div class="chart-block">${index > 0 ? `<div class="chart-caption">Peserta ${index * perChart + 1}–${index * perChart + part.length} dari ${rows.length}</div>` : ''}${groupedVerticalBarsSvg({
          groups: part.map((row) => ({ label: row.name, values: row.values })),
          series,
          maxValue: options?.maxValue,
          showValues: true,
        })}</div>`,
    )
    .join('');
}

function legendHtml(): string {
  return `<div class="legend">${RELI_LABELS.map(
    (label, index) =>
      `<span><i style="background:${RELI_BAR_COLORS_CSS[index]}"></i>${['R', 'E', 'L', 'I'][index]} — ${esc(label)}</span>`,
  ).join('')}</div>`;
}

function communicationHtml(matrix: CommunicationMatrix): string {
  const rows = matrix.rows
    .map(
      (row) =>
        `<tr><td>${esc(row.name)}</td><td>${row.teman}</td><td>${row.pemateri}</td><td><b>${row.total}</b></td></tr>`,
    )
    .join('');

  const rowInputs = matrix.rows.map((row) => ({ id: row.id, label: row.name }));
  const colInputs = matrix.columns.map((col) => ({ id: col.id, label: col.label, kind: col.kind }));
  const { entries } = buildHeatmapInitials(rowInputs.slice(0, 28), colInputs.slice(0, 34));

  const legendGrid = entries.length
    ? `<div class="initials-box">
  <div class="initials-title">Keterangan Inisial Heatmap</div>
  <div class="initials-grid">${entries
    .map(
      (entry) =>
        `<div class="init-item"><span class="init-code${entry.kind === 'box' ? ' box' : ''}">${esc(entry.initial)}</span><span class="init-name">${esc(entry.label)}${entry.kind === 'box' ? ' <span class="muted">(Pemateri/Box)</span>' : ''}</span></div>`,
    )
    .join('')}</div>
</div>`
    : '';

  return `<table><thead><tr><th>Nama</th><th>Teman</th><th>Pemateri</th><th>Total</th></tr></thead><tbody>${
    rows || '<tr><td colspan="4" class="muted">Belum ada peserta dengan kabel komunikasi.</td></tr>'
  }</tbody></table>
<div class="chart-note">Frekuensi tabel &amp; heatmap dihitung dari kabel keluar tiap peserta. Semua box dihitung sebagai Pemateri.</div>
<div class="chart-block">
  <h3>Heatmap Komunikasi</h3>
  <div class="chart-caption">Baris (kiri) = pengirim · Kolom (bawah) = inisial penerima. Garis putus-putus memisahkan peserta dan Pemateri/Box.</div>
  ${heatmapSvg({
    rows: rowInputs,
    columns: colInputs,
    values: matrix.values,
  })}
  ${legendGrid}
</div>`;
}

function assessmentsHtml(
  assessments: Session['assessments'],
  speakerName: (id: string) => string,
  topicPrefix = '',
): string {
  const rows = (assessments || [])
    .map((assessment) => {
      const averages = ASSESSMENT_GROUPS.map(
        (group) => `<td>${assessmentGroupAverage(assessment.scores, group).toFixed(2)}</td>`,
      ).join('');
      const overall = assessmentOverall(assessment.scores).toFixed(2);
      const label = topicPrefix ? `${esc(topicPrefix)}${esc(assessment.date)}` : esc(assessment.date);
      const time = assessment.time ? ` · ${esc(assessment.time)}` : '';
      return `<tr><td>${esc(speakerName(assessment.speakerId))}</td><td>${esc(assessment.observerName)}</td><td>${label}${time}</td>${averages}<td><b>${overall}</b></td><td class="left">${esc(assessment.generalNotes || '—')}</td><td class="left">${esc(assessment.recommendations || '—')}</td></tr>`;
    })
    .join('');

  if (!rows) return '';
  const head =
    '<thead><tr><th>Pemateri</th><th>Observer</th><th>Waktu</th><th>Penampilan</th><th>Bahasa</th><th>Materi</th><th>Nilai</th><th class="left">Catatan Umum</th><th class="left">Rekomendasi</th></tr></thead>';
  return `<h2>Penilaian Pemateri</h2><table>${head}<tbody>${rows}</tbody></table>`;
}

export function buildSessionReport(
  session: Session,
  sosiogram: SosiogramData,
  participants: Participant[],
  speakers: Speaker[],
  options?: ReportOptions,
): string {
  const people = peopleReliRows(sosiogram);
  const perChart = normalizePerChart(options?.perChart);
  const communication = communicationMatrixOf(sosiogram);
  const averages = [0, 1, 2, 3].map((index) =>
    people.length ? people.reduce((total, person) => total + person.values[index], 0) / people.length : 0,
  );
  const overallAspectAvg = sum(averages) / 4;

  const participantName = (id: string) =>
    participants.find((item) => item.id === id)?.name || '(peserta dihapus)';
  const speakerName = (id: string) =>
    speakers.find((item) => item.id === id)?.name || '(pengajar dihapus)';

  const presentCount = session.attendance.filter(
    (item) => item.status === 'hadir' || item.status === 'terlambat',
  ).length;
  const attRate = session.attendance.length
    ? Math.round((presentCount / session.attendance.length) * 100)
    : 0;
  const totalCommLinks = communication.rows.reduce((acc, row) => acc + row.total, 0);
  const { plannedMinutes, actualMinutes, durationDiff } = sessionDurationSummary(session);
  const material = findMaterialByTopic(session.topic);

  const speakerRows = session.speakers
    .map((item) => {
      const role =
        item.role === 'pemateri'
          ? 'Pemateri'
          : item.role === 'inlok'
            ? 'Instruktur Lokal'
            : 'Observer';
      return `<tr><td>${esc(speakerName(item.speakerId))}</td><td>${role}</td><td>${esc(STATUS_LABEL[item.attendance] || item.attendance)}</td></tr>`;
    })
    .join('');

  const attendanceRows = session.attendance
    .map(
      (item) =>
        `<tr><td>${esc(participantName(item.participantId))}</td><td>${esc(STATUS_LABEL[item.status] || item.status)}</td></tr>`,
    )
    .join('');

  const scoreRows = people
    .map((person) => {
      const total = sum(person.values);
      const aspectAvg = total / 4;
      const pred = reliPredicate(aspectAvg, 1);
      return `<tr><td>${esc(person.name)}</td>${person.values
        .map((value) => `<td>${value.toFixed(1)}</td>`)
        .join('')}<td><b>${total.toFixed(1)}</b></td><td>${aspectAvg.toFixed(2)}</td><td>${predicateBadgeHtml(pred)}</td></tr>`;
    })
    .join('');

  const noteEntries = new Map<string, { name: string; note: string }>();
  Object.entries(sosiogram.participantNotes || {}).forEach(([pId, note]) => {
    if (note && note.trim()) {
      noteEntries.set(pId, { name: participantName(pId), note: note.trim() });
    }
  });
  (sosiogram.seats || []).forEach((seat) => {
    const note = seat.note?.trim();
    if (!note) return;
    const key = seat.participantId || `seat:${seat.id}`;
    if (!noteEntries.has(key)) {
      noteEntries.set(key, {
        name: seat.participantId ? participantName(seat.participantId) : seat.name || '(tanpa nama)',
        note,
      });
    }
  });

  const participantNotesRows = [...noteEntries.values()]
    .map(
      (entry) =>
        `<tr><td style="width:220px"><b>${esc(entry.name)}</b></td><td class="left">${esc(entry.note)}</td></tr>`,
    )
    .join('');

  const subtitle = `${session.no ? `Sesi ${session.no} · ` : ''}${session.topic} · ${localLabel(session.localId)} · ${fmtDate(session.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${session.location ? ` · ${session.location}` : ''}`;

  const timePlanText =
    session.startTime && session.endTime
      ? `${session.startTime}–${session.endTime} (${fmtDurationShort(plannedMinutes)})`
      : plannedMinutes
        ? fmtDurationShort(plannedMinutes)
        : '—';
  const timeActualText =
    session.actualStartTime && session.actualEndTime
      ? `${session.actualStartTime}–${session.actualEndTime} (${fmtDurationShort(actualMinutes)}${durationDiff !== undefined ? `, ${fmtDurationDiff(durationDiff)}` : ''})`
      : actualMinutes
        ? `${fmtDurationShort(actualMinutes)}${durationDiff !== undefined ? ` (${fmtDurationDiff(durationDiff)})` : ''}`
        : 'Belum diisi';

  const body = `
<div class="kpi-strip">
  <div class="kpi"><div class="kpi-label">Rata-rata RELI</div><div class="kpi-val">${overallAspectAvg.toFixed(2)}</div><div class="kpi-hint">Skala 0–10 · Total ${sum(averages).toFixed(1)}/40</div></div>
  <div class="kpi navy"><div class="kpi-label">Peserta Dinilai</div><div class="kpi-val">${people.length}</div><div class="kpi-hint">Predikat kelas: ${esc(reliPredicate(overallAspectAvg, people.length).label)}</div></div>
  <div class="kpi teal"><div class="kpi-label">Kehadiran</div><div class="kpi-val">${attRate}%</div><div class="kpi-hint">${presentCount}/${session.attendance.length} hadir/terlambat</div></div>
  <div class="kpi gold"><div class="kpi-label">Komunikasi Kabel</div><div class="kpi-val">${totalCommLinks}</div><div class="kpi-hint">Status: ${esc(SESSION_STATUS_LABEL[session.status || 'scheduled'] || 'Terjadwal')}</div></div>
</div>

<div class="info-grid">
  <div class="info-card"><small>Waktu Rencana</small><strong>${esc(timePlanText)}</strong></div>
  <div class="info-card"><small>Waktu Aktual</small><strong>${esc(timeActualText)}</strong></div>
  ${material?.metode ? `<div class="info-card"><small>Metode Silabus</small><strong>${esc(material.metode)}</strong></div>` : ''}
</div>
${material?.target ? `<div class="note" style="margin-bottom:10px"><b>Target Silabus:</b> ${esc(material.target)}${material.indikator ? `\n<b>Indikator:</b> ${esc(material.indikator)}` : ''}</div>` : ''}

<h2>Pemateri, Inlok &amp; Observer</h2>
<table><thead><tr><th>Nama</th><th>Peran</th><th>Kehadiran</th></tr></thead><tbody>${speakerRows || '<tr><td colspan="3" class="muted">Belum diisi.</td></tr>'}</tbody></table>

${assessmentsHtml(session.assessments, speakerName)}

<h2>Absensi Peserta</h2>
<table><thead><tr><th>Nama</th><th>Status</th></tr></thead><tbody>${attendanceRows || '<tr><td colspan="2" class="muted">Belum diisi.</td></tr>'}</tbody></table>

<h2>Rekap Nilai RELI</h2>
<table><thead><tr><th>Nama</th><th>R</th><th>E</th><th>L</th><th>I</th><th>Total</th><th>Rata-rata</th><th>Predikat</th></tr></thead><tbody>${scoreRows || '<tr><td colspan="8" class="muted">Belum ada nilai.</td></tr>'}</tbody></table>

<h2>Rata-rata per Indikator</h2>
<div class="chart-block">
  ${legendHtml()}
  ${barsSvg(
    RELI_META.map((item, index) => ({
      label: item.label,
      values: [averages[index]],
      color: item.color,
    })),
  )}
</div>

<h2>Nilai per Peserta (Skala 0–10)</h2>
<div class="chart-caption">Nilai RELI 0–10 per peserta. Angka di atas grup adalah total (maks. 40).</div>
${reliChartsHtml(people, { maxValue: 10, perChart })}

<h2>Frekuensi Komunikasi</h2>
${communicationHtml(communication)}

${participantNotesRows ? `<h2>Catatan Observer untuk Peserta</h2><table><thead><tr><th>Nama Peserta</th><th class="left">Catatan Observer</th></tr></thead><tbody>${participantNotesRows}</tbody></table>` : ''}

${sosiogram.cat ? `<h2>Catatan Observasi Umum</h2><div class="note">${esc(sosiogram.cat)}</div>` : ''}

${signatureHtml('Observer', 'Instruktur Lokal')}
`;

  return documentShell(
    `Laporan Pertemuan — ${session.topic}`,
    kopHtml('Laporan Pertemuan & Sosiogram RELI', subtitle, options),
    body,
  );
}

export function buildAllReport(
  sessions: Session[],
  participants: Participant[],
  speakers: Speaker[],
  options?: ReportOptions,
): string {
  const perChart = normalizePerChart(options?.perChart);
  const recap = buildRecapReportData(sessions, participants, speakers);
  const { kpis, participantRows, sessionRows, assessmentDetails, allObserverNotes } = recap;

  const totalRows = participantRows
    .map(
      (row) =>
        `<tr><td><b>${esc(row.name)}</b></td><td>${esc(localLabel(row.localId))}</td>${row.avgValues
          .map((value) => `<td>${value.toFixed(1)}</td>`)
          .join('')}<td><b>${row.aspectAvg.toFixed(2)}</b></td><td>${predicateBadgeHtml(row.predicate)}</td><td>${row.totalSum.toFixed(1)}</td><td>${row.scoredSessions}</td><td>${row.attendance.rate}% <span class="muted">(${row.attendance.present}/${row.attendance.total})</span></td><td>${row.attendance.alpa}</td></tr>`,
    )
    .join('');

  const sessionTableRows = sessionRows
    .map((item) => {
      const timeText = item.actualMinutes
        ? `${fmtDurationShort(item.actualMinutes)}${item.durationDiff !== undefined ? ` <span class="muted">(${fmtDurationDiff(item.durationDiff)})</span>` : ''}`
        : item.plannedMinutes
          ? `${fmtDurationShort(item.plannedMinutes)} <span class="muted">(rencana)</span>`
          : '—';
      return `<tr><td>${esc(item.session.no || '-')}</td><td>${esc(fmtDate(item.session.date))}</td><td>${esc(localLabel(item.session.localId))}</td><td class="left">${esc(item.session.topic)}</td><td>${timeText}</td><td>${item.present}/${item.totalAttendance || '—'}</td><td>${item.scored}</td><td><b>${item.avgReliAspect.toFixed(2)}</b> <span class="muted">(${item.avgReliTotal.toFixed(1)})</span></td></tr>`;
    })
    .join('');

  const speakerAssessmentRows = assessmentDetails
    .map((item) => {
      const label = `${item.session.no ? `Sesi ${item.session.no} · ` : ''}${fmtDate(item.session.date)}`;
      const averages = ASSESSMENT_GROUPS.map(
        (group) => `<td>${(item.groupAverages[group.key] || 0).toFixed(2)}</td>`,
      ).join('');
      return `<tr><td>${esc(label)} · ${esc(localLabel(item.session.localId))}</td><td>${esc(item.speakerName)}</td><td>${esc(item.assessment.observerName)}</td>${averages}<td><b>${item.overall.toFixed(2)}</b></td><td class="left">${esc(item.assessment.generalNotes || '—')}</td><td class="left">${esc(item.assessment.recommendations || '—')}</td></tr>`;
    })
    .join('');

  const insightRows = participantRows
    .filter((row) => row.insight)
    .map(
      (row) =>
        `<tr><td><b>${esc(row.name)}</b></td><td>${esc(localLabel(row.localId))}</td><td>${esc(row.insight!.styleLabel)}</td><td>${row.insight!.totalInteractions}</td><td class="left">${esc(row.insight!.topTopic?.topic || '—')}</td><td class="left">${esc(row.insight!.potentialRecommendation)}</td></tr>`,
    )
    .join('');

  const observerNoteRows = allObserverNotes
    .map(
      (entry) =>
        `<tr><td><b>${esc(entry.participantName)}</b></td><td>${esc(localLabel(entry.localId))}</td><td>${esc(fmtDate(entry.date))} · ${esc(entry.topic)}</td><td class="left">${esc(entry.note)}</td></tr>`,
    )
    .join('');

  const communicationByLocal = communicationMatricesByLocal(sessions);
  const communicationHtmlByLocal = communicationByLocal
    .map(
      ({ localId, matrix }) =>
        `<div style="margin-bottom:18px"><h3>${esc(localLabel(localId))}</h3>${communicationHtml(matrix)}</div>`,
    )
    .join('');

  const rowsByLocal = new Map<number | null, typeof participantRows>();
  participantRows.forEach((row) => {
    const current = rowsByLocal.get(row.localId) || [];
    current.push(row);
    rowsByLocal.set(row.localId, current);
  });

  const scopeText =
    options?.scopeLabel ||
    (options?.localId ? localLabel(options.localId) : 'Seluruh Lokal');
  const subtitle = `${scopeText} · ${kpis.totalSessions} pertemuan · ${participantRows.length} peserta tercatat · ${speakers.length} pengajar`;
  const isSingleLocal = Boolean(options?.localId);

  const body = `
<div class="kpi-strip">
  <div class="kpi"><div class="kpi-label">Rata-rata RELI</div><div class="kpi-val">${kpis.avgReliAspect.toFixed(2)}</div><div class="kpi-hint">Skala 0–10 · ${kpis.avgReliTotal.toFixed(1)}/40 per sesi</div></div>
  <div class="kpi navy"><div class="kpi-label">Peserta Dinilai</div><div class="kpi-val">${kpis.scoredParticipants}/${kpis.totalParticipants}</div><div class="kpi-hint">${kpis.scoredSessions}/${kpis.totalSessions} sesi bersosiogram</div></div>
  <div class="kpi teal"><div class="kpi-label">Kehadiran</div><div class="kpi-val">${kpis.attendanceRate}%</div><div class="kpi-hint">${kpis.presentEntries}/${kpis.totalAttendanceEntries} catatan hadir</div></div>
  <div class="kpi gold"><div class="kpi-label">Keaktifan Forum</div><div class="kpi-val">${kpis.totalInteractions}</div><div class="kpi-hint">${kpis.participationRate}% peserta aktif komunikasi</div></div>
  <div class="kpi"><div class="kpi-label">Penilaian Pemateri</div><div class="kpi-val">${kpis.assessmentCount ? kpis.assessmentAvg.toFixed(2) : '—'}</div><div class="kpi-hint">${kpis.assessmentCount} lembar observer</div></div>
</div>

<h2>Rekap Perkembangan &amp; Predikat Peserta</h2>
<table>
  <thead>
    <tr>
      <th>Nama</th><th>Lokal</th><th>R</th><th>E</th><th>L</th><th>I</th><th>Rata-rata</th><th>Predikat</th><th>Total Akum.</th><th>Sesi</th><th>Hadir</th><th>Alpa</th>
    </tr>
  </thead>
  <tbody>${totalRows || '<tr><td colspan="12" class="muted">Belum ada data peserta.</td></tr>'}</tbody>
</table>
<div class="chart-note">Kolom R, E, L, I, dan Rata-rata menunjukkan rata-rata per sesi dinilai (skala 0–10) agar adil lintas jumlah kehadiran.</div>

<h2>Daftar Pertemuan &amp; Ketepatan Waktu</h2>
<table>
  <thead><tr><th>No</th><th>Tanggal</th><th>Lokal</th><th class="left">Materi</th><th>Durasi</th><th>Hadir</th><th>Dinilai</th><th>Rata-rata RELI</th></tr></thead>
  <tbody>${sessionTableRows || '<tr><td colspan="8" class="muted">Belum ada pertemuan.</td></tr>'}</tbody>
</table>

${
  speakerAssessmentRows
    ? `<h2>Penilaian Pemateri</h2><table><thead><tr><th>Pertemuan</th><th>Pemateri</th><th>Observer</th><th>Penampilan</th><th>Bahasa</th><th>Materi</th><th>Nilai</th><th class="left">Catatan Umum</th><th class="left">Rekomendasi</th></tr></thead><tbody>${speakerAssessmentRows}</tbody></table>`
    : ''
}

<h2>Rata-rata Nilai RELI per Pertemuan</h2>
<div class="chart-block">
  ${legendHtml()}
  ${barsSvg(
    sessionRows.map((row) => ({
      label: `${fmtDate(row.session.date, { day: 'numeric', month: 'short' })} · ${row.session.topic}`,
      values: row.avgValues,
    })),
  )}
</div>

${[...rowsByLocal.entries()]
  .map(
    ([localId, localRows]) =>
      `<h2>Rata-rata Nilai RELI per Peserta — ${esc(localLabel(localId))}</h2>
<div class="chart-caption">Rata-rata per sesi dinilai (skala 0–10 per aspek, total di atas grup maks. 40).</div>
${reliChartsHtml(
  localRows
    .filter((row) => row.scoredSessions > 0)
    .map((row) => ({ name: row.name, values: row.avgValues })),
  { maxValue: 10, perChart },
)}`,
  )
  .join('')}

${
  insightRows
    ? `<h2>Insight Gaya Komunikasi &amp; Rekomendasi Potensi</h2>
<table><thead><tr><th>Nama</th><th>Lokal</th><th>Gaya Komunikasi</th><th>Interaksi*</th><th class="left">Materi Teraktif</th><th class="left">Rekomendasi Potensi</th></tr></thead><tbody>${insightRows}</tbody></table>
<div class="chart-note">*Total keterlibatan interaksi (kabel keluar + masuk) yang digunakan untuk pemetaan gaya komunikasi.</div>`
    : ''
}

<h2>Frekuensi &amp; Heatmap Komunikasi</h2>
${communicationHtmlByLocal || '<p class="muted">Belum ada data komunikasi.</p>'}

<h2>Catatan Peserta dari Observer</h2>
<table>
  <thead><tr><th>Nama Peserta</th><th>Lokal</th><th>Tanggal &amp; Materi</th><th class="left">Catatan Observer</th></tr></thead>
  <tbody>${observerNoteRows || '<tr><td colspan="4" class="muted">Belum ada catatan peserta yang dilaporkan observer.</td></tr>'}</tbody>
</table>

${isSingleLocal ? signatureHtml('Observer', 'Instruktur Lokal') : signatureHtml(null, 'Koordinator Tim')}
`;

  return documentShell(
    `Laporan Rekap LBT — ${scopeText}`,
    kopHtml('Laporan Rekap Perkembangan Peserta', subtitle, options),
    body,
  );
}

export function buildParticipantReport(
  participant: Participant,
  sessions: Session[],
  speakers: Speaker[],
  options?: ReportOptions,
): string {
  const data = buildParticipantReportData(participant, sessions, speakers);
  const diffFromLocal = data.aspectAvg - data.localAvgAspect;
  const diffText = data.scoredSessions
    ? `${diffFromLocal >= 0 ? '+' : ''}${diffFromLocal.toFixed(2)} vs rata-rata lokal (${data.localAvgAspect.toFixed(2)})`
    : 'Belum ada nilai';

  const historyRows = data.history
    .map(
      (item) =>
        `<tr><td>${esc(fmtDate(item.session.date))}</td><td class="left"><b>${esc(item.session.topic)}</b>${item.speakers.length ? `<div class="muted" style="font-size:10.5px">${esc(item.speakers.join(', '))}</div>` : ''}</td><td>${esc(item.attendance ? STATUS_LABEL[item.attendance] || item.attendance : '—')}</td><td>${item.values ? item.values[0].toFixed(1) : '—'}</td><td>${item.values ? item.values[1].toFixed(1) : '—'}</td><td>${item.values ? item.values[2].toFixed(1) : '—'}</td><td>${item.values ? item.values[3].toFixed(1) : '—'}</td><td><b>${item.total !== null ? item.total.toFixed(1) : '—'}</b></td><td>${predicateBadgeHtml(item.predicate)}</td><td class="left">${esc(item.observerNote || '—')}</td></tr>`,
    )
    .join('');

  const trendPoints = data.history
    .filter((item) => item.total !== null)
    .map((item, idx) => ({
      label: `S${item.session.no || idx + 1} (${fmtDate(item.session.date, { day: 'numeric', month: 'short' })})`,
      topic: item.session.topic,
      value: item.total || 0,
      benchmark: item.localAvgTotal,
    }));

  const notesRows = data.observerNotes
    .map(
      (item) =>
        `<tr><td style="width:130px">${esc(fmtDate(item.session.date))}</td><td class="left" style="width:210px"><b>${esc(item.session.topic)}</b></td><td class="left">${esc(item.note)}</td></tr>`,
    )
    .join('');

  const subtitle = `${participant.name} · ${localLabel(participant.localId)}${participant.origin ? ` · ${participant.origin}` : ''}`;

  const body = `
<div class="info-grid">
  <div class="info-card"><small>Nama Lengkap</small><strong>${esc(participant.name)}</strong></div>
  <div class="info-card"><small>Lokal</small><strong>${esc(localLabel(participant.localId))}</strong></div>
  <div class="info-card"><small>Asal / Daerah</small><strong>${esc(participant.origin || '—')}</strong></div>
  <div class="info-card"><small>Predikat Keseluruhan</small><strong>${predicateBadgeHtml(data.predicate)}</strong></div>
</div>

<div class="kpi-strip">
  <div class="kpi"><div class="kpi-label">Rata-rata Aspek RELI</div><div class="kpi-val">${data.aspectAvg.toFixed(2)}</div><div class="kpi-hint">${esc(diffText)}</div></div>
  <div class="kpi navy"><div class="kpi-label">Rata-rata Total/Sesi</div><div class="kpi-val">${data.totalAvg.toFixed(1)}</div><div class="kpi-hint">Akumulasi: ${data.totalSum.toFixed(1)} (${data.scoredSessions} sesi)</div></div>
  <div class="kpi teal"><div class="kpi-label">Kehadiran</div><div class="kpi-val">${data.attendance.rate}%</div><div class="kpi-hint">H:${data.attendance.hadir} · T:${data.attendance.terlambat} · I/S:${data.attendance.izinSakit} · A:${data.attendance.alpa}</div></div>
  <div class="kpi gold"><div class="kpi-label">Interaksi Komunikasi</div><div class="kpi-val">${data.insight?.totalInteractions || 0}</div><div class="kpi-hint">${esc(data.insight?.styleLabel || 'Belum tercatat')}</div></div>
</div>

<h2>Profil 4 Aspek RELI (Rata-rata Skala 0–10)</h2>
<div class="chart-block">
  ${legendHtml()}
  ${barsSvg(
    RELI_META.map((item, idx) => ({
      label: `${item.label} (${item.short})`,
      values: [data.avgValues[idx]],
      color: item.color,
    })),
  )}
</div>

<h2>Grafik Perkembangan per Pertemuan vs Rata-rata Lokal</h2>
<div class="chart-block">
  ${participantTrendSvg({ points: trendPoints })}
</div>

<h2>Analisis Gaya Komunikasi &amp; Rekomendasi Potensi</h2>
${
  data.insight
    ? `<div class="info-grid">
  <div class="info-card"><small>Gaya Komunikasi</small><strong>${esc(data.insight.styleLabel)}</strong><div class="muted" style="font-size:11px;margin-top:4px">${esc(data.insight.styleDescription)}</div></div>
  <div class="info-card"><small>Materi Teraktif &amp; Pemateri Terresponsif</small><strong>${esc(data.insight.topTopic?.topic || 'Belum terpetakan')}</strong><div class="muted" style="font-size:11px;margin-top:4px">Pemateri: ${esc(data.insight.topSpeaker?.speakerName || '—')} · ${data.insight.toSpeakerInteractions} ke pemateri / ${data.insight.peerInteractions} ke teman</div></div>
</div>
<div class="note"><b>Rekomendasi Pengembangan Potensi:</b>\n${esc(data.insight.potentialRecommendation)}</div>`
    : '<p class="muted">Belum ada data komunikasi tercatat.</p>'
}

<h2>Riwayat Pertemuan &amp; Nilai RELI</h2>
<table>
  <thead><tr><th>Tanggal</th><th class="left">Materi</th><th>Hadir</th><th>R</th><th>E</th><th>L</th><th>I</th><th>Total</th><th>Predikat</th><th class="left">Catatan Observer</th></tr></thead>
  <tbody>${historyRows || '<tr><td colspan="10" class="muted">Belum ada riwayat pertemuan.</td></tr>'}</tbody>
</table>

${notesRows ? `<h2>Timeline Catatan Observer</h2><table><thead><tr><th>Tanggal</th><th class="left">Materi</th><th class="left">Catatan</th></tr></thead><tbody>${notesRows}</tbody></table>` : ''}

${participant.notes ? `<h2>Catatan Tambahan Peserta</h2><div class="note">${esc(participant.notes)}</div>` : ''}

${signatureHtml('Observer', 'Instruktur Lokal')}
`;

  return documentShell(
    `Rapor Peserta — ${participant.name}`,
    kopHtml('Rapor Perkembangan Individu Peserta', subtitle, options),
    body,
    true,
  );
}

export function buildSpeakerAssessmentReport(
  sessions: Session[],
  participants: Participant[],
  speakers: Speaker[],
  options?: ReportOptions,
): string {
  const recap = buildRecapReportData(sessions, participants, speakers);
  const { speakerSummaries, assessmentDetails, kpis } = recap;
  const scopeText =
    options?.scopeLabel ||
    (options?.localId ? localLabel(options.localId) : 'Seluruh Lokal');
  const subtitle = `${scopeText} · ${assessmentDetails.length} lembar penilaian dari ${speakerSummaries.length} pemateri`;
  const isSingleLocal = Boolean(options?.localId);

  const summaryRows = speakerSummaries
    .map(
      (item, idx) =>
        `<tr><td>${idx + 1}</td><td class="left"><b>${esc(item.speakerName)}</b></td><td>${item.sessionsCount}</td><td>${item.assessmentsCount}</td>${ASSESSMENT_GROUPS.map(
          (g) => `<td>${(item.groupAverages[g.key] || 0).toFixed(2)}</td>`,
        ).join('')}<td><b>${item.overallAvg.toFixed(2)}</b></td></tr>`,
    )
    .join('');

  const detailRows = assessmentDetails
    .map((item) => {
      const averages = ASSESSMENT_GROUPS.map(
        (g) => `<td>${(item.groupAverages[g.key] || 0).toFixed(2)}</td>`,
      ).join('');
      return `<tr><td>${esc(fmtDate(item.assessment.date))}${item.assessment.time ? `<div class="muted" style="font-size:10px">${esc(item.assessment.time)}</div>` : ''}</td><td>${esc(localLabel(item.session.localId))}</td><td class="left">${esc(item.session.topic)}</td><td class="left"><b>${esc(item.speakerName)}</b></td><td>${esc(item.assessment.observerName)}</td>${averages}<td><b>${item.overall.toFixed(2)}</b></td><td class="left">${esc(item.assessment.generalNotes || '—')}</td><td class="left">${esc(item.assessment.recommendations || '—')}</td></tr>`;
    })
    .join('');

  const groupGlobal = ASSESSMENT_GROUPS.map((group) => ({
    label: group.label,
    avg: assessmentDetails.length
      ? assessmentDetails.reduce((acc, item) => acc + (item.groupAverages[group.key] || 0), 0) /
        assessmentDetails.length
      : 0,
  }));

  const body = `
<div class="kpi-strip">
  <div class="kpi"><div class="kpi-label">Nilai Rata-rata</div><div class="kpi-val">${assessmentDetails.length ? kpis.assessmentAvg.toFixed(2) : '—'}</div><div class="kpi-hint">Skala 1.00 – 5.00</div></div>
  <div class="kpi navy"><div class="kpi-label">Lembar Penilaian</div><div class="kpi-val">${assessmentDetails.length}</div><div class="kpi-hint">Dari ${speakerSummaries.length} pemateri dinilai</div></div>
  ${groupGlobal
    .map(
      (g, i) =>
        `<div class="kpi ${i === 0 ? 'teal' : i === 1 ? 'gold' : 'navy'}"><div class="kpi-label">${esc(g.label)}</div><div class="kpi-val">${assessmentDetails.length ? g.avg.toFixed(2) : '—'}</div><div class="kpi-hint">Rata-rata aspek</div></div>`,
    )
    .join('')}
</div>

<h2>Ringkasan Kinerja per Pemateri</h2>
<table>
  <thead><tr><th>No</th><th class="left">Nama Pemateri</th><th>Sesi</th><th>Lembar</th><th>Penampilan</th><th>Bahasa</th><th>Materi</th><th>Nilai Akhir</th></tr></thead>
  <tbody>${summaryRows || '<tr><td colspan="8" class="muted">Belum ada penilaian pemateri pada cakupan ini.</td></tr>'}</tbody>
</table>

<h2>Detail Lembar Penilaian Observer</h2>
<table>
  <thead><tr><th>Tanggal</th><th>Lokal</th><th class="left">Materi</th><th class="left">Pemateri</th><th>Observer</th><th>Penampilan</th><th>Bahasa</th><th>Materi</th><th>Nilai</th><th class="left">Catatan Umum</th><th class="left">Rekomendasi</th></tr></thead>
  <tbody>${detailRows || '<tr><td colspan="11" class="muted">Belum ada lembar penilaian.</td></tr>'}</tbody>
</table>

${isSingleLocal ? signatureHtml('Observer', 'Instruktur Lokal') : signatureHtml(null, 'Koordinator Tim')}
`;

  return documentShell(
    `Rekap Penilaian Pemateri — ${scopeText}`,
    kopHtml('Laporan Rekap Penilaian Pemateri', subtitle, options),
    body,
  );
}
