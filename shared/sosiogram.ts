import type { Box, SosiogramData, Seat } from './types';

export const CANVAS_W = 980;
export const SEAT_W = 210;
export const SEAT_H = 112;
export const SEAT_GAP = 8;

export function makeId(prefix = 's'): string {
  const rnd =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return prefix + rnd.replace(/-/g, '').slice(0, 10);
}

export function emptySosiogram(): SosiogramData {
  return {
    seats: [],
    boxes: [{ id: 'b0', x: 420, y: 40, w: 170, h: 64, label: 'Pemateri' }],
    scores: {},
    links: {},
    cat: '',
    participantNotes: {},
  };
}

export type LayoutKind = 'u' | 'dua' | 'grid';

export function layoutSeats(d: SosiogramData, kind: LayoutKind, n: number, cols = 4): SosiogramData {
  while (d.seats.length < n) {
    d.seats.push({ id: makeId('s'), name: '', x: 0, y: 0, m: 0 });
  }
  const L = d.seats.length;
  const half = Math.ceil(L / 2);
  const bottom = Math.min(L, Math.max(3, Math.ceil(L / 3)));
  const side = Math.ceil((L - bottom) / 2);
  const gap = SEAT_W + SEAT_GAP;

  if (kind === 'u') {
    const podium = d.boxes.find((b) => b.id === 'b0');
    if (podium) {
      podium.x = Math.max(20, Math.round(20 + ((bottom - 1) * gap + SEAT_W - podium.w) / 2));
      podium.y = 40;
    }
  }

  d.seats.forEach((s: Seat, i: number) => {
    if (kind === 'u') {
      if (i < side) {
        s.m = 0;
        s.x = 20;
        s.y = 20 + i * SEAT_H;
      } else if (i < side + bottom) {
        s.m = 0;
        s.x = 20 + (i - side) * gap;
        s.y = 20 + side * SEAT_H + 10;
      } else {
        s.m = 1;
        s.x = 20 + (bottom - 1) * gap;
        s.y = 20 + (L - 1 - i) * SEAT_H;
      }
    } else if (kind === 'dua') {
      const right = i >= half;
      s.m = right ? 1 : 0;
      s.x = right ? CANVAS_W - SEAT_W - 20 : 20;
      s.y = 20 + (right ? i - half : i) * SEAT_H;
    } else {
      s.m = 0;
      s.x = 20 + (i % cols) * (SEAT_W + 14);
      s.y = 20 + Math.floor(i / cols) * (SEAT_H + SEAT_GAP);
    }
  });

  return d;
}

export function withDefaultSeats(n = 24): SosiogramData {
  const d = emptySosiogram();
  layoutSeats(d, 'u', n, 4);
  return d;
}

export function seatCenters(d: SosiogramData) {
  const map: Record<string, { x: number; y: number }> = {};
  d.seats.forEach((s) => {
    map[s.id] = { x: s.x + SEAT_W / 2, y: s.y + SEAT_H / 2 };
  });
  d.boxes.forEach((b) => {
    map[b.id] = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  });
  return map;
}

export function nextBox(d: SosiogramData): Box {
  const maxY = Math.max(0, ...d.seats.map((s) => s.y + SEAT_H), ...d.boxes.map((b) => b.y + b.h));
  return { id: makeId('b'), x: 420, y: maxY + 16, w: 170, h: 64, label: 'Kotak baru' };
}
