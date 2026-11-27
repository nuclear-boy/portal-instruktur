export type Role = 'admin' | 'koordinator' | 'instruktur_lokal' | 'observer';
export type LocalId = number;

export const ROLES: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'koordinator', label: 'Koordinator Tim' },
  { value: 'instruktur_lokal', label: 'Instruktur Lokal' },
  { value: 'observer', label: 'Observer' },
];

export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpa' | 'terlambat';

export const ATTENDANCE: { value: AttendanceStatus; label: string }[] = [
  { value: 'hadir', label: 'Hadir' },
  { value: 'terlambat', label: 'Terlambat' },
  { value: 'izin', label: 'Izin' },
  { value: 'sakit', label: 'Sakit' },
  { value: 'alpa', label: 'Alpa' },
];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  localId?: LocalId | null;
  position?: string;
  passwordHash?: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}

export type PublicUser = Omit<User, 'passwordHash'>;
export type TeamMember = Pick<PublicUser, 'id' | 'name' | 'role' | 'localId' | 'position'>;

export interface Participant {
  id: string;
  name: string;
  gender?: string;
  origin?: string;
  phone?: string;
  notes?: string;
  localId?: LocalId | null;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Speaker {
  id: string;
  name: string;
  expertise?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Seat {
  id: string;
  name: string;
  x: number;
  y: number;
  m: number;
  participantId?: string;
  note?: string;
}

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface SosiogramData {
  seats: Seat[];
  boxes: Box[];
  scores: Record<string, string[]>;
  links: Record<string, number>;
  cat: string;
  participantNotes?: Record<string, string>;
}

export type SpeakerRole = 'pemateri' | 'inlok' | 'observer';
export type SessionStatus = 'scheduled' | 'in_progress' | 'completed';

export const SPEAKER_ROLES: { value: SpeakerRole; label: string }[] = [
  { value: 'pemateri', label: 'Pemateri' },
  { value: 'inlok', label: 'Instruktur Lokal' },
  { value: 'observer', label: 'Observer' },
];

export const SESSION_STATUSES: { value: SessionStatus; label: string; tone: string }[] = [
  { value: 'scheduled', label: 'Terjadwal', tone: 'badge-neutral' },
  { value: 'in_progress', label: 'Berlangsung', tone: 'badge-amber' },
  { value: 'completed', label: 'Selesai', tone: 'badge-green' },
];

export interface SessionSpeaker {
  speakerId: string;
  role: SpeakerRole;
  attendance: AttendanceStatus;
  notes?: string;
}

export interface SessionAttendance {
  participantId: string;
  status: AttendanceStatus;
  notes?: string;
}

export interface ScoreTotals {
  r: number;
  e: number;
  l: number;
  i: number;
}

export interface SpeakerAssessment {
  id: string;
  sessionId: string;
  speakerId: string;
  observerId: string;
  observerName: string;
  localId?: LocalId | null;
  date: string;
  time: string;
  scores: Record<string, number>;
  notes: Record<string, string>;
  generalNotes: string;
  recommendations: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Session {
  id: string;
  no?: number;
  date: string;
  topic: string;
  location?: string;
  localId?: LocalId | null;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  actualStartTime?: string;
  actualEndTime?: string;
  actualDurationMinutes?: number;
  status?: SessionStatus;
  sosiogram: SosiogramData;
  speakers: SessionSpeaker[];
  attendance: SessionAttendance[];
  scores: Record<string, ScoreTotals>;
  assessments?: SpeakerAssessment[];
  version: number;
  updatedAt: string;
  updatedBy?: string;
  createdAt: string;
}

export interface Meta {
  eventName: string;
  startDate: string;
  endDate: string;
  location: string;
  locals?: { id: number; label: string; short: string }[];
  updatedAt?: string;
}
