import type { LocalId, Participant, Role } from './types';

export const LOCALS: { id: LocalId; label: string; short: string }[] = [
  { id: 1, label: 'Lokal 1', short: 'L1' },
  { id: 2, label: 'Lokal 2', short: 'L2' },
  { id: 3, label: 'Lokal 3', short: 'L3' },
  { id: 4, label: 'Lokal 4', short: 'L4' },
  { id: 5, label: 'Lokal 5', short: 'L5' },
];

export const LOCAL_IDS: LocalId[] = [1, 2, 3, 4, 5];

export function setLocals(locals?: { id: number; label: string; short: string }[] | null) {
  if (!Array.isArray(locals) || locals.length === 0) return;
  LOCALS.splice(0, LOCALS.length, ...locals.map((local) => ({
    id: Number(local.id) as LocalId,
    label: local.label || `Lokal ${local.id}`,
    short: local.short || `L${local.id}`,
  })));
}

export function localLabel(localId?: LocalId | null): string {
  return LOCALS.find((item) => item.id === localId)?.label || 'Belum ditempatkan';
}

export function isLocalScopedRole(role?: Role): boolean {
  return role === 'instruktur_lokal' || role === 'observer';
}

export function isGlobalRole(role?: Role): boolean {
  return role === 'admin' || role === 'koordinator';
}

export function isMasterRole(role?: Role): boolean {
  return role === 'koordinator';
}

export function isOperationalRole(role?: Role): boolean {
  return role === 'koordinator' || role === 'instruktur_lokal' || role === 'observer';
}

export function participantLocal(participant?: Participant | null): LocalId | undefined {
  return participant?.localId || undefined;
}

export function participantsOfLocal(
  participants: Participant[],
  localId?: LocalId | null,
): Participant[] {
  if (!localId) return participants;
  return participants.filter((participant) => participant.localId === localId);
}
