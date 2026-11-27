import { useEffect, useMemo, useState } from 'react';
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
import { assessmentTone } from '../../shared/assessment';
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
import { loadLogoDataUrl } from '../lib/logoAsset';
import {
  buildAssessmentsCsv,
  buildParticipantCsv,
  buildRecapCsv,
  buildSessionCsv,
} from '../lib/csv';
import {
  downloadAssessmentPdf,
  downloadMonitoringPdf,
  downloadParticipantReportPdf,
  downloadSessionReliPdf,
  downloadSpeakerAssessmentsSummaryPdf,
} from '../lib/pdf';
import { peopleReliRows, RELI_LABELS, RELI_META } from '../lib/reli';
import {
  buildAllReport,
  buildParticipantReport,
  buildSessionReport,
  buildSpeakerAssessmentReport,
} from '../lib/report';
import { buildRecapReportData } from '../lib/reportData';
import { downloadFile, fmtDate, openHtmlWindow } from '../lib/utils';

type PerChart = 6 | 8 | 12;
type ReportMode = 'recap' | 'session' | 'participant' | 'assessments';

export function Reports() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [localOptions, setLocalOptions] = useState(LOCALS);

  const [mode, setMode] = useState<ReportMode>('recap');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [perChart, setPerChart] = useState<PerChart>(8);
  const [loading, setLoading] = useState(true);
  const [busyPdf, setBusyPdf] = useState(false);
  const [error, setError] = useState('');

  const scopedLocal = user?.localId || undefined;
  const effectiveLocalId: LocalId | null =
    scopedLocal ?? (filterLocal === 'all' ? null : filterLocal);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionResult, participantResult, speakerResult, metaResult, logo] = await Promise.all([
          api.sessions.list(),
          api.participants.list(),
          api.speakers.list(),
          api.getMeta(),
          loadLogoDataUrl(),
        ]);
        if (cancelled) return;
        setSessions(sessionResult.sessions);
        setParticipants(participantResult.participants);
        setSpeakers(speakerResult.speakers);
        setMeta(metaResult.meta);
        setLogoDataUrl(logo);
        setLocals(metaResult.meta.locals);
        setLocalOptions(metaResult.meta.locals || [...LOCALS]);
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

  const dateRangeLabel = useMemo(() => {
    if (dateStart && dateEnd) return `${fmtDate(dateStart)} – ${fmtDate(dateEnd)}`;
    if (dateStart) return `Mulai ${fmtDate(dateStart)}`;
    if (dateEnd) return `Sampai ${fmtDate(dateEnd)}`;
    return '';
  }, [dateStart, dateEnd]);

  const viewSessions = useMemo(
    () =>
      sessions
        .filter((session) => effectiveLocalId === null || session.localId === effectiveLocalId)
        .filter((session) => (!dateStart || session.date >= dateStart) && (!dateEnd || session.date <= dateEnd)),
    [sessions, effectiveLocalId, dateStart, dateEnd],
  );

  const viewParticipants = useMemo(
    () =>
      participants
        .filter((participant) => effectiveLocalId === null || participant.localId === effectiveLocalId)
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [participants, effectiveLocalId],
  );

  useEffect(() => {
    if (!viewSessions.length) {
      setSelectedSessionId('');
    } else if (!viewSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(viewSessions[0].id);
    }
  }, [viewSessions, selectedSessionId]);

  useEffect(() => {
    if (!viewParticipants.length) {
      setSelectedParticipantId('');
    } else if (!viewParticipants.some((p) => p.id === selectedParticipantId)) {
      setSelectedParticipantId(viewParticipants[0].id);
    }
  }, [viewParticipants, selectedParticipantId]);

  const selectedSession =
    viewSessions.find((session) => session.id === selectedSessionId) || null;
  const selectedParticipant =
    viewParticipants.find((p) => p.id === selectedParticipantId) || null;

  const recapData = useMemo(
    () => buildRecapReportData(viewSessions, viewParticipants, speakers),
    [viewSessions, viewParticipants, speakers],
  );

  const visibleObserverNotes = useMemo(() => {
    const base =
      mode === 'session' && selectedSession
        ? recapData.allObserverNotes.filter((item) => item.sessionId === selectedSession.id)
        : mode === 'participant' && selectedParticipant
          ? recapData.allObserverNotes.filter((item) => item.participantId === selectedParticipant.id)
          : recapData.allObserverNotes;
    const sorted = [...base].sort(
      (a, b) => b.date.localeCompare(a.date) || a.participantName.localeCompare(b.participantName, 'id'),
    );
    const q = noteSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (item) =>
        item.participantName.toLowerCase().includes(q) ||
        item.topic.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q) ||
        localLabel(item.localId).toLowerCase().includes(q),
    );
  }, [recapData.allObserverNotes, mode, selectedSession, selectedParticipant, noteSearch]);

  // Charts react dynamically to active mode & filters (consistent 0-10 aspect scale)
  const reportAspectData = useMemo(() => {
    if (mode === 'session' && selectedSession) {
      const people = peopleReliRows(selectedSession.sosiogram);
      return RELI_LABELS.map((label, index) => ({
        name: label,
        nilai: people.length
          ? Number(
              (
                people.reduce((sum, person) => sum + person.values[index], 0) / people.length
              ).toFixed(2),
            )
          : 0,
        color: RELI_META[index].color,
      }));
    }
    if (mode === 'participant' && selectedParticipant) {
      const row = recapData.participantRows.find((r) => r.id === selectedParticipant.id);
      return RELI_LABELS.map((label, index) => ({
        name: label,
        nilai: row ? Number(row.avgValues[index].toFixed(2)) : 0,
        color: RELI_META[index].color,
      }));
    }
    return RELI_LABELS.map((label, index) => ({
      name: label,
      nilai: Number(recapData.kpis.aspectAverages[index].toFixed(2)),
      color: RELI_META[index].color,
    }));
  }, [mode, selectedSession, selectedParticipant, recapData]);

  const reportSessionData = useMemo(() => {
    if (mode === 'participant' && selectedParticipant) {
      return viewSessions
        .filter((s) => Boolean(s.scores?.[selectedParticipant.id]))
        .map((session, index) => {
          const sc = session.scores[selectedParticipant.id];
          const avg = sc ? (sc.r + sc.e + sc.l + sc.i) / 4 : 0;
          return {
            name: `S${session.no || index + 1}`,
            tanggal: `${fmtDate(session.date)} · ${session.topic}`,
            rata: Number(avg.toFixed(2)),
          };
        });
    }
    return recapData.sessionRows.map((row, index) => ({
      name: `S${row.session.no || index + 1}`,
      tanggal: `${fmtDate(row.session.date)} · ${row.session.topic}`,
      rata: Number(row.avgReliAspect.toFixed(2)),
    }));
  }, [mode, selectedParticipant, viewSessions, recapData.sessionRows]);

  const reportOptions = useMemo(
    () => ({
      perChart,
      meta,
      localId: effectiveLocalId,
      scopeLabel: effectiveLocalId ? localLabel(effectiveLocalId) : 'Seluruh Lokal',
      dateRangeLabel: dateRangeLabel || undefined,
      logoDataUrl,
    }),
    [perChart, meta, effectiveLocalId, dateRangeLabel, logoDataUrl],
  );

  const html = useMemo(() => {
    if (mode === 'recap') {
      if (!viewSessions.length) return '';
      return buildAllReport(viewSessions, viewParticipants, speakers, reportOptions);
    }
    if (mode === 'session') {
      if (!selectedSession) return '';
      return buildSessionReport(
        selectedSession,
        selectedSession.sosiogram,
        viewParticipants,
        speakers,
        reportOptions,
      );
    }
    if (mode === 'participant') {
      if (!selectedParticipant) return '';
      return buildParticipantReport(selectedParticipant, viewSessions, speakers, reportOptions);
    }
    if (!viewSessions.length) return '';
    return buildSpeakerAssessmentReport(viewSessions, viewParticipants, speakers, reportOptions);
  }, [
    mode,
    viewSessions,
    viewParticipants,
    speakers,
    selectedSession,
    selectedParticipant,
    reportOptions,
  ]);

  function print() {
    if (html) openHtmlWindow(html, true);
  }

  async function downloadPdf() {
    if (busyPdf) return;
    setBusyPdf(true);
    setError('');
    try {
      if (mode === 'recap') {
        await downloadMonitoringPdf({
          participants: viewParticipants,
          sessions: viewSessions,
          speakers,
          meta,
          localId: effectiveLocalId,
          dateRangeLabel: dateRangeLabel || undefined,
          title: 'LAPORAN REKAP PERKEMBANGAN PESERTA',
          perChart,
        });
      } else if (mode === 'session' && selectedSession) {
        await downloadSessionReliPdf({
          session: selectedSession,
          sosiogram: selectedSession.sosiogram,
          participants: viewParticipants,
          speakers,
          meta,
          perChart,
        });
      } else if (mode === 'participant' && selectedParticipant) {
        await downloadParticipantReportPdf({
          participant: selectedParticipant,
          sessions: viewSessions,
          speakers,
          meta,
          dateRangeLabel: dateRangeLabel || undefined,
        });
      } else if (mode === 'assessments') {
        await downloadSpeakerAssessmentsSummaryPdf({
          sessions: viewSessions,
          participants: viewParticipants,
          speakers,
          meta,
          localId: effectiveLocalId,
          dateRangeLabel: dateRangeLabel || undefined,
        });
      }
      notify('Dokumen PDF berhasil diunduh.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat PDF';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusyPdf(false);
    }
  }

  function downloadCsv() {
    if (mode === 'recap') {
      const content = buildRecapCsv(viewSessions, viewParticipants, speakers);
      downloadFile(
        `rekap-peserta-${effectiveLocalId ? `lokal-${effectiveLocalId}` : 'semua-lokal'}.csv`,
        content,
        'text/csv;charset=utf-8',
      );
    } else if (mode === 'session' && selectedSession) {
      const content = buildSessionCsv(selectedSession, viewParticipants);
      const slug = selectedSession.topic.replace(/[^\w]+/g, '-').slice(0, 32);
      downloadFile(`sesi-${selectedSession.date}-${slug}.csv`, content, 'text/csv;charset=utf-8');
    } else if (mode === 'participant' && selectedParticipant) {
      const content = buildParticipantCsv(selectedParticipant, viewSessions, speakers);
      const slug = selectedParticipant.name.replace(/[^\w]+/g, '-').slice(0, 32);
      downloadFile(`rapor-${slug}.csv`, content, 'text/csv;charset=utf-8');
    } else if (mode === 'assessments') {
      const content = buildAssessmentsCsv(viewSessions, viewParticipants, speakers);
      downloadFile(
        `penilaian-pemateri-${effectiveLocalId ? `lokal-${effectiveLocalId}` : 'semua-lokal'}.csv`,
        content,
        'text/csv;charset=utf-8',
      );
    }
    notify('File CSV (Excel) berhasil diunduh.');
  }

  function downloadHtml() {
    if (!html) return;
    const slug =
      mode === 'recap'
        ? `laporan-rekap-${effectiveLocalId ? `lokal-${effectiveLocalId}` : 'semua'}`
        : mode === 'session'
          ? `laporan-${selectedSession?.date || 'sesi'}-${(selectedSession?.topic || 'pertemuan')
              .replace(/[^\w]+/g, '-')
              .slice(0, 30)}`
          : mode === 'participant'
            ? `rapor-${(selectedParticipant?.name || 'peserta').replace(/[^\w]+/g, '-').slice(0, 30)}`
            : `laporan-penilaian-pemateri-${effectiveLocalId ? `lokal-${effectiveLocalId}` : 'semua'}`;
    downloadFile(`${slug}.html`, html, 'text/html');
  }

  function downloadJson() {
    const payload =
      mode === 'session' && selectedSession
        ? { session: selectedSession, participants: viewParticipants, speakers }
        : mode === 'participant' && selectedParticipant
          ? { participant: selectedParticipant, sessions: viewSessions, speakers }
          : { sessions: viewSessions, participants: viewParticipants, speakers };
    const suffix =
      mode === 'session'
        ? selectedSession?.id || 'sesi'
        : mode === 'participant'
          ? selectedParticipant?.id || 'peserta'
          : effectiveLocalId
            ? `lokal-${effectiveLocalId}`
            : 'lengkap';
    downloadFile(`data-${suffix}.json`, JSON.stringify(payload, null, 2));
  }

  if (loading) {
    return (
      <div className="content">
        <Loader />
      </div>
    );
  }

  const { kpis } = recapData;

  return (
    <div className="content">
      <PageHeader
        title="Laporan & PDF"
        subtitle={
          scopedLocal
            ? `${localLabel(scopedLocal)} · laporan siap cetak, PDF sinkron, rapor peserta, dan ekspor CSV`
            : 'Laporan rekap, per pertemuan, rapor individu peserta, rekap pemateri, PDF, dan CSV'
        }
        actions={
          <>
            <Button onClick={downloadJson} disabled={!html}>
              JSON
            </Button>
            <Button onClick={downloadCsv} disabled={!html}>
              CSV (Excel)
            </Button>
            <Button onClick={downloadHtml} disabled={!html}>
              HTML
            </Button>
            <Button onClick={print} disabled={!html}>
              Cetak
            </Button>
            <Button variant="primary" onClick={() => void downloadPdf()} disabled={!html || busyPdf}>
              {busyPdf ? 'Membuat PDF…' : 'Unduh PDF'}
            </Button>
          </>
        }
      />

      {error && <Alert>{error}</Alert>}

      {/* KPI Ringkas sesuai filter aktif */}
      <div className="kpi-grid">
        <Stat
          label="Rata-rata RELI"
          value={kpis.avgReliAspect.toFixed(2)}
          hint={`Skala 0–10 (${kpis.avgReliTotal.toFixed(1)}/40)`}
        />
        <Stat
          label="Peserta dinilai"
          value={`${kpis.scoredParticipants}/${kpis.totalParticipants}`}
          hint={`${kpis.scoredSessions}/${kpis.totalSessions} sesi bersosiogram`}
        />
        <Stat
          label="Kehadiran"
          value={`${kpis.attendanceRate}%`}
          hint={`${kpis.presentEntries}/${kpis.totalAttendanceEntries} hadir`}
        />
        <Stat
          label="Keaktifan forum"
          value={kpis.totalInteractions}
          hint={`${kpis.participationRate}% peserta aktif`}
        />
        <Stat
          label="Penilaian pemateri"
          value={kpis.assessmentCount ? kpis.assessmentAvg.toFixed(2) : '—'}
          hint={`${kpis.assessmentCount} lembar observer`}
        />
      </div>

      {/* Mode Tabs */}
      <div className="monitoring-tabs" role="tablist" aria-label="Jenis laporan">
        <button
          role="tab"
          aria-selected={mode === 'recap'}
          className={mode === 'recap' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'}
          onClick={() => setMode('recap')}
        >
          Rekap Lokal / Semua
        </button>
        <button
          role="tab"
          aria-selected={mode === 'session'}
          className={mode === 'session' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'}
          onClick={() => setMode('session')}
        >
          Per Pertemuan
        </button>
        <button
          role="tab"
          aria-selected={mode === 'participant'}
          className={mode === 'participant' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'}
          onClick={() => setMode('participant')}
        >
          Rapor Peserta
        </button>
        <button
          role="tab"
          aria-selected={mode === 'assessments'}
          className={mode === 'assessments' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'}
          onClick={() => setMode('assessments')}
        >
          Penilaian Pemateri ({recapData.assessmentDetails.length})
        </button>
      </div>

      {/* Filter Lokal & Rentang Tanggal */}
      <Card title="Filter & Pengaturan Laporan">
        {!scopedLocal && (
          <div className="toolbar" style={{ marginBottom: 14 }}>
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
              {viewSessions.length} pertemuan · {viewParticipants.length} peserta
            </span>
          </div>
        )}

        <div className="grid grid-4" style={{ alignItems: 'end' }}>
          {mode === 'session' && (
            <Field label="Pilih pertemuan">
              <Select
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                {viewSessions.length ? (
                  viewSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.no ? `Sesi ${session.no} · ` : ''}
                      {fmtDate(session.date)} · {session.topic}
                      {!effectiveLocalId && session.localId ? ` (${localLabel(session.localId)})` : ''}
                    </option>
                  ))
                ) : (
                  <option value="">Belum ada pertemuan</option>
                )}
              </Select>
            </Field>
          )}

          {mode === 'participant' && (
            <Field label="Pilih peserta">
              <Select
                value={selectedParticipantId}
                onChange={(event) => setSelectedParticipantId(event.target.value)}
              >
                {viewParticipants.length ? (
                  viewParticipants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                      {!effectiveLocalId && participant.localId
                        ? ` · ${localLabel(participant.localId)}`
                        : ''}
                    </option>
                  ))
                ) : (
                  <option value="">Belum ada peserta</option>
                )}
              </Select>
            </Field>
          )}

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

          {(mode === 'recap' || mode === 'session') && (
            <Field label="Peserta per grafik">
              <Select
                value={String(perChart)}
                onChange={(event) => setPerChart(Number(event.target.value) as PerChart)}
              >
                <option value="6">6 peserta</option>
                <option value="8">8 peserta</option>
                <option value="12">12 peserta</option>
              </Select>
            </Field>
          )}

          {(dateStart || dateEnd) && (
            <div>
              <Button
                variant="ghost"
                onClick={() => {
                  setDateStart('');
                  setDateEnd('');
                }}
              >
                Reset tanggal
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Grafik Ringkas yang Sinkron dengan Mode & Filter */}
      {mode !== 'assessments' && (
        <div className="grid grid-2">
          <Card
            title={
              mode === 'participant' && selectedParticipant
                ? `Rata-rata RELI: ${selectedParticipant.name}`
                : mode === 'session' && selectedSession
                  ? `Rata-rata RELI: ${selectedSession.topic}`
                  : 'Rata-rata RELI (Skala 0–10)'
            }
            subtitle="Rata-rata tiap aspek RELI sesuai filter aktif."
          >
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={reportAspectData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: number) => [`${val} / 10`, 'Rata-rata']} />
                  <Bar dataKey="nilai" radius={[6, 6, 0, 0]}>
                    {reportAspectData.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title={
              mode === 'participant' && selectedParticipant
                ? `Tren Sesi: ${selectedParticipant.name}`
                : 'Tren Rata-rata Aspek per Sesi'
            }
            subtitle="Skala rata-rata aspek 0–10 per pertemuan."
          >
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={reportSessionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: number) => [`${val} / 10`, 'Rata-rata aspek']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.tanggal || label}
                  />
                  <Line
                    type="monotone"
                    dataKey="rata"
                    stroke="var(--navy)"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Akses Unduh PDF Satuan Lembar Penilaian Pemateri (penting untuk Inlok & Koordinator) */}
      {mode === 'assessments' && (
        <Card
          title="Unduh Lembar Penilaian Pemateri (PDF Satuan)"
          subtitle="Setiap lembar penilaian observer dapat diunduh langsung sebagai dokumen PDF resmi."
        >
          {recapData.assessmentDetails.length ? (
            <div className="table-wrap">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Lokal</th>
                    <th>Materi</th>
                    <th>Pemateri</th>
                    <th>Observer</th>
                    <th className="num">Nilai</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recapData.assessmentDetails.map((item) => (
                    <tr key={item.assessment.id}>
                      <td className="nowrap">{fmtDate(item.assessment.date)}</td>
                      <td>
                        <Badge tone="badge-blue">{localLabel(item.session.localId)}</Badge>
                      </td>
                      <td>{item.session.topic}</td>
                      <td>
                        <strong>{item.speakerName}</strong>
                      </td>
                      <td>{item.assessment.observerName}</td>
                      <td className="num">
                        <Badge tone={assessmentTone(item.overall)}>
                          {item.overall.toFixed(2)}
                        </Badge>
                      </td>
                      <td className="right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void downloadAssessmentPdf({
                              session: item.session,
                              assessment: item.assessment,
                              speaker: speakers.find((s) => s.id === item.assessment.speakerId),
                              meta,
                            })
                          }
                        >
                          PDF Lembar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Belum ada lembar penilaian pemateri pada filter ini.</Empty>
          )}
        </Card>
      )}

      {/* Catatan Peserta yang Dilaporkan Observer (terlihat bagi seluruh tim selain Admin) */}
      {mode !== 'assessments' && (
        <Card
          title={`Catatan Peserta dari Observer (${visibleObserverNotes.length})`}
          subtitle="Catatan perkembangan peserta yang dilaporkan observer sesuai filter aktif."
          actions={
            <input
              type="text"
              className="input input-sm"
              placeholder="Cari peserta, materi, atau catatan…"
              value={noteSearch}
              onChange={(event) => setNoteSearch(event.target.value)}
              style={{ minWidth: 230 }}
            />
          }
        >
          {visibleObserverNotes.length ? (
            <div className="table-wrap">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Lokal</th>
                    <th>Peserta</th>
                    <th>Materi Sesi</th>
                    <th>Catatan Observer</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleObserverNotes.map((entry, idx) => (
                    <tr key={`${entry.sessionId}-${entry.participantId}-${idx}`}>
                      <td className="nowrap">{fmtDate(entry.date)}</td>
                      <td>
                        <Badge tone="badge-blue">{localLabel(entry.localId)}</Badge>
                      </td>
                      <td>
                        <strong>{entry.participantName}</strong>
                      </td>
                      <td>{entry.topic}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{entry.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              {noteSearch
                ? 'Tidak ada catatan observer yang cocok dengan pencarian.'
                : 'Belum ada catatan peserta yang dilaporkan observer pada filter ini.'}
            </Empty>
          )}
        </Card>
      )}

      {/* Pratinjau HTML yang 100% sama dengan hasil cetak */}
      {html ? (
        <Card
          title="Pratinjau Laporan"
          subtitle="Tampilan siap cetak dengan kop resmi, predikat RELI, heatmap inisial bawah, dan blok pengesahan."
        >
          <iframe
            title="Pratinjau laporan"
            srcDoc={html}
            style={{
              width: '100%',
              height: 760,
              border: '1px solid var(--bd)',
              borderRadius: 12,
              background: '#eef2f6',
            }}
          />
        </Card>
      ) : (
        <Empty>
          {mode === 'participant'
            ? 'Belum ada peserta untuk dibuatkan rapor pada cakupan ini.'
            : 'Belum ada pertemuan untuk dilaporkan pada filter yang dipilih.'}
        </Empty>
      )}
    </div>
  );
}
