import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ASSESSMENT_GROUPS,
  ASSESSMENT_SCALE,
  assessmentGroupAverage,
  assessmentOverall,
  assessmentTone,
} from '../../shared/assessment';
import { LOCALS, localLabel, setLocals } from '../../shared/locals';
import type { LocalId, Session, Speaker, SpeakerAssessment } from '../../shared/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Loader,
  PageHeader,
  Select,
  Stat,
  Textarea,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import type { SpeakerAssessmentInput } from '../lib/api';
import { downloadAssessmentPdf } from '../lib/pdf';
import { cls, fmtDate, fmtDateTime, todayISO } from '../lib/utils';

interface AssessmentFormState {
  speakerId: string;
  date: string;
  time: string;
  observerName: string;
  scores: Record<string, number>;
  notes: Record<string, string>;
  generalNotes: string;
  recommendations: string;
}

const GENERAL_CHIPS = [
  'Penyampaian komunikatif & interaktif',
  'Penguasaan materi sangat kuat',
  'Suasana forum hidup dan kondusif',
  'Sistematika pembahasan runtut',
  'Manajemen waktu sudah baik',
];

const RECOMMENDATION_CHIPS = [
  'Perbanyak ruang tanya-jawab peserta',
  'Tambahkan contoh kasus aplikatif',
  'Perlu menjaga ketepatan waktu sesi',
  'Tingkatkan variasi metode diskusi',
  'Pertahankan gaya penyampaian yang komunikatif',
];

function emptyScores(): Record<string, number> {
  return Object.fromEntries(
    ASSESSMENT_GROUPS.flatMap((group) => group.items).map((item) => [item.key, 4]),
  );
}

function emptyNotes(): Record<string, string> {
  return Object.fromEntries(
    ASSESSMENT_GROUPS.flatMap((group) => group.items).map((item) => [item.key, '']),
  );
}

function sessionTimeRange(session?: Session): string {
  if (!session) return '';
  if (session.actualStartTime && session.actualEndTime) {
    return `${session.actualStartTime}–${session.actualEndTime}`;
  }
  if (session.startTime && session.endTime) {
    return `${session.startTime}–${session.endTime}`;
  }
  return session.actualStartTime || session.startTime || '';
}

function scaleLabelOf(value: number): string {
  return ASSESSMENT_SCALE.find((item) => item.value === value)?.label || '—';
}

function appendChip(current: string, chip: string): string {
  const trimmed = current.trim();
  if (!trimmed) return `${chip}.`;
  if (trimmed.toLowerCase().includes(chip.toLowerCase())) return current;
  const sep = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${sep}${chip}.`;
}

export function SpeakerAssessments() {
  const { id } = useParams();
  const { user, meta } = useAuth();
  const { notify } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [localOptions, setLocalOptions] = useState(LOCALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'done'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<SpeakerAssessment | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyPdfId, setBusyPdfId] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const [form, setForm] = useState<AssessmentFormState>({
    speakerId: '',
    date: todayISO(),
    time: '',
    observerName: user?.name || '',
    scores: emptyScores(),
    notes: emptyNotes(),
    generalNotes: '',
    recommendations: '',
  });

  const canWrite = user?.role === 'observer';
  const scopedLocal = user?.localId || undefined;
  const session = id ? sessions.find((item) => item.id === id) : undefined;
  const draftKey = id ? `lbt-assess-draft:${id}` : '';

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionResult, speakerResult, metaResult] = await Promise.all([
        api.sessions.list(),
        api.speakers.list(),
        api.getMeta(),
      ]);
      setSessions(sessionResult.sessions);
      setSpeakers(speakerResult.speakers);
      setLocals(metaResult.meta.locals);
      setLocalOptions(metaResult.meta.locals || [...LOCALS]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat penilaian');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Initialize form for selected session (+ restore offline draft if available)
  useEffect(() => {
    if (!session || editing) return;
    if (canWrite && draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<AssessmentFormState>;
          if (saved && typeof saved === 'object' && saved.scores) {
            setForm({
              speakerId: saved.speakerId || '',
              date: saved.date || session.date,
              time: saved.time || sessionTimeRange(session),
              observerName: saved.observerName || user?.name || '',
              scores: { ...emptyScores(), ...saved.scores },
              notes: { ...emptyNotes(), ...(saved.notes || {}) },
              generalNotes: saved.generalNotes || '',
              recommendations: saved.recommendations || '',
            });
            setDraftRestored(true);
            return;
          }
        }
      } catch {
        // Ignore broken draft
      }
    }

    const myAssessedSpeakerIds = new Set(
      (session.assessments || [])
        .filter((a) => a.observerId === user?.id)
        .map((a) => a.speakerId),
    );
    const sessionPemateri = session.speakers.filter((item) => item.role === 'pemateri');
    const unassessedPrimary =
      sessionPemateri.find((item) => !myAssessedSpeakerIds.has(item.speakerId)) ||
      sessionPemateri[0] ||
      session.speakers[0];

    setDraftRestored(false);
    setForm({
      speakerId: unassessedPrimary?.speakerId || speakers[0]?.id || '',
      date: session.date,
      time: sessionTimeRange(session),
      observerName: user?.name || '',
      scores: emptyScores(),
      notes: emptyNotes(),
      generalNotes: '',
      recommendations: '',
    });
  }, [session?.id]);

  // Sync default speakerId if speakers finished loading after form initialization
  useEffect(() => {
    if (!session || editing || form.speakerId || !speakers.length) return;
    const primary =
      session.speakers.find((item) => item.role === 'pemateri')?.speakerId ||
      session.speakers[0]?.speakerId ||
      speakers[0]?.id ||
      '';
    if (primary) {
      setForm((prev) => (prev.speakerId ? prev : { ...prev, speakerId: primary }));
    }
  }, [session, editing, form.speakerId, speakers]);

  function updateForm(next: AssessmentFormState) {
    setForm(next);
    if (canWrite && draftKey && !editing) {
      try {
        localStorage.setItem(draftKey, JSON.stringify(next));
      } catch {
        // Ignore storage quota
      }
    }
  }

  function clearDraft() {
    setDraftRestored(false);
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Ignore
      }
    }
  }

  const visibleSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions
      .filter((item) => filterLocal === 'all' || item.localId === filterLocal)
      .filter((item) => {
        const count = (item.assessments || []).length;
        if (filterStatus === 'pending') return count === 0;
        if (filterStatus === 'done') return count > 0;
        return true;
      })
      .filter((item) => {
        if (!q) return true;
        const speakerNames = item.speakers
          .map((s) => speakers.find((sp) => sp.id === s.speakerId)?.name || '')
          .join(' ');
        return (
          item.topic.toLowerCase().includes(q) ||
          speakerNames.toLowerCase().includes(q) ||
          localLabel(item.localId).toLowerCase().includes(q)
        );
      });
  }, [sessions, speakers, filterLocal, filterStatus, searchQuery]);

  const scopedSessions = useMemo(
    () => sessions.filter((item) => filterLocal === 'all' || item.localId === filterLocal),
    [sessions, filterLocal],
  );

  const allAssessments = useMemo(
    () =>
      scopedSessions.flatMap((item) =>
        (item.assessments || []).map((assessment) => ({ assessment, session: item })),
      ),
    [scopedSessions],
  );

  const average = useMemo(() => {
    if (!allAssessments.length) return 0;
    return (
      allAssessments.reduce(
        (total, item) => total + assessmentOverall(item.assessment.scores),
        0,
      ) / allAssessments.length
    );
  }, [allAssessments]);

  function canEditAssessment(assessment: SpeakerAssessment) {
    return user?.role === 'observer' && assessment.observerId === user.id;
  }

  function startEdit(assessment: SpeakerAssessment) {
    setEditing(assessment);
    setDraftRestored(false);
    setMessage('');
    setForm({
      speakerId: assessment.speakerId,
      date: assessment.date,
      time: assessment.time,
      observerName: assessment.observerName,
      scores: { ...emptyScores(), ...assessment.scores },
      notes: { ...emptyNotes(), ...assessment.notes },
      generalNotes: assessment.generalNotes,
      recommendations: assessment.recommendations,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm(nextSession?: Session) {
    setEditing(null);
    clearDraft();
    setMessage('');
    const target = nextSession || session;
    const primary =
      target?.speakers.find((item) => item.role === 'pemateri')?.speakerId ||
      target?.speakers[0]?.speakerId ||
      speakers[0]?.id ||
      '';
    setForm({
      speakerId: primary,
      date: target?.date || todayISO(),
      time: sessionTimeRange(target),
      observerName: user?.name || '',
      scores: emptyScores(),
      notes: emptyNotes(),
      generalNotes: '',
      recommendations: '',
    });
  }

  function setGroupScore(groupKey: string, scoreValue: number) {
    if (!canWrite) return;
    const group = ASSESSMENT_GROUPS.find((g) => g.key === groupKey);
    if (!group) return;
    const nextScores = { ...form.scores };
    group.items.forEach((item) => {
      nextScores[item.key] = scoreValue;
    });
    updateForm({ ...form, scores: nextScores });
  }

  async function saveAssessment() {
    if (!session) return;
    if (!form.speakerId) {
      setError('Pemateri wajib dipilih');
      return;
    }
    if (!canWrite) {
      setError('Anda tidak memiliki akses untuk mengisi penilaian');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload: SpeakerAssessmentInput = {
        speakerId: form.speakerId,
        date: form.date,
        time: form.time,
        observerName: form.observerName,
        scores: form.scores,
        notes: form.notes,
        generalNotes: form.generalNotes,
        recommendations: form.recommendations,
      };
      const result = editing
        ? await api.sessions.updateAssessment(session.id, editing.id, payload)
        : await api.sessions.createAssessment(session.id, payload);
      setSessions((items) =>
        items.map((item) => (item.id === session.id ? result.session : item)),
      );
      clearDraft();
      const msg = editing ? 'Penilaian pemateri diperbarui.' : 'Penilaian pemateri berhasil disimpan.';
      setMessage(msg);
      notify(msg);
      resetForm(result.session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan penilaian';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeAssessment(assessment: SpeakerAssessment) {
    if (!session) return;
    if (!canEditAssessment(assessment)) {
      setError('Hanya Observer pemilik lembar penilaian yang dapat menghapusnya');
      return;
    }
    if (!window.confirm(`Hapus penilaian oleh ${assessment.observerName}?`)) return;
    try {
      await api.sessions.removeAssessment(session.id, assessment.id);
      const updated = {
        ...session,
        assessments: (session.assessments || []).filter((item) => item.id !== assessment.id),
      };
      setSessions((items) => items.map((item) => (item.id === session.id ? updated : item)));
      if (editing?.id === assessment.id) resetForm(session);
      setMessage('Penilaian dihapus.');
      notify('Lembar penilaian dihapus.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus penilaian');
    }
  }

  async function download(assessment: SpeakerAssessment) {
    if (!session || busyPdfId) return;
    setBusyPdfId(assessment.id);
    try {
      await downloadAssessmentPdf({
        session,
        assessment,
        speaker: speakers.find((item) => item.id === assessment.speakerId),
        meta,
      });
      notify('PDF lembar penilaian berhasil diunduh.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat PDF';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusyPdfId('');
    }
  }

  function speakerName(speakerId: string) {
    return speakers.find((item) => item.id === speakerId)?.name || 'Pemateri';
  }

  if (loading) {
    return (
      <div className="content">
        <Loader label="Memuat penilaian pemateri…" />
      </div>
    );
  }

  if (id && !session) {
    return (
      <div className="content">
        <Alert>{error || 'Pertemuan tidak ditemukan atau bukan bagian dari lokal Anda.'}</Alert>
        <Link to="/penilaian" className="btn btn-ghost">
          Kembali ke penilaian
        </Link>
      </div>
    );
  }

  if (!id) {
    const pendingCount = scopedSessions.filter((item) => !(item.assessments || []).length).length;
    const doneCount = scopedSessions.length - pendingCount;

    return (
      <div className="content">
        <PageHeader
          title="Penilaian Pemateri"
          subtitle={
            scopedLocal
              ? `${localLabel(scopedLocal)} · formulir penilaian 12 aspek skala 1–5`
              : 'Form penilaian 5 skala, catatan per aspek, dan rekomendasi observer'
          }
          actions={
            <>
              {user?.role === 'koordinator' && (
                <Link to="/monitoring-pemateri" className="btn btn-primary">
                  Monitoring Pemateri →
                </Link>
              )}
              <Link to="/pertemuan" className="btn btn-ghost">
                Daftar pertemuan
              </Link>
            </>
          }
        />

        {error && <Alert>{error}</Alert>}

        <div className="kpi-grid">
          <Stat label="Lembar penilaian" value={allAssessments.length} hint="Tersimpan" />
          <Stat
            label="Rata-rata nilai"
            value={allAssessments.length ? average.toFixed(2) : '—'}
            hint="Skala 1.00 – 5.00"
          />
          <Stat
            label="Cakupan sesi"
            value={`${doneCount}/${scopedSessions.length}`}
            hint={pendingCount ? `${pendingCount} sesi belum dinilai` : 'Semua sesi sudah dinilai'}
          />
          <Stat
            label="Observer"
            value={new Set(allAssessments.map((item) => item.assessment.observerName)).size}
            hint="Berpartisipasi"
          />
        </div>

        <Card>
          <div className="toolbar" style={{ marginBottom: !scopedLocal ? 10 : 0 }}>
            <Input
              className="search"
              placeholder="Cari materi, pemateri, atau lokal…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <div className="filter-pills" role="group" aria-label="Filter status penilaian">
              <button
                className={filterStatus === 'all' ? 'pill active' : 'pill'}
                onClick={() => setFilterStatus('all')}
              >
                Semua ({scopedSessions.length})
              </button>
              <button
                className={filterStatus === 'pending' ? 'pill active' : 'pill'}
                onClick={() => setFilterStatus('pending')}
              >
                Belum dinilai ({pendingCount})
              </button>
              <button
                className={filterStatus === 'done' ? 'pill active' : 'pill'}
                onClick={() => setFilterStatus('done')}
              >
                Sudah dinilai ({doneCount})
              </button>
            </div>
          </div>

          {!scopedLocal && (
            <div className="toolbar">
              <div className="filter-pills" role="group" aria-label="Filter lokal">
                <button
                  className={filterLocal === 'all' ? 'pill active' : 'pill'}
                  onClick={() => setFilterLocal('all')}
                >
                  Semua lokal
                </button>
                {localOptions.map((local) => (
                  <button
                    key={local.id}
                    className={filterLocal === local.id ? 'pill active' : 'pill'}
                    onClick={() => setFilterLocal(local.id)}
                  >
                    {local.label}
                  </button>
                ))}
              </div>
              <span className="small muted">{visibleSessions.length} pertemuan</span>
            </div>
          )}
        </Card>

        <Card
          title="Daftar pertemuan"
          subtitle="Pilih pertemuan untuk melihat atau mengisi lembar penilaian pemateri."
        >
          {visibleSessions.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Tanggal</th>
                    <th>Materi</th>
                    <th>Lokal</th>
                    <th>Pemateri</th>
                    <th>Hasil observer</th>
                    <th className="num">Rata-rata</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleSessions.map((item) => {
                    const primary = item.speakers.find((speaker) => speaker.role === 'pemateri');
                    const list = item.assessments || [];
                    const sessionAvg = list.length
                      ? list.reduce((sum, a) => sum + assessmentOverall(a.scores), 0) / list.length
                      : null;
                    return (
                      <tr key={item.id}>
                        <td>{item.no || '—'}</td>
                        <td className="nowrap">{fmtDate(item.date)}</td>
                        <td>
                          <strong>{item.topic}</strong>
                        </td>
                        <td>
                          <Badge tone="badge-blue">{localLabel(item.localId)}</Badge>
                        </td>
                        <td>{primary ? speakerName(primary.speakerId) : '—'}</td>
                        <td>
                          <Badge tone={list.length ? 'badge-green' : 'badge-amber'}>
                            {list.length ? `${list.length} penilaian` : 'Belum dinilai'}
                          </Badge>
                        </td>
                        <td className="num">
                          {sessionAvg !== null ? (
                            <Badge tone={assessmentTone(sessionAvg)}>{sessionAvg.toFixed(2)}</Badge>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="right">
                          <Link to={`/penilaian/${item.id}`} className="btn btn-primary btn-sm">
                            {list.length
                              ? canWrite
                                ? 'Lihat / nilai'
                                : 'Lihat hasil'
                              : canWrite
                                ? 'Isi penilaian'
                                : 'Lihat detail'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Belum ada pertemuan yang cocok dengan filter.</Empty>
          )}
        </Card>
      </div>
    );
  }

  const assessments = session!.assessments || [];
  const scheduledSpeakerIds = new Set(session!.speakers.map((s) => s.speakerId));
  const scheduledSpeakers = speakers.filter((s) => scheduledSpeakerIds.has(s.id));
  const otherSpeakers = speakers.filter((s) => !scheduledSpeakerIds.has(s.id));
  const duplicateMine =
    canWrite && !editing && form.speakerId
      ? assessments.find((a) => a.observerId === user?.id && a.speakerId === form.speakerId)
      : undefined;
  const overallScore = assessmentOverall(form.scores);
  const overallPercent = Math.round((overallScore / 5) * 100);
  const primarySpeaker = speakers.find((item) => item.id === form.speakerId);

  return (
    <div className="content">
      <PageHeader
        title={`Penilaian · ${session!.topic}`}
        subtitle={`${fmtDate(session!.date, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })} · ${localLabel(session!.localId)}`}
        actions={
          <div className="page-actions">
            {user?.role === 'koordinator' && (
              <Link to="/monitoring-pemateri" className="btn btn-subtle">
                Monitoring Pemateri
              </Link>
            )}
            <Link to="/penilaian" className="btn btn-ghost">
              Kembali
            </Link>
          </div>
        }
      />

      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="alert-success">{message}</Alert>}

      {draftRestored && canWrite && !editing && (
        <Alert tone="alert-info">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>Draft penilaian lokal yang belum tersimpan telah dipulihkan otomatis.</span>
            <Button size="sm" variant="ghost" onClick={() => resetForm(session!)}>
              Mulai dari kosong
            </Button>
          </div>
        </Alert>
      )}

      {duplicateMine && (
        <Alert tone="alert-warning">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>
              Anda sudah menilai <strong>{speakerName(duplicateMine.speakerId)}</strong> pada sesi
              ini (nilai {assessmentOverall(duplicateMine.scores).toFixed(2)}).
            </span>
            <Button size="sm" variant="primary" onClick={() => startEdit(duplicateMine)}>
              Ubah Penilaian Sebelumnya
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid grid-2 assessment-layout">
        <Card
          title={editing ? 'Ubah penilaian pemateri' : 'Form penilaian pemateri'}
          subtitle={
            canWrite
              ? 'Ketuk skor 1–5 pada tiap aspek (1: Sangat Kurang · 5: Sangat Baik). Draft tersimpan otomatis.'
              : 'Anda dapat membaca hasil penilaian, tetapi tidak mengubahnya.'
          }
        >
          {!canWrite && (
            <Alert tone="alert-info">
              Hanya observer yang dapat mengisi penilaian pemateri.
            </Alert>
          )}
          {canWrite && speakers.length === 0 && (
            <Alert tone="alert-warning">
              Daftar pemateri belum tersedia. Minta Koordinator Tim untuk menambahkan atau memuat
              daftar pemateri terlebih dahulu pada menu Pemateri.
            </Alert>
          )}
          <div className="form-grid">
            <Field label="Pemateri">
              <Select
                value={form.speakerId}
                onChange={(event) => updateForm({ ...form, speakerId: event.target.value })}
                disabled={!canWrite || Boolean(editing) || speakers.length === 0}
              >
                <option value="">
                  {speakers.length ? '— pilih pemateri —' : '— belum ada pemateri terdaftar —'}
                </option>
                {scheduledSpeakers.length > 0 && (
                  <optgroup label="Pemateri terjadwal di sesi ini">
                    {scheduledSpeakers.map((speaker) => (
                      <option key={speaker.id} value={speaker.id}>
                        {speaker.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherSpeakers.length > 0 && (
                  <optgroup label={scheduledSpeakers.length ? 'Pemateri lainnya' : 'Daftar pemateri'}>
                    {otherSpeakers.map((speaker) => (
                      <option key={speaker.id} value={speaker.id}>
                        {speaker.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
            <Field label="Tanggal">
              <Input
                type="date"
                value={form.date}
                onChange={(event) => updateForm({ ...form, date: event.target.value })}
                disabled={!canWrite}
              />
            </Field>
            <Field label="Waktu">
              <Input
                value={form.time}
                onChange={(event) => updateForm({ ...form, time: event.target.value })}
                placeholder="08.00–09.30"
                disabled={!canWrite}
              />
            </Field>
            <Field label="Observer">
              <Input
                value={form.observerName}
                onChange={(event) => updateForm({ ...form, observerName: event.target.value })}
                disabled={!canWrite}
                placeholder="Nama observer"
              />
            </Field>
          </div>

          {/* Mobile-friendly grouped score pill cards (zero horizontal scroll) */}
          <div className="assessment-groups">
            {ASSESSMENT_GROUPS.map((group) => {
              const groupAvg = assessmentGroupAverage(form.scores, group);
              return (
                <div key={group.key} className="assessment-group-card">
                  <div className="assessment-group-head">
                    <div>
                      <strong>{group.label}</strong>
                      <span className="small muted">Rata-rata: {groupAvg.toFixed(2)} / 5.00</span>
                    </div>
                    <div className="assessment-quick-set">
                      {canWrite && (
                        <>
                          <span className="small muted">Set semua:</span>
                          {[3, 4, 5].map((val) => (
                            <button
                              key={val}
                              type="button"
                              className="score-quick-btn"
                              onClick={() => setGroupScore(group.key, val)}
                              title={`Setel seluruh aspek ${group.label} ke ${val}`}
                            >
                              {val}
                            </button>
                          ))}
                        </>
                      )}
                      <Badge tone={assessmentTone(groupAvg)}>{groupAvg.toFixed(2)}</Badge>
                    </div>
                  </div>

                  <div className="assessment-items-list">
                    {group.items.map((item) => {
                      const currentVal = form.scores[item.key] || 4;
                      return (
                        <div key={item.key} className="assessment-item-row">
                          <div className="assessment-item-top">
                            <span className="assessment-item-label">{item.label}</span>
                            <span className={`score-label-chip score-v${currentVal}`}>
                              {currentVal} · {scaleLabelOf(currentVal)}
                            </span>
                          </div>
                          <div className="score-pills" role="radiogroup" aria-label={item.label}>
                            {ASSESSMENT_SCALE.map((scale) => {
                              const selected = currentVal === scale.value;
                              return (
                                <button
                                  key={scale.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={selected}
                                  disabled={!canWrite}
                                  title={`${scale.value} — ${scale.label}`}
                                  className={cls(
                                    'score-pill',
                                    selected && `active score-v${scale.value}`,
                                  )}
                                  onClick={() =>
                                    updateForm({
                                      ...form,
                                      scores: { ...form.scores, [item.key]: scale.value },
                                    })
                                  }
                                >
                                  <strong>{scale.value}</strong>
                                  <span>{scale.label.split(' ')[0]}</span>
                                </button>
                              );
                            })}
                          </div>
                          <Input
                            className="assessment-item-note"
                            value={form.notes[item.key] || ''}
                            onChange={(event) =>
                              updateForm({
                                ...form,
                                notes: { ...form.notes, [item.key]: event.target.value },
                              })
                            }
                            placeholder={`Catatan singkat ${item.label.toLowerCase()} (opsional)…`}
                            disabled={!canWrite}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="assessment-summary">
            <div style={{ flex: 1 }}>
              <span className="small muted">Nilai rata-rata keseluruhan</span>
              <strong>{overallScore.toFixed(2)} / 5.00</strong>
              <div className="progress" style={{ marginTop: 6 }}>
                <span style={{ width: `${overallPercent}%` }} />
              </div>
            </div>
            <Badge tone={assessmentTone(overallScore)}>
              {scaleLabelOf(Math.round(overallScore))}
            </Badge>
          </div>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field label="Catatan umum" className="full">
              <Textarea
                value={form.generalNotes}
                onChange={(event) => updateForm({ ...form, generalNotes: event.target.value })}
                placeholder="Deskripsi umum penampilan, bahasa, dan penguasaan materi…"
                disabled={!canWrite}
              />
              {canWrite && (
                <div className="quick-chips">
                  {GENERAL_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="quick-chip"
                      onClick={() =>
                        updateForm({ ...form, generalNotes: appendChip(form.generalNotes, chip) })
                      }
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Rekomendasi" className="full">
              <Textarea
                value={form.recommendations}
                onChange={(event) => updateForm({ ...form, recommendations: event.target.value })}
                placeholder="Saran perbaikan untuk pemateri…"
                disabled={!canWrite}
              />
              {canWrite && (
                <div className="quick-chips">
                  {RECOMMENDATION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="quick-chip"
                      onClick={() =>
                        updateForm({
                          ...form,
                          recommendations: appendChip(form.recommendations, chip),
                        })
                      }
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </div>

          {canWrite && (
            <div className="form-actions">
              {editing && (
                <Button variant="ghost" onClick={() => resetForm(session!)} disabled={saving}>
                  Batal ubah
                </Button>
              )}
              <Button variant="primary" onClick={saveAssessment} disabled={saving}>
                {saving ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan penilaian'}
              </Button>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Ringkasan" subtitle="Penilaian tersimpan pada pertemuan ini.">
            <div className="assessment-overall">
              <strong>{assessments.length}</strong>
              <span>lembar penilaian</span>
            </div>
            <div className="list">
              {assessments.length ? (
                assessments.map((assessment) => (
                  <div className="assessment-card" key={assessment.id}>
                    <div className="assessment-card-head">
                      <div>
                        <strong>{speakerName(assessment.speakerId)}</strong>
                        <span className="small muted">
                          {assessment.observerName} ·{' '}
                          {fmtDateTime(assessment.updatedAt || assessment.createdAt)}
                        </span>
                      </div>
                      <Badge tone={assessmentTone(assessmentOverall(assessment.scores))}>
                        {assessmentOverall(assessment.scores).toFixed(2)}
                      </Badge>
                    </div>
                    <div className="assessment-mini-scores">
                      {ASSESSMENT_GROUPS.map((group) => (
                        <span key={group.key}>
                          <small>{group.label}</small>
                          <strong>{assessmentGroupAverage(assessment.scores, group).toFixed(1)}</strong>
                        </span>
                      ))}
                    </div>
                    {assessment.generalNotes && (
                      <p className="small assessment-note-text">{assessment.generalNotes}</p>
                    )}
                    {assessment.recommendations && (
                      <p className="small muted" style={{ margin: 0 }}>
                        <strong>Rekomendasi:</strong> {assessment.recommendations}
                      </p>
                    )}
                    <div className="actions">
                      {canEditAssessment(assessment) && (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(assessment)}>
                          Ubah
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyPdfId === assessment.id}
                        onClick={() => void download(assessment)}
                      >
                        {busyPdfId === assessment.id ? 'PDF…' : 'PDF'}
                      </Button>
                      {canEditAssessment(assessment) && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => void removeAssessment(assessment)}
                        >
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <Empty>Belum ada penilaian. Isi form di samping untuk menambahkan.</Empty>
              )}
            </div>
          </Card>

          <Card
            title="Pemateri sesi ini"
            subtitle={primarySpeaker ? `Sedang dinilai: ${primarySpeaker.name}` : 'Belum dipilih'}
          >
            {session!.speakers.length ? (
              <div className="list">
                {session!.speakers.map((row) => (
                  <div className="list-row" key={`${row.speakerId}-${row.role}`}>
                    <div className="main-text">
                      <strong>{speakerName(row.speakerId)}</strong>
                      <span>
                        {row.role === 'pemateri'
                          ? 'Pemateri'
                          : row.role === 'inlok'
                            ? 'Instruktur Lokal'
                            : 'Observer'}
                      </span>
                    </div>
                    <Badge tone="badge-neutral">{row.attendance}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Belum ada pemateri terjadwal pada sesi ini.</Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
