import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Participant, Session, Seat, SosiogramData, Speaker } from '../../shared/types';
import { CANVAS_W, SEAT_H, SEAT_W, emptySosiogram, layoutSeats, nextBox } from '../../shared/sosiogram';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api';
import { downloadSessionReliPdf } from '../lib/pdf';
import {
  normalizeReliScore,
  parseReliScore,
  RELI_BAR_COLORS_CSS as RELI_COLORS,
  RELI_LABELS,
  RELI_SCORE_MAX,
  RELI_SCORE_MIN,
} from '../lib/reli';
import { buildSessionReport } from '../lib/report';
import { cls, downloadFile, openHtmlWindow, uid } from '../lib/utils';

const WIRE_COLORS = ['#d32f2f', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f'];
const RELI_HINTS = [
  'Tanggap, inisiatif, mampu menjawab pertanyaan.',
  'Menerima kritik, mengendalikan perasaan, empatik.',
  'Ide runtut, berbasis data, logis dan dapat diikuti.',
  'Berorientasi tim, tidak sombong, menjaga kebersamaan.',
];
const LAYOUTS = [
  { value: 'u', label: 'Huruf U' },
  { value: 'dua', label: 'Dua kolom' },
  { value: 'grid', label: 'Grid kelas' },
] as const;

type LayoutKind = (typeof LAYOUTS)[number]['value'];
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function numeric(value: string | number | undefined): number {
  return parseReliScore(value);
}

function normalize(source: SosiogramData | undefined): SosiogramData {
  const base = emptySosiogram();
  if (!source) return base;
  const participantNotes: Record<string, string> = { ...(source.participantNotes || {}) };
  const seats = Array.isArray(source.seats) ? source.seats : [];
  seats.forEach((seat) => {
    if (seat.participantId && seat.note && !participantNotes[seat.participantId]) {
      participantNotes[seat.participantId] = seat.note;
    }
  });
  const scores: Record<string, string[]> = {};
  Object.entries(source.scores || {}).forEach(([seatId, values]) => {
    scores[seatId] = Array.from({ length: 4 }, (_, index) =>
      normalizeReliScore(values[index]),
    );
  });

  return {
    seats,
    boxes: Array.isArray(source.boxes) && source.boxes.length ? source.boxes : base.boxes,
    scores,
    links: source.links && typeof source.links === 'object' ? source.links : {},
    cat: source.cat || '',
    participantNotes,
  };
}

interface ScoreColumnProps {
  values: string[];
  onChange: (values: string[]) => void;
  readOnly: boolean;
}

function ScoreColumns({ values, onChange, readOnly }: ScoreColumnProps) {
  const active = values.some((value) => String(value).trim());
  return (
    <div className={cls('sg-seat-scores', active && 'filled')}>
      {RELI_LABELS.map((label, index) => (
        <label key={label} className="sg-score-col">
          <span className="sg-score-label">{label[0]}</span>
          <input
            type="number"
            className="sg-score-input"
            value={values[index] || ''}
            min={0}
            max={10}
            placeholder="-"
            readOnly={readOnly}
            onChange={(event) => {
              const raw = event.target.value;
              const parsed = Number.parseFloat(raw.replace(',', '.'));
              const next = [...values];
              next[index] = raw;
              if (
                raw.trim() &&
                Number.isFinite(parsed) &&
                (parsed < RELI_SCORE_MIN || parsed > RELI_SCORE_MAX)
              ) {
                next[index] = String(parseReliScore(raw));
              }
              onChange(next);
            }}
            onBlur={() => {
              if (readOnly) return;
              const normalized = normalizeReliScore(values[index]);
              if (normalized === values[index]) return;
              const next = [...values];
              next[index] = normalized;
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

interface SosiogramEditorProps {
  session: Session;
  participants: Participant[];
  speakers: Speaker[];
  onSaved: (session: Session) => void;
}

export function SosiogramEditor({ session, participants, speakers, onSaved }: SosiogramEditorProps) {
  const { user, meta } = useAuth();
  const { notify } = useToast();
  const canEditSosiogram = user?.role === 'observer';
  const canManageLayout = canEditSosiogram;
  const draftKey = `lbt-sg-draft:${session.id}`;
  const [data, setData] = useState<SosiogramData>(() => normalize(session.sosiogram));
  const [mode, setMode] = useState<'select' | 'wire'>('select');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState('Tersimpan');
  const [conflict, setConflict] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [recoverableDraft, setRecoverableDraft] = useState<{
    savedAt: string;
    data: SosiogramData;
  } | null>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { savedAt?: string; data?: SosiogramData };
      if (!parsed?.data || !Array.isArray(parsed.data.seats)) return null;
      return { savedAt: parsed.savedAt || '', data: normalize(parsed.data) };
    } catch {
      return null;
    }
  });
  const [layoutKind, setLayoutKind] = useState<LayoutKind>('u');
  const [seatCount, setSeatCount] = useState(String(session.sosiogram.seats.length || 24));
  const [cols, setCols] = useState('4');
  const [showData, setShowData] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [wire, setWire] = useState<{ from: string; x: number; y: number; color: string } | null>(null);
  const [flashes, setFlashes] = useState<{ id: string; from: string; to: string; color: string }[]>([]);
  const [scale, setScale] = useState(1);
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === 'dark' || localStorage.getItem('lbt-theme') === 'dark',
  );
  const [activeNoteSeat, setActiveNoteSeat] = useState<Seat | null>(null);
  const [activeNote, setActiveNote] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const sessionRef = useRef(session);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const dims = useMemo(() => {
    const maxX = Math.max(CANVAS_W, ...data.seats.map((seat) => seat.x + SEAT_W), ...data.boxes.map((box) => box.x + box.w));
    const maxY = Math.max(420, ...data.seats.map((seat) => seat.y + SEAT_H), ...data.boxes.map((box) => box.y + box.h));
    return { w: maxX + 40, h: maxY + 40 };
  }, [data.seats, data.boxes]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const updateScale = () => {
      const available = Math.max(220, wrap.clientWidth - 2);
      setScale(Math.max(0.3, Math.min(1, available / dims.w)));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(wrap);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [dims.w]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === 'dark');
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  function commit(next: SosiogramData) {
    if (!canEditSosiogram) return;
    dataRef.current = next;
    setData(next);
    setDirty(true);
    dirtyRef.current = true;
    setSaveState('dirty');
    setSaveMessage('Belum tersimpan');
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ savedAt: new Date().toISOString(), data: next }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  function update(mutator: (draft: SosiogramData) => void) {
    if (!canEditSosiogram) return;
    const next = clone(dataRef.current);
    mutator(next);
    commit(next);
  }

  function restoreLocalDraft() {
    if (!recoverableDraft) return;
    commit(recoverableDraft.data);
    setRecoverableDraft(null);
    notify('Draft lokal berhasil dipulihkan. Tekan Simpan untuk mengirim ke server.', 'info');
  }

  function discardLocalDraft() {
    setRecoverableDraft(null);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore
    }
  }

  async function reloadFromServer() {
    try {
      const latest = await api.sessions.get(sessionRef.current.id);
      sessionRef.current = latest.session;
      onSavedRef.current(latest.session);
      const normalized = normalize(latest.session.sosiogram);
      dataRef.current = normalized;
      setData(normalized);
      setDirty(false);
      dirtyRef.current = false;
      setConflict(false);
      setSaveState('saved');
      setSaveMessage('Disinkronkan dari server');
      discardLocalDraft();
      notify('Data sosiogram terbaru berhasil dimuat dari server.', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal memuat ulang sosiogram', 'error');
    }
  }

  function autoLinkSeats() {
    if (!canManageLayout) return;
    const byLower = new Map(participants.map((p) => [p.name.trim().toLowerCase(), p]));
    let linkedCount = 0;
    const alreadyLinked = new Set(
      dataRef.current.seats.map((s) => s.participantId).filter(Boolean),
    );

    update((draft) => {
      draft.seats.forEach((seat) => {
        if (seat.participantId || !seat.name.trim()) return;
        const needle = seat.name.trim().toLowerCase();
        const exact = byLower.get(needle);
        if (exact && !alreadyLinked.has(exact.id)) {
          seat.participantId = exact.id;
          seat.name = exact.name;
          alreadyLinked.add(exact.id);
          linkedCount += 1;
          return;
        }
        const partialMatches = participants.filter(
          (p) => !alreadyLinked.has(p.id) && p.name.trim().toLowerCase().includes(needle),
        );
        if (partialMatches.length === 1) {
          seat.participantId = partialMatches[0].id;
          seat.name = partialMatches[0].name;
          alreadyLinked.add(partialMatches[0].id);
          linkedCount += 1;
        }
      });
    });

    if (linkedCount > 0) {
      notify(`${linkedCount} kursi berhasil ditautkan otomatis ke data peserta.`);
    } else {
      notify('Tidak ada nama kursi yang cocok otomatis dengan peserta tersisa.', 'info');
    }
  }

  async function persist() {
    if (!canEditSosiogram || savingRef.current || !dirtyRef.current) return;
    const snapshot = dataRef.current;
    savingRef.current = true;
    setSaving(true);
    setSaveState('saving');
    setSaveMessage('Menyimpan');
    setConflict(false);

    try {
      const result = await api.sessions.saveSosiogram(
        sessionRef.current.id,
        sessionRef.current.version,
        snapshot,
      );
      sessionRef.current = result.session;
      onSavedRef.current(result.session);
      if (dataRef.current === snapshot) {
        setDirty(false);
        dirtyRef.current = false;
        setSaveState('saved');
        setSaveMessage(
          `Tersimpan ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        );
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // Ignore
        }
      } else {
        setSaveState('dirty');
        setSaveMessage('Ada perubahan baru yang belum tersimpan');
      }
    } catch (error) {
      setSaveState('error');
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        setSaveMessage('Konflik: sosiogram telah diubah pengguna lain. Draft aman tersimpan lokal.');
      } else {
        setSaveMessage(
          error instanceof Error
            ? `${error.message} (draft aman tersimpan di browser)`
            : 'Gagal menyimpan (draft aman tersimpan di browser)',
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      void persist();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [data, dirty]);

  function applyLayout() {
    const next = clone(dataRef.current);
    const count = Math.max(1, Number(seatCount) || next.seats.length || 24);
    const columnCount = Math.max(1, Number(cols) || 4);

    if (next.seats.length > count) {
      const removed = next.seats.slice(count);
      const removedIds = new Set(removed.map((seat) => seat.id));
      if (!window.confirm(`Kurangi ${removed.length} kursi? Nilai dan kabel pada kursi tersebut ikut dihapus.`)) return;
      next.seats = next.seats.slice(0, count);
      removedIds.forEach((id) => {
        delete next.scores[id];
        Object.keys(next.links).forEach((key) => {
          if (key.split('>').includes(id)) delete next.links[key];
        });
      });
    }

    layoutSeats(next, layoutKind, count, columnCount);
    commit(next);
    setSeatCount(String(next.seats.length));
  }

  function addSeat() {
    const next = clone(dataRef.current);
    const maxY = Math.max(0, ...next.seats.map((seat) => seat.y + SEAT_H));
    next.seats.push({ id: uid('s'), name: '', x: 20, y: maxY || 20, m: 0 });
    commit(next);
    setSeatCount(String(next.seats.length));
  }

  function addBox() {
    const next = clone(dataRef.current);
    next.boxes.push(nextBox(next));
    commit(next);
  }

  function removeSeat(id: string) {
    if (!window.confirm('Hapus kursi ini?')) return;
    const next = clone(dataRef.current);
    next.seats = next.seats.filter((seat) => seat.id !== id);
    delete next.scores[id];
    Object.keys(next.links).forEach((key) => {
      if (key.split('>').includes(id)) delete next.links[key];
    });
    commit(next);
    setSeatCount(String(next.seats.length));
  }

  function removeBox(id: string) {
    if (!window.confirm('Hapus kotak ini?')) return;
    const next = clone(dataRef.current);
    next.boxes = next.boxes.filter((box) => box.id !== id);
    Object.keys(next.links).forEach((key) => {
      if (key.split('>').includes(id)) delete next.links[key];
    });
    commit(next);
  }

  function setSeatName(id: string, name: string) {
    update((draft) => {
      const seat = draft.seats.find((item) => item.id === id);
      if (seat) seat.name = name;
    });
  }

  function setSeatParticipant(id: string, participantId: string) {
    update((draft) => {
      const seat = draft.seats.find((item) => item.id === id);
      if (!seat) return;
      seat.participantId = participantId || undefined;
      const participant = participants.find((item) => item.id === participantId);
      if (participant) seat.name = participant.name;
    });
  }

  function setSeatValues(seatId: string, values: string[]) {
    update((draft) => {
      draft.scores[seatId] = values;
    });
  }

  function seatScoreValues(seatId: string): string[] {
    const current = dataRef.current.scores[seatId] || [];
    return Array.from({ length: 4 }, (_, index) => String(current[index] ?? ''));
  }

  function openNoteForSeat(seat: Seat) {
    setActiveNoteSeat(seat);
    setActiveNote(
      seat.note ||
        (seat.participantId ? dataRef.current.participantNotes?.[seat.participantId] : '') ||
        '',
    );
  }

  function saveActiveSeatNote() {
    if (!activeNoteSeat) return;
    const note = activeNote.trim();
    update((draft) => {
      const seat = draft.seats.find((item) => item.id === activeNoteSeat.id);
      if (seat) seat.note = note;
      if (activeNoteSeat.participantId) {
        draft.participantNotes = draft.participantNotes || {};
        draft.participantNotes[activeNoteSeat.participantId] = note;
      }
    });
    setActiveNoteSeat(null);
  }

  function updateParticipantNoteDirect(participantId: string, note: string) {
    update((draft) => {
      draft.participantNotes = draft.participantNotes || {};
      draft.participantNotes[participantId] = note;
      const seat = draft.seats.find((seat) => seat.participantId === participantId);
      if (seat) seat.note = note;
    });
  }

  function resetLinks() {
    if (!window.confirm('Reset semua kabel komunikasi?')) return;
    update((draft) => {
      draft.links = {};
    });
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, id: string, type: 'seat' | 'box') {
    if (!canManageLayout || mode === 'wire' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const item =
      type === 'seat'
        ? dataRef.current.seats.find((seat) => seat.id === id)
        : dataRef.current.boxes.find((box) => box.id === id);
    if (!item) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = item.x;
    const originY = item.y;

    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / scale;
      const dy = (moveEvent.clientY - startY) / scale;
      update((draft) => {
        const target =
          type === 'seat'
            ? draft.seats.find((seat) => seat.id === id)
            : draft.boxes.find((box) => box.id === id);
        if (!target) return;
        target.x = Math.max(0, Math.round((originX + dx) / 10) * 10);
        target.y = Math.max(0, Math.round((originY + dy) / 10) * 10);
      });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function handleBoxResize(event: ReactPointerEvent<HTMLDivElement>, id: string) {
    const element = event.currentTarget;
    if (!element.offsetWidth || !element.offsetHeight) return;
    update((draft) => {
      const box = draft.boxes.find((item) => item.id === id);
      if (box) {
        box.w = element.offsetWidth;
        box.h = element.offsetHeight;
      }
    });
  }

  function centerOf(id: string) {
    const source = dataRef.current;
    const seat = source.seats.find((item) => item.id === id);
    if (seat) return { x: seat.x + SEAT_W / 2, y: seat.y + SEAT_H / 2 };
    const box = source.boxes.find((item) => item.id === id);
    if (box) return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    return { x: 0, y: 0 };
  }

  function toCanvas(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }

  function startWire(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== 'wire' || event.button !== 0) return;
    const target = (event.target as HTMLElement).closest('[data-sg-id]') as HTMLElement | null;
    if (!target) return;
    event.preventDefault();
    const from = target.dataset.sgId;
    if (!from) return;
    const start = centerOf(from);
    const color = WIRE_COLORS[Math.floor(Math.random() * WIRE_COLORS.length)];
    setWire({ from, x: start.x, y: start.y, color });

    const move = (moveEvent: PointerEvent) => {
      const point = toCanvas(moveEvent.clientX, moveEvent.clientY);
      setWire((current) => (current ? { ...current, x: point.x, y: point.y } : current));
    };
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const element = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest('[data-sg-id]') as HTMLElement | null;
      const to = element?.dataset.sgId;
      if (to && to !== from) {
        update((draft) => {
          const key = `${from}>${to}`;
          draft.links[key] = (draft.links[key] || 0) + 1;
        });
        const flash = { id: uid('f'), from, to, color };
        setFlashes((list) => [...list, flash]);
        window.setTimeout(() => {
          setFlashes((list) => list.filter((item) => item.id !== flash.id));
        }, 2200);
      }
      setWire(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function cablePath(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) {
    const handle = Math.min(140, Math.hypot(b.x - a.x, b.y - a.y) / 2);
    return `M${a.x},${a.y} C${a.x},${a.y + handle} ${b.x},${b.y + handle} ${b.x},${b.y}`;
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = next ? 'dark' : '';
    localStorage.setItem('lbt-theme', next ? 'dark' : 'light');
    setDark(next);
  }

  function openData() {
    setJsonText(JSON.stringify(dataRef.current, null, 2));
    setShowData(true);
  }

  function loadData() {
    try {
      const parsed = JSON.parse(jsonText) as SosiogramData;
      if (!Array.isArray(parsed.seats)) throw new Error('Format tidak valid');
      const normalized = normalize(parsed);
      commit(normalized);
      setSeatCount(String(normalized.seats.length));
      setShowData(false);
    } catch {
      window.alert('JSON tidak valid. Pastikan berisi array "seats".');
    }
  }

  function downloadJson() {
    downloadFile(
      `sosiogram-${session.date || session.id}.json`,
      JSON.stringify(dataRef.current, null, 2),
    );
  }

  function saveReport() {
    const html = buildSessionReport(session, dataRef.current, participants, speakers, {
      meta,
      localId: session.localId ?? null,
    });
    openHtmlWindow(html, true);
  }

  async function downloadPdf() {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const currentMeta = meta || (await api.getMeta()).meta;
      await downloadSessionReliPdf({
        session,
        sosiogram: dataRef.current,
        participants,
        speakers,
        meta: currentMeta,
      });
      notify('PDF hasil RELI berhasil dibuat.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat PDF';
      setSaveState('error');
      setSaveMessage(msg);
      notify(msg, 'error');
    } finally {
      setDownloadingPdf(false);
    }
  }

  const people = useMemo(
    () =>
      data.seats
        .filter((seat) => seat.name.trim())
        .map((seat) => ({
          id: seat.id,
          name: seat.name.trim(),
          values: RELI_LABELS.map((_, index) => numeric(data.scores[seat.id]?.[index])),
        }))
        .sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0)),
    [data],
  );

  const indicatorAverages = useMemo(
    () =>
      RELI_LABELS.map((_, index) => {
        if (!people.length) return 0;
        return people.reduce((total, person) => total + person.values[index], 0) / people.length;
      }),
    [people],
  );

  const linkCount = Object.values(data.links).reduce((total, value) => total + (Number(value) || 0), 0);
  const noteCount = Object.values(data.participantNotes || {}).filter((note) => note.trim()).length;

  return (
    <div className="sg">
      <div className="sg-toolbar">
        <div className="sg-toolbar-group">
          <span className="sg-title">Sosiogram</span>
          <Badge tone="badge-blue">{session.topic}</Badge>
          <span className="small muted">{session.date}</span>
        </div>
        <div className="sg-toolbar-group">
          <span className="small muted">{linkCount} kabel</span>
          <Button
            variant={mode === 'wire' ? 'primary' : 'subtle'}
            onClick={() => setMode(mode === 'wire' ? 'select' : 'wire')}
            disabled={!canEditSosiogram}
          >
            Mode kabel
          </Button>
          {canManageLayout && (
            <Button variant="ghost" onClick={resetLinks}>
              Reset
            </Button>
          )}
        </div>
        <div className="sg-toolbar-group">
          <Button onClick={() => setShowNotesModal(true)}>Catatan peserta ({noteCount})</Button>
          <Button onClick={saveReport}>Laporan</Button>
          <Button onClick={() => void downloadPdf()} disabled={downloadingPdf}>
            {downloadingPdf ? 'Membuat PDF…' : 'Unduh PDF'}
          </Button>
          <Button onClick={openData}>Data</Button>
          <Button onClick={() => window.print()}>Cetak</Button>
          <Button variant="primary" onClick={() => void persist()} disabled={!canEditSosiogram || saving || !dirty}>
            {saving ? 'Menyimpan' : 'Simpan'}
          </Button>
          <Button variant="ghost" onClick={toggleTheme}>
            {dark ? 'Terang' : 'Gelap'}
          </Button>
        </div>
        <div className="sg-status">
          <span className={cls('dot', saveState)} />
          <span>{saveMessage}</span>
        </div>
      </div>

      {recoverableDraft && canEditSosiogram && (
        <Alert tone="alert-info">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span>
              Ditemukan draft sosiogram lokal yang belum tersimpan ke server
              {recoverableDraft.savedAt
                ? ` (${new Date(recoverableDraft.savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`
                : ''}.
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="primary" onClick={restoreLocalDraft}>
                Pulihkan Draft
              </Button>
              <Button size="sm" variant="ghost" onClick={discardLocalDraft}>
                Abaikan
              </Button>
            </div>
          </div>
        </Alert>
      )}
      {saveState === 'error' && (
        <Alert>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span>{saveMessage}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {conflict ? (
                <Button size="sm" variant="primary" onClick={() => void reloadFromServer()}>
                  Muat Ulang Versi Server
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => void persist()} disabled={saving}>
                  Coba Simpan Lagi
                </Button>
              )}
            </div>
          </div>
        </Alert>
      )}
      {data.seats.some((seat) => seat.name.trim() && !seat.participantId) && (
        <Alert tone="alert-warning">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span>
              Ada kursi bernama yang belum ditautkan ke data peserta. Nilainya tetap muncul, tetapi tidak masuk monitoring.
            </span>
            {canManageLayout && (
              <Button size="sm" variant="subtle" onClick={autoLinkSeats}>
                Auto-tautkan ke Peserta
              </Button>
            )}
          </div>
        </Alert>
      )}

      <div className="sg-canvas-wrap" ref={wrapRef} style={{ height: dims.h * scale }}>
        <div
          ref={canvasRef}
          className={cls('sg-canvas', mode === 'wire' && 'sg-mode-wire')}
          style={{ width: dims.w, height: dims.h, transform: `scale(${scale})` }}
          onPointerDown={startWire}
        >
          {data.boxes.map((box) => (
            <div
              key={box.id}
              className="sg-box"
              data-sg-id={box.id}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              onPointerUp={(event) => handleBoxResize(event, box.id)}
            >
              <div className="sg-box-head">
                {canManageLayout ? (
                  <>
                    <span className="sg-box-handle" onPointerDown={(event) => startDrag(event, box.id, 'box')}>
                      ⋮⋮
                    </span>
                    <button className="sg-delete" onClick={() => removeBox(box.id)} title="Hapus kotak">
                      ×
                    </button>
                  </>
                ) : (
                  <span className="sg-box-podium">Podium</span>
                )}
              </div>
              <input
                className="sg-box-label"
                value={box.label}
                readOnly={!canManageLayout}
                onChange={(event) => {
                  const value = event.target.value;
                  update((draft) => {
                    const target = draft.boxes.find((item) => item.id === box.id);
                    if (target) target.label = value;
                  });
                }}
              />
            </div>
          ))}

          {data.seats.map((seat) => {
            const hasNote = Boolean(
              seat.note || (seat.participantId && data.participantNotes?.[seat.participantId]),
            );
            return (
              <div key={seat.id} className="sg-seat" data-sg-id={seat.id} style={{ left: seat.x, top: seat.y }}>
                <div className="sg-seat-head">
                  {canManageLayout && (
                    <span className="sg-seat-handle" onPointerDown={(event) => startDrag(event, seat.id, 'seat')}>
                      ⋮⋮
                    </span>
                  )}
                  <input
                    className="sg-seat-name"
                    value={seat.name}
                    readOnly={!canManageLayout}
                    onChange={(event) => setSeatName(seat.id, event.target.value)}
                  />
                  <button
                    type="button"
                    className={cls('sg-seat-note-btn', hasNote && 'has-note')}
                    onClick={() => openNoteForSeat(seat)}
                    title="Catatan observer"
                  >
                    {hasNote ? '1' : '+'}
                  </button>
                  {canManageLayout && (
                    <button className="sg-delete" onClick={() => removeSeat(seat.id)} title="Hapus kursi">
                      ×
                    </button>
                  )}
                </div>
                <select
                  className="sg-seat-select"
                  value={seat.participantId || ''}
                  disabled={!canManageLayout}
                  onChange={(event) => setSeatParticipant(seat.id, event.target.value)}
                >
                  <option value="">Tautkan peserta</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
                <ScoreColumns
                  values={data.scores[seat.id] || []}
                  readOnly={!canEditSosiogram}
                  onChange={(values) => setSeatValues(seat.id, values)}
                />
              </div>
            );
          })}

          <svg className="sg-wire" width={dims.w} height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`}>
            {flashes.map((flash) => (
              <path key={flash.id} d={cablePath(centerOf(flash.from), centerOf(flash.to))} stroke={flash.color} />
            ))}
            {wire && (
              <path
                d={cablePath(centerOf(wire.from), { x: wire.x, y: wire.y })}
                stroke={wire.color}
              />
            )}
          </svg>
        </div>
      </div>

      <div className="sg-lower">
        <div className="sg-indicator">
          <b>Catatan observasi</b>
          <Textarea
            rows={3}
            value={data.cat}
            readOnly={!canEditSosiogram}
            onChange={(event) =>
              update((draft) => {
                draft.cat = event.target.value;
              })
            }
            placeholder="Catatan suasana keseluruhan sesi"
          />
        </div>
        <div className="sg-indicator">
          <b>Panduan RELI</b>
          <ul>
            {RELI_LABELS.map((label, index) => (
              <li key={label}>
                <span className="sg-legend-dot" style={{ background: RELI_COLORS[index] }} />
                {label}: {RELI_HINTS[index]}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="sg-legend">
        {indicatorAverages.map((value, index) => (
          <span key={RELI_LABELS[index]}>
            <i style={{ background: RELI_COLORS[index] }} />
            {RELI_LABELS[index]}: {value.toFixed(1)}
          </span>
        ))}
      </div>

      <Modal
        open={showNotesModal}
        title="Catatan peserta"
        onClose={() => setShowNotesModal(false)}
        footer={
          <Button variant="primary" onClick={() => setShowNotesModal(false)}>
            Selesai
          </Button>
        }
      >
        <div className="sg-note-list">
          {participants.map((participant) => {
            const currentNote =
              data.participantNotes?.[participant.id] ||
              data.seats.find((seat) => seat.participantId === participant.id)?.note ||
              '';
            return (
              <div key={participant.id} className="sg-note-card">
                <strong>{participant.name}</strong>
                <Input
                  value={currentNote}
                  placeholder="Catatan observer"
                  disabled={!canEditSosiogram}
                  onChange={(event) => updateParticipantNoteDirect(participant.id, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={Boolean(activeNoteSeat)}
        title={activeNoteSeat?.name || 'Catatan observer'}
        onClose={() => setActiveNoteSeat(null)}
        footer={
          <>
            <Button variant="primary" onClick={saveActiveSeatNote}>
              Simpan
            </Button>
            <Button onClick={() => setActiveNoteSeat(null)}>Batal</Button>
          </>
        }
      >
        <Field label="Catatan peserta" hint="Terlihat juga pada profil peserta dan monitoring.">
          <Textarea
            rows={4}
            value={activeNote}
            readOnly={!canEditSosiogram}
            onChange={(event) => setActiveNote(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={showData}
        title="Data sosiogram"
        onClose={() => setShowData(false)}
        footer={
          <>
            <Button onClick={downloadJson}>Unduh JSON</Button>
            {canManageLayout && (
              <Button variant="primary" onClick={loadData}>
                Muat JSON
              </Button>
            )}
            <Button onClick={() => setShowData(false)}>Tutup</Button>
          </>
        }
      >
        <textarea
          className="input sg-json"
          value={jsonText}
          readOnly={!canManageLayout}
          onChange={(event) => setJsonText(event.target.value)}
        />
      </Modal>
    </div>
  );
}
