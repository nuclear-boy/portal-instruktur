import { ATTENDANCE, ROLES } from '../../shared/types';
import type { AttendanceStatus, Role, ScoreTotals } from '../../shared/types';

export function canEditMaster(role?: Role): boolean {
  return role === 'koordinator';
}

export function canManageAccounts(role?: Role): boolean {
  return role === 'admin' || role === 'koordinator';
}

export function canWriteReports(role?: Role): boolean {
  return role === 'observer';
}

export function isOperational(role?: Role): boolean {
  return role === 'koordinator' || role === 'instruktur_lokal' || role === 'observer';
}

export function roleLabel(role?: Role): string {
  return ROLES.find((item) => item.value === role)?.label || role || '-';
}

export function attendanceLabel(status?: AttendanceStatus): string {
  return ATTENDANCE.find((item) => item.value === status)?.label || '-';
}

export function fmtDate(
  value?: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', options);
}

export function fmtDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayISO(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function totalScore(score?: ScoreTotals): number {
  return score ? score.r + score.e + score.l + score.i : 0;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function attendanceTone(status?: AttendanceStatus): string {
  if (status === 'hadir') return 'badge-green';
  if (status === 'terlambat') return 'badge-amber';
  if (status === 'izin' || status === 'sakit') return 'badge-blue';
  return 'badge-red';
}

export function downloadFile(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openHtmlWindow(html: string, print = false) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Popup diblokir. Izinkan popup untuk mencetak laporan.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  if (print) setTimeout(() => win.print(), 500);
}

export function cls(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function uid(prefix = 'x'): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return prefix + random.replace(/-/g, '').slice(0, 10);
}
