import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AttendanceStatus, LocalId, Participant, Session, SessionAttendance, SessionSpeaker, Speaker, } from '../../shared/types';
import { ATTENDANCE, SPEAKER_ROLES } from '../../shared/types';
import { LOCALS, localLabel } from '../../shared/locals';
import { Alert, Button, Card, Empty, Field, Input, Loader, PageHeader, Select, } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { fmtDate } from '../lib/utils';
import { findMaterialByTopic } from '../../shared/materials';
import { SosiogramEditor } from './SosiogramEditor';
export function SessionDetail() {
    const { id = '' } = useParams();
    const { user } = useAuth();
    const [session, setSession] = useState<Session | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [metaForm, setMetaForm] = useState({
        date: '',
        topic: '',
        location: '',
        no: '',
        localId: '',
    });
    const [speakerRows, setSpeakerRows] = useState<SessionSpeaker[]>([]);
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus | ''>>({});
    const [savingMeta, setSavingMeta] = useState(false);
    const [savingSpeakers, setSavingSpeakers] = useState(false);
    const [savingAttendance, setSavingAttendance] = useState(false);
    const [timeForm, setTimeForm] = useState({
        actualStartTime: '',
        actualEndTime: '',
        actualDurationMinutes: '',
    });
    const [savingTime, setSavingTime] = useState(false);
    const writable = user?.role === 'koordinator';
    const canTrackTime = user?.role === 'observer';
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const [sessionResult, participantResult, speakerResult] = await Promise.all([
                    api.sessions.get(id),
                    api.participants.list(),
                    api.speakers.list(),
                ]);
                if (cancelled)
                    return;
                const loaded = sessionResult.session;
                setSession(loaded);
                setParticipants(participantResult.participants.filter((participant) => !loaded.localId || participant.localId === loaded.localId));
                setSpeakers(speakerResult.speakers);
                setMetaForm({
                    date: loaded.date,
                    topic: loaded.topic,
                    location: loaded.location || '',
                    no: loaded.no ? String(loaded.no) : '',
                    localId: loaded.localId ? String(loaded.localId) : '',
                });
                setSpeakerRows(loaded.speakers);
                setAttendance(Object.fromEntries(loaded.attendance.map((item) => [item.participantId, item.status])));
                setTimeForm({
                    actualStartTime: loaded.actualStartTime || '',
                    actualEndTime: loaded.actualEndTime || '',
                    actualDurationMinutes: loaded.actualDurationMinutes
                        ? String(loaded.actualDurationMinutes)
                        : '',
                });
            }
            catch (err) {
                if (!cancelled)
                    setError(err instanceof Error ? err.message : 'Gagal memuat pertemuan');
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);
    async function saveMeta() {
        if (!session || !writable)
            return;
        setSavingMeta(true);
        setError('');
        setMessage('');
        try {
            const result = await api.sessions.update(session.id, {
                date: metaForm.date,
                topic: metaForm.topic,
                location: metaForm.location,
                localId: metaForm.localId ? (Number(metaForm.localId) as LocalId) : null,
                ...(metaForm.no ? { no: Number(metaForm.no) } : {}),
            });
            setSession(result.session);
            setMessage('Data pertemuan disimpan');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menyimpan pertemuan');
        }
        finally {
            setSavingMeta(false);
        }
    }
    async function saveSpeakers() {
        if (!session || !writable)
            return;
        setSavingSpeakers(true);
        setError('');
        setMessage('');
        try {
            const rows = speakerRows.filter((row) => row.speakerId);
            const result = await api.sessions.update(session.id, { speakers: rows });
            setSession(result.session);
            setSpeakerRows(result.session.speakers);
            setMessage('Pemateri dan kehadiran pengajar disimpan');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menyimpan pemateri');
        }
        finally {
            setSavingSpeakers(false);
        }
    }
    async function saveAttendance() {
        if (!session || !canTrackTime)
            return;
        setSavingAttendance(true);
        setError('');
        setMessage('');
        try {
            const rows: SessionAttendance[] = Object.entries(attendance)
                .filter(([, status]) => status)
                .map(([participantId, status]) => ({
                participantId,
                status: status as AttendanceStatus,
            }));
            const result = await api.sessions.update(session.id, { attendance: rows });
            setSession(result.session);
            setAttendance(Object.fromEntries(result.session.attendance.map((item) => [item.participantId, item.status])));
            setMessage('Absensi peserta disimpan');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menyimpan absensi');
        }
        finally {
            setSavingAttendance(false);
        }
    }
    function updateSpeakerRow(index: number, patch: Partial<SessionSpeaker>) {
        setSpeakerRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    }
    function markAllPresent() {
        setAttendance(Object.fromEntries(participants.map((participant) => [participant.id, 'hadir'])));
    }
    function calcDuration(start: string, end: string): number | undefined {
        if (!start || !end)
            return undefined;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        return diff > 0 ? diff : undefined;
    }
    function fmtDuration(minutes?: number | string): string {
        const m = typeof minutes === 'string' ? Number(minutes) : minutes;
        if (!m)
            return '—';
        const h = Math.floor(m / 60);
        const min = m % 60;
        if (h === 0)
            return `${min} menit`;
        if (min === 0)
            return `${h} jam`;
        return `${h} jam ${min} menit`;
    }
    function onActualTimeChange(field: 'actualStartTime' | 'actualEndTime', value: string) {
        const updated = { ...timeForm, [field]: value };
        const dur = calcDuration(field === 'actualStartTime' ? value : timeForm.actualStartTime, field === 'actualEndTime' ? value : timeForm.actualEndTime);
        if (dur !== undefined)
            updated.actualDurationMinutes = String(dur);
        setTimeForm(updated);
    }
    async function saveTime() {
        if (!session || !canTrackTime)
            return;
        setSavingTime(true);
        setError('');
        setMessage('');
        try {
            const result = await api.sessions.update(session.id, {
                actualStartTime: timeForm.actualStartTime,
                actualEndTime: timeForm.actualEndTime,
                ...(timeForm.actualDurationMinutes
                    ? { actualDurationMinutes: Number(timeForm.actualDurationMinutes) }
                    : {}),
            });
            setSession(result.session);
            setMessage('Waktu aktual sesi disimpan');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal menyimpan waktu');
        }
        finally {
            setSavingTime(false);
        }
    }
    if (loading) {
        return (<div className="content">
        <Loader />
      </div>);
    }
    if (!session) {
        return (<div className="content">
        <Alert>{error || 'Pertemuan tidak ditemukan.'}</Alert>
        <Link to="/pertemuan">Kembali ke daftar pertemuan</Link>
      </div>);
    }
    return (<div className="content">
      <PageHeader title={`Sesi ${session.no || ''} · ${session.topic}`} subtitle={`${fmtDate(session.date, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })}${session.location ? ` · ${session.location}` : ''} · ${localLabel(session.localId)}`} actions={<div className="page-actions">
            <Link to={`/penilaian/${session.id}`} className="btn btn-primary">
              Penilaian pemateri
            </Link>
            <Link to="/pertemuan" className="btn btn-ghost">
              Kembali
            </Link>
          </div>}/>

      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="alert-success">{message}</Alert>}

      
      <Card title="Jadwal & Waktu Sesi" subtitle="Waktu rencana ditetapkan Koordinator Tim · Waktu aktual diisi Observer saat sesi berlangsung." actions={canTrackTime ? (<Button variant="primary" size="sm" onClick={saveTime} disabled={savingTime}>
              {savingTime ? 'Menyimpan…' : 'Simpan Waktu Aktual'}
            </Button>) : undefined}>
        <div className="form-grid">
          <Field label="Waktu mulai (rencana)">
            <Input type="time" value={session.startTime || ''} disabled/>
          </Field>
          <Field label="Waktu selesai (rencana)">
            <Input type="time" value={session.endTime || ''} disabled/>
          </Field>
          <Field label="Durasi rencana" hint={fmtDuration(session.durationMinutes ||
            (session.startTime && session.endTime
                ? calcDuration(session.startTime, session.endTime)
                : undefined))}>
            <Input type="number" value={session.durationMinutes || ''} disabled placeholder="—"/>
          </Field>
          <div />
          <Field label="Waktu mulai (aktual)">
            <Input type="time" value={timeForm.actualStartTime} onChange={(e) => onActualTimeChange('actualStartTime', e.target.value)} disabled={!canTrackTime}/>
          </Field>
          <Field label="Waktu selesai (aktual)">
            <Input type="time" value={timeForm.actualEndTime} onChange={(e) => onActualTimeChange('actualEndTime', e.target.value)} disabled={!canTrackTime}/>
          </Field>
          <Field label="Durasi aktual (menit)" hint={(() => {
            const planned = session.durationMinutes ||
                calcDuration(session.startTime || '', session.endTime || '');
            const actual = timeForm.actualDurationMinutes
                ? Number(timeForm.actualDurationMinutes)
                : calcDuration(timeForm.actualStartTime, timeForm.actualEndTime);
            if (!actual)
                return 'Isi waktu aktual untuk menghitung';
            const diff = actual - (planned || 0);
            return `${fmtDuration(actual)}${planned ? ` (${diff >= 0 ? '+' : ''}${diff} mnt dari rencana)` : ''}`;
        })()}>
            <Input type="number" min={1} value={timeForm.actualDurationMinutes} onChange={(e) => setTimeForm({ ...timeForm, actualDurationMinutes: e.target.value })} disabled={!canTrackTime} placeholder="Otomatis dari waktu aktual"/>
          </Field>
        </div>
      </Card>

      {(() => {
            const material = findMaterialByTopic(session.topic);
            if (!material)
                return null;
            return (<Card title="Detail Materi Silabus" subtitle="Pokok bahasan, target, dan indikator dari silabus LBT 2026.">
            <div className="list">
              <div className="list-row">
                <div className="main-text">
                  <span>Pokok Bahasan</span>
                  <strong>{material.pokokBahasan}</strong>
                </div>
              </div>
              <div className="list-row">
                <div className="main-text">
                  <span>Target</span>
                  <strong>{material.target}</strong>
                </div>
              </div>
              <div className="list-row">
                <div className="main-text">
                  <span>Indikator</span>
                  <strong>{material.indikator}</strong>
                </div>
              </div>
              <div className="list-row">
                <div className="main-text">
                  <span>Waktu / Metode</span>
                  <strong>{material.waktu || '-'} / {material.metode || '-'}</strong>
                </div>
              </div>
            </div>
          </Card>);
        })()}

      <Card title="Identitas pertemuan" subtitle={writable ? 'Ubah tanggal, materi, dan lokasi.' : 'Hanya Koordinator Tim yang dapat mengubah.'} actions={writable ? (<Button variant="primary" size="sm" onClick={saveMeta} disabled={savingMeta}>
              {savingMeta ? 'Menyimpan…' : 'Simpan'}
            </Button>) : undefined}>
        <div className="form-grid">
          <Field label="Lokal">
            <Select value={metaForm.localId} onChange={(event) => setMetaForm({ ...metaForm, localId: event.target.value })} disabled={!writable}>
              <option value="">Belum ditempatkan</option>
              {LOCALS.map((local) => (<option key={local.id} value={local.id}>
                  {local.label}
                </option>))}
            </Select>
          </Field>
          <Field label="Tanggal">
            <Input type="date" value={metaForm.date} onChange={(event) => setMetaForm({ ...metaForm, date: event.target.value })} disabled={!writable}/>
          </Field>
          <Field label="Nomor sesi">
            <Input type="number" min={1} value={metaForm.no} onChange={(event) => setMetaForm({ ...metaForm, no: event.target.value })} disabled={!writable}/>
          </Field>
          <Field label="Materi" className="full">
            <Input value={metaForm.topic} onChange={(event) => setMetaForm({ ...metaForm, topic: event.target.value })} disabled={!writable}/>
          </Field>
          <Field label="Lokasi" className="full">
            <Input value={metaForm.location} onChange={(event) => setMetaForm({ ...metaForm, location: event.target.value })} disabled={!writable}/>
          </Field>
        </div>
      </Card>

      <Card title="Penilaian pemateri" subtitle={`${(session.assessments || []).length} lembar penilaian pada sesi ini.`} actions={user?.role === 'instruktur_lokal' ? undefined : (<Link to={`/penilaian/${session.id}`} className="btn btn-primary btn-sm">
              {(session.assessments || []).length
                ? 'Lihat penilaian'
                : user?.role === 'observer'
                    ? 'Isi penilaian'
                    : 'Lihat penilaian'}
            </Link>)}>
        {(session.assessments || []).length ? (<div className="list">
            {(session.assessments || []).map((assessment) => {
                const speaker = speakers.find((item) => item.id === assessment.speakerId);
                return (<div className="list-row" key={assessment.id}>
                  <div className="main-text">
                    <strong>{speaker?.name || 'Pemateri'}</strong>
                    <span>
                      Dinilai oleh {assessment.observerName} · {assessment.date}
                      {assessment.time ? ` · ${assessment.time}` : ''}
                    </span>
                  </div>
                  {user?.role === 'instruktur_lokal' ? (<span className="badge badge-green">Tercatat</span>) : (<Link to={`/penilaian/${session.id}`} className="badge badge-green">
                      Buka
                    </Link>)}
                </div>);
            })}
          </div>) : (<Empty>Belum ada penilaian pemateri untuk sesi ini.</Empty>)}
      </Card>

      <Card title="Pemateri, Inlok & Observer" subtitle={writable ? 'Atur pengajar dan status kehadirannya.' : 'Penjadwalan pengajar dikelola oleh Koordinator Tim.'} actions={writable ? (<div className="card-actions">
              <Button size="sm" onClick={() => setSpeakerRows((rows) => [...rows, { speakerId: '', role: 'pemateri', attendance: 'hadir', notes: '' }])}>
                + Baris
              </Button>
              <Button variant="primary" size="sm" onClick={saveSpeakers} disabled={savingSpeakers}>
                {savingSpeakers ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>) : undefined}>
        {speakerRows.length ? (<div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Peran</th>
                  <th>Kehadiran</th>
                  {writable && <th />}
                </tr>
              </thead>
              <tbody>
                {speakerRows.map((row, index) => (<tr key={`${row.speakerId}-${index}`}>
                    <td>
                      <Select value={row.speakerId} onChange={(event) => updateSpeakerRow(index, { speakerId: event.target.value })} disabled={!writable}>
                        <option value="">— pilih —</option>
                        {speakers.map((speaker) => (<option key={speaker.id} value={speaker.id}>
                            {speaker.name}
                          </option>))}
                      </Select>
                    </td>
                    <td>
                      <Select value={row.role} onChange={(event) => updateSpeakerRow(index, { role: event.target.value as SessionSpeaker['role'] })} disabled={!writable}>
                        {SPEAKER_ROLES.map((role) => (<option key={role.value} value={role.value}>
                            {role.label}
                          </option>))}
                      </Select>
                    </td>
                    <td>
                      <Select value={row.attendance} onChange={(event) => updateSpeakerRow(index, {
                    attendance: event.target.value as AttendanceStatus,
                })} disabled={!writable}>
                        {ATTENDANCE.map((item) => (<option key={item.value} value={item.value}>
                            {item.label}
                          </option>))}
                      </Select>
                    </td>
                    {writable && (<td>
                        <div className="actions">
                          <Button size="sm" variant="danger" onClick={() => setSpeakerRows((rows) => rows.filter((_, i) => i !== index))}>
                            Hapus
                          </Button>
                        </div>
                      </td>)}
                  </tr>))}
              </tbody>
            </table>
          </div>) : (<Empty>Belum ada pemateri/inlok/observer untuk sesi ini.</Empty>)}
      </Card>

      <Card title="Absensi peserta" subtitle={canTrackTime
            ? `${participants.length} peserta terdaftar · dapat diisi Observer`
            : `${participants.length} peserta terdaftar · hanya dapat dilihat`} actions={canTrackTime ? (<div className="card-actions">
              <Button size="sm" onClick={markAllPresent}>
                Semua hadir
              </Button>
              <Button variant="primary" size="sm" onClick={saveAttendance} disabled={savingAttendance}>
                {savingAttendance ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>) : undefined}>
        {participants.length ? (<div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Asal</th>
                  <th>Status kehadiran</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => (<tr key={participant.id}>
                    <td>{participant.name}</td>
                    <td>{participant.origin || '—'}</td>
                    <td>
                      <Select value={attendance[participant.id] || ''} onChange={(event) => setAttendance((current) => ({
                    ...current,
                    [participant.id]: event.target.value as AttendanceStatus | '',
                }))} disabled={!canTrackTime}>
                        <option value="">— belum diisi —</option>
                        {ATTENDANCE.map((item) => (<option key={item.value} value={item.value}>
                            {item.label}
                          </option>))}
                      </Select>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>) : (<Empty>Belum ada peserta. Tambahkan peserta terlebih dahulu.</Empty>)}
      </Card>

      {user?.role === 'observer' ? (<Card title="Sosiogram & penilaian RELI" subtitle="Geser kursi, tautkan peserta, isi nilai 4×4, lalu simpan. Perubahan disimpan otomatis.">
          <SosiogramEditor key={session.id} session={session} participants={participants} speakers={speakers} onSaved={(saved) => setSession(saved)}/>
        </Card>) : (<Card title="Hasil sosiogram" subtitle="Sosiogram diisi oleh Observer. Koordinator dan Instruktur Lokal hanya menerima hasil analisis.">
          <Empty>
            Sosiogram tidak dapat diubah di sini. Buka Monitoring untuk melihat grafik dan perkembangan peserta.
          </Empty>
        </Card>)}
    </div>);
}
