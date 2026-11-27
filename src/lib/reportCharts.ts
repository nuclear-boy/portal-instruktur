import { buildUniqueInitials, formatNameWithInitial, type InitialSource } from './initials';
import { RELI_BAR_COLORS_CSS, RELI_LABELS } from './reli';
export interface ChartSeries {
    label: string;
    color: string;
}
export interface ChartGroup {
    label: string;
    values: number[];
}
export interface HeatmapRowInput {
    id?: string;
    label: string;
}
export interface HeatmapColumnInput {
    id?: string;
    label: string;
    kind?: 'peserta' | 'box';
}
export interface HeatmapInitialEntry {
    id: string;
    initial: string;
    label: string;
    kind: 'peserta' | 'box';
}
function esc(value: unknown): string {
    return String(value == null ? '' : value).replace(/[&<>"]/g, (char) => {
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return map[char];
    });
}
function shortLabel(label: string, max: number): string {
    const clean = label.trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
function labelLines(label: string, max: number): string[] {
    const clean = label.trim();
    if (clean.length <= max)
        return [clean];
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
    if (current)
        lines.push(current);
    return lines.slice(0, 2);
}
function chartMax(values: number[], fixed?: number): number {
    if (fixed && fixed > 0)
        return fixed;
    const highest = Math.max(1, ...values);
    if (highest <= 10)
        return 10;
    const power = 10 ** Math.floor(Math.log10(highest));
    return Math.ceil(highest / power) * power;
}
function tickValues(max: number): number[] {
    return [0, 1, 2, 3, 4, 5].map((index) => (max / 5) * index);
}
function normalizeRows(rows: (string | HeatmapRowInput)[]): {
    id: string;
    label: string;
}[] {
    return rows.map((row, index) => typeof row === 'string'
        ? { id: `row:${row.trim() || index}`, label: row }
        : { id: row.id || `row:${row.label.trim() || index}`, label: row.label });
}
function normalizeColumns(columns: (string | HeatmapColumnInput)[]): {
    id: string;
    label: string;
    kind: 'peserta' | 'box';
}[] {
    return columns.map((column, index) => typeof column === 'string'
        ? { id: `col:${column.trim() || index}`, label: column, kind: 'peserta' }
        : {
            id: column.id || `col:${column.label.trim() || index}`,
            label: column.label,
            kind: column.kind || 'peserta',
        });
}
export function buildHeatmapInitials(rows: (string | HeatmapRowInput)[], columns: (string | HeatmapColumnInput)[]): {
    map: Map<string, string>;
    entries: HeatmapInitialEntry[];
} {
    const normRows = normalizeRows(rows);
    const normCols = normalizeColumns(columns);
    const uniqueSources = new Map<string, InitialSource>();
    normCols.forEach((col) => {
        if (!uniqueSources.has(col.id)) {
            uniqueSources.set(col.id, { id: col.id, label: col.label, kind: col.kind });
        }
    });
    normRows.forEach((row) => {
        if (!uniqueSources.has(row.id)) {
            uniqueSources.set(row.id, { id: row.id, label: row.label, kind: 'peserta' });
        }
    });
    const sources = [...uniqueSources.values()];
    const map = buildUniqueInitials(sources);
    const entries: HeatmapInitialEntry[] = sources.map((source) => ({
        id: source.id,
        initial: map.get(source.id) || '',
        label: source.label,
        kind: source.kind || 'peserta',
    }));
    return { map, entries };
}
export function reliChartSeries(): ChartSeries[] {
    return RELI_LABELS.map((label, index) => ({
        label,
        color: RELI_BAR_COLORS_CSS[index],
    }));
}
export function groupedVerticalBarsSvg(input: {
    groups: ChartGroup[];
    series: ChartSeries[];
    maxValue?: number;
    showValues?: boolean;
}): string {
    const { groups, series, maxValue, showValues = false } = input;
    if (!groups.length || !series.length)
        return '<p class="muted">Belum ada data.</p>';
    const width = 960;
    const height = 368;
    const margin = { top: 44, right: 20, bottom: 96, left: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const max = chartMax(groups.flatMap((group) => group.values), maxValue);
    const ticks = tickValues(max);
    const slot = plotWidth / groups.length;
    const gap = Math.min(3.5, slot * 0.1);
    const barWidth = Math.max(4, Math.min(18, (slot * 0.74 - gap * (series.length - 1)) / series.length));
    const barsWidth = barWidth * series.length + gap * (series.length - 1);
    const plotBottom = margin.top + plotHeight;
    const grid = ticks
        .map((tick, index) => {
        const y = plotBottom - (tick / max) * plotHeight;
        const stroke = index === 0 ? '#cbd5e1' : '#e2e8f0';
        const dash = index === 0 ? '' : ' stroke-dasharray="3 3"';
        return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${stroke}" stroke-width="1"${dash}/><text x="${margin.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#64748b">${tick % 1 === 0 ? tick : tick.toFixed(1)}</text>`;
    })
        .join('');
    const bars = groups
        .map((group, groupIndex) => {
        const start = margin.left + groupIndex * slot + (slot - barsWidth) / 2;
        const groupCenter = margin.left + groupIndex * slot + slot / 2;
        const total = group.values.reduce((sum, value) => sum + value, 0);
        const columns = series
            .map((item, seriesIndex) => {
            const value = Number(group.values[seriesIndex] || 0);
            const barHeight = Math.max(0, Math.min(1, value / max) * plotHeight);
            const x = start + seriesIndex * (barWidth + gap);
            const y = plotBottom - barHeight;
            const labelY = Math.max(margin.top + 8, y - 4);
            const valueLabel = showValues && value > 0
                ? `<text x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle" font-size="8.2" font-weight="700" fill="#334155">${value.toFixed(1)}</text>`
                : '';
            return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${item.color}"><title>${esc(group.label)} · ${esc(item.label)}: ${value.toFixed(1)}</title></rect>${valueLabel}`;
        })
            .join('');
        const totalPillW = 36;
        const totalPillY = margin.top - 29;
        const totalBadge = `<rect x="${groupCenter - totalPillW / 2}" y="${totalPillY}" width="${totalPillW}" height="16" rx="8" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.8"/><text x="${groupCenter}" y="${totalPillY + 11}" text-anchor="middle" font-size="8.8" font-weight="700" fill="#0f172a">${total.toFixed(1)}</text>`;
        const labelY = plotBottom + 16;
        const label = labelLines(group.label, 19)
            .map((line, lineIndex) => `<tspan x="${groupCenter}" dy="${lineIndex === 0 ? 0 : 12}">${esc(line)}</tspan>`)
            .join('');
        return `<g>${columns}${totalBadge}<text x="${groupCenter}" y="${labelY}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#334155"><title>${esc(group.label)}</title>${label}</text></g>`;
    })
        .join('');
    let legendX = margin.left;
    const legend = series
        .map((item) => {
        const text = shortLabel(item.label, 18);
        const node = `<g transform="translate(${legendX} ${height - 24})"><rect width="10" height="10" rx="2.5" fill="${item.color}"/><text x="15" y="9" font-size="10.5" font-weight="600" fill="#475569">${esc(text)}</text></g>`;
        legendX += 15 + text.length * 6.2 + 18;
        return node;
    })
        .join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" style="max-width:960px;display:block">${grid}${bars}${legend}</svg>`;
}
export function horizontalBarsSvg(rows: {
    label: string;
    value: number;
    color?: string;
}[]): string {
    if (!rows.length)
        return '<p class="muted">Belum ada data.</p>';
    const width = 960;
    const labelWidth = 280;
    const barWidth = 570;
    const rowHeight = 26;
    const height = rows.length * rowHeight + 8;
    const max = Math.max(1, ...rows.map((row) => row.value));
    const body = rows
        .map((row, index) => {
        const y = index * rowHeight + 4;
        const widthValue = Math.max(0, (row.value / max) * barWidth);
        const color = row.color || '#1d4ed8';
        return `<g><rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${rowHeight - 8}" rx="4" fill="#f1f5f9"/><rect x="${labelWidth}" y="${y}" width="${widthValue}" height="${rowHeight - 8}" rx="4" fill="${color}"><title>${esc(row.label)}: ${row.value}</title></rect><text x="${labelWidth - 10}" y="${y + 13}" text-anchor="end" font-size="10.5" font-weight="500" fill="#334155"><title>${esc(row.label)}</title>${esc(shortLabel(row.label, 36))}</text><text x="${labelWidth + widthValue + 8}" y="${y + 13}" font-size="10.5" font-weight="700" fill="#0f172a">${row.value}</text></g>`;
    })
        .join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" style="max-width:960px;display:block">${body}</svg>`;
}
function blueScaleColor(ratio: number): string {
    if (ratio <= 0)
        return '#ffffff';
    if (ratio < 0.35)
        return '#dbeafe';
    if (ratio < 0.65)
        return '#60a5fa';
    if (ratio < 0.85)
        return '#1d4ed8';
    return '#0b2545';
}
function maroonScaleColor(ratio: number): string {
    if (ratio <= 0)
        return '#fff5f7';
    if (ratio < 0.35)
        return '#fecdd3';
    if (ratio < 0.65)
        return '#e11d48';
    if (ratio < 0.85)
        return '#9f1239';
    return '#800020';
}
export function heatmapSvg(input: {
    rows: (string | HeatmapRowInput)[];
    columns: (string | HeatmapColumnInput)[];
    values: number[][];
    maxRows?: number;
    maxColumns?: number;
    includeLegend?: boolean;
}): string {
    const { rows: rawRows, columns: rawColumns, values, maxRows = 28, maxColumns = 34, includeLegend = false, } = input;
    const normRows = normalizeRows(rawRows);
    const normCols = normalizeColumns(rawColumns);
    if (!normRows.length || !normCols.length) {
        return '<p class="muted">Belum ada data komunikasi.</p>';
    }
    const visibleRows = normRows.slice(0, maxRows);
    const visibleColumns = normCols.slice(0, maxColumns);
    const truncated = normRows.length > visibleRows.length || normCols.length > visibleColumns.length;
    const { map: initialMap, entries: legendEntries } = buildHeatmapInitials(visibleRows, visibleColumns);
    const firstBoxIndex = visibleColumns.findIndex((col) => col.kind === 'box');
    const hasBoxDivider = firstBoxIndex > 0;
    const dividerGap = hasBoxDivider ? 12 : 0;
    const width = 960;
    const labelWidth = 220;
    const rightPad = 16;
    const topBarHeight = truncated ? 52 : 32;
    const rowHeight = 27;
    const bottomInitialsHeight = 46;
    const gridWidth = width - labelWidth - rightPad - dividerGap;
    const cellWidth = gridWidth / visibleColumns.length;
    const gridTop = topBarHeight;
    const gridBottom = gridTop + visibleRows.length * rowHeight;
    const legendCols = 4;
    const legendRowsCount = includeLegend ? Math.ceil(legendEntries.length / legendCols) : 0;
    const legendBlockHeight = includeLegend ? 28 + legendRowsCount * 18 + 10 : 0;
    const height = gridBottom + bottomInitialsHeight + legendBlockHeight + 8;
    const max = Math.max(1, ...visibleRows.flatMap((_, rowIndex) => visibleColumns.map((__, columnIndex) => Number(values[rowIndex]?.[columnIndex]) || 0)));
    const colX = (columnIndex: number) => labelWidth +
        columnIndex * cellWidth +
        (hasBoxDivider && columnIndex >= firstBoxIndex ? dividerGap : 0);
    const scaleSwatches = [0, 0.25, 0.55, 0.8, 1];
    const scaleStartX = width - rightPad - 175;
    const scaleBar = `<text x="${scaleStartX - 8}" y="18" text-anchor="end" font-size="9.5" fill="#64748b">Frekuensi: 0</text>` +
        scaleSwatches
            .map((ratio, idx) => `<rect x="${scaleStartX + idx * 14}" y="9" width="12" height="11" rx="2" fill="${blueScaleColor(ratio)}" stroke="#cbd5e1" stroke-width="0.6"/>`)
            .join('') +
        `<text x="${scaleStartX + scaleSwatches.length * 14 + 5}" y="18" font-size="9.5" font-weight="700" fill="#0b2545">${max}</text>` +
        (firstBoxIndex >= 0
            ? `<rect x="${scaleStartX + scaleSwatches.length * 14 + 34}" y="9" width="11" height="11" rx="2" fill="#800020"/><text x="${scaleStartX + scaleSwatches.length * 14 + 49}" y="18" font-size="9.5" font-weight="600" fill="#800020">Pemateri</text>`
            : '');
    const topNotice = truncated
        ? `<rect x="${labelWidth}" y="28" width="${width - labelWidth - rightPad}" height="18" rx="4" fill="#fef3c7" stroke="#f59e0b" stroke-width="0.7"/><text x="${labelWidth + 8}" y="40" font-size="9.2" font-weight="600" fill="#92400e">Menampilkan ${visibleRows.length} dari ${normRows.length} pengirim &amp; ${visibleColumns.length} dari ${normCols.length} penerima teraktif.</text>`
        : '';
    const topHeader = `<text x="${labelWidth - 10}" y="18" text-anchor="end" font-size="10" font-weight="700" fill="#475569">Pengirim ↓</text>` +
        scaleBar +
        topNotice;
    const body = visibleRows
        .map((row, rowIndex) => {
        const y = gridTop + rowIndex * rowHeight;
        const rowInitial = initialMap.get(row.id) || '';
        const cells = visibleColumns
            .map((column, columnIndex) => {
            const x = colX(columnIndex);
            const isSelf = column.kind !== 'box' && column.id === row.id;
            const value = Number(values[rowIndex]?.[columnIndex]) || 0;
            const ratio = value / max;
            const cellW = Math.max(4, cellWidth - 2);
            const cellH = rowHeight - 2.5;
            if (isSelf) {
                return `<g><rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="0.6"/><text x="${x + cellW / 2}" y="${y + cellH / 2 + 3}" text-anchor="middle" font-size="11" fill="#94a3b8">·</text></g>`;
            }
            const fill = column.kind === 'box' ? maroonScaleColor(ratio) : blueScaleColor(ratio);
            const stroke = value > 0 ? 'none' : column.kind === 'box' ? '#fecdd3' : '#e2e8f0';
            const textColor = ratio >= 0.5 ? '#ffffff' : column.kind === 'box' ? '#800020' : '#0b2545';
            const numSize = cellWidth < 22 ? 8 : 9.5;
            return `<g><rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="0.7"><title>${esc(row.label)} → ${esc(column.label)}: ${value}</title></rect>${value ? `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 3.2}" text-anchor="middle" font-size="${numSize}" font-weight="700" fill="${textColor}">${value}</text>` : ''}</g>`;
        })
            .join('');
        const displayName = shortLabel(row.label, 23);
        return `<g><text x="${labelWidth - 10}" y="${y + rowHeight / 2 + 2}" text-anchor="end" font-size="10" fill="#1e293b"><title>${esc(formatNameWithInitial(row.label, rowInitial))}</title>${esc(displayName)} <tspan font-weight="700" fill="#0b2545">(${esc(rowInitial)})</tspan></text>${cells}</g>`;
    })
        .join('');
    const dividerX = hasBoxDivider ? labelWidth + firstBoxIndex * cellWidth + dividerGap / 2 - 1 : 0;
    const dividerSvg = hasBoxDivider
        ? `<line x1="${dividerX}" y1="${gridTop - 2}" x2="${dividerX}" y2="${gridBottom + 32}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 3"/>`
        : '';
    const badgeY = gridBottom + 8;
    const badgeH = 20;
    const initialFontSize = visibleColumns.length > 26 ? 7.2 : visibleColumns.length > 18 ? 8.2 : 9.2;
    const bottomLabels = visibleColumns
        .map((column, columnIndex) => {
        const x = colX(columnIndex);
        const cellW = Math.max(4, cellWidth - 2);
        const initial = initialMap.get(column.id) || shortLabel(column.label, 3).toUpperCase();
        const isBox = column.kind === 'box';
        const pillFill = isBox ? '#ffe4e6' : '#eef2ff';
        const pillStroke = isBox ? '#fda4af' : '#c7d2fe';
        const pillText = isBox ? '#800020' : '#1e3a8a';
        return `<g><rect x="${x}" y="${badgeY}" width="${cellW}" height="${badgeH}" rx="4" fill="${pillFill}" stroke="${pillStroke}" stroke-width="0.75"><title>${esc(column.label)} (${esc(initial)})</title></rect><text x="${x + cellW / 2}" y="${badgeY + 13.5}" text-anchor="middle" font-size="${initialFontSize}" font-weight="700" fill="${pillText}">${esc(initial)}</text></g>`;
    })
        .join('');
    const axisFooterY = badgeY + badgeH + 14;
    const pesertaEndX = hasBoxDivider
        ? labelWidth + firstBoxIndex * cellWidth - 2
        : width - rightPad;
    const pesertaMidX = (labelWidth + pesertaEndX) / 2;
    const boxMidX = hasBoxDivider ? (colX(firstBoxIndex) + width - rightPad) / 2 : 0;
    const axisFooter = `<text x="${labelWidth - 10}" y="${axisFooterY}" text-anchor="end" font-size="9.5" font-weight="700" fill="#475569">Penerima →</text>` +
        `<text x="${pesertaMidX}" y="${axisFooterY}" text-anchor="middle" font-size="9" font-weight="600" fill="#64748b">Peserta</text>` +
        (hasBoxDivider
            ? `<text x="${boxMidX}" y="${axisFooterY}" text-anchor="middle" font-size="9" font-weight="700" fill="#800020">Pemateri / Box</text>`
            : '');
    let embeddedLegend = '';
    if (includeLegend && legendEntries.length) {
        const legTop = gridBottom + bottomInitialsHeight + 6;
        const colW = (width - 28) / legendCols;
        const itemsSvg = legendEntries
            .map((entry, index) => {
            const col = index % legendCols;
            const row = Math.floor(index / legendCols);
            const x = 14 + col * colW;
            const y = legTop + 22 + row * 18;
            const fill = entry.kind === 'box' ? '#800020' : '#1e3a8a';
            return `<text x="${x}" y="${y}" font-size="9.2" fill="#334155"><tspan font-weight="700" fill="${fill}">${esc(entry.initial)}</tspan> = ${esc(shortLabel(entry.label, 26))}</text>`;
        })
            .join('');
        embeddedLegend = `<g><line x1="14" y1="${legTop}" x2="${width - 14}" y2="${legTop}" stroke="#e2e8f0" stroke-width="1"/><text x="14" y="${legTop + 13}" font-size="9.5" font-weight="700" fill="#475569">Keterangan Inisial:</text>${itemsSvg}</g>`;
    }
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" style="max-width:960px;display:block">${topHeader}${body}${dividerSvg}${bottomLabels}${axisFooter}${embeddedLegend}</svg>`;
}
export function participantTrendSvg(input: {
    points: {
        label: string;
        topic: string;
        value: number;
        benchmark: number | null;
    }[];
    maxValue?: number;
}): string {
    const { points, maxValue = 40 } = input;
    if (!points.length)
        return '<p class="muted">Belum ada data perkembangan sesi.</p>';
    const width = 960;
    const height = 280;
    const margin = { top: 28, right: 26, bottom: 64, left: 46 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const plotBottom = margin.top + plotH;
    const ticks = [0, 10, 20, 30, 40];
    const xOf = (index: number) => points.length === 1
        ? margin.left + plotW / 2
        : margin.left + (index / (points.length - 1)) * plotW;
    const yOf = (val: number) => plotBottom - (Math.max(0, Math.min(maxValue, val)) / maxValue) * plotH;
    const grid = ticks
        .map((tick, idx) => {
        const y = yOf(tick);
        const dash = idx === 0 ? '' : ' stroke-dasharray="3 3"';
        return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${idx === 0 ? '#cbd5e1' : '#e2e8f0'}" stroke-width="1"${dash}/><text x="${margin.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#64748b">${tick}</text>`;
    })
        .join('');
    const mainCoords = points.map((pt, idx) => ({ x: xOf(idx), y: yOf(pt.value), pt }));
    const linePath = mainCoords
        .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(' ');
    const areaPath = mainCoords.length > 1
        ? `${linePath} L${mainCoords[mainCoords.length - 1].x.toFixed(1)},${plotBottom} L${mainCoords[0].x.toFixed(1)},${plotBottom} Z`
        : '';
    const benchPoints = points
        .map((pt, idx) => (pt.benchmark !== null ? { x: xOf(idx), y: yOf(pt.benchmark) } : null))
        .filter(Boolean) as {
        x: number;
        y: number;
    }[];
    const benchPath = benchPoints.length > 1
        ? benchPoints
            .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
            .join(' ')
        : '';
    const dots = mainCoords
        .map(({ x, y, pt }) => `<g><circle cx="${x}" cy="${y}" r="4.5" fill="#0b2545" stroke="#ffffff" stroke-width="1.5"><title>${esc(pt.label)} · ${esc(pt.topic)}: ${pt.value.toFixed(1)}</title></circle><text x="${x}" y="${Math.max(margin.top + 8, y - 9)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#0b2545">${pt.value.toFixed(1)}</text></g>`)
        .join('');
    const xLabels = mainCoords
        .map(({ x, pt }) => {
        const lines = labelLines(pt.label, 14);
        const tspans = lines
            .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : 11}">${esc(line)}</tspan>`)
            .join('');
        return `<text x="${x}" y="${plotBottom + 16}" text-anchor="middle" font-size="9.5" fill="#475569"><title>${esc(pt.topic)}</title>${tspans}</text>`;
    })
        .join('');
    const legend = `<g transform="translate(${margin.left} ${height - 16})">` +
        `<line x1="0" y1="0" x2="18" y2="0" stroke="#0b2545" stroke-width="2.5"/><circle cx="9" cy="0" r="3" fill="#0b2545"/>` +
        `<text x="24" y="3.5" font-size="10" font-weight="600" fill="#334155">Total RELI Peserta (0–40)</text>` +
        `<line x1="185" y1="0" x2="203" y2="0" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 3"/>` +
        `<text x="209" y="3.5" font-size="10" fill="#64748b">Rata-rata Lokal</text>` +
        `</g>`;
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" style="max-width:960px;display:block">${grid}${areaPath ? `<path d="${areaPath}" fill="rgba(11, 37, 69, 0.08)"/>` : ''}${benchPath ? `<path d="${benchPath}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4"/>` : ''}${mainCoords.length > 1 ? `<path d="${linePath}" fill="none" stroke="#0b2545" stroke-width="2.6" stroke-linejoin="round"/>` : ''}${dots}${xLabels}${legend}</svg>`;
}
