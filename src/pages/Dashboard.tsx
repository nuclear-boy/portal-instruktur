import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOCALS, localLabel } from '../../shared/locals';
import type { Meta, Participant, PublicUser, Session, Speaker } from '../../shared/types';
import { Alert, Badge, Card, Empty, Loader, PageHeader, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime, roleLabel, todayISO } from '../lib/utils';

function OperationalDashboard() {
  const { user } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [metaResult, participantResult, sessionResult, speakerResult] = await Promise.all([
          api.getMeta(),
          api.participants.list(),
          api.sessions.list(),
          api.speakers.list(),
        ]);
        if (cancelled) return;
        setMeta(metaResult.meta);
        setParticipants(participantResult.participants);
        setSessions(sessionResult.sessions);
        setSpeakers(speakerResult.speakers);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayISO();
  const todaySessions = sessions.filter((session) => session.date === today);
  const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const attendanceEntries = sessions.flatMap((session) => session.attendance);
  const present = attendanceEntries.filter((item) => item.status === 'hadir' || item.status === 'terlambat').length;
  const attendanceRate = attendanceEntries.length ? Math.round((present / attendanceEntries.length) * 100) : 0;
  const assessmentCount = sessions.reduce(
    (total, session) => total + (session.assessments || []).length,
    0,
  );
  const scopedLocal = user?.localId || undefined;
  const localStats = useMemo(
    () =>
      LOCALS.filter((local) => !scopedLocal || local.id === scopedLocal).map((local) => {
        const localParticipants = participants.filter(
          (participant) => participant.localId === local.id && participant.active,
        );
        const localSessions = sessions.filter((session) => session.localId === local.id);
        const entries = localSessions.flatMap((session) => session.attendance);
        const hadir = entries.filter(
          (entry) => entry.status === 'hadir' || entry.status === 'terlambat',
        ).length;
        return {
          ...local,
          participants: localParticipants.length,
          sessions: localSessions.length,
          assessments: localSessions.reduce(
            (total, session) => total + (session.assessments || []).length,
            0,
          ),
          attendanceRate: entries.length ? Math.round((hadir / entries.length) * 100) : 0,
        };
      }),
    [participants, sessions, scopedLocal],
  );

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
        title={user ? `Selamat datang, ${user.name.split(' ')[0]}` : 'Dashboard'}
        subtitle={meta ? `${meta.eventName}${meta.location ? ` · ${meta.location}` : ''}` : 'Ringkasan kegiatan'}
      />

      {error && <Alert>{error}</Alert>}

      <div className="role-banner">
        <div>
          <Badge tone="badge-blue">{roleLabel(user?.role)}</Badge>
          {scopedLocal && <Badge tone="badge-neutral">{localLabel(scopedLocal)}</Badge>}
          <strong>
            {user?.role === 'observer'
              ? 'Fokus Anda: mengamati sosiogram, mencatat absensi, dan menilai pemateri.'
              : user?.role === 'instruktur_lokal'
                ? 'Fokus Anda: memantau perkembangan peserta dan menerima laporan observer lokal.'
                : 'Anda melihat seluruh lokal dan dapat mengelola tim, jadwal, peserta, serta penempatan.'}
          </strong>
        </div>
        <div className="role-banner-actions">
          {user?.role === 'instruktur_lokal' ? (
            <>
              <Link to="/monitoring" className="btn btn-primary btn-sm">
                Monitoring
              </Link>
              <Link to="/monitoring-pemateri" className="btn btn-ghost btn-sm">
                Monitoring Pemateri
              </Link>
              <Link to="/laporan" className="btn btn-ghost btn-sm">
                Laporan
              </Link>
              <Link to="/pertemuan" className="btn btn-ghost btn-sm">
                Pertemuan
              </Link>
            </>
          ) : (
            <>
              <Link
                to={user?.role === 'observer' ? '/penilaian' : '/monitoring-pemateri'}
                className="btn btn-primary btn-sm"
              >
                {user?.role === 'observer' ? 'Isi penilaian' : 'Monitoring Pemateri'}
              </Link>
              <Link to="/lokal" className="btn btn-ghost btn-sm">
                Lihat lokal
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <Stat label="Peserta" value={participants.length} hint={`${participants.filter((p) => p.active).length} aktif`} />
        <Stat label="Pertemuan" value={sessions.length} hint={todaySessions.length ? `${todaySessions.length} hari ini` : 'Belum ada hari ini'} />
        <Stat label="Penilaian pemateri" value={assessmentCount} hint="Lembar observer" />
        <Stat label="Kehadiran peserta" value={`${attendanceRate}%`} hint={`${attendanceEntries.length} catatan`} />
      </div>

      <Card
        title={scopedLocal ? `Perkembangan ${localLabel(scopedLocal)}` : 'Perkembangan seluruh lokal'}
        subtitle="Ringkasan peserta, pertemuan, penilaian, dan kehadiran."
        actions={
          <Link to="/monitoring" className="btn btn-ghost btn-sm">
            Monitoring
          </Link>
        }
      >
        <div className="local-mini-grid">
          {localStats.map((local) => (
            <div className="local-mini" key={local.id}>
              <div className="local-mini-head">
                <strong>{local.label}</strong>
                <Badge tone="badge-neutral">{local.participants} peserta</Badge>
              </div>
              <div className="local-mini-values">
                <span>
                  <strong>{local.sessions}</strong> pertemuan
                </span>
                <span>
                  <strong>{local.assessments}</strong> penilaian
                </span>
                <span>
                  <strong>{local.attendanceRate}%</strong> hadir
                </span>
              </div>
              <div className="progress">
                <span style={{ width: `${local.attendanceRate}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Jadwal hari ini"
        subtitle={fmtDate(today, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      >
        {todaySessions.length ? (
          <div className="list">
            {todaySessions.map((session) => (
              <Link key={session.id} to={`/pertemuan/${session.id}`} className="list-row">
                <div className="main-text">
                  <strong>{session.topic}</strong>
                  <span>
                    Sesi {session.no || '-'} {session.location ? `· ${session.location}` : ''}
                  </span>
                </div>
                <span className="badge badge-green">Buka</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">Tidak ada pertemuan terjadwal hari ini.</div>
        )}
      </Card>

      <Card
        title="Pertemuan terbaru"
        actions={
          <Link to="/pertemuan" className="btn btn-ghost btn-sm">
            Lihat semua
          </Link>
        }
      >
        {recentSessions.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Materi</th>
                  <th>Lokal</th>
                  <th>Pemateri</th>
                  <th>Kehadiran</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((session) => {
                  const speakerNames = session.speakers
                    .filter((item) => item.role === 'pemateri')
                    .map((item) => speakers.find((speaker) => speaker.id === item.speakerId)?.name)
                    .filter(Boolean)
                    .join(', ');
                  const presentCount = session.attendance.filter(
                    (item) => item.status === 'hadir' || item.status === 'terlambat',
                  ).length;
                  return (
                    <tr key={session.id}>
                      <td>{session.no || '—'}</td>
                      <td className="nowrap">{fmtDate(session.date)}</td>
                      <td>{session.topic}</td>
                      <td>
                        <Badge tone="badge-blue">{localLabel(session.localId)}</Badge>
                      </td>
                      <td>{speakerNames || '—'}</td>
                      <td>
                        {presentCount}/{session.attendance.length || '—'}
                      </td>
                      <td className="right">
                        <Link to={`/pertemuan/${session.id}`} className="btn btn-ghost btn-sm">
                          Buka
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Belum ada pertemuan. Tambahkan pertemuan pertama di menu Pertemuan.</div>
        )}
      </Card>
    </div>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [metaResult, userResult] = await Promise.all([api.getMeta(), api.users.list()]);
        if (cancelled) return;
        setMeta(metaResult.meta);
        setUsers(userResult.users);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="content">
        <Loader />
      </div>
    );
  }

  const koordinators = users.filter((item) => item.role === 'koordinator');
  const localAccounts = users.filter(
    (item) => item.role === 'instruktur_lokal' || item.role === 'observer',
  );
  const activeAccounts = users.filter((item) => item.active);
  const recentLogins = [...users]
    .filter((item) => item.lastLoginAt)
    .sort((a, b) => String(b.lastLoginAt).localeCompare(String(a.lastLoginAt)))
    .slice(0, 8);

  return (
    <div className="content">
      <PageHeader
        title={user ? `Selamat datang, ${user.name.split(' ')[0]}` : 'Dashboard Admin'}
        subtitle={
          meta
            ? `${meta.eventName} · administrasi akun`
            : 'Administrasi akun Portal Instruktur'
        }
      />

      {error && <Alert>{error}</Alert>}

      <div className="role-banner">
        <div>
          <Badge tone="badge-amber">{roleLabel(user?.role)}</Badge>
          <strong>Admin mengelola akun Koordinator Tim dan memantau status login seluruh akun.</strong>
        </div>
        <div className="role-banner-actions">
          <Link to="/admin" className="btn btn-primary btn-sm">
            Kelola akun
          </Link>
          <Link to="/profil" className="btn btn-ghost btn-sm">
            Profil
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <Stat label="Total akun" value={users.length} hint={`${activeAccounts.length} aktif`} />
        <Stat label="Koordinator Tim" value={koordinators.length} hint="Dikelola admin" />
        <Stat label="Akun lokal" value={localAccounts.length} hint="Inlok & Observer" />
        <Stat
          label="Pernah login"
          value={users.filter((item) => item.lastLoginAt).length}
          hint="Berdasarkan login terakhir"
        />
      </div>

      <Card
        title="Aktivitas login terakhir"
        subtitle="Admin hanya melihat status login, bukan data operasional."
        actions={
          <Link to="/admin" className="btn btn-ghost btn-sm">
            Buka kelola akun
          </Link>
        }
      >
        {recentLogins.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Peran</th>
                  <th>Lokal</th>
                  <th>Login terakhir</th>
                </tr>
              </thead>
              <tbody>
                {recentLogins.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{roleLabel(item.role)}</td>
                    <td>{item.localId ? localLabel(item.localId) : 'Global'}</td>
                    <td className="nowrap">{fmtDateTime(item.lastLoginAt || undefined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada aktivitas login.</Empty>
        )}
      </Card>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminDashboard /> : <OperationalDashboard />;
}
