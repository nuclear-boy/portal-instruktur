import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LOCALS, localLabel, setLocals } from '../../shared/locals';
import type { LocalId, Meta, Participant, Session, TeamMember } from '../../shared/types';
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
  Stat,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { downloadMonitoringPdf } from '../lib/pdf';
import { cls, downloadFile, roleLabel, todayISO } from '../lib/utils';

export function Locals() {
  const { user, updateMeta } = useAuth();
  const { notify } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [localOptions, setLocalOptions] = useState(LOCALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [busyPdfLocalId, setBusyPdfLocalId] = useState<LocalId | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const [editingLocalId, setEditingLocalId] = useState<LocalId | null>(null);
  const [localForm, setLocalForm] = useState({ label: '', short: '' });
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);

  const scopedLocal = user?.localId || undefined;
  const canManage = user?.role === 'koordinator';
  const canAssign = canManage;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [participantResult, sessionResult, teamResult, metaResult] = await Promise.all([
        api.participants.list(),
        api.sessions.list(),
        api.team.list(),
        api.getMeta(),
      ]);
      setParticipants(participantResult.participants);
      setSessions(sessionResult.sessions);
      setTeam(teamResult.members);
      setMeta(metaResult.meta);
      setLocals(metaResult.meta.locals);
      setLocalOptions(metaResult.meta.locals || LOCALS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data lokal');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleParticipants = useMemo(
    () =>
      participants.filter(
        (participant) => filterLocal === 'all' || participant.localId === filterLocal,
      ),
    [participants, filterLocal],
  );

  const visibleLocals = scopedLocal ? [scopedLocal] : localOptions.map((item) => item.id);

  const stats = visibleLocals.map((localId) => {
    const localParticipants = participants.filter(
      (participant) => participant.localId === localId && participant.active,
    );
    const localSessions = sessions.filter((session) => session.localId === localId);
    const attendance = localSessions.flatMap((session) => session.attendance);
    const present = attendance.filter(
      (entry) => entry.status === 'hadir' || entry.status === 'terlambat',
    ).length;
    const assessments = localSessions.reduce(
      (total, session) => total + (session.assessments || []).length,
      0,
    );
    return {
      localId,
      participants: localParticipants,
      sessions: localSessions,
      attendanceRate: attendance.length ? Math.round((present / attendance.length) * 100) : 0,
      assessments,
      instructor: team.find(
        (member) => member.role === 'instruktur_lokal' && member.localId === localId,
      ),
      observer: team.find(
        (member) => member.role === 'observer' && member.localId === localId,
      ),
    };
  });

  async function assignLocal(participant: Participant, value: string) {
    setBusyId(participant.id);
    setError('');
    try {
      const localId = value ? (Number(value) as LocalId) : null;
      const result = await api.participants.update(participant.id, { localId });
      setParticipants((items) =>
        items.map((item) => (item.id === participant.id ? result.participant : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memindahkan peserta');
    } finally {
      setBusyId('');
    }
  }

  async function downloadLocal(localId: LocalId) {
    if (busyPdfLocalId !== null) return;
    setBusyPdfLocalId(localId);
    try {
      const localParticipants = participants.filter(
        (participant) => participant.localId === localId,
      );
      const localSessions = sessions.filter((session) => session.localId === localId);
      const { speakers } = await api.speakers.list();
      await downloadMonitoringPdf({
        participants: localParticipants,
        sessions: localSessions,
        speakers,
        meta,
        localId,
        title: `REKAP PERKEMBANGAN ${localLabel(localId).toUpperCase()}`,
      });
      notify(`PDF rekap ${localLabel(localId)} berhasil diunduh.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat PDF');
    } finally {
      setBusyPdfLocalId(null);
    }
  }

  async function downloadFullBackup() {
    if (backingUp) return;
    setBackingUp(true);
    setError('');
    try {
      const [metaRes, participantsRes, sessionsRes, speakersRes, teamRes] = await Promise.all([
        api.getMeta(),
        api.participants.list(),
        api.sessions.list(),
        api.speakers.list(),
        api.team.list(),
      ]);
      const snapshot = {
        exportedAt: new Date().toISOString(),
        exportedBy: user?.email || user?.name || '',
        meta: metaRes.meta,
        team: teamRes.members,
        speakers: speakersRes.speakers,
        participants: participantsRes.participants,
        sessions: sessionsRes.sessions,
      };
      downloadFile(`backup-arsip-lbt-${todayISO()}.json`, JSON.stringify(snapshot, null, 2));
      notify('Arsip penuh kegiatan (JSON) berhasil diunduh.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat backup');
    } finally {
      setBackingUp(false);
    }
  }

  function openLocalCreate() {
    setEditingLocalId(null);
    setLocalForm({ label: '', short: '' });
    setLocalModalOpen(true);
  }

  function openLocalEdit(local: { id: number; label: string; short: string }) {
    setEditingLocalId(local.id as LocalId);
    setLocalForm({ label: local.label, short: local.short });
    setLocalModalOpen(true);
  }

  async function saveLocal(event: FormEvent) {
    event.preventDefault();
    setSavingLocal(true);
    setError('');
    setMessage('');
    try {
      const result = editingLocalId
        ? await api.locals.update(editingLocalId, localForm)
        : await api.locals.create(localForm);
      setMeta(result.meta);
      updateMeta(result.meta);
      setLocalOptions(result.meta.locals || LOCALS);
      setLocalModalOpen(false);
      setMessage(editingLocalId ? 'Lokal diperbarui' : 'Lokal ditambahkan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan lokal');
    } finally {
      setSavingLocal(false);
    }
  }

  async function removeLocal(local: { id: number; label: string }) {
    if (
      !window.confirm(
        `Hapus ${local.label}? Semua peserta, pertemuan, akun Inlok/Observer di lokal ini ikut terhapus.`,
      )
    )
      return;
    setError('');
    setMessage('');
    try {
      const result = await api.locals.remove(local.id as LocalId);
      setMeta(result.meta);
      updateMeta(result.meta);
      setLocalOptions(result.meta.locals || LOCALS);
      setMessage(
        `Lokal dihapus. ${result.deleted.participants} peserta, ${result.deleted.sessions} pertemuan, ${result.deleted.users} akun ikut terhapus.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus lokal');
    }
  }

  async function saveEventMeta(event: FormEvent) {
    event.preventDefault();
    if (!meta) return;
    setSavingMeta(true);
    setError('');
    setMessage('');
    try {
      const result = await api.saveMeta({
        eventName: meta.eventName,
        startDate: meta.startDate,
        endDate: meta.endDate,
        location: meta.location,
      });
      setMeta(result.meta);
      updateMeta(result.meta);
      setMessage('Identitas kegiatan disimpan');
      notify('Identitas kegiatan berhasil diperbarui.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan identitas kegiatan');
    } finally {
      setSavingMeta(false);
    }
  }

  if (loading) {
    return (
      <div className="content">
        <Loader label="Memuat lokal dan tim…" />
      </div>
    );
  }

  const teamRoles = ['koordinator', 'instruktur_lokal', 'observer'] as const;

  return (
    <div className="content">
      <PageHeader
        title="Lokal & Tim"
        subtitle={
          scopedLocal
            ? `${localLabel(scopedLocal)} · peserta, pengajar, dan perkembangan lokal Anda`
            : `${localOptions.length} lokal, satu tim, dan penempatan peserta dalam satu tampilan`
        }
        actions={
          <>
            {canManage && (
              <Button onClick={() => void downloadFullBackup()} disabled={backingUp}>
                {backingUp ? 'Menyiapkan Backup…' : 'Backup Arsip (JSON)'}
              </Button>
            )}
            <Link to="/monitoring" className="btn btn-ghost">
              Monitoring lengkap
            </Link>
          </>
        }
      />

      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="alert-success">{message}</Alert>}

      {canManage && (
        <div className="grid grid-2">
          <Card
            title="Kelola lokal"
            subtitle="Tambah, ubah, atau hapus lokal. Penghapusan bersifat permanen."
            actions={
              <Button size="sm" variant="primary" onClick={openLocalCreate}>
                + Lokal
              </Button>
            }
          >
            {localOptions.length ? (
              <div className="table-wrap">
                <table className="data compact">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nama</th>
                      <th>Singkatan</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {localOptions.map((local) => (
                      <tr key={local.id}>
                        <td>{local.id}</td>
                        <td>{local.label}</td>
                        <td>{local.short}</td>
                        <td>
                          <div className="actions">
                            <Button size="sm" variant="ghost" onClick={() => openLocalEdit(local)}>
                              Ubah
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => void removeLocal(local)}>
                              Hapus
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Belum ada lokal.</Empty>
            )}
          </Card>

          <Card title="Identitas kegiatan" subtitle="Tampil di halaman login, sidebar, dan laporan.">
            {meta && (
              <form className="form-grid" onSubmit={saveEventMeta}>
                <Field label="Nama kegiatan" className="full">
                  <Input
                    value={meta.eventName}
                    onChange={(event) => setMeta({ ...meta, eventName: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Tanggal mulai">
                  <Input
                    type="date"
                    value={meta.startDate || ''}
                    onChange={(event) => setMeta({ ...meta, startDate: event.target.value })}
                  />
                </Field>
                <Field label="Tanggal selesai">
                  <Input
                    type="date"
                    value={meta.endDate || ''}
                    onChange={(event) => setMeta({ ...meta, endDate: event.target.value })}
                  />
                </Field>
                <Field label="Lokasi" className="full">
                  <Input
                    value={meta.location || ''}
                    onChange={(event) => setMeta({ ...meta, location: event.target.value })}
                  />
                </Field>
                <div className="full form-actions">
                  <Button type="submit" variant="primary" disabled={savingMeta}>
                    {savingMeta ? 'Menyimpan…' : 'Simpan identitas'}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      )}

      <div className={cls('local-grid', visibleLocals.length === 1 && 'local-grid-single')}>
        {stats.map((local) => (
          <section className="local-card" key={local.localId}>
            <div className="local-card-head">
              <div>
                <span className="eyebrow">Lokal</span>
                <h2>{localLabel(local.localId)}</h2>
              </div>
              <Badge tone="badge-blue">{local.participants.length} peserta</Badge>
            </div>
            <div className="local-team">
              <div>
                <small>Instruktur lokal</small>
                <strong>{local.instructor?.name || 'Belum ditetapkan'}</strong>
              </div>
              <div>
                <small>Observer</small>
                <strong>{local.observer?.name || 'Belum ditetapkan'}</strong>
              </div>
            </div>
            <div className="local-metrics">
              <div>
                <strong>{local.sessions.length}</strong>
                <span>pertemuan</span>
              </div>
              <div>
                <strong>{local.assessments}</strong>
                <span>penilaian</span>
              </div>
              <div>
                <strong>{local.attendanceRate}%</strong>
                <span>kehadiran</span>
              </div>
            </div>
            <div className="progress" aria-label={`Kehadiran ${local.attendanceRate}%`}>
              <span style={{ width: `${local.attendanceRate}%` }} />
            </div>
            <div className="local-card-foot">
              <Link to="/pertemuan" className="btn btn-ghost btn-sm">
                Pertemuan
              </Link>
              <Button
                size="sm"
                variant="primary"
                disabled={busyPdfLocalId === local.localId}
                onClick={() => void downloadLocal(local.localId)}
              >
                {busyPdfLocalId === local.localId ? 'Membuat PDF…' : 'Unduh PDF'}
              </Button>
            </div>
          </section>
        ))}
      </div>

      <div className="grid grid-2">
        <Card
          title="Roster tim"
          subtitle="Koordinator, instruktur lokal, dan observer."
        >
          {team.length ? (
            <div className="team-list">
              {teamRoles.map((role) => {
                const members = team.filter((member) => member.role === role);
                if (!members.length) return null;
                return (
                  <div className="team-group" key={role}>
                    <span className="team-role">{roleLabel(role)}</span>
                    {members.map((member) => (
                      <div className="team-row" key={member.id}>
                        <div className="avatar avatar-sm">{member.name.slice(0, 1)}</div>
                        <div className="main-text">
                          <strong>{member.name}</strong>
                          <span>
                            {member.position || roleLabel(member.role)}
                            {member.localId ? ` · ${localLabel(member.localId)}` : ''}
                          </span>
                        </div>
                        {member.localId && (
                          <Badge tone="badge-blue">{localLabel(member.localId)}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>Belum ada data tim.</Empty>
          )}
        </Card>

        <Card
          title={canAssign ? 'Penempatan peserta' : 'Peserta lokal'}
          subtitle={
            canAssign
              ? 'Pindahkan peserta ke lokal yang tepat. Perubahan langsung tersimpan.'
              : 'Peserta yang terdaftar pada lokal Anda.'
          }
        >
          {!scopedLocal && canAssign && (
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <Select
                value={filterLocal}
                onChange={(event) =>
                  setFilterLocal(
                    event.target.value === 'all' ? 'all' : (Number(event.target.value) as LocalId),
                  )
                }
                aria-label="Filter lokal"
              >
                <option value="all">Semua lokal</option>
                            {localOptions.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.label}
                  </option>
                ))}
              </Select>
              <span className="small muted">{visibleParticipants.length} peserta</span>
            </div>
          )}
          {visibleParticipants.length ? (
            <div className="table-wrap">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>Peserta</th>
                    <th>Asal</th>
                    <th>Lokal</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleParticipants.map((participant) => (
                    <tr key={participant.id}>
                      <td>
                        <Link to={`/peserta/${participant.id}`}>{participant.name}</Link>
                      </td>
                      <td>{participant.origin || '—'}</td>
                      <td>
                        {canAssign ? (
                          <Select
                            value={participant.localId || ''}
                            onChange={(event) => void assignLocal(participant, event.target.value)}
                            disabled={busyId === participant.id}
                            aria-label={`Lokal ${participant.name}`}
                          >
                            <option value="">Belum ditempatkan</option>
                {localOptions.map((local) => (
                              <option key={local.id} value={local.id}>
                                {local.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Badge tone={participant.localId ? 'badge-blue' : 'badge-neutral'}>
                            {localLabel(participant.localId)}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Belum ada peserta yang ditempatkan di lokal ini.</Empty>
          )}
        </Card>
      </div>

      {!scopedLocal && (
        <Card>
          <div className="local-kpis">
            <Stat label="Total peserta" value={participants.length} hint="Semua lokal" />
            <Stat label="Total pertemuan" value={sessions.length} hint="Sosiogram tersimpan" />
            <Stat
              label="Penilaian pemateri"
              value={sessions.reduce((total, session) => total + (session.assessments || []).length, 0)}
              hint="Dari seluruh observer"
            />
            <Stat label="Anggota tim" value={team.length} hint="Aktif" />
          </div>
        </Card>
      )}

      <Modal
        open={localModalOpen}
        title={editingLocalId ? 'Ubah lokal' : 'Tambah lokal'}
        onClose={() => setLocalModalOpen(false)}
        footer={
          <>
            <Button onClick={() => setLocalModalOpen(false)}>Batal</Button>
            <Button type="submit" form="local-form" variant="primary" disabled={savingLocal}>
              {savingLocal ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
        <form id="local-form" className="form-grid" onSubmit={saveLocal}>
          <Field label="Nama lokal" className="full">
            <Input
              value={localForm.label}
              onChange={(event) => setLocalForm({ ...localForm, label: event.target.value })}
              placeholder="Contoh: Lokal 6"
              required
            />
          </Field>
          <Field label="Singkatan" className="full">
            <Input
              value={localForm.short}
              onChange={(event) => setLocalForm({ ...localForm, short: event.target.value })}
              placeholder="Contoh: L6"
              required
            />
          </Field>
          {!editingLocalId && (
            <p className="small muted full">
              Lokal baru akan tersedia untuk penempatan peserta, jadwal, dan akun tim.
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}
