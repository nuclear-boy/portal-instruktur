import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { LocalId, Session, SessionStatus } from '../../shared/types';
import { LOCALS, localLabel } from '../../shared/locals';
import { SESSION_STATUSES } from '../../shared/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Loader,
  Modal,
  PageHeader,
  Select,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { MATERIALS } from '../../shared/materials';
import { fmtDate, todayISO } from '../lib/utils';

interface ScheduleForm {
  date: string;
  topic: string;
  location: string;
  no: string;
  localId: string;
  startTime: string;
  endTime: string;
  durationMinutes: string;
}

function statusTone(status?: SessionStatus): string {
  const found = SESSION_STATUSES.find((s) => s.value === status);
  return found ? found.tone : 'badge-neutral';
}
function statusLabel(status?: SessionStatus): string {
  const found = SESSION_STATUSES.find((s) => s.value === status);
  return found ? found.label : 'Terjadwal';
}

function calcDuration(start: string, end: string): number | undefined {
  if (!start || !end) return undefined;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (sh === undefined || sm === undefined || eh === undefined || em === undefined) return undefined;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : undefined;
}

function fmtDuration(minutes?: number): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} mnt`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} mnt`;
}

export function Schedule() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | SessionStatus>('all');
  const [form, setForm] = useState<ScheduleForm>({
    date: todayISO(),
    topic: '',
    location: '',
    no: '',
    localId: '1',
    startTime: '',
    endTime: '',
    durationMinutes: '',
  });
  const [busy, setBusy] = useState(false);

  const isKoortim = user?.role === 'koordinator';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api.sessions.list();
      setSessions(result.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    return sessions
      .filter((s) => filterLocal === 'all' || s.localId === filterLocal)
      .filter((s) => filterStatus === 'all' || (s.status || 'scheduled') === filterStatus)
      .sort((a, b) => {
        const dateComp = a.date.localeCompare(b.date);
        if (dateComp !== 0) return dateComp;
        const startA = a.startTime || '';
        const startB = b.startTime || '';
        if (startA !== startB) return startA.localeCompare(startB);
        return (a.no || 0) - (b.no || 0);
      });
  }, [sessions, filterLocal, filterStatus]);

  // Group by date for calendar-like view
  const byDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const s of filtered) {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function openCreate() {
    setEditing(null);
    setForm({
      date: todayISO(),
      topic: '',
      location: '',
      no: '',
      localId: '1',
      startTime: '',
      endTime: '',
      durationMinutes: '',
    });
    setModalOpen(true);
  }

  function openEdit(session: Session) {
    setEditing(session);
    setForm({
      date: session.date,
      topic: session.topic,
      location: session.location || '',
      no: session.no ? String(session.no) : '',
      localId: String(session.localId || 1),
      startTime: session.startTime || '',
      endTime: session.endTime || '',
      durationMinutes: session.durationMinutes ? String(session.durationMinutes) : '',
    });
    setModalOpen(true);
  }

  function onTimeChange(field: 'startTime' | 'endTime', value: string) {
    const updated = { ...form, [field]: value };
    // Auto-calculate durationMinutes if both are set
    const dur = calcDuration(
      field === 'startTime' ? value : form.startTime,
      field === 'endTime' ? value : form.endTime,
    );
    updated.durationMinutes = dur !== undefined ? String(dur) : form.durationMinutes;
    setForm(updated);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.topic.trim()) {
      setError('Materi wajib diisi');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const targetLocals =
        !editing && form.localId === 'all'
          ? LOCALS.map((local) => local.id)
          : [Number(form.localId) as LocalId];
      const basePayload = {
        date: form.date,
        topic: form.topic,
        location: form.location,
        ...(form.no ? { no: Number(form.no) } : {}),
        startTime: form.startTime,
        endTime: form.endTime,
        ...(form.durationMinutes ? { durationMinutes: Number(form.durationMinutes) } : {}),
      };

      if (editing) {
        const result = await api.sessions.update(editing.id, {
          ...basePayload,
          localId: targetLocals[0],
        });
        setSessions((items) =>
          items.map((item) => (item.id === editing.id ? result.session : item)),
        );
        setModalOpen(false);
      } else {
        const created: Session[] = [];
        for (const localId of targetLocals) {
          const result = await api.sessions.create({ ...basePayload, localId });
          created.push(result.session);
        }
        setSessions((items) => [...items, ...created]);
        setModalOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan jadwal');
    } finally {
      setBusy(false);
    }
  }

  async function publishToAll(session: Session) {
    if (
      !window.confirm(
        `Salin jadwal "${session.topic}" (${fmtDate(session.date)}) ke semua lokal yang belum memilikinya?`,
      )
    )
      return;
    setBusy(true);
    try {
      const existingLocals = sessions
        .filter((s) => s.topic === session.topic && s.date === session.date)
        .map((s) => s.localId);
      const missing = LOCALS.map((local) => local.id).filter(
        (localId) => !existingLocals.includes(localId),
      );
      for (const localId of missing) {
        const result = await api.sessions.create({
          date: session.date,
          topic: session.topic,
          location: session.location || '',
          localId,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes: session.durationMinutes,
        });
        setSessions((items) => [...items, result.session]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyalin ke lokal');
    } finally {
      setBusy(false);
    }
  }

  async function markStatus(session: Session, status: SessionStatus) {
    try {
      const result = await api.sessions.update(session.id, { status });
      setSessions((items) => items.map((item) => (item.id === session.id ? result.session : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui status');
    }
  }

  if (loading) {
    return (
      <div className="content">
        <Loader />
      </div>
    );
  }

  return (
    <div className="content">
      <PageHeader
        title="Jadwal Materi"
        subtitle={`${sessions.length} sesi terjadwal di ${LOCALS.length} lokal · ditetapkan oleh Koordinator Tim`}
        actions={
          isKoortim ? (
            <Button variant="primary" onClick={openCreate}>
              + Jadwal Sesi
            </Button>
          ) : undefined
        }
      />

      {error && <Alert>{error}</Alert>}

      {/* Filter toolbar */}
      <Card>
        <div className="toolbar">
          <div className="filter-pills" role="group" aria-label="Filter lokal">
            <button
              className={filterLocal === 'all' ? 'pill active' : 'pill'}
              onClick={() => setFilterLocal('all')}
            >
              Semua lokal
            </button>
            {LOCALS.map((local) => (
              <button
                key={local.id}
                className={filterLocal === local.id ? 'pill active' : 'pill'}
                onClick={() => setFilterLocal(local.id)}
              >
                {local.label}
              </button>
            ))}
          </div>

          <div className="filter-pills" role="group" aria-label="Filter status">
            <button
              className={filterStatus === 'all' ? 'pill active' : 'pill'}
              onClick={() => setFilterStatus('all')}
            >
              Semua status
            </button>
            {SESSION_STATUSES.map((s) => (
              <button
                key={s.value}
                className={filterStatus === s.value ? 'pill active' : 'pill'}
                onClick={() => setFilterStatus(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <span className="small muted">{filtered.length} sesi</span>
        </div>
      </Card>

      {/* Calendar-grouped schedule view */}
      {byDate.length === 0 ? (
        <Card>
          <Empty>Belum ada jadwal materi. {isKoortim && 'Klik "+ Jadwal Sesi" untuk menambahkan.'}</Empty>
        </Card>
      ) : (
        byDate.map(([date, dateSessions]) => (
          <div key={date} className="schedule-day-group">
            <div className="schedule-day-header">
              <span className="schedule-day-label">
                {fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="badge badge-neutral">{dateSessions.length} sesi</span>
            </div>
            <Card>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Materi</th>
                      <th>Lokal</th>
                      <th>Waktu Rencana</th>
                      <th>Durasi Rencana</th>
                      <th>Waktu Aktual</th>
                      <th>Durasi Aktual</th>
                      <th>Status</th>
                      {isKoortim && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {dateSessions.map((session) => {
                      const plannedDur =
                        session.durationMinutes ||
                        calcDuration(session.startTime || '', session.endTime || '');
                      const actualDur =
                        session.actualDurationMinutes ||
                        calcDuration(
                          session.actualStartTime || '',
                          session.actualEndTime || '',
                        );
                      return (
                        <tr key={session.id}>
                          <td>{session.no || '—'}</td>
                          <td>
                            <strong>{session.topic}</strong>
                            {session.location && (
                              <div className="small muted">{session.location}</div>
                            )}
                          </td>
                          <td>
                            <Badge tone="badge-blue">{localLabel(session.localId)}</Badge>
                          </td>
                          <td className="nowrap">
                            {session.startTime && session.endTime
                              ? `${session.startTime} – ${session.endTime}`
                              : session.startTime || '—'}
                          </td>
                          <td>{fmtDuration(plannedDur)}</td>
                          <td className="nowrap">
                            {session.actualStartTime && session.actualEndTime
                              ? `${session.actualStartTime} – ${session.actualEndTime}`
                              : session.actualStartTime
                                ? `${session.actualStartTime} (berlangsung)`
                                : '—'}
                          </td>
                          <td>
                            {actualDur !== undefined ? (
                              <span
                                className={
                                  plannedDur && actualDur > plannedDur
                                    ? 'text-amber'
                                    : plannedDur && actualDur < plannedDur - 10
                                      ? 'text-red'
                                      : ''
                                }
                              >
                                {fmtDuration(actualDur)}
                                {plannedDur && actualDur !== plannedDur && (
                                  <span className="small muted">
                                    {' '}
                                    ({actualDur > plannedDur ? '+' : ''}
                                    {actualDur - plannedDur} mnt)
                                  </span>
                                )}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <Badge tone={statusTone(session.status)}>
                              {statusLabel(session.status)}
                            </Badge>
                          </td>
                          {isKoortim && (
                            <td>
                              <div className="actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEdit(session)}
                                >
                                  Ubah
                                </Button>
                                {(session.status === 'scheduled' || !session.status) && (
                                  <Button
                                    size="sm"
                                    variant="subtle"
                                    onClick={() => markStatus(session, 'in_progress')}
                                  >
                                    Mulai
                                  </Button>
                                )}
                                {session.status === 'in_progress' && (
                                  <Button
                                    size="sm"
                                    variant="subtle"
                                    onClick={() => markStatus(session, 'completed')}
                                  >
                                    Selesai
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void publishToAll(session)}
                                  title="Salin ke semua lokal"
                                >
                                  Salin ke lokal lain
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ))
      )}

      {/* Info for observer/inlok */}
      {!isKoortim && (
        <Card>
          <div className="empty">
            Jadwal dan penunjukan pemateri ditetapkan oleh Koordinator Tim. Waktu aktual, absensi,
            sosiogram, dan penilaian pemateri diisi oleh Observer di halaman <strong>Pertemuan</strong>.
          </div>
        </Card>
      )}

      {/* Create/Edit Modal - only for koordinator */}
      {isKoortim && (
        <Modal
          open={modalOpen}
          title={editing ? 'Ubah jadwal sesi' : 'Tambah jadwal sesi'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button onClick={() => setModalOpen(false)}>Batal</Button>
              <Button type="submit" form="schedule-form" variant="primary" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan & Publish'}
              </Button>
            </>
          }
        >
          <form id="schedule-form" className="form-grid" onSubmit={save}>
            <Field label="Lokal">
              <Select
                value={form.localId}
                onChange={(e) => setForm({ ...form, localId: e.target.value })}
                required
              >
                {!editing && <option value="all">Semua lokal</option>}
                {LOCALS.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Tanggal">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </Field>

            <Field label="Nomor sesi">
              <Input
                type="number"
                min={1}
                value={form.no}
                onChange={(e) => setForm({ ...form, no: e.target.value })}
                placeholder="Otomatis"
              />
            </Field>

            <Field label="Materi" className="full" hint="Pilih dari silabus LBT 2026. Hanya koordinator yang menetapkan materi dan waktu.">
              <Select
                value={form.topic}
                onChange={(e) => {
                  const material = MATERIALS.find((item) => item.topic === e.target.value);
                  setForm({
                    ...form,
                    topic: e.target.value,
                    ...(material?.waktu ? { durationMinutes: String(parseInt(material.waktu, 10) || '') } : {}),
                  });
                }}
                required
              >
                <option value="">Pilih materi silabus</option>
                {MATERIALS.map((material) => (
                  <option key={`${material.no}-${material.topic}`} value={material.topic}>
                    {material.no}. {material.topic}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Lokasi / Ruang" className="full">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Aula Utama / Ruang Diskusi"
              />
            </Field>

            <Field label="Waktu mulai (rencana)">
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => onTimeChange('startTime', e.target.value)}
              />
            </Field>

            <Field label="Waktu selesai (rencana)">
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => onTimeChange('endTime', e.target.value)}
              />
            </Field>

            <Field
              label="Durasi rencana (menit)"
              hint={
                form.startTime && form.endTime
                  ? `Otomatis: ${fmtDuration(calcDuration(form.startTime, form.endTime))}`
                  : 'Isi otomatis dari waktu mulai & selesai'
              }
            >
              <Input
                type="number"
                min={1}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                placeholder="menit"
              />
            </Field>

            <div className="full">
              <p className="small muted" style={{ marginTop: 0 }}>
                💡 Penjadwalan pemateri diatur oleh <strong>Koordinator Tim</strong> di halaman
                Pertemuan; waktu aktual, absensi, sosiogram, dan penilaian diisi oleh{' '}
                <strong>Observer</strong>.
              </p>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

