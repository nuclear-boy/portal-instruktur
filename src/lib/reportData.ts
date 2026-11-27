import {
  ASSESSMENT_GROUPS,
  assessmentGroupAverage,
  assessmentOverall,
} from '../../shared/assessment';
import type {
  AttendanceStatus,
  LocalId,
  Participant,
  Session,
  Speaker,
  SpeakerAssessment,
} from '../../shared/types';
import {
  computeCommunicationInsights,
  type ClassCommunicationStats,
  type ParticipantInsight,
} from './communicationInsights';
import { reliPredicate, type ReliPredicate, type ReliValues } from './reli';
import { totalScore } from './utils';

export interface AttendanceSummary {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpa: number;
  izinSakit: number;
  present: number;
  total: number;
  rate: number;
}

export interface ObserverParticipantNote {
  sessionId: string;
  sessionNo?: number;
  date: string;
  topic: string;
  localId: LocalId | null;
  participantId: string;
  participantName: string;
  note: string;
}

export interface RecapParticipantRow {
  id: string;
  name: string;
  localId: LocalId | null;
  origin: string;
  sumValues: ReliValues;
  avgValues: ReliValues;
  totalSum: number;
  totalAvg: number;
  aspectAvg: number;
  predicate: ReliPredicate;
  scoredSessions: number;
  attendance: AttendanceSummary;
  insight?: ParticipantInsight;
  observerNotes: string[];
  observerNoteEntries: ObserverParticipantNote[];
  participantBioNote?: string;
}

export interface RecapSessionRow {
  session: Session;
  plannedMinutes?: number;
  actualMinutes?: number;
  durationDiff?: number;
  present: number;
  totalAttendance: number;
  attendanceRate: number;
  scored: number;
  avgValues: ReliValues;
  avgReliTotal: number;
  avgReliAspect: number;
  assessmentCount: number;
  assessmentAvg?: number;
  speakerNames: string[];
}

export interface SpeakerSummaryRow {
  speakerId: string;
  speakerName: string;
  sessionsCount: number;
  assessmentsCount: number;
  groupAverages: Record<string, number>;
  overallAvg: number;
  notes: string[];
  recommendations: string[];
}

export interface AssessmentDetailRow {
  session: Session;
  assessment: SpeakerAssessment;
  speakerName: string;
  groupAverages: Record<string, number>;
  overall: number;
}

export interface RecapKpis {
  totalSessions: number;
  scoredSessions: number;
  totalParticipants: number;
  scoredParticipants: number;
  avgReliAspect: number;
  avgReliTotal: number;
  aspectAverages: ReliValues;
  attendanceRate: number;
  presentEntries: number;
  totalAttendanceEntries: number;
  totalInteractions: number;
  activeCommParticipants: number;
  participationRate: number;
  assessmentCount: number;
  assessmentAvg: number;
  avgDurationDiff?: number;
  timedSessionsCount: number;
}

export interface RecapReportData {
  kpis: RecapKpis;
  participantRows: RecapParticipantRow[];
  sessionRows: RecapSessionRow[];
  speakerSummaries: SpeakerSummaryRow[];
  assessmentDetails: AssessmentDetailRow[];
  allObserverNotes: ObserverParticipantNote[];
  classStats: ClassCommunicationStats;
}

export interface ParticipantSessionHistoryRow {
  session: Session;
  attendance?: AttendanceStatus;
  values: ReliValues | null;
  total: number | null;
  aspectAvg: number | null;
  predicate: ReliPredicate;
  localAvgTotal: number | null;
  interactions: number;
  toSpeaker: number;
  peer: number;
  speakers: string[];
  observerNote: string;
}

export interface ParticipantReportData {
  participant: Participant;
  localAvgAspect: number;
  localAvgTotal: number;
  sumValues: ReliValues;
  avgValues: ReliValues;
  totalSum: number;
  totalAvg: number;
  aspectAvg: number;
  predicate: ReliPredicate;
  scoredSessions: number;
  attendance: AttendanceSummary;
  history: ParticipantSessionHistoryRow[];
  observerNotes: { session: Session; note: string }[];
  insight?: ParticipantInsight;
}

export function calcMinutesBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
    return undefined;
  }
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : undefined;
}

export function sessionDurationSummary(session: Session): {
  plannedMinutes?: number;
  actualMinutes?: number;
  durationDiff?: number;
} {
  const plannedMinutes =
    session.durationMinutes || calcMinutesBetween(session.startTime, session.endTime);
  const actualMinutes =
    session.actualDurationMinutes ||
    calcMinutesBetween(session.actualStartTime, session.actualEndTime);
  const durationDiff =
    plannedMinutes !== undefined && actualMinutes !== undefined
      ? actualMinutes - plannedMinutes
      : undefined;
  return { plannedMinutes, actualMinutes, durationDiff };
}

export function fmtDurationShort(minutes?: number): string {
  if (!minutes || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} mnt`;
  if (mins === 0) return `${hours} jam`;
  return `${hours}j ${mins}m`;
}

export function fmtDurationDiff(diff?: number): string {
  if (diff === undefined) return '';
  if (diff === 0) return 'tepat waktu';
  return `${diff > 0 ? '+' : ''}${diff} mnt`;
}

export function getParticipantSessionNote(
  session: Session,
  participantId: string,
  participantName?: string,
): string {
  const direct = session.sosiogram?.participantNotes?.[participantId];
  if (direct && direct.trim()) return direct.trim();
  const byIdSeat = session.sosiogram?.seats?.find(
    (seat) => seat.participantId === participantId && seat.note && seat.note.trim(),
  )?.note;
  if (byIdSeat && byIdSeat.trim()) return byIdSeat.trim();
  if (participantName && participantName.trim()) {
    const needle = participantName.trim().toLowerCase();
    const byNameSeat = session.sosiogram?.seats?.find(
      (seat) =>
        !seat.participantId &&
        seat.name.trim().toLowerCase() === needle &&
        seat.note &&
        seat.note.trim(),
    )?.note;
    if (byNameSeat && byNameSeat.trim()) return byNameSeat.trim();
  }
  return '';
}

function emptyAttendance(): AttendanceSummary {
  return {
    hadir: 0,
    terlambat: 0,
    izin: 0,
    sakit: 0,
    alpa: 0,
    izinSakit: 0,
    present: 0,
    total: 0,
    rate: 0,
  };
}

function finalizeAttendance(att: AttendanceSummary): AttendanceSummary {
  att.izinSakit = att.izin + att.sakit;
  att.present = att.hadir + att.terlambat;
  att.total = att.hadir + att.terlambat + att.izin + att.sakit + att.alpa;
  att.rate = att.total ? Math.round((att.present / att.total) * 100) : 0;
  return att;
}

export function buildRecapReportData(
  sessions: Session[],
  participants: Participant[],
  speakers: Speaker[],
): RecapReportData {
  const sortedSessions = [...sessions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.localId || 0) - (b.localId || 0) ||
      (a.no || 0) - (b.no || 0),
  );
  const speakerNameOf = (id: string) =>
    speakers.find((item) => item.id === id)?.name || '(pengajar dihapus)';

  const { participantInsights, classStats } = computeCommunicationInsights(
    sortedSessions,
    participants,
    speakers,
  );
  const insightById = new Map(participantInsights.map((item) => [item.participantId, item]));

  const participantMap = new Map<
    string,
    {
      id: string;
      name: string;
      localId: LocalId | null;
      origin: string;
      sumValues: ReliValues;
      scoredSessions: number;
      attendance: AttendanceSummary;
      observerNoteEntries: ObserverParticipantNote[];
      fallbackNote: string;
    }
  >();

  participants.forEach((participant) => {
    participantMap.set(participant.id, {
      id: participant.id,
      name: participant.name,
      localId: participant.localId ?? null,
      origin: participant.origin || '',
      sumValues: [0, 0, 0, 0],
      scoredSessions: 0,
      attendance: emptyAttendance(),
      observerNoteEntries: [],
      fallbackNote: participant.notes?.trim() || '',
    });
  });

  const allObserverNotes: ObserverParticipantNote[] = [];

  const aspectGlobalSums: ReliValues = [0, 0, 0, 0];
  let aspectGlobalCount = 0;
  let presentEntries = 0;
  let totalAttendanceEntries = 0;
  let durationDiffSum = 0;
  let timedSessionsCount = 0;

  const sessionRows: RecapSessionRow[] = sortedSessions.map((session) => {
    Object.entries(session.scores || {}).forEach(([participantId, score]) => {
      let target = participantMap.get(participantId);
      if (!target) {
        const found = participants.find((item) => item.id === participantId);
        target = {
          id: participantId,
          name: found?.name || '(peserta dihapus)',
          localId: found?.localId ?? session.localId ?? null,
          origin: found?.origin || '',
          sumValues: [0, 0, 0, 0],
          scoredSessions: 0,
          attendance: emptyAttendance(),
          observerNoteEntries: [],
          fallbackNote: found?.notes?.trim() || '',
        };
        participantMap.set(participantId, target);
      }
      target.sumValues[0] += score.r || 0;
      target.sumValues[1] += score.e || 0;
      target.sumValues[2] += score.l || 0;
      target.sumValues[3] += score.i || 0;
      target.scoredSessions += 1;

      aspectGlobalSums[0] += score.r || 0;
      aspectGlobalSums[1] += score.e || 0;
      aspectGlobalSums[2] += score.l || 0;
      aspectGlobalSums[3] += score.i || 0;
      aspectGlobalCount += 1;
    });

    session.attendance.forEach((entry) => {
      const target = participantMap.get(entry.participantId);
      if (target) {
        target.attendance[entry.status] = (target.attendance[entry.status] || 0) + 1;
      }
      totalAttendanceEntries += 1;
      if (entry.status === 'hadir' || entry.status === 'terlambat') presentEntries += 1;
    });

    const matchedNoteParticipantIds = new Set<string>();
    participantMap.forEach((target, participantId) => {
      if (session.localId && target.localId && session.localId !== target.localId) return;
      const note = getParticipantSessionNote(session, participantId, target.name);
      if (note) {
        matchedNoteParticipantIds.add(participantId);
        const entry: ObserverParticipantNote = {
          sessionId: session.id,
          sessionNo: session.no,
          date: session.date,
          topic: session.topic,
          localId: session.localId ?? target.localId ?? null,
          participantId,
          participantName: target.name,
          note,
        };
        target.observerNoteEntries.push(entry);
        allObserverNotes.push(entry);
      }
    });

    // Also include notes written directly on unlinked named seats
    (session.sosiogram?.seats || []).forEach((seat) => {
      const note = seat.note?.trim();
      if (!note) return;
      if (seat.participantId && matchedNoteParticipantIds.has(seat.participantId)) return;
      const seatName = seat.name.trim();
      if (!seatName) return;
      const alreadyByName = [...participantMap.values()].some(
        (target) =>
          matchedNoteParticipantIds.has(target.id) &&
          target.name.trim().toLowerCase() === seatName.toLowerCase(),
      );
      if (alreadyByName) return;
      allObserverNotes.push({
        sessionId: session.id,
        sessionNo: session.no,
        date: session.date,
        topic: session.topic,
        localId: session.localId ?? null,
        participantId: seat.participantId || `seat:${seat.id}`,
        participantName: seatName,
        note,
      });
    });

    const scoresList = Object.values(session.scores || {});
    const scored = scoresList.length;
    const avgValues: ReliValues = scored
      ? [
          scoresList.reduce((sum, s) => sum + (s.r || 0), 0) / scored,
          scoresList.reduce((sum, s) => sum + (s.e || 0), 0) / scored,
          scoresList.reduce((sum, s) => sum + (s.l || 0), 0) / scored,
          scoresList.reduce((sum, s) => sum + (s.i || 0), 0) / scored,
        ]
      : [0, 0, 0, 0];
    const avgReliTotal = avgValues[0] + avgValues[1] + avgValues[2] + avgValues[3];
    const avgReliAspect = avgReliTotal / 4;

    const present = session.attendance.filter(
      (item) => item.status === 'hadir' || item.status === 'terlambat',
    ).length;
    const totalAttendance = session.attendance.length;
    const attendanceRate = totalAttendance ? Math.round((present / totalAttendance) * 100) : 0;

    const { plannedMinutes, actualMinutes, durationDiff } = sessionDurationSummary(session);
    if (durationDiff !== undefined) {
      durationDiffSum += durationDiff;
      timedSessionsCount += 1;
    }

    const sessionAssessments = session.assessments || [];
    const assessmentAvg = sessionAssessments.length
      ? sessionAssessments.reduce((sum, item) => sum + assessmentOverall(item.scores), 0) /
        sessionAssessments.length
      : undefined;

    const speakerNames = session.speakers
      .filter((item) => item.role === 'pemateri')
      .map((item) => speakerNameOf(item.speakerId));

    return {
      session,
      plannedMinutes,
      actualMinutes,
      durationDiff,
      present,
      totalAttendance,
      attendanceRate,
      scored,
      avgValues,
      avgReliTotal,
      avgReliAspect,
      assessmentCount: sessionAssessments.length,
      assessmentAvg,
      speakerNames,
    };
  });

  const participantRows: RecapParticipantRow[] = [...participantMap.values()]
    .map((entry) => {
      const attendance = finalizeAttendance(entry.attendance);
      const totalSum =
        entry.sumValues[0] + entry.sumValues[1] + entry.sumValues[2] + entry.sumValues[3];
      const avgValues: ReliValues = entry.scoredSessions
        ? [
            entry.sumValues[0] / entry.scoredSessions,
            entry.sumValues[1] / entry.scoredSessions,
            entry.sumValues[2] / entry.scoredSessions,
            entry.sumValues[3] / entry.scoredSessions,
          ]
        : [0, 0, 0, 0];
      const totalAvg = entry.scoredSessions ? totalSum / entry.scoredSessions : 0;
      const aspectAvg = totalAvg / 4;
      const observerNotes = entry.observerNoteEntries.map((item) => item.note);

      return {
        id: entry.id,
        name: entry.name,
        localId: entry.localId,
        origin: entry.origin,
        sumValues: entry.sumValues,
        avgValues,
        totalSum,
        totalAvg,
        aspectAvg,
        predicate: reliPredicate(aspectAvg, entry.scoredSessions),
        scoredSessions: entry.scoredSessions,
        attendance,
        insight: insightById.get(entry.id),
        observerNotes,
        observerNoteEntries: entry.observerNoteEntries,
        participantBioNote: entry.fallbackNote || undefined,
      };
    })
    .filter(
      (row) =>
        row.scoredSessions > 0 ||
        row.attendance.total > 0 ||
        row.observerNoteEntries.length > 0,
    )
    .sort(
      (a, b) =>
        b.aspectAvg - a.aspectAvg ||
        b.totalSum - a.totalSum ||
        a.name.localeCompare(b.name, 'id'),
    );

  const assessmentDetails: AssessmentDetailRow[] = sortedSessions
    .flatMap((session) =>
      (session.assessments || []).map((assessment) => {
        const groupAverages = Object.fromEntries(
          ASSESSMENT_GROUPS.map((group) => [
            group.key,
            assessmentGroupAverage(assessment.scores, group),
          ]),
        );
        return {
          session,
          assessment,
          speakerName: speakerNameOf(assessment.speakerId),
          groupAverages,
          overall: assessmentOverall(assessment.scores),
        };
      }),
    )
    .sort(
      (a, b) =>
        a.assessment.date.localeCompare(b.assessment.date) ||
        a.session.topic.localeCompare(b.session.topic, 'id'),
    );

  const speakerAcc = new Map<
    string,
    {
      speakerId: string;
      speakerName: string;
      sessionIds: Set<string>;
      assessments: AssessmentDetailRow[];
    }
  >();

  sortedSessions.forEach((session) => {
    session.speakers
      .filter((item) => item.role === 'pemateri')
      .forEach((item) => {
        const current = speakerAcc.get(item.speakerId) || {
          speakerId: item.speakerId,
          speakerName: speakerNameOf(item.speakerId),
          sessionIds: new Set<string>(),
          assessments: [],
        };
        current.sessionIds.add(session.id);
        speakerAcc.set(item.speakerId, current);
      });
  });

  assessmentDetails.forEach((detail) => {
    const current = speakerAcc.get(detail.assessment.speakerId) || {
      speakerId: detail.assessment.speakerId,
      speakerName: detail.speakerName,
      sessionIds: new Set<string>(),
      assessments: [],
    };
    current.sessionIds.add(detail.session.id);
    current.assessments.push(detail);
    speakerAcc.set(detail.assessment.speakerId, current);
  });

  const speakerSummaries: SpeakerSummaryRow[] = [...speakerAcc.values()]
    .filter((entry) => entry.assessments.length > 0)
    .map((entry) => {
      const count = entry.assessments.length;
      const groupAverages = Object.fromEntries(
        ASSESSMENT_GROUPS.map((group) => [
          group.key,
          entry.assessments.reduce((sum, item) => sum + (item.groupAverages[group.key] || 0), 0) /
            count,
        ]),
      );
      const overallAvg =
        entry.assessments.reduce((sum, item) => sum + item.overall, 0) / count;
      return {
        speakerId: entry.speakerId,
        speakerName: entry.speakerName,
        sessionsCount: entry.sessionIds.size,
        assessmentsCount: count,
        groupAverages,
        overallAvg,
        notes: entry.assessments
          .map((item) => item.assessment.generalNotes?.trim())
          .filter(Boolean) as string[],
        recommendations: entry.assessments
          .map((item) => item.assessment.recommendations?.trim())
          .filter(Boolean) as string[],
      };
    })
    .sort((a, b) => b.overallAvg - a.overallAvg || a.speakerName.localeCompare(b.speakerName, 'id'));

  const aspectAverages: ReliValues = aspectGlobalCount
    ? [
        aspectGlobalSums[0] / aspectGlobalCount,
        aspectGlobalSums[1] / aspectGlobalCount,
        aspectGlobalSums[2] / aspectGlobalCount,
        aspectGlobalSums[3] / aspectGlobalCount,
      ]
    : [0, 0, 0, 0];
  const avgReliTotal =
    aspectAverages[0] + aspectAverages[1] + aspectAverages[2] + aspectAverages[3];
  const avgReliAspect = avgReliTotal / 4;

  const assessmentAvg = assessmentDetails.length
    ? assessmentDetails.reduce((sum, item) => sum + item.overall, 0) / assessmentDetails.length
    : 0;

  const kpis: RecapKpis = {
    totalSessions: sortedSessions.length,
    scoredSessions: sortedSessions.filter((s) => Object.keys(s.scores || {}).length > 0).length,
    totalParticipants: participants.length,
    scoredParticipants: participantRows.filter((row) => row.scoredSessions > 0).length,
    avgReliAspect,
    avgReliTotal,
    aspectAverages,
    attendanceRate: totalAttendanceEntries
      ? Math.round((presentEntries / totalAttendanceEntries) * 100)
      : 0,
    presentEntries,
    totalAttendanceEntries,
    totalInteractions: classStats.totalInteractions,
    activeCommParticipants: classStats.activeParticipantsCount,
    participationRate: classStats.participationRate,
    assessmentCount: assessmentDetails.length,
    assessmentAvg,
    avgDurationDiff: timedSessionsCount
      ? Math.round(durationDiffSum / timedSessionsCount)
      : undefined,
    timedSessionsCount,
  };

  return {
    kpis,
    participantRows,
    sessionRows,
    speakerSummaries,
    assessmentDetails,
    allObserverNotes,
    classStats,
  };
}

export function buildParticipantReportData(
  participant: Participant,
  sessions: Session[],
  speakers: Speaker[],
): ParticipantReportData {
  const localSessions = sessions
    .filter((session) => !participant.localId || session.localId === participant.localId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.no || 0) - (b.no || 0));

  const speakerNameOf = (id: string) =>
    speakers.find((item) => item.id === id)?.name || 'Pemateri';

  const { participantInsights } = computeCommunicationInsights(
    localSessions,
    [participant],
    speakers,
  );
  const insight = participantInsights[0];
  const breakdownBySession = new Map(
    (insight?.sessionBreakdown || []).map((item) => [item.sessionId, item]),
  );

  const sumValues: ReliValues = [0, 0, 0, 0];
  let scoredSessions = 0;
  const attendance = emptyAttendance();
  const observerNotes: { session: Session; note: string }[] = [];

  let localTotalSum = 0;
  let localScoreCount = 0;

  const history: ParticipantSessionHistoryRow[] = localSessions
    .filter(
      (session) =>
        Boolean(session.scores?.[participant.id]) ||
        session.attendance.some((entry) => entry.participantId === participant.id) ||
        Boolean(getParticipantSessionNote(session, participant.id, participant.name)),
    )
    .map((session) => {
      const score = session.scores?.[participant.id];
      const attEntry = session.attendance.find((entry) => entry.participantId === participant.id);
      if (attEntry) {
        attendance[attEntry.status] = (attendance[attEntry.status] || 0) + 1;
      }

      const values: ReliValues | null = score ? [score.r, score.e, score.l, score.i] : null;
      const total = score ? totalScore(score) : null;
      const aspectAvg = total !== null ? total / 4 : null;

      if (values) {
        sumValues[0] += values[0];
        sumValues[1] += values[1];
        sumValues[2] += values[2];
        sumValues[3] += values[3];
        scoredSessions += 1;
      }

      const allLocalScores = Object.values(session.scores || {});
      const localAvgTotal = allLocalScores.length
        ? allLocalScores.reduce((sum, item) => sum + totalScore(item), 0) / allLocalScores.length
        : null;
      if (allLocalScores.length) {
        allLocalScores.forEach((item) => {
          localTotalSum += totalScore(item);
          localScoreCount += 1;
        });
      }

      const note = getParticipantSessionNote(session, participant.id, participant.name);
      if (note) observerNotes.push({ session, note });

      const comm = breakdownBySession.get(session.id);

      return {
        session,
        attendance: attEntry?.status,
        values,
        total,
        aspectAvg,
        predicate: reliPredicate(aspectAvg ?? 0, values ? 1 : 0),
        localAvgTotal,
        interactions: comm?.interactionCount || 0,
        toSpeaker: comm?.toSpeakerCount || 0,
        peer: comm?.peerCount || 0,
        speakers: session.speakers
          .filter((item) => item.role === 'pemateri')
          .map((item) => speakerNameOf(item.speakerId)),
        observerNote: note,
      };
    });

  finalizeAttendance(attendance);

  const totalSum = sumValues[0] + sumValues[1] + sumValues[2] + sumValues[3];
  const avgValues: ReliValues = scoredSessions
    ? [
        sumValues[0] / scoredSessions,
        sumValues[1] / scoredSessions,
        sumValues[2] / scoredSessions,
        sumValues[3] / scoredSessions,
      ]
    : [0, 0, 0, 0];
  const totalAvg = scoredSessions ? totalSum / scoredSessions : 0;
  const aspectAvg = totalAvg / 4;
  const localAvgTotal = localScoreCount ? localTotalSum / localScoreCount : 0;
  const localAvgAspect = localAvgTotal / 4;

  return {
    participant,
    localAvgAspect,
    localAvgTotal,
    sumValues,
    avgValues,
    totalSum,
    totalAvg,
    aspectAvg,
    predicate: reliPredicate(aspectAvg, scoredSessions),
    scoredSessions,
    attendance,
    history,
    observerNotes,
    insight,
  };
}
