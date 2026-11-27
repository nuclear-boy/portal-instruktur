import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Participant, Session, Speaker } from '../../shared/types';
import { localLabel } from '../../shared/locals';
import { Alert, Badge, Button, Card, Empty, Field, Input, Loader, PageHeader, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { computeCommunicationInsights } from '../lib/communicationInsights';
import { downloadParticipantReportPdf } from '../lib/pdf';
import { RELI_META } from '../lib/reli';
import { getParticipantSessionNote } from '../lib/reportData';
import { attendanceLabel, attendanceTone, fmtDate, totalScore } from '../lib/utils';

export function ParticipantDetail() {
  const { id = '' } = useParams();
  const { user, meta } = useAuth();
  const { notify } = useToast();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPdf, setBusyPdf] = useState(false);
  const [error, setError] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [participantResult, sessionResult, speakerResult] = await Promise.all([
          api.participants.list(),
          api.sessions.list(),
          api.speakers.list(),
        ]);
        if (cancelled) return;
        setParticipant(participantResult.participants.find((item) => item.id === id) || null);
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
  }, [id]);

  const rows = useMemo(
    () =>
      sessions
        .filter(
          (session) =>
            (session.scores[id] || session.attendance.some((item) => item.participantId === id)) &&
            (!dateStart || session.date >= dateStart) &&
            (!dateEnd || session.date <= dateEnd),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [sessions, id, dateStart, dateEnd],
  );

  const columnChartData = useMemo(() => {
    return rows.map((session, index) => {
      const score = session.scores[id];
      return {
        sessionLabel: `Sesi ${session.no || index + 1}`,
        dateLabel: fmtDate(session.date, { day: 'numeric', month: 'short' }),
        topic: session.topic,
        R: score?.r || 0,
        E: score?.e || 0,
        L: score?.l || 0,
        I: score?.i || 0,
        Total: totalScore(score),
      };
    });
  }, [rows, id]);

  const attendanceCounts = rows.reduce(
    (acc, session) => {
      const entry = session.attendance.find((item) => item.participantId === id);
      if (entry) acc[entry.status] = (acc[entry.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const total = rows.reduce((sum, session) => sum + totalScore(session.scores[id]), 0);

  // Compute communication insights for this participant
  const participantInsight = useMemo(() => {
    if (!participant) return null;
    const { participantInsights } = computeCommunicationInsights(sessions, [participant], speakers);
    return participantInsights[0] || null;
  }, [participant, sessions, speakers]);

  // Observer notes per session
  const observerNotes = useMemo(() => {
    return rows
      .map((session) => ({
        session,
        note: getParticipantSessionNote(session, id, participant?.name),
      }))
      .filter((item) => item.note);
  }, [rows, id, participant?.name]);

  async function downloadRapor() {
    if (!participant || busyPdf) return;
    setBusyPdf(true);
    try {
      const scopedSessions = sessions.filter(
        (s) => (!dateStart || s.date >= dateStart) && (!dateEnd || s.date <= dateEnd),
      );
      const dateRangeLabel =
        dateStart && dateEnd
          ? `${fmtDate(dateStart)} – ${fmtDate(dateEnd)}`
          : dateStart
            ? `Mulai ${fmtDate(dateStart)}`
            : dateEnd
              ? `Sampai ${fmtDate(dateEnd)}`
              : undefined;
      await downloadParticipantReportPdf({
        participant,
        sessions: scopedSessions,
        speakers,
        meta,
        dateRangeLabel,
      });
      notify(`Rapor PDF ${participant.name} berhasil diunduh.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat PDF rapor';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusyPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="content">
        <Loader />
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="content">
        <Alert>{error || 'Peserta tidak ditemukan.'}</Alert>
        <Link to="/peserta">Kembali ke daftar peserta</Link>
      </div>
    );
  }

  return (
    <div className="content">
      <PageHeader
        title={participant.name}
        subtitle={[localLabel(participant.localId), participant.gender, participant.origin, participant.phone].filter(Boolean).join(' · ') || 'Detail peserta'}
        actions={
          <div className="page-actions">
            <Button variant="primary" onClick={() => void downloadRapor()} disabled={busyPdf}>
              {busyPdf ? 'Membuat Rapor…' : 'Unduh Rapor PDF'}
            </Button>
            <Link to="/monitoring" className="btn btn-subtle">
              Buka di Monitoring
            </Link>
            <Link to={user?.role === 'instruktur_lokal' ? '/monitoring' : '/peserta'} className="btn btn-ghost">
              Kembali
            </Link>
          </div>
        }
      />

      {error && <Alert>{error}</Alert>}

      <div className="kpi-grid">
        <Stat label="Pertemuan tercatat" value={rows.length} />
        <Stat label="Total nilai RELI" value={total.toFixed(1)} />
        <Stat
          label="Interaksi Komunikasi"
          value={participantInsight?.totalInteractions || 0}
          hint={`${participantInsight?.toSpeakerInteractions || 0} ke pemateri`}
        />
        <Stat label="Kehadiran Hadir" value={attendanceCounts.hadir || 0} hint="Tepat waktu" />
        <Stat label="Terlambat" value={attendanceCounts.terlambat || 0} />
        <Stat label="Izin/Sakit" value={(attendanceCounts.izin || 0) + (attendanceCounts.sakit || 0)} />
      </div>

      <Card title="Filter tanggal perkembangan" subtitle="Lihat perkembangan peserta hari demi hari.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}>
          <Field label="Dari tanggal">
            <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </Field>
          <Field label="Sampai tanggal">
            <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </Field>
          <Button variant="ghost" onClick={() => { setDateStart(''); setDateEnd(''); }}>
            Semua tanggal
          </Button>
        </div>
      </Card>

      {/* Grafik Perkembangan Pribadi dari Bawah ke Atas (Point 5) */}
      <Card
        title="Grafik Perkembangan RELI per Pertemuan"
        subtitle="Grafik kolom vertikal (dari bawah ke atas) menunjukkan perkembangan 4 aspek RELI di tiap sesi."
      >
        {columnChartData.length ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={columnChartData} margin={{ top: 20, right: 16, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false} />
                <XAxis dataKey="sessionLabel" tick={{ fontSize: 11, fontWeight: 600 }} />
                <YAxis domain={[0, 'dataMax + 4']} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--sf)',
                    border: '1px solid var(--bd)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelFormatter={(label: string, payload) => {
                    const item = payload?.[0]?.payload;
                    return `${label} · ${item?.topic || ''} (${item?.dateLabel || ''})`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="R" name="Respon" fill={RELI_META[0].color} stackId="a" />
                <Bar dataKey="E" name="Emosi" fill={RELI_META[1].color} stackId="a" />
                <Bar dataKey="L" name="Logika" fill={RELI_META[2].color} stackId="a" />
                <Bar dataKey="I" name="Integritas" fill={RELI_META[3].color} stackId="a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty>Belum ada nilai untuk peserta ini.</Empty>
        )}
      </Card>

      <div className="grid grid-2">
        {/* Catatan untuk Peserta dari Observer (Point 3) */}
        <Card
          title="Catatan Perkembangan dari Observer"
          subtitle="Catatan langsung oleh observer selama sesi pengamatan sosiogram."
        >
          {observerNotes.length ? (
            <div className="timeline-list">
              {observerNotes.map(({ session, note }) => (
                <div key={session.id} className="timeline-item">
                  <div className="timeline-badge">
                    <Badge tone="badge-blue">{fmtDate(session.date, { day: 'numeric', month: 'short' })}</Badge>
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-topic">{session.topic}</div>
                    <div className="timeline-note">{note}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Belum ada catatan khusus observer untuk peserta ini.</Empty>
          )}
        </Card>

        {/* Insight Frekuensi Komunikasi & Rekomendasi Potensi (Point 6) */}
        <Card
          title="Insight Komunikasi & Potensi Peserta"
          subtitle="Analisis keaktifan komunikasi berdasarkan materi dan pemateri."
        >
          {participantInsight ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="insight-recommendation">
                <strong>Gaya Komunikasi:</strong> {participantInsight.styleLabel}
                <p style={{ marginTop: '4px', fontSize: '12px' }}>{participantInsight.styleDescription}</p>
              </div>

              <div className="insight-metrics">
                <div className="insight-metric-tag">
                  <small>Materi Teraktif</small>
                  <strong>{participantInsight.topTopic?.topic || 'Belum terpetakan'}</strong>
                </div>
                <div className="insight-metric-tag">
                  <small>Frekuensi Interaksi</small>
                  <strong>{participantInsight.topTopic?.count || 0} kali</strong>
                </div>
                <div className="insight-metric-tag">
                  <small>Pemateri Favorit</small>
                  <strong>{participantInsight.topSpeaker?.speakerName || '—'}</strong>
                </div>
              </div>

              <div style={{ padding: '12px', background: 'var(--sf-2)', borderRadius: '10px', border: '1px solid var(--bd)' }}>
                <strong>💡 Rekomendasi Pengembangan Potensi:</strong>
                <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--tx)' }}>
                  {participantInsight.potentialRecommendation}
                </p>
              </div>
            </div>
          ) : (
            <Empty>Belum ada data komunikasi.</Empty>
          )}
        </Card>
      </div>

      <Card title="Riwayat Pertemuan">
        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Materi</th>
                  <th>Kehadiran</th>
                  <th className="num">R</th>
                  <th className="num">E</th>
                  <th className="num">L</th>
                  <th className="num">I</th>
                  <th className="num">Total</th>
                  <th>Catatan Observer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((session) => {
                  const entry = session.attendance.find((item) => item.participantId === id);
                  const score = session.scores[id];
                  const note = getParticipantSessionNote(session, id, participant.name);
                  return (
                    <tr key={session.id}>
                      <td className="nowrap">
                        <Link to={`/pertemuan/${session.id}`}>{fmtDate(session.date)}</Link>
                      </td>
                      <td>{session.topic}</td>
                      <td>
                        {entry ? (
                          <Badge tone={attendanceTone(entry.status)}>{attendanceLabel(entry.status)}</Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num">{score ? score.r.toFixed(1) : '—'}</td>
                      <td className="num">{score ? score.e.toFixed(1) : '—'}</td>
                      <td className="num">{score ? score.l.toFixed(1) : '—'}</td>
                      <td className="num">{score ? score.i.toFixed(1) : '—'}</td>
                      <td className="num">
                        <strong>{score ? totalScore(score).toFixed(1) : '—'}</strong>
                      </td>
                      <td style={{ fontSize: '12px', color: note ? 'var(--tx)' : 'var(--mu)' }}>
                        {note || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada riwayat pertemuan.</Empty>
        )}
      </Card>

      {participant.notes && (
        <Card title="Catatan Tambahan Peserta">
          <p style={{ whiteSpace: 'pre-wrap' }}>{participant.notes}</p>
        </Card>
      )}
    </div>
  );
}
