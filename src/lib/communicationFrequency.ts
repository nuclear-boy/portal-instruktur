import type { Session, SosiogramData } from '../../shared/types';

export interface PairRow {
  a: string;
  b: string;
  forward: number;
  reverse: number;
  localId?: number | null;
}

function pairNameMap(sosiogram: SosiogramData): (id: string) => string {
  return (id: string) => {
    const seat = sosiogram.seats.find((item) => item.id === id);
    if (seat) return seat.name || '(tanpa nama)';
    const box = sosiogram.boxes.find((item) => item.id === id);
    return box ? box.label || 'Kotak' : '?';
  };
}

export function pairsOf(sosiogram: SosiogramData): PairRow[] {
  const nameOf = pairNameMap(sosiogram);
  const map: Record<string, PairRow> = {};

  Object.entries(sosiogram.links).forEach(([key, count]) => {
    const [from, to] = key.split('>');
    if (!from || !to) return;
    const forward = from < to;
    const canonical = forward ? key : `${to}>${from}`;
    const row =
      map[canonical] ||
      (map[canonical] = {
        a: nameOf(forward ? from : to),
        b: nameOf(forward ? to : from),
        forward: 0,
        reverse: 0,
      });
    if (forward) row.forward += Number(count) || 0;
    else row.reverse += Number(count) || 0;
  });

  return Object.values(map).sort((x, y) => y.forward + y.reverse - (x.forward + x.reverse));
}

export function aggregatePairs(sessions: Session[]): PairRow[] {
  const map = new Map<string, PairRow>();

  sessions.forEach((session) => {
    pairsOf(session.sosiogram).forEach((pair) => {
      const localId = session.localId ?? null;
      const key = `${localId ?? 'none'}|${pair.a}|${pair.b}`;
      let current = map.get(key);
      if (!current) {
        current = {
          a: pair.a,
          b: pair.b,
          forward: 0,
          reverse: 0,
          localId,
        };
        map.set(key, current);
      }
      current.forward += pair.forward;
      current.reverse += pair.reverse;
    });
  });

  return [...map.values()].sort(
    (x, y) => y.forward + y.reverse - (x.forward + x.reverse),
  );
}

export function pairDirections(pair: PairRow): { label: string; value: number }[] {
  return [
    { label: `${pair.a} → ${pair.b}`, value: pair.forward },
    { label: `${pair.b} → ${pair.a}`, value: pair.reverse },
  ];
}

export interface CommunicationMatrix {
  rows: { id: string; name: string; teman: number; pemateri: number; total: number }[];
  columns: { id: string; label: string; kind: 'peserta' | 'box' }[];
  values: number[][];
}

interface MatrixRowMeta {
  id: string;
  name: string;
  sourceIds: string[];
}

interface MatrixColumnMeta {
  id: string;
  label: string;
  kind: 'peserta' | 'box';
  targetIds: string[];
}

interface MatrixGroup {
  rows: MatrixRowMeta[];
  columns: MatrixColumnMeta[];
  rowIndex: Map<string, number>;
  columnIndex: Map<string, number>;
  values: number[][];
}

function emptyGroup(): MatrixGroup {
  return { rows: [], columns: [], rowIndex: new Map(), columnIndex: new Map(), values: [] };
}

function participantKey(seat: { id: string; name: string; participantId?: string }): string {
  return `peserta:${seat.participantId || seat.name.trim() || seat.id}`;
}

function boxKey(label: string): string {
  return `box:${label.trim() || 'Pemateri'}`;
}

function addRow(group: MatrixGroup, meta: MatrixRowMeta): number {
  const existing = group.rowIndex.get(meta.id);
  if (existing !== undefined) {
    const row = group.rows[existing];
    meta.sourceIds.forEach((sourceId) => {
      if (!row.sourceIds.includes(sourceId)) row.sourceIds.push(sourceId);
    });
    return existing;
  }
  const index = group.rows.length;
  group.rowIndex.set(meta.id, index);
  group.rows.push(meta);
  group.values.push(group.columns.map(() => 0));
  return index;
}

function addColumn(group: MatrixGroup, meta: MatrixColumnMeta): number {
  const existing = group.columnIndex.get(meta.id);
  if (existing !== undefined) {
    const column = group.columns[existing];
    meta.targetIds.forEach((targetId) => {
      if (!column.targetIds.includes(targetId)) column.targetIds.push(targetId);
    });
    return existing;
  }
  const index = group.columns.length;
  group.columnIndex.set(meta.id, index);
  group.columns.push(meta);
  group.values.forEach((row) => row.push(0));
  return index;
}

function finalizeMatrix(group: MatrixGroup): CommunicationMatrix {
  const indexed = group.rows.map((row, rowIndex) => {
    const teman = group.columns.reduce(
      (total, column, columnIndex) =>
        total +
        (column.kind === 'peserta' && column.id !== row.id
          ? group.values[rowIndex][columnIndex]
          : 0),
      0,
    );
    const pemateri = group.columns.reduce(
      (total, column, columnIndex) =>
        total + (column.kind === 'box' ? group.values[rowIndex][columnIndex] : 0),
      0,
    );
    return {
      row: { id: row.id, name: row.name, teman, pemateri, total: teman + pemateri },
      values: [...group.values[rowIndex]],
    };
  });

  indexed.sort((a, b) => b.row.total - a.row.total || a.row.name.localeCompare(b.row.name, 'id'));

  return {
    rows: indexed.map((entry) => entry.row),
    columns: group.columns.map(({ id, label, kind }) => ({ id, label, kind })),
    values: indexed.map((entry) => entry.values),
  };
}

export function communicationMatrixOf(sosiogram: SosiogramData): CommunicationMatrix {
  const seats = sosiogram.seats.filter((seat) => seat.name.trim());
  const group = emptyGroup();

  seats.forEach((seat) => {
    addColumn(group, {
      id: participantKey(seat),
      label: seat.name.trim(),
      kind: 'peserta',
      targetIds: [seat.id],
    });
  });
  sosiogram.boxes.forEach((box) => {
    const label = box.label.trim() || 'Pemateri';
    addColumn(group, { id: boxKey(label), label, kind: 'box', targetIds: [box.id] });
  });

  seats.forEach((seat) => {
    const rowIndex = addRow(group, {
      id: participantKey(seat),
      name: seat.name.trim(),
      sourceIds: [seat.id],
    });
    group.columns.forEach((column, columnIndex) => {
      if (column.kind === 'peserta' && column.id === group.rows[rowIndex].id) return;
      const count = column.targetIds.reduce(
        (total, targetId) => total + (Number(sosiogram.links[`${seat.id}>${targetId}`]) || 0),
        0,
      );
      group.values[rowIndex][columnIndex] += count;
    });
  });

  return finalizeMatrix(group);
}

export function communicationMatricesByLocal(
  sessions: Session[],
): { localId: number | null; matrix: CommunicationMatrix }[] {
  const groups = new Map<number | null, MatrixGroup>();

  sessions.forEach((session) => {
    const localId = session.localId ?? null;
    const group = groups.get(localId) || emptyGroup();
    groups.set(localId, group);

    const matrix = communicationMatrixOf(session.sosiogram);
    matrix.rows.forEach((row, rowIndex) => {
      const metaRow = {
        id: row.id,
        name: row.name,
        sourceIds: [] as string[],
      };
      const seat = session.sosiogram.seats.find(
        (item) => participantKey(item) === row.id && item.name.trim() === row.name,
      );
      if (seat) metaRow.sourceIds.push(seat.id);
      const targetRowIndex = addRow(group, metaRow);

      matrix.columns.forEach((column, columnIndex) => {
        const metaColumn = {
          id: column.id,
          label: column.label,
          kind: column.kind,
          targetIds: [] as string[],
        };
        if (column.kind === 'box') {
          session.sosiogram.boxes
            .filter((box) => boxKey(box.label.trim() || 'Pemateri') === column.id)
            .forEach((box) => metaColumn.targetIds.push(box.id));
        } else {
          session.sosiogram.seats
            .filter((item) => participantKey(item) === column.id)
            .forEach((item) => metaColumn.targetIds.push(item.id));
        }
        const targetColumnIndex = addColumn(group, metaColumn);
        group.values[targetRowIndex][targetColumnIndex] += matrix.values[rowIndex][columnIndex];
      });
    });
  });

  return [...groups.entries()]
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
    .map(([localId, group]) => ({ localId, matrix: finalizeMatrix(group) }));
}
