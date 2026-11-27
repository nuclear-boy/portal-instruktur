import {
  ASSESSMENT_GROUPS,
  ASSESSMENT_ITEMS,
  assessmentGroupAverage,
  assessmentOverall,
  assessmentTone,
} from '../../shared/assessment';
import type { LocalId, Session, Speaker, SpeakerAssessment } from '../../shared/types';

export interface SpeakerSessionEval {
  session: Session;
  assessment: SpeakerAssessment;
  groupAverages: Record<string, number>;
  overall: number;
  forumInteractions: number;
  aspectNotes: { label: string; score: number; note: string }[];
}

export interface SpeakerAnalyticsRow {
  speakerId: string;
  speakerName: string;
  expertise: string;
  sessionsCount: number;
  assessmentsCount: number;
  groupAverages: Record<string, number>;
  itemAverages: Record<string, number>;
  overallAvg: number;
  tone: string;
  totalForumInteractions: number;
  avgForumInteractions: number;
  evaluations: SpeakerSessionEval[];
}

export interface AspectStat {
  key: string;
  label: string;
  groupKey: string;
  groupLabel: string;
  average: number;
}

export interface UnassessedSessionRow {
  session: Session;
  scheduledSpeakers: string[];
}

export interface SpeakerMonitoringData {
  kpis: {
    overallAvg: number;
    totalAssessments: number;
    assessedSpeakersCount: number;
    totalSpeakersCount: number;
    assessedSessionsCount: number;
    totalSessionsCount: number;
    coverageRate: number;
    strongestAspect?: AspectStat;
    weakestAspect?: AspectStat;
    topSpeaker?: SpeakerAnalyticsRow;
  };
  groupStats: { key: string; label: string; average: number; color: string }[];
  aspectStats: AspectStat[];
  speakerRows: SpeakerAnalyticsRow[];
  unassessedSessions: UnassessedSessionRow[];
  allEvaluations: (SpeakerSessionEval & { speakerName: string; localId: LocalId | null })[];
}

const GROUP_COLORS: Record<string, string> = {
  penampilan: '#2f6f62',
  bahasa: '#4a6fa5',
  materi: '#800020',
};

function sessionSpeakerInteractions(session: Session): number {
  const boxIds = new Set((session.sosiogram?.boxes || []).map((b) => b.id));
  if (!boxIds.size) boxIds.add('b0');
  let total = 0;
  Object.entries(session.sosiogram?.links || {}).forEach(([key, count]) => {
    const num = Number(count) || 0;
    if (num <= 0) return;
    const [from, to] = key.split('>');
    if (boxIds.has(from) || boxIds.has(to)) total += num;
  });
  return total;
}

export function computeSpeakerMonitoring(
  sessions: Session[],
  speakers: Speaker[],
): SpeakerMonitoringData {
  const sortedSessions = [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.no || 0) - (b.no || 0),
  );
  const speakerById = new Map(speakers.map((s) => [s.id, s]));
  const speakerNameOf = (id: string) => speakerById.get(id)?.name || '(pemateri dihapus)';

  const itemSums: Record<string, number> = Object.fromEntries(
    ASSESSMENT_ITEMS.map((item) => [item.key, 0]),
  );
  let totalAssessments = 0;

  const accBySpeaker = new Map<
    string,
    {
      speakerId: string;
      sessionIds: Set<string>;
      evaluations: SpeakerSessionEval[];
      totalForumInteractions: number;
    }
  >();

  const ensureAcc = (speakerId: string) => {
    let acc = accBySpeaker.get(speakerId);
    if (!acc) {
      acc = {
        speakerId,
        sessionIds: new Set<string>(),
        evaluations: [],
        totalForumInteractions: 0,
      };
      accBySpeaker.set(speakerId, acc);
    }
    return acc;
  };

  const unassessedSessions: UnassessedSessionRow[] = [];
  const allEvaluations: (SpeakerSessionEval & { speakerName: string; localId: LocalId | null })[] =
    [];
  let assessedSessionsCount = 0;

  sortedSessions.forEach((session) => {
    const forumInteractions = sessionSpeakerInteractions(session);
    const pemateriEntries = session.speakers.filter((s) => s.role === 'pemateri');

    pemateriEntries.forEach((entry) => {
      const acc = ensureAcc(entry.speakerId);
      if (!acc.sessionIds.has(session.id)) {
        acc.sessionIds.add(session.id);
        acc.totalForumInteractions += forumInteractions;
      }
    });

    const assessments = session.assessments || [];
    if (assessments.length > 0) {
      assessedSessionsCount += 1;
    } else {
      unassessedSessions.push({
        session,
        scheduledSpeakers: pemateriEntries.map((entry) => speakerNameOf(entry.speakerId)),
      });
    }

    assessments.forEach((assessment) => {
      totalAssessments += 1;
      ASSESSMENT_ITEMS.forEach((item) => {
        itemSums[item.key] += Number(assessment.scores[item.key]) || 0;
      });

      const groupAverages = Object.fromEntries(
        ASSESSMENT_GROUPS.map((group) => [
          group.key,
          assessmentGroupAverage(assessment.scores, group),
        ]),
      );
      const overall = assessmentOverall(assessment.scores);
      const aspectNotes = ASSESSMENT_ITEMS.filter(
        (item) => assessment.notes?.[item.key] && assessment.notes[item.key].trim(),
      ).map((item) => ({
        label: item.label,
        score: Number(assessment.scores[item.key]) || 0,
        note: assessment.notes[item.key].trim(),
      }));

      const evalItem: SpeakerSessionEval = {
        session,
        assessment,
        groupAverages,
        overall,
        forumInteractions,
        aspectNotes,
      };

      const acc = ensureAcc(assessment.speakerId);
      if (!acc.sessionIds.has(session.id)) {
        acc.sessionIds.add(session.id);
        acc.totalForumInteractions += forumInteractions;
      }
      acc.evaluations.push(evalItem);

      allEvaluations.push({
        ...evalItem,
        speakerName: speakerNameOf(assessment.speakerId),
        localId: session.localId ?? assessment.localId ?? null,
      });
    });
  });

  const groupStats = ASSESSMENT_GROUPS.map((group) => {
    const groupAvg = totalAssessments
      ? group.items.reduce((sum, item) => sum + itemSums[item.key] / totalAssessments, 0) /
        group.items.length
      : 0;
    return {
      key: group.key,
      label: group.label,
      average: Number(groupAvg.toFixed(2)),
      color: GROUP_COLORS[group.key] || '#1d4ed8',
    };
  });

  const aspectStats: AspectStat[] = ASSESSMENT_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      key: item.key,
      label: item.label,
      groupKey: group.key,
      groupLabel: group.label,
      average: totalAssessments ? Number((itemSums[item.key] / totalAssessments).toFixed(2)) : 0,
    })),
  ).sort((a, b) => a.average - b.average);

  const speakerRows: SpeakerAnalyticsRow[] = [...accBySpeaker.values()]
    .filter((acc) => acc.evaluations.length > 0)
    .map((acc) => {
      const sp = speakerById.get(acc.speakerId);
      const count = acc.evaluations.length;
      const groupAverages = Object.fromEntries(
        ASSESSMENT_GROUPS.map((group) => [
          group.key,
          acc.evaluations.reduce((s, e) => s + (e.groupAverages[group.key] || 0), 0) / count,
        ]),
      );
      const itemAverages = Object.fromEntries(
        ASSESSMENT_ITEMS.map((item) => [
          item.key,
          acc.evaluations.reduce(
            (s, e) => s + (Number(e.assessment.scores[item.key]) || 0),
            0,
          ) / count,
        ]),
      );
      const overallAvg = acc.evaluations.reduce((s, e) => s + e.overall, 0) / count;
      const sessionsCount = acc.sessionIds.size;
      const avgForumInteractions = sessionsCount
        ? Number((acc.totalForumInteractions / sessionsCount).toFixed(1))
        : 0;

      return {
        speakerId: acc.speakerId,
        speakerName: speakerNameOf(acc.speakerId),
        expertise: sp?.expertise || '',
        sessionsCount,
        assessmentsCount: count,
        groupAverages,
        itemAverages,
        overallAvg,
        tone: assessmentTone(overallAvg),
        totalForumInteractions: acc.totalForumInteractions,
        avgForumInteractions,
        evaluations: acc.evaluations.sort((a, b) =>
          b.assessment.date.localeCompare(a.assessment.date),
        ),
      };
    })
    .sort((a, b) => b.overallAvg - a.overallAvg || b.assessmentsCount - a.assessmentsCount);

  const overallAvg = totalAssessments
    ? allEvaluations.reduce((s, e) => s + e.overall, 0) / totalAssessments
    : 0;

  const coverageRate = sortedSessions.length
    ? Math.round((assessedSessionsCount / sortedSessions.length) * 100)
    : 0;

  const strongestAspect = totalAssessments ? aspectStats[aspectStats.length - 1] : undefined;
  const weakestAspect = totalAssessments ? aspectStats[0] : undefined;

  allEvaluations.sort(
    (a, b) =>
      b.assessment.date.localeCompare(a.assessment.date) ||
      a.speakerName.localeCompare(b.speakerName, 'id'),
  );

  return {
    kpis: {
      overallAvg,
      totalAssessments,
      assessedSpeakersCount: speakerRows.length,
      totalSpeakersCount: speakers.length,
      assessedSessionsCount,
      totalSessionsCount: sortedSessions.length,
      coverageRate,
      strongestAspect,
      weakestAspect,
      topSpeaker: speakerRows[0],
    },
    groupStats,
    aspectStats,
    speakerRows,
    unassessedSessions,
    allEvaluations,
  };
}
