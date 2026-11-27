import type {
  AttendanceStatus,
  LocalId,
  Meta,
  Participant,
  PublicUser,
  Role,
  Session,
  SessionAttendance,
  SessionSpeaker,
  SessionStatus,
  SosiogramData,
  Speaker,
  SpeakerAssessment,
  TeamMember,
} from '../../shared/types';
import { ApiError } from './apiError';

export { ApiError };

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'lbt-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      ...init,
      signal: init.signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(
        'Permintaan melebihi batas waktu. Periksa koneksi jaringan Anda.',
        408,
      );
    }
    throw new ApiError(
      'Tidak dapat terhubung ke server. Periksa koneksi atau alamat API.',
      0,
    );
  } finally {
    window.clearTimeout(timer);
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('lbt:unauthorized'));
    }
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'Permintaan gagal',
      response.status,
      data,
    );
  }
  return data as T;
}

export interface SessionPatch {
  date?: string;
  topic?: string;
  location?: string;
  no?: number;
  localId?: LocalId | null;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  actualStartTime?: string;
  actualEndTime?: string;
  actualDurationMinutes?: number;
  status?: SessionStatus;
  speakers?: SessionSpeaker[];
  attendance?: SessionAttendance[];
}

export interface SpeakerAssessmentInput {
  speakerId: string;
  date: string;
  time?: string;
  observerName?: string;
  scores: Record<string, number>;
  notes?: Record<string, string>;
  generalNotes?: string;
  recommendations?: string;
}

const liveApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: PublicUser }>('/auth/me'),

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await request<{ ok: boolean; token?: string }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.token) setToken(res.token);
    return res;
  },

  getMeta: () => request<{ meta: Meta }>('/meta'),

  team: {
    list: () => request<{ members: TeamMember[] }>('/team'),
  },

  saveMeta: (meta: Pick<Meta, 'eventName' | 'startDate' | 'endDate' | 'location'>) =>
    request<{ meta: Meta }>('/meta', { method: 'POST', body: JSON.stringify(meta) }),

  locals: {
    create: (data: { label: string; short: string }) =>
      request<{ meta: Meta; local: NonNullable<Meta['locals']>[number] }>('/locals', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: LocalId, data: { label?: string; short?: string }) =>
      request<{ meta: Meta; local: NonNullable<Meta['locals']>[number] }>(`/locals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: LocalId) =>
      request<{ ok: boolean; deleted: { participants: number; sessions: number; users: number }; meta: Meta }>(
        `/locals/${id}`,
        { method: 'DELETE' },
      ),
  },

  participants: {
    list: () => request<{ participants: Participant[] }>('/participants'),
    create: (data: Omit<Participant, 'id' | 'createdAt'>) =>
      request<{ participant: Participant }>('/participants', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Participant>) =>
      request<{ participant: Participant }>(`/participants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<{ ok: boolean }>(`/participants/${id}`, { method: 'DELETE' }),
  },

  speakers: {
    list: () => request<{ speakers: Speaker[] }>('/speakers'),
    create: (data: Omit<Speaker, 'id' | 'createdAt'>) =>
      request<{ speaker: Speaker }>('/speakers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Speaker>) =>
      request<{ speaker: Speaker }>(`/speakers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) => request<{ ok: boolean }>(`/speakers/${id}`, { method: 'DELETE' }),
  },

  sessions: {
    list: () => request<{ sessions: Session[] }>('/sessions'),
    get: (id: string) => request<{ session: Session }>(`/sessions/${id}`),
    create: (data: {
      date: string;
      topic: string;
      location?: string;
      no?: number;
      localId: LocalId;
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
      actualStartTime?: string;
      actualEndTime?: string;
      actualDurationMinutes?: number;
      status?: SessionStatus;
    }) =>
      request<{ session: Session }>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: SessionPatch) =>
      request<{ session: Session }>(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) => request<{ ok: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
    saveSosiogram: (id: string, version: number, sosiogram: SosiogramData) =>
      request<{ session: Session }>(`/sessions/${id}/sosiogram`, {
        method: 'PUT',
        body: JSON.stringify({ version, sosiogram }),
      }),
    createAssessment: (sessionId: string, data: SpeakerAssessmentInput) =>
      request<{ session: Session; assessment: SpeakerAssessment }>(
        `/sessions/${sessionId}/assessments`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    updateAssessment: (
      sessionId: string,
      assessmentId: string,
      data: Partial<SpeakerAssessmentInput>,
    ) =>
      request<{ session: Session; assessment: SpeakerAssessment }>(
        `/sessions/${sessionId}/assessments?assessmentId=${encodeURIComponent(assessmentId)}`,
        { method: 'PATCH', body: JSON.stringify(data) },
      ),
    removeAssessment: (sessionId: string, assessmentId: string) =>
      request<{ ok: boolean }>(
        `/sessions/${sessionId}/assessments?assessmentId=${encodeURIComponent(assessmentId)}`,
        { method: 'DELETE' },
      ),
  },

  users: {
    list: () => request<{ users: PublicUser[] }>('/admin/users'),
    create: (data: {
      email: string;
      name: string;
      role: Role;
      password: string;
      active?: boolean;
      localId?: LocalId | null;
      position?: string;
    }) =>
      request<{ user: PublicUser }>('/admin/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        email: string;
        name: string;
        role: Role;
        password: string;
        active: boolean;
        localId: LocalId | null;
        position: string;
      }>,
    ) =>
      request<{ user: PublicUser }>(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) => request<{ ok: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }),
  },
};

export const api = liveApi;

export type { AttendanceStatus };
