import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ASSESSMENT_GROUPS, ASSESSMENT_ITEMS, assessmentTone } from '../../shared/assessment';
import { LOCALS, localLabel, setLocals } from '../../shared/locals';
import type { LocalId, Meta, Participant, Session, Speaker } from '../../shared/types';
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
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { buildAssessmentsCsv } from '../lib/csv';
import { downloadAssessmentPdf, downloadSpeakerAssessmentsSummaryPdf } from '../lib/pdf';
import { computeSpeakerMonitoring } from '../lib/speakerAnalytics';
import { downloadFile, fmtDate } from '../lib/utils';

type TabKey = 'overview' | 'speaker' | 'coverage';

const GROUP_COLOR_MAP: Record<string, string> = {
  penampilan: '#2f6f62',
  bahasa: '#4a6fa5',
  materi: '#800020',
};

export function SpeakerMonitoring() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [localOptions, setLocalOptions] = useState(LOCALS);
  const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyPdf, setBusyPdf] = useState(false);
  const [busyItemPdfId, setBusyItemPdfId] = useState('');
  const [error, setError] = useState('');

  const scopedLocal = user?.localId || undefined;
  const effectiveLocalId: LocalId | null =
    scopedLocal ?? (filterLocal === 'all' ? null : filterLocal);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, participantRes, speakerRes, metaRes] = await Promise.all([
        api.sessions.list(),
        api.participants.list(),
        api.speakers.list(),
        api.getMeta(),
      ]);
      setSessions(sessionRes.sessions);
      setParticipants(participantRes.participants);
      setSpeakers(speakerRes.speakers);
      setMeta(metaRes.meta);
      setLocals(metaRes.meta.locals);
      setLocalOptions(metaRes.meta.locals || [...LOCALS]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data monitoring pemateri');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const viewSessions = useMemo(
    () =>
      sessions
        .filter((s) => effectiveLocalId === null || s.localId === effectiveLocalId)
        .filter((s) => (!dateStart || s.date >= dateStart) && (!dateEnd || s.date <= dateEnd)),
    [sessions, effectiveLocalId, dateStart, dateEnd],
  );

  const viewParticipants = useMemo(
    () =>
      participants.filter((p) => effectiveLocalId === null || p.localId === effectiveLocalId),
    [participants, effectiveLocalId],
  );

  const dateRangeLabel = useMemo(() => {
    if (dateStart && dateEnd) return `${fmtDate(dateStart)} – ${fmtDate(dateEnd)}`;
    if (dateStart) return `Mulai ${fmtDate(dateStart)}`;
    if (dateEnd) return `Sampai ${fmtDate(dateEnd)}`;
    return '';
  }, [dateStart, dateEnd]);

  const data = useMemo(
    () => computeSpeakerMonitoring(viewSessions, speakers),
    [viewSessions, speakers],
  );

  useEffect(() => {
    if (!data.speakerRows.length) {
      setSelectedSpeakerId('');
    } else if (!data.speakerRows.some((row) => row.speakerId === selectedSpeakerId)) {
      setSelectedSpeakerId(data.speakerRows[0].speakerId);
    }
  }, [data.speakerRows, selectedSpeakerId]);

  const selectedSpeaker = useMemo(
    () => data.speakerRows.find((row) => row.speakerId === selectedSpeakerId) || null,
    [data.speakerRows, selectedSpeakerId],
  );

  const selectedSpeakerAspects = useMemo(() => {
    if (!selectedSpeaker) return [];
    return ASSESSMENT_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        name: item.label,
        nilai: Number((selectedSpeaker.itemAverages[item.key] || 0).toFixed(2)),
        group: group.label,
        color: GROUP_COLOR_MAP[group.key] || '#1d4ed8',
      })),
    );
  }, [selectedSpeaker]);

  const selectedSpeakerTrend = useMemo(() => {
    if (!selectedSpeaker) return [];
    return [...selectedSpeaker.evaluations]
      .sort((a, b) => a.assessment.date.localeCompare(b.assessment.date))
      .map((item, idx) => ({
        label: `S${item.session.no || idx + 1}`,
        detail: `${fmtDate(item.assessment.date)} · ${item.session.topic} (${localLabel(item.session.localId)})`,
        nilai: Number(item.overall.toFixed(2)),
        penampilan: Number((item.groupAverages.penampilan || 0).toFixed(2)),
        bahasa: Number((item.groupAverages.bahasa || 0).toFixed(2)),
        materi: Number((item.groupAverages.materi || 0).toFixed(2)),
      }));
  }, [selectedSpeaker]);

  const filteredEvaluations = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    if (!q) return data.allEvaluations;
    return data.allEvaluations.filter(
      (item) =>
        item.speakerName.toLowerCase().includes(q) ||
        item.session.topic.toLowerCase().includes(q) ||
        item.assessment.observerName.toLowerCase().includes(q) ||
        item.assessment.generalNotes.toLowerCase().includes(q) ||
        item.assessment.recommendations.toLowerCase().includes(q) ||
        localLabel(item.localId).toLowerCase().includes(q),
    );
  }, [data.allEvaluations, archiveSearch]);

  async function handleDownloadSummaryPdf() {
    if (busyPdf) return;
    setBusyPdf(true);
    try {
      await downloadSpeakerAssessmentsSummaryPdf({
        sessions: viewSessions,
        participants: viewParticipants,
        speakers,
        meta,
        localId: effectiveLocalId,
        dateRangeLabel: dateRangeLabel || undefined,
      });
      notify('PDF rekap monitoring pemateri berhasil diunduh.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat PDF';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusyPdf(false);
    }
  }

  function handleDownloadCsv() {
    const csv = buildAssessmentsCsv(viewSessions, viewParticipants, speakers);
    downloadFile(
      `monitoring-pemateri-${effectiveLocalId ? `lokal-${effectiveLocalId}` : 'semua-lokal'}.csv`,
      csv,
      'text/csv;charset=utf-8',
    );
    notify('File CSV monitoring pemateri berhasil diunduh.');
  }

  async function handleDownloadSinglePdf(item: (typeof data.allEvaluations)[number]) {
    if (busyItemPdfId) return;
    setBusyItemPdfId(item.assessment.id);
    try {
      await downloadAssessmentPdf({
        session: item.session,
        assessment: item.assessment,
        speaker: speakers.find((s) => s.id === item.assessment.speakerId),
        meta,
      });
      notify('PDF lembar penilaian berhasil diunduh.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat PDF';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusyItemPdfId('');
    }
  }

  if (loading) {
    return (
      <div className="content">
        <Loader label="Memuat monitoring pemateri…" />
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="content">
      <PageHeader
        title="Monitoring Pemateri"
        subtitle={
          scopedLocal
            ? `${localLabel(scopedLocal)} · Evaluasi kualitas pemateri, 12 sub-aspek, dan cakupan penilaian observer.`
            : 'Evaluasi kinerja seluruh pemateri lintas lokal, perbandingan 12 aspek, dan pelacakan penilaian observer.'
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void load()}>
              Muat ulang
            </Button>
            <Button onClick={handleDownloadCsv} disabled={!data.allEvaluations.length}>
              CSV Pemateri
            </Button>
            <Button
              variant="primary"
              disabled={busyPdf || !viewSessions.length}
              onClick={() => void handleDownloadSummaryPdf()}
            >
              {busyPdf ? 'Membuat PDF…' : 'Unduh PDF Rekap'}
            </Button>
          </>
        }
      />

      {error && <Alert>{error}</Alert>}

      {/* Filter Lokal & Tanggal */}
      <Card>
        {!scopedLocal && (
          <div className="toolbar" style={{ marginBottom: 12 }}>
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
            <span className="small muted">
              {viewSessions.length} pertemuan · {kpis.totalAssessments} lembar penilaian
            </span>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <Field label="Dari tanggal">
            <Input
              type="date"
              value={dateStart}
              onChange={(event) => setDateStart(event.target.value)}
            />
          </Field>
          <Field label="Sampai tanggal">
            <Input
              type="date"
              value={dateEnd}
              onChange={(event) => setDateEnd(event.target.value)}
            />
          </Field>
          {(dateStart || dateEnd) && (
            <Button
              variant="ghost"
              onClick={() => {
                setDateStart('');
                setDateEnd('');
              }}
            >
              Semua tanggal
            </Button>
          )}
        </div>
      </Card>

      {/* KPI Eksekutif Pemateri */}
      <div className="kpi-grid">
        <Stat
          label="Rata-rata Nilai"
          value={kpis.totalAssessments ? kpis.overallAvg.toFixed(2) : '—'}
          hint="Skala 1.00 – 5.00"
        />
        <Stat
          label="Cakupan Penilaian"
          value={`${kpis.coverageRate}%`}
          hint={`${kpis.assessedSessionsCount}/${kpis.totalSessionsCount} sesi dinilai`}
        />
        <Stat
          label="Pemateri Dinilai"
          value={`${kpis.assessedSpeakersCount}/${kpis.totalSpeakersCount}`}
          hint={`${kpis.totalAssessments} lembar observer`}
        />
        <Stat
          label="Aspek Terkuat"
          value={kpis.strongestAspect ? kpis.strongestAspect.average.toFixed(2) : '—'}
          hint={kpis.strongestAspect?.label || 'Belum ada penilaian'}
        />
        <Stat
          label="Perlu Peningkatan"
          value={kpis.weakestAspect ? kpis.weakestAspect.average.toFixed(2) : '—'}
          hint={kpis.weakestAspect?.label || 'Belum ada penilaian'}
        />
      </div>

      {/* Tabs */}
      <div className="monitoring-tabs" role="tablist" aria-label="Tab monitoring pemateri">
        <button
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={activeTab === 'overview' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'}
          onClick={() => setActiveTab('overview')}
        >
          Ringkasan &amp; Peringkat
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'speaker'}
          className={activeTab === 'speaker' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'}
          onClick={() => setActiveTab('speaker')}
        >
          Profil &amp; Evaluasi Pemateri
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'coverage'}
          className={activeTab === 'coverage' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'}
          onClick={() => setActiveTab('coverage')}
        >
          Cakupan &amp; Arsip ({data.unassessedSessions.length} belum dinilai)
        </button>
      </div>

      {/* TAB 1: RINGKASAN & PERINGKAT */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="grid grid-2">
            <Card
              title="Perbandingan 3 Kelompok Aspek"
              subtitle="Rata-rata Penampilan, Bahasa, dan Materi (skala 0–5)."
            >
              {kpis.totalAssessments ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height={270}>
                    <BarChart
                      data={data.groupStats}
                      margin={{ top: 16, right: 16, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val: number) => [`${val} / 5.00`, 'Rata-rata']} />
                      <Bar dataKey="average" radius={[6, 6, 0, 0]}>
                        {data.groupStats.map((item) => (
                          <Cell key={item.key} fill={item.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty>Belum ada data penilaian pemateri pada filter ini.</Empty>
              )}
            </Card>

            <Card
              title="Analisis 12 Sub-Aspek (Terendah → Tertinggi)"
              subtitle="Memudahkan identifikasi aspek yang perlu pembinaan."
            >
              {kpis.totalAssessments ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height={330}>
                    <BarChart
                      data={data.aspectStats}
                      layout="vertical"
                      margin={{ top: 6, right: 18, left: 20, bottom: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" horizontal={false} />
                      <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={150}
                        tick={{ fontSize: 10.5 }}
                      />
                      <Tooltip
                        formatter={(val: number) => [`${val} / 5.00`, 'Rata-rata']}
                        labelFormatter={(label) => String(label)}
                      />
                      <Bar dataKey="average" radius={[0, 5, 5, 0]}>
                        {data.aspectStats.map((item) => (
                          <Cell
                            key={item.key}
                            fill={GROUP_COLOR_MAP[item.groupKey] || '#1d4ed8'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty>Belum ada data sub-aspek untuk dianalisis.</Empty>
              )}
            </Card>
          </div>

          <Card
            title="Peringkat & Kinerja Pemateri"
            subtitle="Diurutkan berdasarkan nilai rata-rata penilaian observer; menyertakan rata-rata interaksi forum dari sosiogram."
          >
            {data.speakerRows.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Pemateri</th>
                      <th className="num">Sesi</th>
                      <th className="num">Lembar</th>
                      <th className="num">Penampilan</th>
                      <th className="num">Bahasa</th>
                      <th className="num">Materi</th>
                      <th className="num">Nilai Akhir</th>
                      <th className="num">Interaksi/Sesi</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.speakerRows.map((row, idx) => (
                      <tr key={row.speakerId}>
                        <td>{idx + 1}</td>
                        <td>
                          <strong>{row.speakerName}</strong>
                          {row.expertise && (
                            <div className="small muted" style={{ maxWidth: 260 }}>
                              {row.expertise}
                            </div>
                          )}
                        </td>
                        <td className="num">{row.sessionsCount}</td>
                        <td className="num">{row.assessmentsCount}</td>
                        <td className="num">{(row.groupAverages.penampilan || 0).toFixed(2)}</td>
                        <td className="num">{(row.groupAverages.bahasa || 0).toFixed(2)}</td>
                        <td className="num">{(row.groupAverages.materi || 0).toFixed(2)}</td>
                        <td className="num">
                          <Badge tone={row.tone}>{row.overallAvg.toFixed(2)}</Badge>
                        </td>
                        <td className="num">
                          <strong>{row.avgForumInteractions}</strong>
                        </td>
                        <td className="right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedSpeakerId(row.speakerId);
                              setActiveTab('speaker');
                            }}
                          >
                            Detail →
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Belum ada pemateri yang dinilai observer pada cakupan filter ini.</Empty>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: PROFIL & EVALUASI PER PEMATERI */}
      {activeTab === 'speaker' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13 }}>Pilih Pemateri:</strong>
                <Select
                  value={selectedSpeakerId}
                  onChange={(event) => setSelectedSpeakerId(event.target.value)}
                  style={{ minWidth: 250, fontWeight: 600 }}
                >
                  {data.speakerRows.length ? (
                    data.speakerRows.map((row) => (
                      <option key={row.speakerId} value={row.speakerId}>
                        {row.speakerName} ({row.overallAvg.toFixed(2)} · {row.assessmentsCount}{' '}
                        lembar)
                      </option>
                    ))
                  ) : (
                    <option value="">Belum ada pemateri dinilai</option>
                  )}
                </Select>
              </div>
              {selectedSpeaker && (
                <Badge tone={selectedSpeaker.tone}>
                  Nilai Akhir: {selectedSpeaker.overallAvg.toFixed(2)} / 5.00
                </Badge>
              )}
            </div>
          </Card>

          {selectedSpeaker ? (
            <>
              <div className="kpi-grid">
                <Stat
                  label="Nilai Rata-rata"
                  value={selectedSpeaker.overallAvg.toFixed(2)}
                  hint={`Rata-rata semua: ${kpis.overallAvg.toFixed(2)}`}
                />
                <Stat
                  label="Penampilan"
                  value={(selectedSpeaker.groupAverages.penampilan || 0).toFixed(2)}
                  hint="4 sub-aspek"
                />
                <Stat
                  label="Bahasa"
                  value={(selectedSpeaker.groupAverages.bahasa || 0).toFixed(2)}
                  hint="4 sub-aspek"
                />
                <Stat
                  label="Materi"
                  value={(selectedSpeaker.groupAverages.materi || 0).toFixed(2)}
                  hint="4 sub-aspek"
                />
                <Stat
                  label="Interaksi Forum"
                  value={selectedSpeaker.avgForumInteractions}
                  hint={`Rata-rata/sesi (total ${selectedSpeaker.totalForumInteractions})`}
                />
              </div>

              <div className="grid grid-2">
                <Card
                  title={`Profil 12 Aspek: ${selectedSpeaker.speakerName}`}
                  subtitle="Rata-rata setiap indikator dari seluruh lembar observer."
                >
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height={330}>
                      <BarChart
                        data={selectedSpeakerAspects}
                        layout="vertical"
                        margin={{ top: 6, right: 18, left: 20, bottom: 6 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" horizontal={false} />
                        <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={150}
                          tick={{ fontSize: 10.5 }}
                        />
                        <Tooltip formatter={(val: number) => [`${val} / 5.00`, 'Skor']} />
                        <Bar dataKey="nilai" radius={[0, 5, 5, 0]}>
                          {selectedSpeakerAspects.map((item) => (
                            <Cell key={item.name} fill={item.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card
                  title="Tren Nilai Antar Sesi"
                  subtitle="Konsistensi performa pemateri lintas sesi/lokal."
                >
                  {selectedSpeakerTrend.length > 1 ? (
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height={330}>
                        <LineChart
                          data={selectedSpeakerTrend}
                          margin={{ top: 16, right: 18, left: -12, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis domain={[1, 5]} tick={{ fontSize: 11 }} />
                          <Tooltip
                            labelFormatter={(label, payload) =>
                              payload?.[0]?.payload?.detail || String(label)
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="nilai"
                            name="Nilai Akhir"
                            stroke="var(--navy)"
                            strokeWidth={3}
                            dot={{ r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="penampilan"
                            name="Penampilan"
                            stroke="#2f6f62"
                            strokeWidth={1.8}
                            dot={{ r: 2.5 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="bahasa"
                            name="Bahasa"
                            stroke="#4a6fa5"
                            strokeWidth={1.8}
                            dot={{ r: 2.5 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="materi"
                            name="Materi"
                            stroke="#800020"
                            strokeWidth={1.8}
                            dot={{ r: 2.5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <Empty>
                      Pemateri ini baru memiliki 1 lembar penilaian. Grafik tren muncul otomatis
                      setelah ≥ 2 sesi dinilai.
                    </Empty>
                  )}
                </Card>
              </div>

              <Card
                title={`Riwayat Evaluasi & Rekomendasi Observer (${selectedSpeaker.evaluations.length})`}
                subtitle="Detail catatan per aspek, catatan umum, dan rekomendasi tiap sesi."
              >
                <div className="list">
                  {selectedSpeaker.evaluations.map((ev) => (
                    <div className="assessment-card" key={ev.assessment.id}>
                      <div className="assessment-card-head">
                        <div>
                          <strong>
                            {ev.session.topic} · {localLabel(ev.session.localId)}
                          </strong>
                          <span className="small muted">
                            {fmtDate(ev.assessment.date)}
                            {ev.assessment.time ? ` · ${ev.assessment.time}` : ''} · Observer:{' '}
                            {ev.assessment.observerName} · Interaksi forum: {ev.forumInteractions}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Badge tone={assessmentTone(ev.overall)}>
                            {ev.overall.toFixed(2)} / 5.00
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyItemPdfId === ev.assessment.id}
                            onClick={() =>
                              void handleDownloadSinglePdf({
                                ...ev,
                                speakerName: selectedSpeaker.speakerName,
                                localId: ev.session.localId ?? null,
                              })
                            }
                          >
                            {busyItemPdfId === ev.assessment.id ? 'PDF…' : 'PDF Lembar'}
                          </Button>
                        </div>
                      </div>

                      <div className="assessment-mini-scores">
                        {ASSESSMENT_GROUPS.map((group) => (
                          <span key={group.key}>
                            <small>{group.label}</small>
                            <strong>{(ev.groupAverages[group.key] || 0).toFixed(2)}</strong>
                          </span>
                        ))}
                      </div>

                      {ev.aspectNotes.length > 0 && (
                        <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {ev.aspectNotes.map((an) => (
                            <span
                              key={an.label}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: 'var(--bg)',
                                border: '1px solid var(--bd)',
                              }}
                            >
                              <strong>
                                {an.label} ({an.score}):
                              </strong>{' '}
                              {an.note}
                            </span>
                          ))}
                        </div>
                      )}

                      {ev.assessment.generalNotes && (
                        <p className="small assessment-note-text">
                          <strong>Catatan Umum:</strong> {ev.assessment.generalNotes}
                        </p>
                      )}
                      {ev.assessment.recommendations && (
                        <p className="small" style={{ margin: 0 }}>
                          <strong>Rekomendasi:</strong> {ev.assessment.recommendations}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <Empty>Belum ada pemateri yang dinilai pada cakupan filter ini.</Empty>
          )}
        </div>
      )}

      {/* TAB 3: CAKUPAN & ARSIP LEMBAR */}
      {activeTab === 'coverage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card
            title={`Sesi Belum Dinilai Observer (${data.unassessedSessions.length})`}
            subtitle="Daftar pertemuan yang belum memiliki lembar penilaian pemateri untuk ditindaklanjuti."
          >
            {data.unassessedSessions.length ? (
              <div className="table-wrap">
                <table className="data compact">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Tanggal</th>
                      <th>Lokal</th>
                      <th>Materi</th>
                      <th>Pemateri Terjadwal</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.unassessedSessions.map(({ session, scheduledSpeakers }) => (
                      <tr key={session.id}>
                        <td>{session.no || '—'}</td>
                        <td className="nowrap">{fmtDate(session.date)}</td>
                        <td>
                          <Badge tone="badge-blue">{localLabel(session.localId)}</Badge>
                        </td>
                        <td>
                          <strong>{session.topic}</strong>
                        </td>
                        <td>{scheduledSpeakers.join(', ') || 'Belum dijadwalkan'}</td>
                        <td className="right">
                          <Link to={`/pertemuan/${session.id}`} className="btn btn-ghost btn-sm">
                            Detail Sesi
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Seluruh pertemuan pada filter ini sudah memiliki penilaian observer.</Empty>
            )}
          </Card>

          <Card
            title={`Arsip Seluruh Lembar Penilaian (${filteredEvaluations.length})`}
            subtitle={`Mencakup ${ASSESSMENT_ITEMS.length} aspek penilaian per lembar.`}
            actions={
              <input
                type="text"
                className="input input-sm"
                placeholder="Cari pemateri, materi, observer, atau catatan…"
                value={archiveSearch}
                onChange={(event) => setArchiveSearch(event.target.value)}
                style={{ minWidth: 250 }}
              />
            }
          >
            {filteredEvaluations.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Lokal</th>
                      <th>Materi</th>
                      <th>Pemateri</th>
                      <th>Observer</th>
                      <th className="num">Penamp.</th>
                      <th className="num">Bahasa</th>
                      <th className="num">Materi</th>
                      <th className="num">Nilai</th>
                      <th>Catatan &amp; Rekomendasi</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvaluations.map((item) => (
                      <tr key={item.assessment.id}>
                        <td className="nowrap">{fmtDate(item.assessment.date)}</td>
                        <td>
                          <Badge tone="badge-blue">{localLabel(item.localId)}</Badge>
                        </td>
                        <td>{item.session.topic}</td>
                        <td>
                          <strong>{item.speakerName}</strong>
                        </td>
                        <td>{item.assessment.observerName}</td>
                        <td className="num">{(item.groupAverages.penampilan || 0).toFixed(2)}</td>
                        <td className="num">{(item.groupAverages.bahasa || 0).toFixed(2)}</td>
                        <td className="num">{(item.groupAverages.materi || 0).toFixed(2)}</td>
                        <td className="num">
                          <Badge tone={assessmentTone(item.overall)}>
                            {item.overall.toFixed(2)}
                          </Badge>
                        </td>
                        <td style={{ maxWidth: 260, fontSize: 12 }}>
                          <div>{item.assessment.generalNotes || '—'}</div>
                          {item.assessment.recommendations && (
                            <div className="small muted">
                              <strong>Rek:</strong> {item.assessment.recommendations}
                            </div>
                          )}
                        </td>
                        <td className="right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyItemPdfId === item.assessment.id}
                            onClick={() => void handleDownloadSinglePdf(item)}
                          >
                            {busyItemPdfId === item.assessment.id ? 'PDF…' : 'PDF'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>
                {archiveSearch
                  ? 'Tidak ada lembar penilaian yang cocok dengan pencarian.'
                  : 'Belum ada lembar penilaian pemateri.'}
              </Empty>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
