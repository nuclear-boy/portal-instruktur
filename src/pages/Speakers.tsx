import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_SPEAKERS } from '../../shared/defaultSpeakers';
import { MATERIALS } from '../../shared/materials';
import type { Session, Speaker } from '../../shared/types';
import {
  Alert,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Loader,
  Modal,
  PageHeader,
  Textarea,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { canEditMaster } from '../lib/utils';

interface SpeakerForm {
  name: string;
  expertise: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: SpeakerForm = { name: '', expertise: '', phone: '', notes: '' };

export function Speakers() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Speaker | null>(null);
  const [form, setForm] = useState<SpeakerForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const writable = canEditMaster(user?.role);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [speakerResult, sessionResult] = await Promise.all([
        api.speakers.list(),
        api.sessions.list(),
      ]);
      setSpeakers(speakerResult.speakers);
      setSessions(sessionResult.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return speakers;
    return speakers.filter((speaker) =>
      [speaker.name, speaker.expertise, speaker.phone, speaker.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [speakers, query]);

  const missingDefaultsCount = useMemo(() => {
    const existingNames = new Set(speakers.map((item) => item.name.trim().toLowerCase()));
    return DEFAULT_SPEAKERS.filter((name) => !existingNames.has(name.trim().toLowerCase())).length;
  }, [speakers]);

  function sessionCount(speakerId: string) {
    return sessions.filter((session) =>
      session.speakers.some((item) => item.speakerId === speakerId),
    ).length;
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(speaker: Speaker) {
    setEditing(speaker);
    setForm({
      name: speaker.name,
      expertise: speaker.expertise || '',
      phone: speaker.phone || '',
      notes: speaker.notes || '',
    });
    setModalOpen(true);
  }

  async function seedDefaultSpeakers() {
    if (!writable || seeding) return;
    if (!missingDefaultsCount) {
      notify('Seluruh 17 pemateri default sudah terdaftar.', 'info');
      return;
    }
    if (
      !window.confirm(
        `Tambahkan ${missingDefaultsCount} pemateri resmi LBT Pontianak yang belum terdaftar?`,
      )
    ) {
      return;
    }
    setSeeding(true);
    setError('');
    const existingNames = new Set(speakers.map((item) => item.name.trim().toLowerCase()));
    const created: Speaker[] = [];
    let failed = 0;

    for (const name of DEFAULT_SPEAKERS) {
      if (existingNames.has(name.trim().toLowerCase())) continue;
      try {
        const result = await api.speakers.create({
          name,
          expertise: '',
          phone: '',
          notes: '',
        });
        created.push(result.speaker);
        existingNames.add(name.trim().toLowerCase());
      } catch {
        failed += 1;
      }
    }

    if (created.length) {
      setSpeakers((items) =>
        [...items, ...created].sort((a, b) => a.name.localeCompare(b.name, 'id')),
      );
      notify(
        failed
          ? `${created.length} pemateri ditambahkan (${failed} gagal).`
          : `${created.length} pemateri resmi berhasil ditambahkan.`,
        failed ? 'info' : 'success',
      );
    } else if (failed) {
      setError('Gagal memuat pemateri default. Periksa koneksi server.');
    }
    setSeeding(false);
  }

  async function save() {
    if (!form.name.trim()) {
      setError('Nama pemateri wajib diisi');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing) {
        const result = await api.speakers.update(editing.id, form);
        setSpeakers((items) =>
          items.map((item) => (item.id === editing.id ? result.speaker : item)),
        );
        notify('Data pemateri diperbarui.');
      } else {
        const result = await api.speakers.create(form);
        setSpeakers((items) =>
          [...items, result.speaker].sort((a, b) => a.name.localeCompare(b.name, 'id')),
        );
        notify('Pemateri berhasil ditambahkan.');
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pemateri');
    } finally {
      setBusy(false);
    }
  }

  async function remove(speaker: Speaker) {
    if (!window.confirm(`Hapus pemateri "${speaker.name}"?`)) return;
    try {
      await api.speakers.remove(speaker.id);
      setSpeakers((items) => items.filter((item) => item.id !== speaker.id));
      notify('Pemateri dihapus.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus pemateri');
    }
  }

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
        title="Pemateri & Instruktur"
        subtitle="Data pemateri, instruktur lokal, dan observer"
        actions={
          <>
            {user?.role === 'koordinator' && (
              <Link to="/monitoring-pemateri" className="btn btn-ghost">
                Monitoring Pemateri →
              </Link>
            )}
            {writable && missingDefaultsCount > 0 && (
              <Button onClick={() => void seedDefaultSpeakers()} disabled={seeding}>
                {seeding ? 'Memuat…' : `Muat ${missingDefaultsCount} Pemateri Default`}
              </Button>
            )}
            {writable && (
              <Button variant="primary" onClick={openCreate}>
                + Pemateri
              </Button>
            )}
          </>
        }
      />

      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <Input
            className="search"
            placeholder="Cari nama atau materi keahlian…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="small muted">{filtered.length} data</span>
        </div>

        {filtered.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Materi / Keahlian</th>
                  <th>Kontak</th>
                  <th>Sesi</th>
                  {writable && <th />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((speaker) => (
                  <tr key={speaker.id}>
                    <td>
                      <strong>{speaker.name}</strong>
                      {speaker.notes && (
                        <div className="small muted" style={{ marginTop: 2, maxWidth: 420 }}>
                          {speaker.notes}
                        </div>
                      )}
                    </td>
                    <td>{speaker.expertise || '—'}</td>
                    <td className="nowrap">{speaker.phone || '—'}</td>
                    <td>{sessionCount(speaker.id)}</td>
                    {writable && (
                      <td>
                        <div className="actions">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(speaker)}>
                            Ubah
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => remove(speaker)}>
                            Hapus
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{query ? 'Tidak ada data yang cocok.' : 'Belum ada pemateri terdaftar.'}</Empty>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? 'Ubah pemateri' : 'Tambah pemateri'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Batal</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Nama lengkap" className="full">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Nama pemateri"
            />
          </Field>
          <Field
            label="Keahlian / materi"
            hint="Pilih dari silabus atau ketik beberapa materi dipisah koma."
            className="full"
          >
            <Input
              list="syllabus-materials-list"
              value={form.expertise}
              onChange={(event) => setForm({ ...form, expertise: event.target.value })}
              placeholder="Contoh: Aqidah + Dinul Islam, Sirah Nabawiyah"
            />
            <datalist id="syllabus-materials-list">
              {MATERIALS.map((material) => (
                <option key={`${material.no}-${material.topic}`} value={material.topic} />
              ))}
            </datalist>
          </Field>
          <Field label="Kontak" className="full">
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="No. HP"
            />
          </Field>
          <Field label="Catatan" className="full">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Catatan tambahan (opsional)"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
