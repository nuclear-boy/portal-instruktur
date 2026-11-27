import type { Participant, Session, Speaker } from '../../shared/types';
import { fmtDate } from './utils';
export interface ParticipantInsight {
    participantId: string;
    participantName: string;
    totalInteractions: number;
    toSpeakerInteractions: number;
    peerInteractions: number;
    topTopic?: {
        topic: string;
        count: number;
    };
    topSpeaker?: {
        speakerName: string;
        count: number;
    };
    communicationStyle: 'kritis_pemateri' | 'kolegial_kelompok' | 'seimbang' | 'pasif';
    styleLabel: string;
    styleDescription: string;
    potentialRecommendation: string;
    notesCount: number;
    latestObserverNote?: string;
    sessionBreakdown: {
        sessionId: string;
        date: string;
        topic: string;
        speakers: string[];
        interactionCount: number;
        toSpeakerCount: number;
        peerCount: number;
        observerNote?: string;
    }[];
}
export interface ClassCommunicationStats {
    totalInteractions: number;
    toSpeakerInteractions: number;
    peerInteractions: number;
    activeParticipantsCount: number;
    participationRate: number;
    topTopic?: {
        topic: string;
        count: number;
    };
    topSpeaker?: {
        speakerName: string;
        count: number;
    };
    sessionTrends: {
        sessionId: string;
        label: string;
        topic: string;
        total: number;
        toSpeaker: number;
        peer: number;
    }[];
}
export function computeCommunicationInsights(sessions: Session[], participants: Participant[], speakers: Speaker[]): {
    participantInsights: ParticipantInsight[];
    classStats: ClassCommunicationStats;
} {
    const speakerNameMap = new Map<string, string>();
    speakers.forEach((s) => speakerNameMap.set(s.id, s.name));
    const participantMap = new Map<string, Participant>();
    participants.forEach((p) => participantMap.set(p.id, p));
    let totalClassInteractions = 0;
    let totalToSpeaker = 0;
    let totalPeer = 0;
    const activeParticipantSet = new Set<string>();
    const topicTotalMap: Record<string, number> = {};
    const speakerTotalMap: Record<string, number> = {};
    const sessionTrends = sessions.map((session) => {
        let sessionTotal = 0;
        let sessionToSpeaker = 0;
        let sessionPeer = 0;
        const boxIds = new Set(session.sosiogram?.boxes?.map((b) => b.id) || ['b0']);
        const primarySpeaker = session.speakers.find((entry) => entry.role === 'pemateri') || session.speakers[0];
        const primarySpeakerName = primarySpeaker
            ? speakerNameMap.get(primarySpeaker.speakerId) || 'Pemateri'
            : 'Pemateri';
        Object.entries(session.sosiogram?.links || {}).forEach(([key, count]) => {
            const num = Number(count) || 0;
            if (num <= 0)
                return;
            sessionTotal += num;
            totalClassInteractions += num;
            const [from, to] = key.split('>');
            const isBox = boxIds.has(from) || boxIds.has(to);
            if (isBox) {
                sessionToSpeaker += num;
                totalToSpeaker += num;
            }
            else {
                sessionPeer += num;
                totalPeer += num;
            }
            topicTotalMap[session.topic] = (topicTotalMap[session.topic] || 0) + num;
            speakerTotalMap[primarySpeakerName] = (speakerTotalMap[primarySpeakerName] || 0) + num;
        });
        return {
            sessionId: session.id,
            label: fmtDate(session.date, { day: 'numeric', month: 'short' }),
            topic: session.topic,
            total: sessionTotal,
            toSpeaker: sessionToSpeaker,
            peer: sessionPeer,
        };
    });
    const participantInsights: ParticipantInsight[] = participants.map((participant) => {
        let totalInteractions = 0;
        let toSpeakerInteractions = 0;
        let peerInteractions = 0;
        const participantTopicCount: Record<string, number> = {};
        const participantSpeakerCount: Record<string, number> = {};
        const notes: string[] = [];
        const sessionBreakdown = sessions.map((session) => {
            let sessionInteractions = 0;
            let sessionSpeakerInt = 0;
            let sessionPeerInt = 0;
            const seatOfParticipant = session.sosiogram?.seats?.find((s) => s.participantId === participant.id || s.name.trim() === participant.name.trim());
            const participantSeatId = seatOfParticipant?.id;
            const boxIds = new Set(session.sosiogram?.boxes?.map((b) => b.id) || ['b0']);
            const primarySpeaker = session.speakers.find((entry) => entry.role === 'pemateri') || session.speakers[0];
            const primarySpeakerName = primarySpeaker
                ? speakerNameMap.get(primarySpeaker.speakerId) || 'Pemateri'
                : 'Pemateri';
            if (participantSeatId) {
                Object.entries(session.sosiogram?.links || {}).forEach(([key, count]) => {
                    const num = Number(count) || 0;
                    if (num <= 0)
                        return;
                    const [from, to] = key.split('>');
                    if (from === participantSeatId || to === participantSeatId) {
                        sessionInteractions += num;
                        totalInteractions += num;
                        activeParticipantSet.add(participant.id);
                        const isBox = (from === participantSeatId && boxIds.has(to)) ||
                            (to === participantSeatId && boxIds.has(from));
                        if (isBox) {
                            sessionSpeakerInt += num;
                            toSpeakerInteractions += num;
                        }
                        else {
                            sessionPeerInt += num;
                            peerInteractions += num;
                        }
                        participantTopicCount[session.topic] =
                            (participantTopicCount[session.topic] || 0) + num;
                        participantSpeakerCount[primarySpeakerName] =
                            (participantSpeakerCount[primarySpeakerName] || 0) + num;
                    }
                });
            }
            const observerNote = session.sosiogram?.participantNotes?.[participant.id] ||
                seatOfParticipant?.note ||
                '';
            if (observerNote.trim()) {
                notes.push(observerNote.trim());
            }
            const sessionSpeakers = session.speakers
                .map((s) => speakerNameMap.get(s.speakerId) || 'Pemateri')
                .filter(Boolean);
            return {
                sessionId: session.id,
                date: session.date,
                topic: session.topic,
                speakers: sessionSpeakers,
                interactionCount: sessionInteractions,
                toSpeakerCount: sessionSpeakerInt,
                peerCount: sessionPeerInt,
                observerNote: observerNote.trim() || undefined,
            };
        });
        let topTopic: {
            topic: string;
            count: number;
        } | undefined;
        Object.entries(participantTopicCount).forEach(([topic, count]) => {
            if (!topTopic || count > topTopic.count) {
                topTopic = { topic, count };
            }
        });
        let topSpeaker: {
            speakerName: string;
            count: number;
        } | undefined;
        Object.entries(participantSpeakerCount).forEach(([speakerName, count]) => {
            if (!topSpeaker || count > topSpeaker.count) {
                topSpeaker = { speakerName, count };
            }
        });
        let communicationStyle: 'kritis_pemateri' | 'kolegial_kelompok' | 'seimbang' | 'pasif' = 'seimbang';
        let styleLabel = 'Komunikator Seimbang';
        let styleDescription = 'Berkomunikasi secara dinamis dan adaptif, baik saat menanggapi materi pemateri maupun berdiskusi dengan rekan sebaya.';
        if (totalInteractions === 0) {
            communicationStyle = 'pasif';
            styleLabel = 'Perlu Stimulus Interaksi';
            styleDescription =
                'Belum banyak terlibat interaksi kabel dalam forum. Memerlukan dorongan pertanyaan langsung yang suportif dari inlok.';
        }
        else if (toSpeakerInteractions / totalInteractions >= 0.55) {
            communicationStyle = 'kritis_pemateri';
            styleLabel = 'Kritis & Proaktif ke Pemateri';
            styleDescription =
                'Fokus komunikasi dominan terarah langsung ke pemateri. Sangat berani bertanya dan mengonfirmasi pemahaman konsep.';
        }
        else if (peerInteractions / totalInteractions >= 0.65) {
            communicationStyle = 'kolegial_kelompok';
            styleLabel = 'Penggerak Rekan Sebaya';
            styleDescription =
                'Komunikasi dominan cair dengan peserta lain di sekitarnya. Berperan aktif sebagai penghubung dan pemantik diskusi meja.';
        }
        let potentialRecommendation = '';
        const topicName = topTopic?.topic.toLowerCase() || '';
        if (communicationStyle === 'pasif') {
            potentialRecommendation =
                'Rekomendasi tim: Berikan ruang bicara terstruktur dalam kelompok kecil (2-3 orang) sebelum diminta berbicara di forum pleno.';
        }
        else if (topicName.includes('pimpin') || topicName.includes('kepemimpinan')) {
            potentialRecommendation =
                `Paling vokal pada materi "${topTopic?.topic}". Sangat potensial dikembangkan sebagai ketua kelompok atau pemimpin simulasi aksi.`;
        }
        else if (topicName.includes('organisasi') || topicName.includes('manajemen')) {
            potentialRecommendation =
                `Sangat antusias saat topik "${topTopic?.topic}". Memiliki bakat analitis manajerial; cocok diberi tanggung jawab perumusan strategi tim.`;
        }
        else if (topicName.includes('publik') || topicName.includes('bicara') || topicName.includes('advokasi')) {
            potentialRecommendation =
                `Frekuensi bicara tinggi pada materi "${topTopic?.topic}". Potensial sebagai juru bicara, advokator gagasan, atau presentator forum.`;
        }
        else if (topTopic) {
            potentialRecommendation =
                `Menunjukkan responsivitas terbaik pada materi "${topTopic.topic}"${topSpeaker ? ` bersama ${topSpeaker.speakerName}` : ''}. Fasilitasi penugasan yang memperdalam ranah tersebut.`;
        }
        else {
            potentialRecommendation =
                'Potensi interaksi stabil di berbagai sesi. Disarankan terus didampingi untuk peningkatan kematangan emosional dan rujukan logis.';
        }
        return {
            participantId: participant.id,
            participantName: participant.name,
            totalInteractions,
            toSpeakerInteractions,
            peerInteractions,
            topTopic,
            topSpeaker,
            communicationStyle,
            styleLabel,
            styleDescription,
            potentialRecommendation,
            notesCount: notes.length,
            latestObserverNote: notes[notes.length - 1],
            sessionBreakdown,
        };
    });
    let topTopic: {
        topic: string;
        count: number;
    } | undefined;
    Object.entries(topicTotalMap).forEach(([topic, count]) => {
        if (!topTopic || count > topTopic.count)
            topTopic = { topic, count };
    });
    let topSpeaker: {
        speakerName: string;
        count: number;
    } | undefined;
    Object.entries(speakerTotalMap).forEach(([speakerName, count]) => {
        if (!topSpeaker || count > topSpeaker.count)
            topSpeaker = { speakerName, count };
    });
    const participationRate = participants.length
        ? Math.round((activeParticipantSet.size / participants.length) * 100)
        : 0;
    return {
        participantInsights: participantInsights.sort((a, b) => b.totalInteractions - a.totalInteractions),
        classStats: {
            totalInteractions: totalClassInteractions,
            toSpeakerInteractions: totalToSpeaker,
            peerInteractions: totalPeer,
            activeParticipantsCount: activeParticipantSet.size,
            participationRate,
            topTopic,
            topSpeaker,
            sessionTrends,
        },
    };
}
