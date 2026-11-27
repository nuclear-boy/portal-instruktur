import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import { assessmentOverall, assessmentTone } from '../../shared/assessment';
import { LOCALS, localLabel, setLocals } from '../../shared/locals';
import type { LocalId, Meta, Participant, Session, Speaker } from '../../shared/types';
import { SPEAKER_ROLES } from '../../shared/types';
import { Alert, Badge, Button, Card, Empty, Field, Input, Loader, PageHeader, Select, Stat } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { computeCommunicationInsights } from '../lib/communicationInsights';
import { downloadAssessmentPdf, downloadMonitoringPdf, downloadParticipantReportPdf, } from '../lib/pdf';
import { RELI_META } from '../lib/reli';
import { buildRecapReportData } from '../lib/reportData';
import { fmtDate, totalScore } from '../lib/utils';
type DailySeriesKey = 'R' | 'E' | 'L' | 'I' | 'Total' | 'RataRataLokal';
const DAILY_SERIES: {
    key: DailySeriesKey;
    name: string;
    color: string;
    axis: 'indicator' | 'total';
    dashed?: boolean;
}[] = [
    ...RELI_META.map((item) => ({
        key: item.short as DailySeriesKey,
        name: item.label,
        color: item.color,
        axis: 'indicator' as const,
    })),
    { key: 'Total', name: 'Total RELI', color: 'var(--navy)', axis: 'total' },
    {
        key: 'RataRataLokal',
        name: 'Rata-rata lokal',
        color: 'var(--mu)',
        axis: 'total',
        dashed: true,
    },
];
interface ParticipantRow {
    id: string;
    name: string;
    localId?: LocalId | null;
    total: number;
    values: [
        number,
        number,
        number,
        number
    ];
    scored: number;
    attendance: Record<string, number>;
}
interface SpeakerRow {
    id: string;
    name: string;
    roles: string;
    sessions: number;
    attendance: Record<string, number>;
}
type TabKey = 'overview' | 'tracking' | 'insights' | 'recap';
export function Monitoring() {
    const { user } = useAuth();
    const { notify } = useToast();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [localOptions, setLocalOptions] = useState(LOCALS);
    const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
    const [insightSearch, setInsightSearch] = useState('');
    const [noteSearch, setNoteSearch] = useState('');
    const [progressStart, setProgressStart] = useState('');
    const [progressEnd, setProgressEnd] = useState('');
    const [hiddenDailySeries, setHiddenDailySeries] = useState<DailySeriesKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyPdf, setBusyPdf] = useState(false);
    const [busyRaporPdf, setBusyRaporPdf] = useState(false);
    const [error, setError] = useState('');
    const scopedLocal = user?.localId || undefined;
    async function load() {
        setLoading(true);
        setError('');
        try {
            const [sessionResult, participantResult, speakerResult, metaResult] = await Promise.all([
                api.sessions.list(),
                api.participants.list(),
                api.speakers.list(),
                api.getMeta(),
            ]);
            setSessions(sessionResult.sessions);
            setParticipants(participantResult.participants);
            setSpeakers(speakerResult.speakers);
            setMeta(metaResult.meta);
            setLocals(metaResult.meta.locals);
            setLocalOptions(metaResult.meta.locals || [...LOCALS]);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal memuat data');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, []);
    const viewSessions = useMemo(() => sessions
        .filter((session) => filterLocal === 'all' || session.localId === filterLocal)
        .sort((a, b) => a.date.localeCompare(b.date)), [sessions, filterLocal]);
    const viewParticipants = useMemo(() => participants
        .filter((participant) => filterLocal === 'all' || participant.localId === filterLocal)
        .sort((a, b) => a.name.localeCompare(b.name, 'id')), [participants, filterLocal]);
    const participantRows = useMemo<ParticipantRow[]>(() => {
        return viewParticipants
            .map((participant) => {
            const values: [
                number,
                number,
                number,
                number
            ] = [0, 0, 0, 0];
            let scored = 0;
            const attendance: Record<string, number> = {};
            viewSessions.forEach((session) => {
                const score = session.scores[participant.id];
                if (score) {
                    values[0] += score.r;
                    values[1] += score.e;
                    values[2] += score.l;
                    values[3] += score.i;
                    scored += 1;
                }
                const entry = session.attendance.find((item) => item.participantId === participant.id);
                if (entry)
                    attendance[entry.status] = (attendance[entry.status] || 0) + 1;
            });
            return {
                id: participant.id,
                name: participant.name,
                localId: participant.localId,
                total: values.reduce((total, value) => total + value, 0),
                values,
                scored,
                attendance,
            };
        })
            .filter((row) => row.scored > 0 || Object.keys(row.attendance).length > 0)
            .sort((a, b) => b.total - a.total);
    }, [viewParticipants, viewSessions]);
    useEffect(() => {
        if (!selectedParticipantId && participantRows.length > 0) {
            setSelectedParticipantId(participantRows[0].id);
        }
        else if (selectedParticipantId &&
            !viewParticipants.some((p) => p.id === selectedParticipantId)) {
            setSelectedParticipantId(participantRows[0]?.id || viewParticipants[0]?.id || '');
        }
    }, [participantRows, viewParticipants, selectedParticipantId]);
    const sessionRows = useMemo(() => viewSessions.map((session) => {
        const scored = Object.keys(session.scores).length;
        const average = scored
            ? Object.values(session.scores).reduce((total, score) => total + totalScore(score), 0) / scored
            : 0;
        const present = session.attendance.filter((item) => item.status === 'hadir' || item.status === 'terlambat').length;
        return {
            id: session.id,
            label: fmtDate(session.date, { day: 'numeric', month: 'short' }),
            topic: session.topic,
            average: Number(average.toFixed(1)),
            present,
            scored,
            totalAttendance: session.attendance.length,
        };
    }), [viewSessions]);
    const { participantInsights, classStats } = useMemo(() => computeCommunicationInsights(viewSessions, viewParticipants, speakers), [viewSessions, viewParticipants, speakers]);
    const recapData = useMemo(() => buildRecapReportData(viewSessions, viewParticipants, speakers), [viewSessions, viewParticipants, speakers]);
    const observerNotesByParticipant = useMemo(() => new Map(recapData.participantRows.map((row) => [row.id, row.observerNoteEntries])), [recapData.participantRows]);
    const filteredObserverNotes = useMemo(() => {
        const q = noteSearch.trim().toLowerCase();
        const list = [...recapData.allObserverNotes].sort((a, b) => b.date.localeCompare(a.date) || a.participantName.localeCompare(b.participantName, 'id'));
        if (!q)
            return list;
        return list.filter((item) => item.participantName.toLowerCase().includes(q) ||
            item.topic.toLowerCase().includes(q) ||
            item.note.toLowerCase().includes(q) ||
            localLabel(item.localId).toLowerCase().includes(q));
    }, [recapData.allObserverNotes, noteSearch]);
    const localAspectAverages = useMemo(() => {
        const count = participantRows.length;
        const sums = [0, 0, 0, 0];
        participantRows.forEach((row) => {
            sums[0] += row.values[0];
            sums[1] += row.values[1];
            sums[2] += row.values[2];
            sums[3] += row.values[3];
        });
        return RELI_META.map((item, index) => ({
            name: `${item.label} (${item.short})`,
            score: count ? Number((sums[index] / count).toFixed(1)) : 0,
            full: item.label,
            color: item.color,
            desc: item.description,
        }));
    }, [participantRows]);
    const localOverallScoreAverage = useMemo(() => {
        if (!participantRows.length)
            return 0;
        return participantRows.reduce((acc, row) => acc + row.total, 0) / participantRows.length;
    }, [participantRows]);
    const selectedParticipant = useMemo(() => viewParticipants.find((p) => p.id === selectedParticipantId), [viewParticipants, selectedParticipantId]);
    const selectedParticipantRow = useMemo(() => participantRows.find((p) => p.id === selectedParticipantId), [participantRows, selectedParticipantId]);
    const selectedParticipantInsight = useMemo(() => participantInsights.find((pi) => pi.participantId === selectedParticipantId), [participantInsights, selectedParticipantId]);
    const participantProgressionData = useMemo(() => {
        if (!selectedParticipantId)
            return [];
        return viewSessions
            .filter((session) => (!progressStart || session.date >= progressStart) && (!progressEnd || session.date <= progressEnd))
            .map((session, index) => {
            const score = session.scores[selectedParticipantId];
            const scoredCount = Object.keys(session.scores).length;
            const localSessionAvg = scoredCount
                ? Object.values(session.scores).reduce((total, sc) => total + totalScore(sc), 0) / scoredCount
                : 0;
            const pTotal = score ? totalScore(score) : 0;
            return {
                sessionLabel: `Sesi ${session.no || index + 1}`,
                dateLabel: fmtDate(session.date, { day: 'numeric', month: 'short' }),
                topic: session.topic,
                R: score?.r || 0,
                E: score?.e || 0,
                L: score?.l || 0,
                I: score?.i || 0,
                Total: Number(pTotal.toFixed(1)),
                RataRataLokal: Number(localSessionAvg.toFixed(1)),
            };
        });
    }, [viewSessions, selectedParticipantId, progressStart, progressEnd]);
    const participantDailyPerformanceData = useMemo(() => {
        if (!selectedParticipantId)
            return [];
        const byDate = new Map<string, {
            date: string;
            topics: Set<string>;
            values: [
                number,
                number,
                number,
                number
            ];
            scoreCount: number;
            localValues: [
                number,
                number,
                number,
                number
            ];
            localCount: number;
        }>();
        viewSessions
            .filter((session) => (!progressStart || session.date >= progressStart) &&
            (!progressEnd || session.date <= progressEnd))
            .forEach((session) => {
            const date = String(session.date || '').slice(0, 10);
            if (!date)
                return;
            const current = byDate.get(date) || {
                date,
                topics: new Set<string>(),
                values: [0, 0, 0, 0],
                scoreCount: 0,
                localValues: [0, 0, 0, 0],
                localCount: 0,
            };
            current.topics.add(session.topic);
            const scored = Object.values(session.scores || {});
            if (scored.length) {
                current.localValues[0] += scored.reduce((total, score) => total + score.r, 0) / scored.length;
                current.localValues[1] += scored.reduce((total, score) => total + score.e, 0) / scored.length;
                current.localValues[2] += scored.reduce((total, score) => total + score.l, 0) / scored.length;
                current.localValues[3] += scored.reduce((total, score) => total + score.i, 0) / scored.length;
                current.localCount += 1;
            }
            const score = session.scores[selectedParticipantId];
            if (score) {
                current.values[0] += score.r;
                current.values[1] += score.e;
                current.values[2] += score.l;
                current.values[3] += score.i;
                current.scoreCount += 1;
            }
            byDate.set(date, current);
        });
        return [...byDate.values()]
            .filter((item) => item.scoreCount > 0)
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((item) => {
            const average = item.values.map((value) => value / item.scoreCount);
            const localAverage = item.localValues.map((value) => item.localCount ? value / item.localCount : 0);
            return {
                date: item.date,
                dateLabel: fmtDate(item.date, { day: 'numeric', month: 'short' }),
                topic: [...item.topics].join(' · '),
                R: Number(average[0].toFixed(1)),
                E: Number(average[1].toFixed(1)),
                L: Number(average[2].toFixed(1)),
                I: Number(average[3].toFixed(1)),
                Total: Number(average.reduce((total, value) => total + value, 0).toFixed(1)),
                RataRataLokal: Number(localAverage.reduce((total, value) => total + value, 0).toFixed(1)),
            };
        });
    }, [viewSessions, selectedParticipantId, progressStart, progressEnd]);
    const speakerRows = useMemo<SpeakerRow[]>(() => {
        return speakers
            .map((speaker) => {
            const sessionIds = new Set<string>();
            const roles = new Set<string>();
            const attendance: Record<string, number> = {};
            viewSessions.forEach((session) => {
                session.speakers
                    .filter((entry) => entry.speakerId === speaker.id)
                    .forEach((entry) => {
                    sessionIds.add(session.id);
                    const role = SPEAKER_ROLES.find((item) => item.value === entry.role)?.label || entry.role;
                    roles.add(role);
                    attendance[entry.attendance] = (attendance[entry.attendance] || 0) + 1;
                });
            });
            return {
                id: speaker.id,
                name: speaker.name,
                roles: [...roles].join(', '),
                sessions: sessionIds.size,
                attendance,
            };
        })
            .filter((row) => row.sessions > 0)
            .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, 'id'));
    }, [speakers, viewSessions]);
    const allAssessments = useMemo(() => viewSessions.flatMap((session) => (session.assessments || []).map((assessment) => ({ session, assessment }))), [viewSessions]);
    const assessmentAverage = allAssessments.length
        ? allAssessments.reduce((total, item) => total + assessmentOverall(item.assessment.scores), 0) / allAssessments.length
        : 0;
    const totalPresent = sessionRows.reduce((total, row) => total + row.present, 0);
    const totalAttendance = sessionRows.reduce((total, row) => total + row.totalAttendance, 0);
    const overallAttendance = totalAttendance ? Math.round((totalPresent / totalAttendance) * 100) : 0;
    const filteredInsights = useMemo(() => {
        if (!insightSearch.trim())
            return participantInsights;
        const q = insightSearch.toLowerCase();
        return participantInsights.filter((pi) => pi.participantName.toLowerCase().includes(q) ||
            pi.topTopic?.topic.toLowerCase().includes(q) ||
            pi.topSpeaker?.speakerName.toLowerCase().includes(q) ||
            pi.styleLabel.toLowerCase().includes(q) ||
            pi.potentialRecommendation.toLowerCase().includes(q));
    }, [participantInsights, insightSearch]);
    if (loading) {
        return (<div className="content">
        <Loader />
      </div>);
    }
    return (<div className="content">
      <PageHeader title="Monitoring & Perkembangan Peserta" subtitle={scopedLocal
            ? `${localLabel(scopedLocal)} · Pantau kondisi rata-rata lokal, perkembangan pribadi peserta, dan insight komunikasi observer.`
            : 'Perkembangan seluruh lokal, tracking pribadi masing-masing peserta, dan insight potensi tim.'} actions={<>
            <Button variant="ghost" onClick={() => void load()}>
              Muat ulang
            </Button>
            <Button variant="primary" disabled={busyPdf} onClick={async () => {
                setBusyPdf(true);
                try {
                    await downloadMonitoringPdf({
                        participants: viewParticipants,
                        sessions: viewSessions,
                        speakers,
                        meta,
                        localId: scopedLocal ?? (filterLocal === 'all' ? null : filterLocal),
                    });
                    notify('PDF monitoring berhasil diunduh.');
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Gagal membuat PDF';
                    setError(msg);
                    notify(msg, 'error');
                }
                finally {
                    setBusyPdf(false);
                }
            }}>
              {busyPdf ? 'Membuat PDF…' : 'Unduh PDF'}
            </Button>
          </>}/>

      {error && <Alert>{error}</Alert>}

      {!scopedLocal && (<Card>
          <div className="toolbar">
            <div className="filter-pills" role="group" aria-label="Filter lokal">
              <button className={filterLocal === 'all' ? 'pill active' : 'pill'} onClick={() => setFilterLocal('all')}>
                Semua lokal
              </button>
              {localOptions.map((local) => (<button key={local.id} className={filterLocal === local.id ? 'pill active' : 'pill'} onClick={() => setFilterLocal(local.id)}>
                  {local.label}
                </button>))}
            </div>
            <span className="small muted">
              {viewParticipants.length} peserta · {viewSessions.length} pertemuan
            </span>
          </div>
        </Card>)}

      
      <div className="kpi-grid">
        <Stat label="Peserta dinilai" value={participantRows.length} hint={`${viewParticipants.length} terdaftar`}/>
        <Stat label="Rata-rata skor lokal" value={localOverallScoreAverage.toFixed(1)} hint="Akumulasi semua sesi"/>
        <Stat label="Keaktifan komunikasi" value={classStats.totalInteractions} hint={`${classStats.participationRate}% peserta aktif`}/>
        <Stat label="Kehadiran peserta" value={`${overallAttendance}%`} hint={`${totalPresent}/${totalAttendance} catatan`}/>
        <Stat label="Pertemuan dievaluasi" value={viewSessions.length} hint={`${viewSessions.filter((item) => Object.keys(item.scores).length).length} ada sosiogram`}/>
        <Stat label="Catatan observer" value={recapData.allObserverNotes.length} hint={allAssessments.length
            ? `${allAssessments.length} penilaian (rata2 ${assessmentAverage.toFixed(2)})`
            : 'Catatan perkembangan peserta'}/>
      </div>

      
      <div className="monitoring-tabs">
        <button className={activeTab === 'overview' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'} onClick={() => setActiveTab('overview')}>
          Kondisi Rata-Rata Lokal
        </button>
        <button className={activeTab === 'tracking' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'} onClick={() => setActiveTab('tracking')}>
          Tracking Perkembangan Pribadi
        </button>
        <button className={activeTab === 'insights' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'} onClick={() => setActiveTab('insights')}>
          Insight Komunikasi & Potensi
        </button>
        <button className={activeTab === 'recap' ? 'monitoring-tab-btn active' : 'monitoring-tab-btn'} onClick={() => setActiveTab('recap')}>
          Rekap Nilai & Penilaian
        </button>
      </div>

      
      
      
      {activeTab === 'overview' && (<div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid grid-2">
            <Card title="Kondisi Rata-rata Lokal per Aspek RELI" subtitle="Grafik vertikal (dari bawah ke atas) yang mudah dipahami orang awam.">
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={localAspectAverages} margin={{ top: 20, right: 16, left: -10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }}/>
                    <YAxis domain={[0, 'dataMax + 4']} tick={{ fontSize: 11 }}/>
                    <Tooltip contentStyle={{
                background: 'var(--sf)',
                border: '1px solid var(--bd)',
                borderRadius: 10,
                fontSize: 12,
            }} formatter={(val: number) => [`${val} poin`, 'Rata-rata']}/>
                    <Bar dataKey="score" name="Skor Rata-rata" radius={[6, 6, 0, 0]}>
                      {localAspectAverages.map((item) => (<Cell key={item.name} fill={item.color}/>))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              
              <div style={{
                marginTop: '14px',
                padding: '12px',
                background: 'var(--sf-2)',
                border: '1px solid var(--bd)',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
            }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>
                  Pedoman Pembacaan Kondisi Lokal:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '11px' }}>
                  {localAspectAverages.map((item) => (<div key={item.name} style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: item.color }}>
                        {item.full}: {item.score} poin
                      </span>
                      <span className="muted">{item.desc}</span>
                    </div>))}
                </div>
              </div>
            </Card>

            <Card title="Statistik Keaktifan Komunikasi Lokal" subtitle="Tingkat interaksi forum dari catatan kabel sosiogram observer.">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ padding: '12px', background: 'var(--sf-2)', borderRadius: '10px', border: '1px solid var(--bd)' }}>
                  <span className="small muted">Interaksi ke Pemateri</span>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: RELI_META[0].color, marginTop: '4px' }}>
                    {classStats.toSpeakerInteractions}
                  </div>
                  <span className="small muted">Tanya-jawab kritis di forum</span>
                </div>
                <div style={{ padding: '12px', background: 'var(--sf-2)', borderRadius: '10px', border: '1px solid var(--bd)' }}>
                  <span className="small muted">Interaksi Antarpeserta</span>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: RELI_META[2].color, marginTop: '4px' }}>
                    {classStats.peerInteractions}
                  </div>
                  <span className="small muted">Dinamika diskusi kelompok</span>
                </div>
              </div>

              <div className="chart-box">
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={classStats.sessionTrends} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }}/>
                    <YAxis tick={{ fontSize: 11 }}/>
                    <Tooltip contentStyle={{
                background: 'var(--sf)',
                border: '1px solid var(--bd)',
                borderRadius: 10,
                fontSize: 12,
            }}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                    <Bar dataKey="toSpeaker" name="Ke Pemateri" fill={RELI_META[0].color} stackId="a" radius={[0, 0, 0, 0]}/>
                    <Bar dataKey="peer" name="Antarpeserta" fill={RELI_META[2].color} stackId="a" radius={[4, 4, 0, 0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card title="Tren Rata-Rata Nilai per Pertemuan" subtitle="Perkembangan kualitas forum sesi ke sesi.">
            {sessionRows.length ? (<div className="chart-box">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={sessionRows} margin={{ top: 10, right: 20, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)"/>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }}/>
                    <YAxis tick={{ fontSize: 11 }}/>
                    <Tooltip contentStyle={{
                    background: 'var(--sf)',
                    border: '1px solid var(--bd)',
                    borderRadius: 10,
                    fontSize: 12,
                }} formatter={(val: number) => [`${val} poin`, 'Rata-rata RELI']}/>
                    <Legend wrapperStyle={{ fontSize: 12 }}/>
                    <Line type="monotone" dataKey="average" name="Rata-rata Nilai Pertemuan" stroke="var(--navy)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>) : (<Empty>Belum ada pertemuan yang dinilai.</Empty>)}
          </Card>
        </div>)}

      
      
      
      {activeTab === 'tracking' && (<div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '13px' }}>Pilih Peserta untuk Ditracking:</span>
                <Select value={selectedParticipantId} onChange={(e) => setSelectedParticipantId(e.target.value)} style={{ minWidth: '220px', fontWeight: 600 }}>
                  {viewParticipants.map((p) => {
                const row = participantRows.find((r) => r.id === p.id);
                return (<option key={p.id} value={p.id}>
                        {p.name} {row ? `(${row.total.toFixed(1)} poin)` : '(Belum dinilai)'}
                      </option>);
            })}
                </Select>
              </div>

              {selectedParticipant && (<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Badge tone="badge-blue">{localLabel(selectedParticipant.localId)}</Badge>
                  <Button size="sm" variant="primary" disabled={busyRaporPdf} onClick={async () => {
                    setBusyRaporPdf(true);
                    try {
                        const scoped = viewSessions.filter((s) => (!progressStart || s.date >= progressStart) &&
                            (!progressEnd || s.date <= progressEnd));
                        await downloadParticipantReportPdf({
                            participant: selectedParticipant,
                            sessions: scoped,
                            speakers,
                            meta,
                        });
                        notify(`Rapor PDF ${selectedParticipant.name} berhasil diunduh.`);
                    }
                    catch (err) {
                        const msg = err instanceof Error ? err.message : 'Gagal membuat PDF rapor';
                        setError(msg);
                        notify(msg, 'error');
                    }
                    finally {
                        setBusyRaporPdf(false);
                    }
                }}>
                    {busyRaporPdf ? 'Membuat Rapor…' : 'Unduh Rapor PDF'}
                  </Button>
                  <Link to={`/peserta/${selectedParticipant.id}`} className="btn btn-ghost btn-sm">
                    Buka Profil Lengkap →
                  </Link>
                </div>)}
            </div>
          </Card>

          {selectedParticipant ? (<>
              <Card title="Filter tanggal perkembangan" subtitle="Lihat perkembangan peserta hari demi hari.">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}>
                  <Field label="Dari tanggal">
                    <Input type="date" value={progressStart} onChange={(e) => setProgressStart(e.target.value)}/>
                  </Field>
                  <Field label="Sampai tanggal">
                    <Input type="date" value={progressEnd} onChange={(e) => setProgressEnd(e.target.value)}/>
                  </Field>
                  <Button variant="ghost" onClick={() => { setProgressStart(''); setProgressEnd(''); }}>
                    Semua tanggal
                  </Button>
                </div>
              </Card>

              
              <div className="kpi-grid">
                <Stat label="Total Nilai RELI" value={selectedParticipantRow ? selectedParticipantRow.total.toFixed(1) : '0.0'} hint={`Rata-rata lokal: ${localOverallScoreAverage.toFixed(1)}`}/>
                <Stat label="Pertemuan Dinilai" value={selectedParticipantRow?.scored || 0} hint={`Dari ${viewSessions.length} sesi pertemuan`}/>
                <Stat label="Interaksi Komunikasi" value={selectedParticipantInsight?.totalInteractions || 0} hint={`${selectedParticipantInsight?.toSpeakerInteractions || 0} ke pemateri`}/>
                <Stat label="Status Dinamika" value={selectedParticipantInsight?.styleLabel || 'Stabil'} hint="Observasi sosiogram"/>
              </div>

              
              <Card title={`Grafik Perkembangan Pribadi: ${selectedParticipant.name}`} subtitle="Grafik kolom vertikal dari bawah ke atas per pertemuan, dilengkapi garis benchmark Rata-rata Lokal.">
                {participantProgressionData.length ? (<div className="chart-box">
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={participantProgressionData} margin={{ top: 20, right: 20, left: -10, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false}/>
                        <XAxis dataKey="sessionLabel" tick={{ fontSize: 11, fontWeight: 600 }}/>
                        <YAxis domain={[0, 'dataMax + 6']} tick={{ fontSize: 11 }}/>
                        <Tooltip contentStyle={{
                        background: 'var(--sf)',
                        border: '1px solid var(--bd)',
                        borderRadius: 10,
                        fontSize: 12,
                    }} formatter={(val: number, name: string) => [`${val} poin`, name]} labelFormatter={(label: string, payload) => {
                        const item = payload?.[0]?.payload;
                        return `${label} · ${item?.topic || ''} (${item?.dateLabel || ''})`;
                    }}/>
                        <Legend wrapperStyle={{ fontSize: 11 }}/>
                        <Bar dataKey="R" name="Respon" fill={RELI_META[0].color} stackId="reli"/>
                        <Bar dataKey="E" name="Emosi" fill={RELI_META[1].color} stackId="reli"/>
                        <Bar dataKey="L" name="Logika" fill={RELI_META[2].color} stackId="reli"/>
                        <Bar dataKey="I" name="Integritas" fill={RELI_META[3].color} stackId="reli" radius={[6, 6, 0, 0]}/>
                        <ReferenceLine y={localOverallScoreAverage / Math.max(1, viewSessions.length)} stroke="var(--dg)" strokeDasharray="4 4" label={{
                        value: 'Rata-rata Sesi Lokal',
                        position: 'right',
                        fontSize: 10,
                        fill: 'var(--dg)',
                    }}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>) : (<Empty>Belum ada data perkembangan sesi untuk peserta ini.</Empty>)}
              </Card>

              <Card title={`Performa Harian: ${selectedParticipant.name}`} subtitle="Empat aspek RELI (sumbu kiri 0–10) dan total (sumbu kanan 0–40) per tanggal, dengan benchmark rata-rata lokal.">
                {participantDailyPerformanceData.length ? (<>
                    <div className="chart-toggle-bar" role="group" aria-label="Pilih seri grafik">
                      {DAILY_SERIES.map((item) => {
                        const hidden = hiddenDailySeries.includes(item.key);
                        return (<button key={item.key} type="button" className={hidden ? 'chart-toggle off' : 'chart-toggle'} aria-pressed={!hidden} onClick={() => setHiddenDailySeries((current) => current.includes(item.key)
                                ? current.filter((key) => key !== item.key)
                                : [...current, item.key])}>
                            <i style={{ background: item.color }}/>
                            {item.name}
                          </button>);
                    })}
                    </div>
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height={340}>
                        <LineChart data={participantDailyPerformanceData} margin={{ top: 20, right: 18, left: -8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)"/>
                          <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fontWeight: 600 }}/>
                          <YAxis yAxisId="indicator" domain={[0, 10]} tick={{ fontSize: 11 }} label={{
                        value: 'Aspek RELI',
                        angle: -90,
                        position: 'insideLeft',
                        fontSize: 10,
                        fill: 'var(--mu)',
                    }}/>
                          <YAxis yAxisId="total" orientation="right" domain={[0, 40]} tick={{ fontSize: 11 }} label={{
                        value: 'Total',
                        angle: 90,
                        position: 'insideRight',
                        fontSize: 10,
                        fill: 'var(--mu)',
                    }}/>
                          <Tooltip contentStyle={{
                        background: 'var(--sf)',
                        border: '1px solid var(--bd)',
                        borderRadius: 10,
                        fontSize: 12,
                    }} formatter={(value: number, name: string) => [
                        Number(value).toFixed(1),
                        name,
                    ]} labelFormatter={(label: string, payload) => {
                        const item = payload?.[0]?.payload;
                        return `${label} · ${item?.topic || ''}`;
                    }}/>
                          {DAILY_SERIES.map((item) => (<Line key={item.key} type="monotone" dataKey={item.key} name={item.name} yAxisId={item.axis} stroke={item.color} strokeWidth={item.key === 'Total' ? 3 : 2} strokeDasharray={item.dashed ? '5 4' : undefined} dot={{ r: 2.5 }} activeDot={{ r: 5 }} hide={hiddenDailySeries.includes(item.key)} connectNulls/>))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>) : (<Empty>Belum ada data nilai harian untuk peserta ini.</Empty>)}
              </Card>

              
              <div className="grid grid-2">
                <Card title={`Catatan Perkembangan dari Observer (${selectedParticipant.name})`} subtitle="Catatan khusus yang ditulis observer pada saat pengamatan sosiogram sesi per sesi.">
                  {selectedParticipantInsight?.sessionBreakdown.some((s) => s.observerNote) ? (<div className="timeline-list">
                      {selectedParticipantInsight.sessionBreakdown
                        .filter((s) => s.observerNote)
                        .map((s) => (<div key={s.sessionId} className="timeline-item">
                            <div className="timeline-badge">
                              <Badge tone="badge-blue">{fmtDate(s.date, { day: 'numeric', month: 'short' })}</Badge>
                            </div>
                            <div className="timeline-content">
                              <div className="timeline-topic">{s.topic}</div>
                              <div className="small muted" style={{ marginBottom: '4px' }}>
                                Pemateri: {s.speakers.join(', ') || '—'}
                              </div>
                              <div className="timeline-note">{s.observerNote}</div>
                            </div>
                          </div>))}
                    </div>) : (<Empty>
                      Belum ada catatan khusus observer untuk peserta ini. Observer dapat menambahkan catatan langsung dari sosiogram saat sesi berlangsung.
                    </Empty>)}
                </Card>

                <Card title="Insight Frekuensi Komunikasi Pribadi" subtitle="Karakteristik keaktifan komunikasi dan respon peserta terhadap pemateri/topik.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="insight-recommendation">
                      <strong>Gaya Komunikasi:</strong> {selectedParticipantInsight?.styleLabel}
                      <p style={{ marginTop: '4px', fontSize: '12px' }}>
                        {selectedParticipantInsight?.styleDescription}
                      </p>
                    </div>

                    <div className="insight-metrics">
                      <div className="insight-metric-tag">
                        <small>Materi Teraktif</small>
                        <strong>{selectedParticipantInsight?.topTopic?.topic || '—'}</strong>
                      </div>
                      <div className="insight-metric-tag">
                        <small>Frekuensi Topik</small>
                        <strong>{selectedParticipantInsight?.topTopic?.count || 0} interaksi</strong>
                      </div>
                      <div className="insight-metric-tag">
                        <small>Pemateri Terresponsif</small>
                        <strong>{selectedParticipantInsight?.topSpeaker?.speakerName || '—'}</strong>
                      </div>
                    </div>

                    <div style={{ padding: '12px', background: 'var(--sf-2)', borderRadius: '10px', border: '1px solid var(--bd)' }}>
                      <strong>Rekomendasi Potensi untuk Tim:</strong>
                      <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--tx)' }}>
                        {selectedParticipantInsight?.potentialRecommendation}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </>) : (<Empty>Pilih peserta untuk menampilkan grafik tracking perkembangan pribadinya.</Empty>)}
        </div>)}

      
      
      
      {activeTab === 'insights' && (<div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="grid grid-3">
            <Card title="Topik Paling Interaktif" subtitle="Materi dengan frekuensi diskusi tertinggi">
              <div style={{ fontSize: '18px', fontWeight: 800, color: RELI_META[0].color, marginBottom: '4px' }}>
                {classStats.topTopic?.topic || 'Belum ada'}
              </div>
              <span className="small muted">
                Total {classStats.topTopic?.count || 0} interaksi tercatat sepanjang pelatihan.
              </span>
            </Card>

            <Card title="Pemateri Paling Memantik Diskusi" subtitle="Pemateri dengan interaksi langsung tertinggi">
              <div style={{ fontSize: '18px', fontWeight: 800, color: RELI_META[2].color, marginBottom: '4px' }}>
                {classStats.topSpeaker?.speakerName || 'Belum ada'}
              </div>
              <span className="small muted">
                Memicu antusiasme peserta untuk berdialog dan bertanya kritis.
              </span>
            </Card>

            <Card title="Keterlibatan Kelas" subtitle="Rasio peserta yang aktif berkomunikasi">
              <div style={{ fontSize: '18px', fontWeight: 800, color: RELI_META[1].color, marginBottom: '4px' }}>
                {classStats.participationRate}% Aktif
              </div>
              <span className="small muted">
                {classStats.activeParticipantsCount} dari {viewParticipants.length} peserta terlibat interaksi kabel.
              </span>
            </Card>
          </div>

          
          <Card title="Insight Komunikasi & Rekomendasi Potensi Peserta" subtitle="Pembacaan tim instruktur dan koordinator untuk memetakan minat materi dan mengembangkan potensi masing-masing peserta." actions={<input type="text" className="input input-sm" placeholder="Cari peserta, materi, gaya..." value={insightSearch} onChange={(e) => setInsightSearch(e.target.value)} style={{ minWidth: '220px' }}/>}>
            {filteredInsights.length ? (<div className="insight-grid">
                {filteredInsights.map((insight) => (<div key={insight.participantId} className="insight-item">
                    <div className="insight-header">
                      <div>
                        <strong style={{ fontSize: '14px' }}>{insight.participantName}</strong>
                        <div className="small muted">
                          Total {insight.totalInteractions} interaksi kabel
                        </div>
                      </div>
                      <Badge tone={insight.communicationStyle === 'kritis_pemateri'
                        ? 'badge-blue'
                        : insight.communicationStyle === 'kolegial_kelompok'
                            ? 'badge-green'
                            : insight.communicationStyle === 'seimbang'
                                ? 'badge-amber'
                                : 'badge-neutral'}>
                        {insight.styleLabel}
                      </Badge>
                    </div>

                    <div className="insight-metrics">
                      <div className="insight-metric-tag">
                        <small>Materi Paling Aktif</small>
                        <strong>{insight.topTopic?.topic || 'Belum terpetakan'}</strong>
                      </div>
                      <div className="insight-metric-tag">
                        <small>Pemateri Favorit</small>
                        <strong>{insight.topSpeaker?.speakerName || '—'}</strong>
                      </div>
                    </div>

                    <div className="insight-body">
                      {insight.styleDescription}
                    </div>

                    <div className="insight-recommendation">
                      <strong>💡 Rekomendasi Potensi:</strong> {insight.potentialRecommendation}
                    </div>

                    {insight.latestObserverNote && (<div style={{
                            fontSize: '11px',
                            color: 'var(--mu)',
                            background: 'var(--sf-2)',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--bd)',
                        }}>
                        <strong>Catatan Observer Terakhir:</strong> &quot;{insight.latestObserverNote}&quot;
                      </div>)}

                    <div style={{ marginTop: 'auto', paddingTop: '6px' }}>
                      <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => {
                        setSelectedParticipantId(insight.participantId);
                        setActiveTab('tracking');
                    }}>
                        Lihat Tracking Pribadi →
                      </button>
                    </div>
                  </div>))}
              </div>) : (<Empty>Tidak ada peserta yang cocok dengan filter pencarian.</Empty>)}
          </Card>
        </div>)}

      
      
      
      {activeTab === 'recap' && (<div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Card title="Rekap Nilai Peserta & Kehadiran">
            {participantRows.length ? (<div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Lokal</th>
                      <th className="num">R</th>
                      <th className="num">E</th>
                      <th className="num">L</th>
                      <th className="num">I</th>
                      <th className="num">Total</th>
                      <th className="num">Sesi Dinilai</th>
                      <th className="num">Hadir</th>
                      <th className="num">Terlambat</th>
                      <th className="num">Izin/Sakit</th>
                      <th className="num">Alpa</th>
                      <th>Catatan Observer</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {participantRows.map((row) => {
                    const obsNotes = observerNotesByParticipant.get(row.id) || [];
                    const latestObs = obsNotes[obsNotes.length - 1];
                    return (<tr key={row.id}>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td>
                          <Badge tone="badge-blue">{localLabel(row.localId)}</Badge>
                        </td>
                        {row.values.map((value, index) => (<td key={index} className="num">
                            {value.toFixed(1)}
                          </td>))}
                        <td className="num">
                          <strong>{row.total.toFixed(1)}</strong>
                        </td>
                        <td className="num">{row.scored}</td>
                        <td className="num">{row.attendance.hadir || 0}</td>
                        <td className="num">{row.attendance.terlambat || 0}</td>
                        <td className="num">{(row.attendance.izin || 0) + (row.attendance.sakit || 0)}</td>
                        <td className="num">{row.attendance.alpa || 0}</td>
                        <td style={{ maxWidth: 260, fontSize: 12 }}>
                          {latestObs ? (<div>
                              <span className="small muted">
                                {fmtDate(latestObs.date, { day: 'numeric', month: 'short' })} · {latestObs.topic}
                              </span>
                              <div>{latestObs.note}</div>
                              {obsNotes.length > 1 && (<Badge tone="badge-neutral">+{obsNotes.length - 1} catatan lain</Badge>)}
                            </div>) : (<span className="muted">—</span>)}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => {
                            setSelectedParticipantId(row.id);
                            setActiveTab('tracking');
                        }}>
                            Tracking
                          </button>
                        </td>
                      </tr>);
                })}
                  </tbody>
                </table>
              </div>) : (<Empty>Belum ada data peserta.</Empty>)}
          </Card>

          <Card title={`Catatan Peserta dari Observer (${recapData.allObserverNotes.length})`} subtitle="Rekap seluruh catatan perkembangan peserta yang dilaporkan observer pada setiap sesi." actions={<input type="text" className="input input-sm" placeholder="Cari peserta, materi, atau catatan…" value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} style={{ minWidth: 230 }}/>}>
            {filteredObserverNotes.length ? (<div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Lokal</th>
                      <th>Peserta</th>
                      <th>Materi Sesi</th>
                      <th>Catatan Observer</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredObserverNotes.map((entry, idx) => (<tr key={`${entry.sessionId}-${entry.participantId}-${idx}`}>
                        <td className="nowrap">{fmtDate(entry.date)}</td>
                        <td>
                          <Badge tone="badge-blue">{localLabel(entry.localId)}</Badge>
                        </td>
                        <td>
                          <strong>{entry.participantName}</strong>
                        </td>
                        <td>{entry.topic}</td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{entry.note}</td>
                        <td className="right">
                          {viewParticipants.some((p) => p.id === entry.participantId) && (<button className="btn btn-ghost btn-sm" onClick={() => {
                            setSelectedParticipantId(entry.participantId);
                            setActiveTab('tracking');
                        }}>
                              Tracking →
                            </button>)}
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>) : (<Empty>
                {noteSearch
                    ? 'Tidak ada catatan observer yang cocok dengan pencarian.'
                    : 'Belum ada catatan peserta yang dilaporkan oleh observer.'}
              </Empty>)}
          </Card>

          <Card title="Monitoring Pemateri & Inlok" subtitle="Jadwal mengajar dan kehadiran pengajar">
            {speakerRows.length ? (<div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Peran</th>
                      <th className="num">Sesi</th>
                      <th className="num">Hadir</th>
                      <th className="num">Terlambat</th>
                      <th className="num">Izin/Sakit</th>
                      <th className="num">Alpa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {speakerRows.map((row) => (<tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.roles || '—'}</td>
                        <td className="num">{row.sessions}</td>
                        <td className="num">{row.attendance.hadir || 0}</td>
                        <td className="num">{row.attendance.terlambat || 0}</td>
                        <td className="num">{(row.attendance.izin || 0) + (row.attendance.sakit || 0)}</td>
                        <td className="num">{row.attendance.alpa || 0}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>) : (<Empty>Belum ada pemateri yang dijadwalkan pada pertemuan.</Empty>)}
          </Card>

          <Card title="Hasil Penilaian Pemateri oleh Observer" subtitle="Rekap lembar penilaian pemateri yang diisi observer." actions={user?.role === 'instruktur_lokal' ? (<Link to="/laporan" className="btn btn-ghost btn-sm">
                  Lihat di Laporan
                </Link>) : (<Link to="/penilaian" className="btn btn-ghost btn-sm">
                  Buka Form Penilaian
                </Link>)}>
            {allAssessments.length ? (<div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Materi</th>
                      <th>Lokal</th>
                      <th>Pemateri</th>
                      <th>Observer</th>
                      <th className="num">Nilai</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allAssessments.map(({ session, assessment }) => (<tr key={assessment.id}>
                        <td className="nowrap">{fmtDate(assessment.date)}</td>
                        <td>{session.topic}</td>
                        <td>
                          <Badge tone="badge-blue">{localLabel(assessment.localId)}</Badge>
                        </td>
                        <td>
                          {speakers.find((speaker) => speaker.id === assessment.speakerId)?.name ||
                        'Pemateri'}
                        </td>
                        <td>{assessment.observerName}</td>
                        <td className="num">
                          <Badge tone={assessmentTone(assessmentOverall(assessment.scores))}>
                            {assessmentOverall(assessment.scores).toFixed(2)}
                          </Badge>
                        </td>
                        <td>
                          <Button size="sm" variant="ghost" onClick={() => void downloadAssessmentPdf({
                        session,
                        assessment,
                        speaker: speakers.find((speaker) => speaker.id === assessment.speakerId),
                        meta,
                    })}>
                            PDF
                          </Button>
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>) : (<Empty>Belum ada penilaian pemateri. Observer dapat mengisinya melalui menu Penilaian.</Empty>)}
          </Card>
        </div>)}
    </div>);
}
