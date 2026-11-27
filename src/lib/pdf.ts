import { ASSESSMENT_GROUPS, assessmentGroupAverage, assessmentOverall } from '../../shared/assessment';
import { localLabel } from '../../shared/locals';
import type { LocalId, Meta, Participant, Session, SosiogramData, Speaker, SpeakerAssessment, } from '../../shared/types';
import { communicationMatricesByLocal, communicationMatrixOf, type CommunicationMatrix, } from './communicationFrequency';
import { drawCommunicationHeatmap, drawKpiStrip, drawReliGroupedChart, } from './pdfCharts';
import { loadLogoDataUrl } from './logoAsset';
import { peopleReliRows, RELI_PREDICATE_LEGEND, reliPredicate, sessionPdfFilename, } from './reli';
import { buildParticipantReportData, buildRecapReportData, fmtDurationDiff, fmtDurationShort, getParticipantSessionNote, sessionDurationSummary, } from './reportData';
import { attendanceLabel, fmtDate } from './utils';
export type PdfPerChart = 6 | 8 | 12;
function normalizePerChart(value?: PdfPerChart): PdfPerChart {
    return value === 6 || value === 8 || value === 12 ? value : 8;
}
function matrixTableBody(matrix: CommunicationMatrix): (string | number)[][] {
    return matrix.rows.map((row) => [row.name, row.teman, row.pemateri, row.total]);
}
async function loadPdf() {
    const [{ jsPDF }, { default: autoTable }, logoDataUrl] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        loadLogoDataUrl(),
    ]);
    return { jsPDF, autoTable, logoDataUrl };
}
function lastYOf(doc: import('jspdf').jsPDF, fallback = 180): number {
    return (doc as unknown as {
        lastAutoTable?: {
            finalY: number;
        };
    }).lastAutoTable?.finalY || fallback;
}
function header(doc: import('jspdf').jsPDF, title: string, subtitle: string, meta?: Meta | null, logoDataUrl?: string | null) {
    const width = doc.internal.pageSize.getWidth();
    doc.setFillColor(128, 0, 32);
    doc.rect(0, 0, width, 28, 'F');
    doc.setFillColor(11, 37, 69);
    doc.rect(0, 26.2, width, 1.8, 'F');
    let textX = 14;
    if (logoDataUrl) {
        try {
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(14, 4.2, 18, 18, 2.2, 2.2, 'F');
            doc.addImage(logoDataUrl, 'PNG', 15.2, 5.4, 15.6, 15.6);
            textX = 36;
        }
        catch {
        }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('PORTAL INSTRUKTUR LBT PII', textX, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(meta?.eventName || 'Leadership Basic Training Pelajar Islam Indonesia', textX, 18.5);
    if (meta?.location) {
        doc.text(meta.location, textX, 23.5);
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text(title, 14, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 14, 43.5);
    doc.setTextColor(20, 24, 35);
}
function footer(doc: import('jspdf').jsPDF) {
    const pages = doc.getNumberOfPages();
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(220, 224, 232);
        doc.setLineWidth(0.2);
        doc.line(14, height - 13, width - 14, height - 13);
        doc.setTextColor(130, 136, 148);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('Dokumen dibuat otomatis oleh Portal Instruktur LBT PII', 14, height - 8.5);
        doc.text(`Halaman ${page} / ${pages}`, width - 14, height - 8.5, { align: 'right' });
    }
    doc.setTextColor(20, 24, 35);
}
function signature(doc: import('jspdf').jsPDF, y: number, leftLabel: string | null, rightLabel: string) {
    const width = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let startY = y;
    if (startY > pageHeight - 48) {
        doc.addPage();
        startY = 26;
    }
    doc.setDrawColor(170, 176, 190);
    doc.setLineWidth(0.25);
    if (leftLabel) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(leftLabel, 52, startY, { align: 'center' });
        doc.line(22, startY + 24, 82, startY + 24);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Nama & tanda tangan', 52, startY + 29, { align: 'center' });
    }
    const rightCenter = width - 52;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(rightLabel, rightCenter, startY, { align: 'center' });
    doc.line(width - 82, startY + 24, width - 22, startY + 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Nama & tanda tangan', rightCenter, startY + 29, { align: 'center' });
    doc.setTextColor(20, 24, 35);
}
function safeSlug(text: string): string {
    return (String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'laporan');
}
export async function downloadAssessmentPdf(input: {
    session: Session;
    assessment: SpeakerAssessment;
    speaker?: Speaker;
    meta?: Meta | null;
}) {
    const { session, assessment, speaker, meta } = input;
    const { jsPDF, autoTable, logoDataUrl } = await loadPdf();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const title = 'LEMBAR PENILAIAN PEMATERI';
    header(doc, title, `${session.topic} · ${localLabel(session.localId)}`, meta, logoDataUrl);
    const identityRows = [
        ['Nama pemateri', speaker?.name || assessment.speakerId],
        ['Tanggal', fmtDate(assessment.date)],
        ['Waktu', assessment.time || '—'],
        ['Observer', assessment.observerName],
        ['Lokal', localLabel(assessment.localId)],
    ];
    autoTable(doc, {
        startY: 50,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
        body: identityRows,
    });
    const body: (string | number)[][] = [];
    ASSESSMENT_GROUPS.forEach((group) => {
        body.push([
            {
                content: group.label.toUpperCase(),
                colSpan: 3,
                styles: { fillColor: [246, 241, 243], fontStyle: 'bold', textColor: [128, 0, 32] },
            } as never,
        ]);
        group.items.forEach((item) => {
            body.push([
                item.label,
                assessment.scores[item.key] || 0,
                assessment.notes?.[item.key] || '',
            ]);
        });
        body.push([
            `Rata-rata ${group.label}`,
            assessmentGroupAverage(assessment.scores, group).toFixed(2),
            '',
        ]);
    });
    autoTable(doc, {
        startY: lastYOf(doc, 96) + 5,
        head: [['Aspek yang dinilai', 'Skor (1–5)', 'Catatan']],
        body,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.3, valign: 'top' },
        headStyles: { fillColor: [128, 0, 32], textColor: 255 },
        columnStyles: {
            0: { cellWidth: 55 },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 'auto' },
        },
        didParseCell: (data) => {
            if (data.column.index === 1 && data.section === 'body') {
                data.cell.styles.halign = 'center';
                data.cell.styles.fontStyle = 'bold';
            }
        },
    });
    let y = lastYOf(doc, 240) + 8;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y > pageHeight - 70) {
        doc.addPage();
        y = 24;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`NILAI RATA-RATA: ${assessmentOverall(assessment.scores).toFixed(2)} / 5.00`, 14, y);
    y += 7;
    doc.text('Catatan umum', 14, y);
    y += 4.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const general = doc.splitTextToSize(assessment.generalNotes || '—', 180);
    doc.text(general, 14, y);
    y += general.length * 4 + 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Rekomendasi', 14, y);
    y += 4.8;
    doc.setFont('helvetica', 'normal');
    const recommendation = doc.splitTextToSize(assessment.recommendations || '—', 180);
    doc.text(recommendation, 14, y);
    y += recommendation.length * 4 + 10;
    signature(doc, y, 'Observer', 'Instruktur Lokal');
    footer(doc);
    doc.save(`penilaian-${session.id}-${assessment.id}.pdf`);
}
export async function downloadMonitoringPdf(input: {
    participants: Participant[];
    sessions: Session[];
    speakers?: Speaker[];
    meta?: Meta | null;
    title?: string;
    localId?: LocalId | null;
    dateRangeLabel?: string;
    perChart?: PdfPerChart;
}) {
    const { participants, sessions, speakers = [], meta, title, localId, dateRangeLabel } = input;
    const perChart = normalizePerChart(input.perChart);
    const { jsPDF, autoTable, logoDataUrl } = await loadPdf();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const recap = buildRecapReportData(sessions, participants, speakers);
    const { kpis, participantRows, sessionRows, assessmentDetails, allObserverNotes } = recap;
    const reportTitle = title || 'LAPORAN REKAP PERKEMBANGAN PESERTA';
    const scopePart = localId ? localLabel(localId) : 'Seluruh Lokal';
    const reportSubtitle = `${scopePart}${dateRangeLabel ? ` · ${dateRangeLabel}` : ''} · ${kpis.totalSessions} pertemuan · ${participantRows.length} peserta`;
    const drawHeader = (pageTitle: string) => header(doc, pageTitle, reportSubtitle, meta, logoDataUrl);
    drawHeader(reportTitle);
    const afterKpiY = drawKpiStrip(doc, [
        {
            label: 'Rata-rata RELI',
            value: kpis.avgReliAspect.toFixed(2),
            hint: `Skala 0–10 (${kpis.avgReliTotal.toFixed(1)}/40)`,
            accent: [128, 0, 32],
        },
        {
            label: 'Peserta Dinilai',
            value: `${kpis.scoredParticipants}/${kpis.totalParticipants}`,
            hint: `${kpis.scoredSessions}/${kpis.totalSessions} sesi bersosiogram`,
            accent: [11, 37, 69],
        },
        {
            label: 'Kehadiran',
            value: `${kpis.attendanceRate}%`,
            hint: `${kpis.presentEntries}/${kpis.totalAttendanceEntries} hadir`,
            accent: [47, 111, 98],
        },
        {
            label: 'Keaktifan Forum',
            value: String(kpis.totalInteractions),
            hint: `${kpis.participationRate}% peserta aktif`,
            accent: [194, 138, 43],
        },
        {
            label: 'Penilaian Pemateri',
            value: kpis.assessmentCount ? kpis.assessmentAvg.toFixed(2) : '—',
            hint: `${kpis.assessmentCount} lembar observer`,
            accent: [74, 111, 165],
        },
    ], 49);
    const participantTableRows = participantRows.map((entry, idx) => [
        idx + 1,
        entry.name,
        localLabel(entry.localId),
        entry.attendance.total ? `${entry.attendance.rate}% (${entry.attendance.present}/${entry.attendance.total})` : '—',
        entry.avgValues[0].toFixed(1),
        entry.avgValues[1].toFixed(1),
        entry.avgValues[2].toFixed(1),
        entry.avgValues[3].toFixed(1),
        entry.aspectAvg.toFixed(2),
        entry.predicate.label,
        entry.totalSum.toFixed(1),
        entry.observerNoteEntries.length
            ? entry.observerNoteEntries
                .map((item) => `[${fmtDate(item.date, { day: 'numeric', month: 'short' })}] ${item.note}`)
                .join('; ')
            : '—',
    ]);
    autoTable(doc, {
        startY: afterKpiY,
        head: [
            ['No', 'Nama Peserta', 'Lokal', 'Hadir', 'R', 'E', 'L', 'I', 'Rata2', 'Predikat', 'Akum.', 'Catatan Observer'],
        ],
        body: participantTableRows,
        theme: 'striped',
        styles: { fontSize: 7.2, cellPadding: 1.7, overflow: 'linebreak' },
        headStyles: { fillColor: [128, 0, 32], textColor: 255, fontSize: 7.2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 38 },
            2: { cellWidth: 20 },
            3: { cellWidth: 23, halign: 'center' },
            4: { cellWidth: 10, halign: 'center' },
            5: { cellWidth: 10, halign: 'center' },
            6: { cellWidth: 10, halign: 'center' },
            7: { cellWidth: 10, halign: 'center' },
            8: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
            9: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
            10: { cellWidth: 13, halign: 'center' },
            11: { cellWidth: 'auto' },
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 9) {
                const entry = participantRows[data.row.index];
                if (entry) {
                    data.cell.styles.fillColor = entry.predicate.bgRgb;
                    data.cell.styles.textColor = entry.predicate.rgb;
                }
            }
        },
    });
    let noteY = lastYOf(doc, 170) + 5;
    if (noteY > doc.internal.pageSize.getHeight() - 24) {
        doc.addPage();
        noteY = 22;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(100, 116, 139);
    doc.text('R = Respon · E = Emosi · L = Logika · I = Integritas (kolom R/E/L/I & Rata2 adalah rata-rata per sesi dinilai, skala 0–10)', 14, noteY);
    doc.text(RELI_PREDICATE_LEGEND, 14, noteY + 4.2);
    if (sessionRows.length) {
        doc.addPage();
        drawHeader('DAFTAR PERTEMUAN & KETEPATAN WAKTU');
        autoTable(doc, {
            startY: 50,
            head: [['No', 'Tanggal', 'Lokal', 'Materi', 'Durasi', 'Hadir', 'Dinilai', 'Rata2 RELI']],
            body: sessionRows.map((item) => {
                const durText = item.actualMinutes
                    ? `${fmtDurationShort(item.actualMinutes)}${item.durationDiff !== undefined ? ` (${fmtDurationDiff(item.durationDiff)})` : ''}`
                    : item.plannedMinutes
                        ? `${fmtDurationShort(item.plannedMinutes)} (renc.)`
                        : '—';
                return [
                    item.session.no || '—',
                    fmtDate(item.session.date),
                    localLabel(item.session.localId),
                    item.session.topic,
                    durText,
                    `${item.present}/${item.totalAttendance || '—'}`,
                    item.scored,
                    `${item.avgReliAspect.toFixed(2)} (${item.avgReliTotal.toFixed(1)})`,
                ];
            }),
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [11, 37, 69], textColor: 255, fontSize: 7.5 },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 26 },
                2: { cellWidth: 22 },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 36, halign: 'center' },
                5: { cellWidth: 18, halign: 'center' },
                6: { cellWidth: 16, halign: 'center' },
                7: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
            },
        });
    }
    if (assessmentDetails.length) {
        doc.addPage();
        drawHeader('REKAP PENILAIAN PEMATERI');
        autoTable(doc, {
            startY: 50,
            head: [['Pertemuan', 'Pemateri', 'Observer', 'Penamp.', 'Bahasa', 'Materi', 'Nilai', 'Catatan Umum', 'Rekomendasi']],
            body: assessmentDetails.map((item) => [
                `${fmtDate(item.assessment.date)} · ${item.session.topic} (${localLabel(item.session.localId)})`,
                item.speakerName,
                item.assessment.observerName,
                (item.groupAverages.penampilan || 0).toFixed(2),
                (item.groupAverages.bahasa || 0).toFixed(2),
                (item.groupAverages.materi || 0).toFixed(2),
                item.overall.toFixed(2),
                item.assessment.generalNotes || '—',
                item.assessment.recommendations || '—',
            ]),
            theme: 'grid',
            styles: { fontSize: 7.2, cellPadding: 1.8, overflow: 'linebreak' },
            headStyles: { fillColor: [128, 0, 32], textColor: 255, fontSize: 7.2 },
            columnStyles: {
                0: { cellWidth: 48 },
                1: { cellWidth: 30 },
                2: { cellWidth: 26 },
                3: { cellWidth: 14, halign: 'center' },
                4: { cellWidth: 14, halign: 'center' },
                5: { cellWidth: 14, halign: 'center' },
                6: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                7: { cellWidth: 50 },
                8: { cellWidth: 'auto' },
            },
        });
    }
    const insightEntries = participantRows.filter((row) => row.insight);
    if (insightEntries.length) {
        doc.addPage();
        drawHeader('INSIGHT KOMUNIKASI & REKOMENDASI POTENSI');
        autoTable(doc, {
            startY: 50,
            head: [['Nama Peserta', 'Lokal', 'Gaya Komunikasi', 'Interaksi', 'Materi Teraktif', 'Rekomendasi Potensi']],
            body: insightEntries.map((row) => [
                row.name,
                localLabel(row.localId),
                row.insight!.styleLabel,
                row.insight!.totalInteractions,
                row.insight!.topTopic?.topic || '—',
                row.insight!.potentialRecommendation,
            ]),
            theme: 'striped',
            styles: { fontSize: 7.2, cellPadding: 1.8, overflow: 'linebreak' },
            headStyles: { fillColor: [11, 37, 69], textColor: 255, fontSize: 7.2 },
            columnStyles: {
                0: { cellWidth: 38 },
                1: { cellWidth: 20 },
                2: { cellWidth: 38 },
                3: { cellWidth: 16, halign: 'center' },
                4: { cellWidth: 42 },
                5: { cellWidth: 'auto' },
            },
        });
    }
    const localRows = new Map<number | null, {
        name: string;
        values: number[];
    }[]>();
    participantRows
        .filter((entry) => entry.scoredSessions > 0)
        .forEach((entry) => {
        const key = entry.localId ?? null;
        const current = localRows.get(key) || [];
        current.push({ name: entry.name, values: entry.avgValues });
        localRows.set(key, current);
    });
    [...localRows.entries()].forEach(([rowLocalId, chartRows]) => {
        for (let index = 0; index < chartRows.length; index += perChart) {
            doc.addPage();
            drawHeader(reportTitle);
            drawReliGroupedChart({
                doc,
                title: `Rata-rata Nilai RELI per Peserta — ${localLabel(rowLocalId)}`,
                subtitle: `Rata-rata per sesi dinilai · Peserta ${index + 1}–${Math.min(index + perChart, chartRows.length)} dari ${chartRows.length} · Skala 0–10 per aspek (maks. total 40)`,
                startY: 50,
                rows: chartRows.slice(index, index + perChart),
                maxValue: 10,
                showValues: true,
            });
        }
    });
    communicationMatricesByLocal(sessions).forEach(({ localId: groupLocalId, matrix }) => {
        const body = matrixTableBody(matrix);
        if (!body.length)
            return;
        doc.addPage();
        drawHeader(`FREKUENSI KOMUNIKASI — ${localLabel(groupLocalId).toUpperCase()}`);
        autoTable(doc, {
            startY: 50,
            head: [['Nama Peserta', 'Teman', 'Pemateri', 'Total']],
            body,
            theme: 'grid',
            styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [128, 0, 32], textColor: 255, fontSize: 7.5 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 90 },
                1: { cellWidth: 28, halign: 'center' },
                2: { cellWidth: 28, halign: 'center' },
                3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
            },
        });
        doc.addPage();
        drawHeader(reportTitle);
        drawCommunicationHeatmap({
            doc,
            title: `Heatmap Komunikasi — ${localLabel(groupLocalId)}`,
            subtitle: 'Baris (kiri) = pengirim · Kolom (bawah) = inisial penerima · Kabel keluar (box = Pemateri)',
            startY: 50,
            rows: matrix.rows.map((row) => ({ id: row.id, label: row.name })),
            columns: matrix.columns.map((col) => ({ id: col.id, label: col.label, kind: col.kind })),
            values: matrix.values,
        });
    });
    if (allObserverNotes.length) {
        doc.addPage();
        drawHeader('CATATAN PESERTA DARI OBSERVER');
        autoTable(doc, {
            startY: 50,
            head: [['Nama Peserta', 'Lokal', 'Tanggal & Materi', 'Catatan Observer']],
            body: allObserverNotes.map((entry) => [
                entry.participantName,
                localLabel(entry.localId),
                `${fmtDate(entry.date)} · ${entry.topic}`,
                entry.note,
            ]),
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [11, 37, 69], textColor: 255, fontSize: 7.5 },
            columnStyles: {
                0: { cellWidth: 44, fontStyle: 'bold' },
                1: { cellWidth: 24 },
                2: { cellWidth: 62 },
                3: { cellWidth: 'auto' },
            },
        });
    }
    const finalY = doc.internal.pageSize.getHeight() - 52;
    doc.addPage();
    drawHeader('PENGESAHAN LAPORAN');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Laporan ini disusun berdasarkan rekaman sosiogram, absensi, dan penilaian pemateri pada ${scopePart}.`, 14, 58);
    signature(doc, Math.min(76, finalY), localId ? 'Observer' : null, localId ? 'Instruktur Lokal' : 'Koordinator Tim');
    footer(doc);
    doc.save(`laporan-perkembangan-${localId ? `lokal-${localId}` : 'semua-lokal'}.pdf`);
}
export async function downloadSessionReliPdf(input: {
    session: Session;
    sosiogram: SosiogramData;
    participants: Participant[];
    speakers?: Speaker[];
    meta?: Meta | null;
    perChart?: PdfPerChart;
}) {
    const { session, sosiogram, participants, speakers = [], meta } = input;
    const perChart = normalizePerChart(input.perChart);
    const { jsPDF, autoTable, logoDataUrl } = await loadPdf();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const rows = peopleReliRows(sosiogram).map((row) => {
        const participant = participants.find((item) => item.id === row.id);
        return { id: row.id, name: participant?.name || row.name, values: row.values };
    });
    if (!rows.length)
        throw new Error('Belum ada nilai RELI untuk pertemuan ini');
    const subtitle = `${session.no ? `Sesi ${session.no} · ` : ''}${session.topic} · ${localLabel(session.localId)} · ${fmtDate(session.date, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })}`;
    const averages = [0, 1, 2, 3].map((idx) => rows.reduce((sum, item) => sum + item.values[idx], 0) / rows.length);
    const avgAspect = averages.reduce((a, b) => a + b, 0) / 4;
    const presentCount = session.attendance.filter((item) => item.status === 'hadir' || item.status === 'terlambat').length;
    const attRate = session.attendance.length
        ? Math.round((presentCount / session.attendance.length) * 100)
        : 0;
    const { plannedMinutes, actualMinutes, durationDiff } = sessionDurationSummary(session);
    const communication = communicationMatrixOf(sosiogram);
    const totalComm = communication.rows.reduce((acc, row) => acc + row.total, 0);
    const drawSessionHeader = (pageTitle: string) => header(doc, pageTitle, subtitle, meta, logoDataUrl);
    drawSessionHeader('LAPORAN PERTEMUAN & HASIL RELI');
    const afterKpi = drawKpiStrip(doc, [
        {
            label: 'Rata-rata RELI',
            value: avgAspect.toFixed(2),
            hint: `Predikat: ${reliPredicate(avgAspect, rows.length).label}`,
            accent: [128, 0, 32],
        },
        {
            label: 'Peserta Dinilai',
            value: String(rows.length),
            hint: `Kehadiran: ${attRate}% (${presentCount}/${session.attendance.length})`,
            accent: [11, 37, 69],
        },
        {
            label: 'Durasi Sesi',
            value: actualMinutes ? fmtDurationShort(actualMinutes) : fmtDurationShort(plannedMinutes),
            hint: durationDiff !== undefined
                ? `Rencana ${fmtDurationShort(plannedMinutes)} (${fmtDurationDiff(durationDiff)})`
                : plannedMinutes
                    ? 'Sesuai rencana'
                    : 'Belum diisi',
            accent: [47, 111, 98],
        },
        {
            label: 'Komunikasi Kabel',
            value: String(totalComm),
            hint: `${communication.rows.filter((r) => r.total > 0).length} peserta aktif`,
            accent: [194, 138, 43],
        },
    ], 49);
    const scoreBody = rows.map((row, idx) => {
        const total = row.values.reduce((sum, val) => sum + val, 0);
        const aspectAvg = total / 4;
        const pred = reliPredicate(aspectAvg, 1);
        const att = row.id
            ? session.attendance.find((item) => item.participantId === row.id)?.status
            : undefined;
        const note = row.id
            ? getParticipantSessionNote(session, row.id)
            : sosiogram.seats.find((s) => s.name.trim() === row.name)?.note || '';
        return {
            pred,
            cells: [
                idx + 1,
                row.name,
                att ? attendanceLabel(att) : '—',
                row.values[0].toFixed(1),
                row.values[1].toFixed(1),
                row.values[2].toFixed(1),
                row.values[3].toFixed(1),
                total.toFixed(1),
                aspectAvg.toFixed(2),
                pred.label,
                note || '—',
            ],
        };
    });
    autoTable(doc, {
        startY: afterKpi,
        head: [['No', 'Nama Peserta', 'Status', 'R', 'E', 'L', 'I', 'Total', 'Rata2', 'Predikat', 'Catatan Observer']],
        body: scoreBody.map((item) => item.cells),
        theme: 'striped',
        styles: { fontSize: 7.3, cellPadding: 1.7, overflow: 'linebreak' },
        headStyles: { fillColor: [128, 0, 32], textColor: 255, fontSize: 7.3 },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 42 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 11, halign: 'center' },
            4: { cellWidth: 11, halign: 'center' },
            5: { cellWidth: 11, halign: 'center' },
            6: { cellWidth: 11, halign: 'center' },
            7: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
            8: { cellWidth: 13, halign: 'center' },
            9: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
            10: { cellWidth: 'auto' },
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 9) {
                const entry = scoreBody[data.row.index];
                if (entry) {
                    data.cell.styles.fillColor = entry.pred.bgRgb;
                    data.cell.styles.textColor = entry.pred.rgb;
                }
            }
        },
    });
    for (let index = 0; index < rows.length; index += perChart) {
        doc.addPage();
        drawSessionHeader('HASIL RELI PESERTA');
        drawReliGroupedChart({
            doc,
            title: 'Nilai RELI per Peserta',
            subtitle: `Peserta ${index + 1}–${Math.min(index + perChart, rows.length)} dari ${rows.length} · Skala 0–10 per aspek`,
            startY: 50,
            rows: rows.slice(index, index + perChart),
            maxValue: 10,
            showValues: true,
        });
    }
    if (session.assessments && session.assessments.length > 0) {
        const speakerNameOf = (id: string) => speakers.find((item) => item.id === id)?.name || '(pengajar)';
        doc.addPage();
        drawSessionHeader('PENILAIAN PEMATERI SESI');
        autoTable(doc, {
            startY: 50,
            head: [['Pemateri', 'Observer', 'Waktu', 'Penamp.', 'Bahasa', 'Materi', 'Nilai', 'Catatan Umum', 'Rekomendasi']],
            body: session.assessments.map((assessment) => [
                speakerNameOf(assessment.speakerId),
                assessment.observerName,
                assessment.time || fmtDate(assessment.date),
                assessmentGroupAverage(assessment.scores, ASSESSMENT_GROUPS[0]).toFixed(2),
                assessmentGroupAverage(assessment.scores, ASSESSMENT_GROUPS[1]).toFixed(2),
                assessmentGroupAverage(assessment.scores, ASSESSMENT_GROUPS[2]).toFixed(2),
                assessmentOverall(assessment.scores).toFixed(2),
                assessment.generalNotes || '—',
                assessment.recommendations || '—',
            ]),
            theme: 'grid',
            styles: { fontSize: 7.4, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [11, 37, 69], textColor: 255, fontSize: 7.4 },
        });
    }
    if (communication.rows.length) {
        doc.addPage();
        drawSessionHeader('FREKUENSI KOMUNIKASI SESI');
        autoTable(doc, {
            startY: 50,
            head: [['Nama Peserta', 'Teman', 'Pemateri', 'Total']],
            body: matrixTableBody(communication),
            theme: 'grid',
            styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [128, 0, 32], textColor: 255, fontSize: 7.5 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 90 },
                1: { cellWidth: 28, halign: 'center' },
                2: { cellWidth: 28, halign: 'center' },
                3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
            },
        });
        doc.addPage();
        drawSessionHeader('HEATMAP KOMUNIKASI SESI');
        drawCommunicationHeatmap({
            doc,
            title: 'Heatmap Komunikasi',
            subtitle: 'Baris (kiri) = pengirim · Kolom (bawah) = inisial penerima · Kabel keluar (box = Pemateri)',
            startY: 50,
            rows: communication.rows.map((row) => ({ id: row.id, label: row.name })),
            columns: communication.columns.map((col) => ({ id: col.id, label: col.label, kind: col.kind })),
            values: communication.values,
        });
    }
    doc.addPage();
    drawSessionHeader('CATATAN OBSERVASI & PENGESAHAN');
    let y = 52;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Catatan Observasi Umum Sesi', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(51, 65, 85);
    const catLines = doc.splitTextToSize(sosiogram.cat?.trim() || 'Tidak ada catatan observasi umum.', 268);
    doc.text(catLines, 14, y);
    y += catLines.length * 4.2 + 12;
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(RELI_PREDICATE_LEGEND, 14, y);
    y += 10;
    signature(doc, y, 'Observer', 'Instruktur Lokal');
    footer(doc);
    doc.save(sessionPdfFilename(session));
}
export async function downloadParticipantReportPdf(input: {
    participant: Participant;
    sessions: Session[];
    speakers: Speaker[];
    meta?: Meta | null;
    dateRangeLabel?: string;
}) {
    const { participant, sessions, speakers, meta, dateRangeLabel } = input;
    const { jsPDF, autoTable, logoDataUrl } = await loadPdf();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const data = buildParticipantReportData(participant, sessions, speakers);
    const subtitle = `${participant.name} · ${localLabel(participant.localId)}${participant.origin ? ` · ${participant.origin}` : ''}${dateRangeLabel ? ` · ${dateRangeLabel}` : ''}`;
    header(doc, 'RAPOR PERKEMBANGAN INDIVIDU PESERTA', subtitle, meta, logoDataUrl);
    let y = drawKpiStrip(doc, [
        {
            label: 'Rata-rata RELI',
            value: data.aspectAvg.toFixed(2),
            hint: `Lokal: ${data.localAvgAspect.toFixed(2)}`,
            accent: [128, 0, 32],
        },
        {
            label: 'Predikat',
            value: data.predicate.label,
            hint: `${data.scoredSessions} sesi dinilai`,
            accent: data.predicate.rgb,
        },
        {
            label: 'Kehadiran',
            value: `${data.attendance.rate}%`,
            hint: `${data.attendance.present}/${data.attendance.total} hadir`,
            accent: [47, 111, 98],
        },
        {
            label: 'Komunikasi',
            value: String(data.insight?.totalInteractions || 0),
            hint: data.insight?.styleLabel || 'Belum tercatat',
            accent: [194, 138, 43],
        },
    ], 49);
    autoTable(doc, {
        startY: y,
        head: [['Aspek RELI', 'Respon (R)', 'Emosi (E)', 'Logika (L)', 'Integritas (I)', 'Total/Sesi', 'Akumulasi']],
        body: [
            [
                'Rata-rata Peserta',
                data.avgValues[0].toFixed(1),
                data.avgValues[1].toFixed(1),
                data.avgValues[2].toFixed(1),
                data.avgValues[3].toFixed(1),
                data.totalAvg.toFixed(1),
                data.totalSum.toFixed(1),
            ],
        ],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.2, halign: 'center' },
        headStyles: { fillColor: [11, 37, 69], textColor: 255, fontSize: 7.8 },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    });
    y = lastYOf(doc, y + 20) + 6;
    if (data.insight) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text('Analisis Gaya Komunikasi & Rekomendasi Potensi', 14, y);
        y += 4.5;
        autoTable(doc, {
            startY: y,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.2 },
            columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', fillColor: [248, 250, 252] } },
            body: [
                ['Gaya Komunikasi', `${data.insight.styleLabel} — ${data.insight.styleDescription}`],
                ['Materi Teraktif', data.insight.topTopic?.topic || 'Belum terpetakan'],
                ['Pemateri Terresponsif', data.insight.topSpeaker?.speakerName || '—'],
                ['Rekomendasi Potensi', data.insight.potentialRecommendation],
            ],
        });
        y = lastYOf(doc, y + 36) + 6;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Riwayat Pertemuan & Nilai RELI', 14, y);
    y += 4;
    autoTable(doc, {
        startY: y,
        head: [['Tanggal', 'Materi', 'Hadir', 'R', 'E', 'L', 'I', 'Total', 'Predikat', 'Catatan']],
        body: data.history.map((item) => [
            fmtDate(item.session.date, { day: 'numeric', month: 'short' }),
            item.session.topic,
            item.attendance ? attendanceLabel(item.attendance) : '—',
            item.values ? item.values[0].toFixed(1) : '—',
            item.values ? item.values[1].toFixed(1) : '—',
            item.values ? item.values[2].toFixed(1) : '—',
            item.values ? item.values[3].toFixed(1) : '—',
            item.total !== null ? item.total.toFixed(1) : '—',
            item.predicate.label,
            item.observerNote || '—',
        ]),
        theme: 'striped',
        styles: { fontSize: 7.2, cellPadding: 1.7, overflow: 'linebreak' },
        headStyles: { fillColor: [128, 0, 32], textColor: 255, fontSize: 7.2 },
        columnStyles: {
            0: { cellWidth: 16 },
            1: { cellWidth: 36 },
            2: { cellWidth: 16, halign: 'center' },
            3: { cellWidth: 9, halign: 'center' },
            4: { cellWidth: 9, halign: 'center' },
            5: { cellWidth: 9, halign: 'center' },
            6: { cellWidth: 9, halign: 'center' },
            7: { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
            8: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
            9: { cellWidth: 'auto' },
        },
        didParseCell: (cellData) => {
            if (cellData.section === 'body' && cellData.column.index === 8) {
                const entry = data.history[cellData.row.index];
                if (entry) {
                    cellData.cell.styles.fillColor = entry.predicate.bgRgb;
                    cellData.cell.styles.textColor = entry.predicate.rgb;
                }
            }
        },
    });
    y = lastYOf(doc, 220) + 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(RELI_PREDICATE_LEGEND, 14, y);
    y += 10;
    signature(doc, y, 'Observer', 'Instruktur Lokal');
    footer(doc);
    doc.save(`rapor-${safeSlug(participant.name)}.pdf`);
}
export async function downloadSpeakerAssessmentsSummaryPdf(input: {
    sessions: Session[];
    participants: Participant[];
    speakers: Speaker[];
    meta?: Meta | null;
    localId?: LocalId | null;
    dateRangeLabel?: string;
}) {
    const { sessions, participants, speakers, meta, localId, dateRangeLabel } = input;
    const { jsPDF, autoTable, logoDataUrl } = await loadPdf();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const recap = buildRecapReportData(sessions, participants, speakers);
    const { speakerSummaries, assessmentDetails, kpis } = recap;
    const scopePart = localId ? localLabel(localId) : 'Seluruh Lokal';
    const subtitle = `${scopePart}${dateRangeLabel ? ` · ${dateRangeLabel}` : ''} · ${assessmentDetails.length} lembar penilaian`;
    header(doc, 'LAPORAN REKAP PENILAIAN PEMATERI', subtitle, meta, logoDataUrl);
    const afterKpi = drawKpiStrip(doc, [
        {
            label: 'Rata-rata Nilai',
            value: assessmentDetails.length ? kpis.assessmentAvg.toFixed(2) : '—',
            hint: 'Skala 1.00 – 5.00',
            accent: [128, 0, 32],
        },
        {
            label: 'Total Lembar',
            value: String(assessmentDetails.length),
            hint: `${speakerSummaries.length} pemateri dinilai`,
            accent: [11, 37, 69],
        },
        ...ASSESSMENT_GROUPS.map((group, idx) => {
            const avg = assessmentDetails.length
                ? assessmentDetails.reduce((s, item) => s + (item.groupAverages[group.key] || 0), 0) /
                    assessmentDetails.length
                : 0;
            const accents: [
                number,
                number,
                number
            ][] = [
                [47, 111, 98],
                [194, 138, 43],
                [74, 111, 165],
            ];
            return {
                label: group.label,
                value: assessmentDetails.length ? avg.toFixed(2) : '—',
                hint: 'Rata-rata aspek',
                accent: accents[idx % 3],
            };
        }),
    ], 49);
    autoTable(doc, {
        startY: afterKpi,
        head: [['No', 'Nama Pemateri', 'Sesi', 'Lembar', 'Penampilan', 'Bahasa', 'Materi', 'Nilai Akhir']],
        body: speakerSummaries.map((item, idx) => [
            idx + 1,
            item.speakerName,
            item.sessionsCount,
            item.assessmentsCount,
            (item.groupAverages.penampilan || 0).toFixed(2),
            (item.groupAverages.bahasa || 0).toFixed(2),
            (item.groupAverages.materi || 0).toFixed(2),
            item.overallAvg.toFixed(2),
        ]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [128, 0, 32], textColor: 255, fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 'auto', fontStyle: 'bold' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 22, halign: 'center' },
            4: { cellWidth: 26, halign: 'center' },
            5: { cellWidth: 26, halign: 'center' },
            6: { cellWidth: 26, halign: 'center' },
            7: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        },
    });
    if (assessmentDetails.length) {
        doc.addPage();
        header(doc, 'DETAIL LEMBAR PENILAIAN PEMATERI', subtitle, meta, logoDataUrl);
        autoTable(doc, {
            startY: 50,
            head: [['Tanggal', 'Lokal', 'Materi', 'Pemateri', 'Observer', 'Penamp.', 'Bahasa', 'Materi', 'Nilai', 'Catatan Umum', 'Rekomendasi']],
            body: assessmentDetails.map((item) => [
                fmtDate(item.assessment.date),
                localLabel(item.session.localId),
                item.session.topic,
                item.speakerName,
                item.assessment.observerName,
                (item.groupAverages.penampilan || 0).toFixed(2),
                (item.groupAverages.bahasa || 0).toFixed(2),
                (item.groupAverages.materi || 0).toFixed(2),
                item.overall.toFixed(2),
                item.assessment.generalNotes || '—',
                item.assessment.recommendations || '—',
            ]),
            theme: 'grid',
            styles: { fontSize: 7.1, cellPadding: 1.7, overflow: 'linebreak' },
            headStyles: { fillColor: [11, 37, 69], textColor: 255, fontSize: 7.1 },
        });
    }
    signature(doc, lastYOf(doc, 140) + 12, localId ? 'Observer' : null, localId ? 'Instruktur Lokal' : 'Koordinator Tim');
    footer(doc);
    doc.save(`rekap-penilaian-pemateri-${localId ? `lokal-${localId}` : 'semua-lokal'}.pdf`);
}
export function assessmentStatusLabel(session: Session): string {
    const count = session.assessments?.length || 0;
    if (!count)
        return 'Belum dinilai';
    return `${count} penilaian`;
}
export function attendanceText(status?: string): string {
    return attendanceLabel(status as never);
}
