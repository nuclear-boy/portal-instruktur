import type { jsPDF } from 'jspdf';
import { RELI_BAR_COLORS, RELI_LABELS } from './reli';
import {
  buildHeatmapInitials,
  type HeatmapColumnInput,
  type HeatmapRowInput,
} from './reportCharts';

export interface PdfKpiItem {
  label: string;
  value: string;
  hint?: string;
  accent?: [number, number, number];
}

function chartMax(values: number[], fixed?: number): number {
  if (fixed && fixed > 0) return fixed;
  const highest = Math.max(1, ...values);
  if (highest <= 10) return 10;
  const power = 10 ** Math.floor(Math.log10(highest));
  return Math.ceil(highest / power) * power;
}

function shortLabel(label: string, max: number): string {
  const clean = label.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function labelLines(label: string, max: number): string[] {
  const clean = label.trim();
  if (clean.length <= max) return [clean];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= max || !current) {
      current = next;
      return;
    }
    lines.push(current);
    current = shortLabel(word, max);
  });
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function titleBlock(
  doc: jsPDF,
  title: string,
  subtitle: string | undefined,
  startY: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, startY);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 14, startY + 4.8);
  }
  doc.setTextColor(20, 24, 35);
  return startY + (subtitle ? 11.5 : 7);
}

export function drawKpiStrip(doc: jsPDF, items: PdfKpiItem[], startY: number): number {
  if (!items.length) return startY;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const gap = 3.5;
  const boxWidth = (pageWidth - marginX * 2 - gap * (items.length - 1)) / items.length;
  const boxHeight = 19;

  items.forEach((item, index) => {
    const x = marginX + index * (boxWidth + gap);
    const accent = item.accent || (index % 2 === 0 ? [128, 0, 32] : [11, 37, 69]);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(219, 227, 236);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, startY, boxWidth, boxHeight, 1.8, 1.8, 'FD');

    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(x, startY + 0.6, 1.3, boxHeight - 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(shortLabel(item.label.toUpperCase(), 24), x + 3.5, startY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(shortLabel(item.value, 18), x + 3.5, startY + 11.8);

    if (item.hint) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(100, 116, 139);
      doc.text(shortLabel(item.hint, 28), x + 3.5, startY + 16.5);
    }
  });

  doc.setTextColor(20, 24, 35);
  return startY + boxHeight + 5;
}

export function drawReliGroupedChart(input: {
  doc: jsPDF;
  title: string;
  subtitle?: string;
  startY?: number;
  rows: { name: string; values: number[] }[];
  maxValue?: number;
  showValues?: boolean;
}): number {
  const { doc, title, subtitle, startY = 20, rows, maxValue, showValues = false } = input;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = titleBlock(doc, title, subtitle, startY);

  if (!rows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(95, 102, 117);
    doc.text('Belum ada nilai RELI untuk ditampilkan.', 14, y);
    return y + 8;
  }

  const left = 24;
  const right = pageWidth - 14;
  const plotWidth = right - left;
  const plotTop = y + 9;
  const plotBottom = Math.min(plotTop + 86, pageHeight - 48);
  const plotHeight = plotBottom - plotTop;
  const max = chartMax(rows.flatMap((row) => row.values), maxValue);
  const slot = plotWidth / rows.length;
  const gap = Math.min(1.3, slot * 0.1);
  const barWidth = Math.max(1.4, Math.min(6.4, (slot * 0.74 - gap * 3) / 4));
  const barsWidth = barWidth * 4 + gap * 3;

  doc.setLineWidth(0.15);
  for (let tick = 0; tick <= 5; tick += 1) {
    const value = (max / 5) * tick;
    const lineY = plotBottom - (value / max) * plotHeight;
    doc.setDrawColor(tick === 0 ? 180 : 226, tick === 0 ? 192 : 232, tick === 0 ? 206 : 240);
    doc.line(left, lineY, right, lineY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(value % 1 === 0 ? String(value) : value.toFixed(1), left - 2, lineY + 1, {
      align: 'right',
    });
  }

  rows.forEach((row, rowIndex) => {
    const start = left + rowIndex * slot + (slot - barsWidth) / 2;
    const center = left + rowIndex * slot + slot / 2;
    const total = row.values.reduce((sum, value) => sum + value, 0);

    // Total badge cleanly above plotTop (never collides with bar values)
    const pillW = 11.5;
    const pillH = 4.6;
    const pillY = plotTop - 8.2;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(center - pillW / 2, pillY, pillW, pillH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.setTextColor(15, 23, 42);
    doc.text(total.toFixed(1), center, pillY + 3.2, { align: 'center' });

    row.values.forEach((value, valueIndex) => {
      const barHeight = Math.max(0, Math.min(1, value / max) * plotHeight);
      const barX = start + valueIndex * (barWidth + gap);
      doc.setFillColor(...RELI_BAR_COLORS[valueIndex]);
      doc.rect(barX, plotBottom - barHeight, barWidth, barHeight, 'F');
      if (showValues && value > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.2);
        doc.setTextColor(51, 65, 85);
        doc.text(
          value.toFixed(1),
          barX + barWidth / 2,
          Math.max(plotTop + 1.8, plotBottom - barHeight - 1.2),
          { align: 'center' },
        );
      }
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(51, 65, 85);
    labelLines(row.name, 18).forEach((line, lineIndex) => {
      doc.text(line, center, plotBottom + 4.5 + lineIndex * 3.2, { align: 'center' });
    });
  });

  let legendX = 14;
  const legendY = Math.min(plotBottom + 15, pageHeight - 25);
  doc.setFontSize(7);
  RELI_LABELS.forEach((label, index) => {
    const text = `${label[0]} — ${label}`;
    doc.setFillColor(...RELI_BAR_COLORS[index]);
    doc.rect(legendX, legendY - 2.4, 3, 3, 'F');
    doc.setTextColor(71, 85, 105);
    doc.text(text, legendX + 4.2, legendY);
    legendX += 4.2 + doc.getTextWidth(text) + 7.5;
  });
  doc.setTextColor(20, 24, 35);
  return legendY + 6;
}

function blueScaleRgb(ratio: number): [number, number, number] {
  if (ratio <= 0) return [255, 255, 255];
  if (ratio < 0.35) return [219, 234, 254];
  if (ratio < 0.65) return [96, 165, 250];
  if (ratio < 0.85) return [29, 78, 216];
  return [11, 37, 69];
}

function maroonScaleRgb(ratio: number): [number, number, number] {
  if (ratio <= 0) return [255, 245, 247];
  if (ratio < 0.35) return [254, 205, 211];
  if (ratio < 0.65) return [225, 29, 72];
  if (ratio < 0.85) return [159, 18, 57];
  return [128, 0, 32];
}

export function drawCommunicationHeatmap(input: {
  doc: jsPDF;
  title: string;
  subtitle?: string;
  startY?: number;
  rows: (string | HeatmapRowInput)[];
  columns: (string | HeatmapColumnInput)[];
  values: number[][];
  maxRows?: number;
  maxColumns?: number;
}): number {
  const {
    doc,
    title,
    subtitle,
    startY = 20,
    rows: rawRows,
    columns: rawColumns,
    values,
    maxRows = 22,
    maxColumns = 32,
  } = input;

  const normRows = rawRows.map((row, idx) =>
    typeof row === 'string'
      ? { id: `row:${row.trim() || idx}`, label: row }
      : { id: row.id || `row:${row.label.trim() || idx}`, label: row.label },
  );
  const normCols = rawColumns.map((col, idx) =>
    typeof col === 'string'
      ? { id: `col:${col.trim() || idx}`, label: col, kind: 'peserta' as const }
      : {
          id: col.id || `col:${col.label.trim() || idx}`,
          label: col.label,
          kind: col.kind || ('peserta' as const),
        },
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = titleBlock(doc, title, subtitle, startY);

  if (!normRows.length || !normCols.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(95, 102, 117);
    doc.text('Belum ada data komunikasi untuk ditampilkan.', 14, y);
    return y + 8;
  }

  const visibleRows = normRows.slice(0, maxRows);
  const visibleColumns = normCols.slice(0, maxColumns);
  const truncated = normRows.length > visibleRows.length || normCols.length > visibleColumns.length;

  const { map: initialMap, entries: legendEntries } = buildHeatmapInitials(
    visibleRows,
    visibleColumns,
  );

  const firstBoxIndex = visibleColumns.findIndex((col) => col.kind === 'box');
  const hasBoxDivider = firstBoxIndex > 0;
  const dividerGap = hasBoxDivider ? 3 : 0;

  const labelWidth = 54;
  const rightMargin = 14;
  const gridWidth = pageWidth - labelWidth - rightMargin - dividerGap;
  const cellWidth = gridWidth / visibleColumns.length;

  const legendCols = 4;
  const legendRowsEst = Math.ceil(legendEntries.length / legendCols);
  const legendHeightEst = Math.min(34, 8 + legendRowsEst * 4);
  const availableForGrid = pageHeight - y - 22 - 14 - legendHeightEst - (truncated ? 6 : 0);
  const cellHeight = Math.max(3.8, Math.min(5.8, availableForGrid / visibleRows.length));

  const max = Math.max(
    1,
    ...visibleRows.flatMap((_, rowIndex) =>
      visibleColumns.map((__, columnIndex) => Number(values[rowIndex]?.[columnIndex]) || 0),
    ),
  );

  const colX = (columnIndex: number) =>
    labelWidth +
    columnIndex * cellWidth +
    (hasBoxDivider && columnIndex >= firstBoxIndex ? dividerGap : 0);

  // Top utility bar: Pengirim label + smooth color scale swatches
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Pengirim (baris)', labelWidth - 2, y + 2, { align: 'right' });

  const swatches = [0, 0.25, 0.55, 0.8, 1];
  const scaleStartX = pageWidth - rightMargin - (firstBoxIndex >= 0 ? 52 : 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('Skala: 0', scaleStartX - 2, y + 2, { align: 'right' });
  swatches.forEach((ratio, idx) => {
    const rgb = blueScaleRgb(ratio);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.12);
    doc.rect(scaleStartX + idx * 4.2, y - 0.6, 3.6, 3.2, 'FD');
  });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 37, 69);
  doc.text(String(max), scaleStartX + swatches.length * 4.2 + 1.5, y + 2);
  if (firstBoxIndex >= 0) {
    const pmX = scaleStartX + swatches.length * 4.2 + 9;
    doc.setFillColor(128, 0, 32);
    doc.rect(pmX, y - 0.6, 3.2, 3.2, 'F');
    doc.setTextColor(128, 0, 32);
    doc.text('Pemateri', pmX + 4.2, y + 2);
  }
  y += 5;

  if (truncated) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.15);
    doc.roundedRect(labelWidth, y - 1, pageWidth - labelWidth - rightMargin, 5, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(146, 64, 14);
    doc.text(
      `Menampilkan ${visibleRows.length} dari ${normRows.length} pengirim & ${visibleColumns.length} dari ${normCols.length} penerima teraktif.`,
      labelWidth + 2,
      y + 2.3,
    );
    y += 6;
  }

  const gridTop = y;
  const gridBottom = gridTop + visibleRows.length * cellHeight;

  // Grid rows & cells
  visibleRows.forEach((row, rowIndex) => {
    const rowY = gridTop + rowIndex * cellHeight;
    const rowInitial = initialMap.get(row.id) || '';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(30, 41, 59);
    const fullRowLabel = `${shortLabel(row.label, 21)} (${rowInitial})`;
    doc.text(fullRowLabel, labelWidth - 2, rowY + cellHeight * 0.68, { align: 'right' });

    visibleColumns.forEach((column, columnIndex) => {
      const x = colX(columnIndex);
      const cellW = Math.max(1.8, cellWidth - 0.55);
      const cellH = cellHeight - 0.55;
      const isSelf = column.kind !== 'box' && column.id === row.id;

      if (isSelf) {
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.12);
        doc.rect(x, rowY, cellW, cellH, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(148, 163, 184);
        doc.text('·', x + cellW / 2, rowY + cellH * 0.72, { align: 'center' });
        return;
      }

      const value = Number(values[rowIndex]?.[columnIndex]) || 0;
      const ratio = value / max;
      const rgb = column.kind === 'box' ? maroonScaleRgb(ratio) : blueScaleRgb(ratio);
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      if (value > 0) {
        doc.rect(x, rowY, cellW, cellH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cellWidth < 6 ? 4.8 : 5.6);
        if (ratio >= 0.5) {
          doc.setTextColor(255, 255, 255);
        } else if (column.kind === 'box') {
          doc.setTextColor(128, 0, 32);
        } else {
          doc.setTextColor(11, 37, 69);
        }
        doc.text(String(value), x + cellW / 2, rowY + cellH * 0.72, { align: 'center' });
      } else {
        doc.setDrawColor(column.kind === 'box' ? 254 : 226, column.kind === 'box' ? 205 : 232, column.kind === 'box' ? 211 : 240);
        doc.setLineWidth(0.12);
        doc.rect(x, rowY, cellW, cellH, 'FD');
      }
    });
  });

  // Dashed divider between Peserta and Pemateri/Box
  if (hasBoxDivider) {
    const divX = labelWidth + firstBoxIndex * cellWidth + dividerGap / 2 - 0.25;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.line(divX, gridTop - 0.5, divX, gridBottom + 6.5);
  }

  // Bottom column initials (horizontal & upright inside clean pills!)
  const badgeY = gridBottom + 1.4;
  const badgeH = 4.8;
  const fontSize = visibleColumns.length > 26 ? 4.4 : visibleColumns.length > 18 ? 5.0 : 5.7;

  visibleColumns.forEach((column, columnIndex) => {
    const x = colX(columnIndex);
    const cellW = Math.max(1.8, cellWidth - 0.55);
    const initial = initialMap.get(column.id) || shortLabel(column.label, 3).toUpperCase();
    const isBox = column.kind === 'box';

    if (isBox) {
      doc.setFillColor(255, 228, 230);
      doc.setDrawColor(253, 164, 175);
    } else {
      doc.setFillColor(238, 242, 255);
      doc.setDrawColor(199, 210, 254);
    }
    doc.setLineWidth(0.15);
    doc.roundedRect(x, badgeY, cellW, badgeH, 0.8, 0.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    if (isBox) doc.setTextColor(128, 0, 32);
    else doc.setTextColor(30, 58, 138);
    doc.text(initial, x + cellW / 2, badgeY + 3.4, { align: 'center' });
  });

  // Axis footer line under bottom pills
  const axisY = badgeY + badgeH + 3.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(71, 85, 105);
  doc.text('Penerima (kolom)', labelWidth - 2, axisY, { align: 'right' });

  const pesertaEndX = hasBoxDivider
    ? labelWidth + firstBoxIndex * cellWidth - 0.6
    : pageWidth - rightMargin;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Peserta', (labelWidth + pesertaEndX) / 2, axisY, { align: 'center' });
  if (hasBoxDivider) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(128, 0, 32);
    doc.text(
      'Pemateri',
      (colX(firstBoxIndex) + pageWidth - rightMargin) / 2,
      axisY,
      { align: 'center' },
    );
  }

  // Keterangan Inisial multi-column box right below heatmap
  let legendTop = axisY + 3.5;
  const legendLineH = 3.8;
  const legendBoxH = 6.5 + Math.ceil(legendEntries.length / legendCols) * legendLineH + 2;
  if (legendTop + legendBoxH > pageHeight - 16) {
    doc.addPage();
    legendTop = 18;
  }

  const boxW = pageWidth - 28;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(219, 227, 236);
  doc.setLineWidth(0.2);
  doc.roundedRect(14, legendTop, boxW, legendBoxH, 1.6, 1.6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text('KETERANGAN INISIAL HEATMAP', 17, legendTop + 4.4);

  const colW = (boxW - 6) / legendCols;
  legendEntries.forEach((entry, index) => {
    const col = index % legendCols;
    const row = Math.floor(index / legendCols);
    const ix = 17 + col * colW;
    const iy = legendTop + 8.6 + row * legendLineH;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    if (entry.kind === 'box') doc.setTextColor(128, 0, 32);
    else doc.setTextColor(30, 58, 138);
    doc.text(entry.initial, ix, iy);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const suffix = entry.kind === 'box' ? ' (Pemateri)' : '';
    doc.text(`= ${shortLabel(entry.label, 22)}${suffix}`, ix + 9, iy);
  });

  doc.setTextColor(20, 24, 35);
  return legendTop + legendBoxH + 4;
}
