import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LocalId, Participant, Session } from '../../shared/types';
import { LOCALS, localLabel } from '../../shared/locals';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Loader,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { canEditMaster, cls } from '../lib/utils';

interface ImportRow {
  name: string;
  gender: string;
  origin: string;
  phone: string;
}

function parseBulkParticipants(raw: string): ImportRow[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: ImportRow[] = [];
  lines.forEach((line, index) => {
    const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const cols = line.split(delimiter).map((col) => col.trim().replace(/^"|"$/g, ''));
    const name = cols[0] || '';
    if (!name) return;
    if (index === 0 && /^(nama|name|peserta)$/i.test(name)) return;
    const rawGender = (cols[1] || '').toUpperCase();
    const gender = rawGender.startsWith('L') ? 'L' : rawGender.startsWith('P') ? 'P' : '';
    rows.push({
      name,
      gender,
      origin: cols[2] || '',
      phone: cols[3] || '',
    });
  });
  return rows;
}

interface ParticipantForm {
  localId: string;
  name: string;
  gender: string;
  origin: string;
  phone: string;
  notes: string;
  active: boolean;
}

const EMPTY_FORM: ParticipantForm = {
  localId: '',
  name: '',
  gender: '',
  origin: '',
  phone: '',
  notes: '',
  active: true,
};

export function Participants() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filterLocal, setFilterLocal] = useState<'all' | LocalId>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [form, setForm] = useState<ParticipantForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLocalId, setImportLocalId] = useState('1');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const writable = canEditMaster(user?.role);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [participantResult, sessionResult] = await Promise.all([
        api.participants.list(),
        api.sessions.list(),
      ]);
      setParticipants(participantResult.participants);
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
    return participants.filter((participant) => {
      if (filterLocal !== 'all' && participant.localId !== filterLocal) return false;
      if (!needle) return true;
      return [participant.name, participant.origin, participant.gender, participant.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [participants, query, filterLocal]);

  const parsedImport = useMemo(() => parseBulkParticipants(importText), [importText]);

  function openImport() {
    setImportText('');
    setImportLocalId(String(user?.localId || LOCALS[0]?.id || 1));
    setImportProgress('');
    setImportOpen(true);
  }

  async function runBulkImport() {
    if (!parsedImport.length || importing) return;
    setImporting(true);
    setError('');
    const created: Participant[] = [];
    const targetLocal = importLocalId ? (Number(importLocalId) as LocalId) : null;
    let failed = 0;

    for (let i = 0; i < parsedImport.length; i += 1) {
      const row = parsedImport[i];
      setImportProgress(`Menyimpan ${i + 1} / ${parsedImport.length}…`);
      try {
        const res = await api.participants.create({
          name: row.name,
          gender: row.gender,
          origin: row.origin,
          phone: row.phone,
          notes: '',
          localId: targetLocal,
          active: true,
        });
        created.push(res.participant);
      } catch {
        failed += 1;
      }
    }

    if (created.length) {
      setParticipants((items) =>
        [...items, ...created].sort((a, b) => a.name.localeCompare(b.name, 'id')),
      );
      notify(
        failed
          ? `${created.length} peserta diimpor (${failed} gagal).`
          : `${created.length} peserta berhasil diimpor.`,
        failed ? 'info' : 'success',
      );
      setImportOpen(false);
    } else if (failed) {
      setError('Gagal mengimpor peserta. Periksa koneksi server.');
    }
    setImporting(false);
    setImportProgress('');
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, localId: String(user?.localId || 1) });
    setModalOpen(true);
  }

  function openEdit(participant: Participant) {
    setEditing(participant);
    setForm({
      localId: participant.localId ? String(participant.localId) : '',
      name: participant.name,
      gender: participant.gender || '',
      origin: participant.origin || '',
      phone: participant.phone || '',
      notes: participant.notes || '',
      active: participant.active,
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setError('Nama peserta wajib diisi');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        localId: form.localId ? (Number(form.localId) as LocalId) : null,
      };
      if (editing) {
        const result = await api.participants.update(editing.id, payload);
        setParticipants((items) =>
          items.map((item) => (item.id === editing.id ? result.participant : item)),
        );
      } else {
        const result = await api.participants.create(payload);
        setParticipants((items) =>
          [...items, result.participant].sort((a, b) => a.name.localeCompare(b.name, 'id')),
        );
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan peserta');
    } finally {
      setBusy(false);
    }
  }

  async function remove(participant: Participant) {
    if (!window.confirm(`Hapus peserta "${participant.name}"?`)) return;
    try {
      await api.participants.remove(participant.id);
      setParticipants((items) => items.filter((item) => item.id !== participant.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus peserta');
    }
  }

  function attendanceSummary(participantId: string) {
    let present = 0;
    let total = 0;
    sessions.forEach((session) => {
      const entry = session.attendance.find((item) => item.participantId === participantId);
      if (!entry) return;
      total += 1;
      if (entry.status === 'hadir' || entry.status === 'terlambat') present += 1;
    });
    return { present, total };
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
        title="Peserta"
        subtitle={
          user?.localId
            ? `${localLabel(user.localId)} · ${participants.length} peserta`
            : `${participants.length} peserta terdaftar`
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void load()}>
              Muat ulang
            </Button>
            {writable && (
              <>
                <Button onClick={openImport}>Impor CSV / Excel</Button>
                <Button variant="primary" onClick={openCreate}>
                  + Peserta
                </Button>
              </>
            )}
          </>
        }
      />

      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <Input
            className="search"
            placeholder="Cari nama, asal, atau kontak…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {!user?.localId && (
            <Select
              value={filterLocal}
              onChange={(event) =>
                setFilterLocal(
                  event.target.value === 'all' ? 'all' : (Number(event.target.value) as LocalId),
                )
              }
              aria-label="Filter lokal"
            >
              <option value="all">Semua lokal</option>
              {LOCALS.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.label}
                </option>
              ))}
            </Select>
          )}
          <span className="small muted">{filtered.length} hasil</span>
        </div>

        {filtered.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Lokal</th>
                  <th>L/P</th>
                  <th>Asal</th>
                  <th>Kontak</th>
                  <th>Kehadiran</th>
                  <th>Status</th>
                  {writable && <th />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((participant) => {
                  const summary = attendanceSummary(participant.id);
                  return (
                    <tr key={participant.id}>
                      <td>
                        <Link to={`/peserta/${participant.id}`}>{participant.name}</Link>
                      </td>
                      <td>
                        <Badge tone={participant.localId ? 'badge-blue' : 'badge-neutral'}>
                          {localLabel(participant.localId)}
                        </Badge>
                      </td>
                      <td>{participant.gender || '—'}</td>
                      <td>{participant.origin || '—'}</td>
                      <td>{participant.phone || '—'}</td>
                      <td>
                        {summary.total ? `${summary.present}/${summary.total}` : '—'}
                      </td>
                      <td>
                        <Badge tone={participant.active ? 'badge-green' : 'badge-neutral'}>
                          {participant.active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>
                      {writable && (
                        <td>
                          <div className="actions">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(participant)}>
                              Ubah
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => remove(participant)}>
                              Hapus
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{query ? 'Tidak ada peserta yang cocok.' : 'Belum ada peserta terdaftar.'}</Empty>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? 'Ubah peserta' : 'Tambah peserta'}
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
        <div className={cls('form-grid')}>
          <Field label="Nama lengkap" className="full">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Nama peserta"
            />
          </Field>
          <Field label="Lokal">
            <Select
              value={form.localId}
              onChange={(event) => setForm({ ...form, localId: event.target.value })}
            >
              <option value="">Belum ditempatkan</option>
              {LOCALS.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis kelamin">
            <Select
              value={form.gender}
              onChange={(event) => setForm({ ...form, gender: event.target.value })}
            >
              <option value="">—</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </Select>
          </Field>
          <Field label="Asal sekolah/daerah">
            <Input
              value={form.origin}
              onChange={(event) => setForm({ ...form, origin: event.target.value })}
              placeholder="Asal"
            />
          </Field>
          <Field label="Kontak">
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="No. HP"
            />
          </Field>
          <Field label="Status">
            <span className="checkbox" style={{ height: 38 }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Aktif
            </span>
          </Field>
          <Field label="Catatan" className="full">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Catatan tambahan"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        wide
        title="Impor Peserta Massal (CSV / Paste Excel)"
        onClose={() => !importing && setImportOpen(false)}
        footer={
          <>
            <span className="small muted" style={{ marginRight: 'auto' }}>
              {importProgress || `${parsedImport.length} baris siap diimpor`}
            </span>
            <Button onClick={() => setImportOpen(false)} disabled={importing}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={() => void runBulkImport()}
              disabled={importing || !parsedImport.length}
            >
              {importing ? 'Mengimpor…' : `Impor ${parsedImport.length} Peserta`}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Penempatan lokal" hint="Seluruh peserta pada impor ini ditempatkan ke lokal terpilih.">
            <Select
              value={importLocalId}
              onChange={(event) => setImportLocalId(event.target.value)}
              disabled={importing}
            >
              <option value="">Belum ditempatkan</option>
              {LOCALS.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Atau unggah file CSV" hint="Kolom: Nama, L/P, Asal, Kontak">
            <Input
              type="file"
              accept=".csv,.txt"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => setImportText(text));
              }}
            />
          </Field>
          <Field
            label="Tempel daftar peserta (1 baris = 1 peserta)"
            hint="Format: Nama, L/P, Asal, Kontak — atau salin-tempel langsung 4 kolom dari Excel/Spreadsheet."
            className="full"
          >
            <Textarea
              rows={6}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={'Muhammad Ardiansyah, L, Bandung, 08123456789\nSiti Aisyah, P, Cimahi, 08129876543'}
              disabled={importing}
            />
          </Field>
        </div>

        {parsedImport.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="small muted" style={{ marginBottom: 6 }}>
              Pratinjau ({Math.min(parsedImport.length, 8)} dari {parsedImport.length} peserta):
            </div>
            <div className="table-wrap">
              <table className="data compact">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>L/P</th>
                    <th>Asal</th>
                    <th>Kontak</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedImport.slice(0, 8).map((row, idx) => (
                    <tr key={`${row.name}-${idx}`}>
                      <td>{row.name}</td>
                      <td>{row.gender || '—'}</td>
                      <td>{row.origin || '—'}</td>
                      <td>{row.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
