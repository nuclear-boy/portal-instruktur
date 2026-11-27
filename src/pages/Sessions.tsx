import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LocalId, Participant, Session, Speaker } from '../../shared/types';
import { LOCALS, localLabel } from '../../shared/locals';
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
import { canEditMaster, fmtDate, todayISO } from '../lib/utils';
import { MATERIALS } from '../../shared/materials';

interface SessionForm {
  date: string;
  topic: string;
  location: string;
  no: string;
  localId: string;
}

export function Sessions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
  const [form, setForm] = useState<SessionForm>({
    date: todayISO(),
    topic: '',
    location: '',
    no: '',
    localId: String(user?.localId || 1),
  });
  const [busy, setBusy] = useState(false);

  const writable = canEditMaster(user?.role);
  const scopedLocal = user?.localId || undefined;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionResult, speakerResult, participantResult] = await Promise.all([
        api.sessions.list(),
        api.speakers.list(),
        api.participants.list(),
      ]);
      setSessions(sessionResult.sessions);
      setSpeakers(speakerResult.speakers);
      setParticipants(participantResult.participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      sessions.filter(
        (session) => filterLocal === 'all' || session.localId === filterLocal,
      ),
    [sessions, filterLocal],
  );

  function openCreate() {
    setEditing(null);
    setForm({
      date: todayISO(),
      topic: '',
      location: '',
      no: '',
      localId: String(scopedLocal || 1),
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
      localId: String(session.localId || scopedLocal || 1),
    });
    setModalOpen(true);
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
        !editing && form.localId === 'all' ? LOCALS.map((local) => local.id) : [Number(form.localId) as LocalId];
      const basePayload = {
        date: form.date,
        topic: form.topic,
        location: form.location,
        ...(form.no ? { no: Number(form.no) } : {}),
      };

      if (editing) {
        const result = await api.sessions.update(editing.id, {
          ...basePayload,
          localId: targetLocals[0],
        });
        setSessions((items) => items.map((item) => (item.id === editing.id ? result.session : item)));
        setModalOpen(false);
      } else {
        const created: Session[] = [];
        for (const localId of targetLocals) {
          const result = await api.sessions.create({ ...basePayload, localId });
          created.push(result.session);
        }
        setSessions((items) => [...items, ...created]);
        setModalOpen(false);
        if (created.length === 1) navigate(`/pertemuan/${created[0].id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pertemuan');
    } finally {
      setBusy(false);
    }
  }

  async function remove(session: Session) {
    if (!window.confirm(`Hapus pertemuan "${session.topic}"? Nilai dan absensi ikut terhapus.`)) return;
    try {
      await api.sessions.remove(session.id);
      setSessions((items) => items.filter((item) => item.id !== session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus pertemuan');
    }
  }

  async function duplicate(session: Session) {
    if (!window.confirm(`Duplikat denah pertemuan "${session.topic}" ke pertemuan baru?`)) return;
    try {
      const created = await api.sessions.create({
        date: todayISO(),
        topic: `${session.topic} (salinan)`,
        location: session.location || '',
        localId: session.localId || (scopedLocal as LocalId) || 1,
      });
      await api.sessions.saveSosiogram(created.session.id, created.session.version, session.sosiogram);
      navigate(`/pertemuan/${created.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menduplikat pertemuan');
    }
  }

  function speakerNames(session: Session) {
    return session.speakers
      .map((item) => {
        const speaker = speakers.find((entry) => entry.id === item.speakerId);
        if (!speaker) return null;
        const role = item.role === 'pemateri' ? 'Pemateri' : item.role === 'inlok' ? 'Inlok' : 'Obs';
        return `${speaker.name} (${role})`;
      })
      .filter(Boolean)
      .join(', ');
  }

  function localTotal(session: Session) {
    return participants.filter((participant) => participant.localId === session.localId).length;
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
        title="Pertemuan"
        subtitle={
          scopedLocal
            ? `${localLabel(scopedLocal)} · ${filtered.length} pertemuan`
            : `${filtered.length} pertemuan · sosiogram dan penilaian per lokal`
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void load()}>
              Muat ulang
            </Button>
            {writable && (
              <Button variant="primary" onClick={openCreate}>
                + Pertemuan
              </Button>
            )}
          </>
        }
      />

      {error && <Alert>{error}</Alert>}

      {!scopedLocal && (
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
            <span className="small muted">{filtered.length} pertemuan</span>
          </div>
        </Card>
      )}

      <Card>
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Materi</th>
                  <th>Lokal</th>
                  <th>Pemateri/Inlok/Obs</th>
                  <th>Hadir</th>
                  <th>Penilaian</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => {
                  const present = session.attendance.filter(
                    (item) => item.status === 'hadir' || item.status === 'terlambat',
                  ).length;
                  const total = localTotal(session);
                  return (
                    <tr key={session.id}>
                      <td>{session.no || '—'}</td>
                      <td className="nowrap">{fmtDate(session.date)}</td>
                      <td>
                        <Link to={`/pertemuan/${session.id}`}>{session.topic}</Link>
                        {session.location && <div className="small muted">{session.location}</div>}
                      </td>
                      <td>
                        <Badge tone={session.localId ? 'badge-blue' : 'badge-neutral'}>
                          {localLabel(session.localId)}
                        </Badge>
                      </td>
                      <td>{speakerNames(session) || '—'}</td>
                      <td>
                        {present}/{total || '—'}
                      </td>
                      <td>
                        {user?.role === 'instruktur_lokal' ? (
                          <span className="badge badge-green">
                            {session.assessments?.length || 0} penilaian
                          </span>
                        ) : (
                          <Link to={`/penilaian/${session.id}`} className="badge badge-green">
                            {session.assessments?.length || 0} penilaian
                          </Link>
                        )}
                      </td>
                      <td>
                        <div className="actions">
                          <Link to={`/pertemuan/${session.id}`} className="btn btn-primary btn-sm">
                            Sosiogram
                          </Link>
                          {writable && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(session)}>
                                Ubah
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => duplicate(session)}>
                                Salin
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => remove(session)}>
                                Hapus
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada pertemuan untuk lokal ini. Tambahkan pertemuan pertama.</Empty>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? 'Ubah pertemuan' : 'Tambah pertemuan'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" form="session-form" variant="primary" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
        <form id="session-form" className="form-grid" onSubmit={save}>
          <Field label="Lokal">
            <Select
              value={form.localId}
              onChange={(event) => setForm({ ...form, localId: event.target.value })}
              disabled={Boolean(scopedLocal)}
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
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              required
            />
          </Field>
          <Field label="Nomor sesi">
            <Input
              type="number"
              min={1}
              value={form.no}
              onChange={(event) => setForm({ ...form, no: event.target.value })}
              placeholder="Otomatis"
            />
          </Field>
           <Field label="Materi" className="full" hint="Pilih dari silabus LBT 2026.">
             <Select
               value={form.topic}
               onChange={(event) => setForm({ ...form, topic: event.target.value })}
               required
             >
               <option value="" disabled>
                 Pilih materi silabus
               </option>
               {!MATERIALS.some((material) => material.topic === form.topic) && form.topic && (
                 <option value={form.topic}>{form.topic} (tidak di silabus)</option>
               )}
               {MATERIALS.map((material) => (
                 <option key={`${material.no}-${material.topic}`} value={material.topic}>
                   {material.no}. {material.topic}
                 </option>
               ))}
             </Select>
           </Field>
          <Field label="Lokasi" className="full">
            <Input
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              placeholder="Ruang/gedung"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
