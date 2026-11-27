import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { LocalId, PublicUser, Role } from '../../shared/types';
import { LOCALS, localLabel, setLocals } from '../../shared/locals';
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
  Stat,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { fmtDateTime, roleLabel } from '../lib/utils';

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: Role;
  active: boolean;
  localId: string;
  position: string;
}

const EMPTY_FORM: UserForm = {
  name: '',
  email: '',
  password: '',
  role: 'observer',
  active: true,
  localId: '',
  position: '',
};

export function AdminUsers() {
  const { user } = useAuth();
  const { notify } = useToast();
  const isAdmin = user?.role === 'admin';
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const creatableRoles: Role[] = isAdmin ? ['koordinator'] : ['instruktur_lokal', 'observer'];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [userResult, metaResult] = await Promise.all([api.users.list(), api.getMeta()]);
      setUsers(userResult.users);
      setLocals(metaResult.meta.locals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM, role: creatableRoles[0] });
    setModalOpen(true);
  }

  function openEdit(target: PublicUser) {
    setEditingUser(target);
    setForm({
      name: target.name,
      email: target.email,
      password: '',
      role: isAdmin ? 'koordinator' : target.role,
      active: target.active,
      localId: target.localId ? String(target.localId) : '',
      position: target.position || '',
    });
    setModalOpen(true);
  }

  function editable(target: PublicUser): boolean {
    if (target.id === user?.id) return false;
    if (isAdmin) return target.role === 'koordinator';
    return target.role === 'instruktur_lokal' || target.role === 'observer';
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (editingUser) {
        const result = await api.users.update(editingUser.id, {
          name: form.name,
          email: form.email,
          active: form.active,
          position: form.position,
          ...(isAdmin
            ? {}
            : {
                role: form.role,
                localId: form.localId ? (Number(form.localId) as LocalId) : null,
              }),
          ...(form.password ? { password: form.password } : {}),
        });
        setUsers((items) =>
          items.map((item) => (item.id === editingUser.id ? result.user : item)),
        );
        setMessage('Akun diperbarui');
      } else {
        const result = await api.users.create({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          active: form.active,
          position: form.position,
          localId: isAdmin ? null : form.localId ? (Number(form.localId) as LocalId) : null,
        });
        setUsers((items) => [...items, result.user].sort((a, b) => a.name.localeCompare(b.name, 'id')));
        setMessage('Akun berhasil dibuat');
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akun');
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(target: PublicUser, patch: Partial<PublicUser> & { password?: string }) {
    setError('');
    setMessage('');
    try {
      const result = await api.users.update(target.id, patch);
      setUsers((items) => items.map((item) => (item.id === target.id ? result.user : item)));
      setMessage('Akun diperbarui');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui akun');
    }
  }

  function openResetPassword(target: PublicUser) {
    setResetTarget(target);
    setResetPwd('');
    setResetConfirm('');
    setError('');
  }

  async function submitResetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetTarget) return;
    if (resetPwd.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }
    if (resetPwd !== resetConfirm) {
      setError('Konfirmasi password tidak cocok');
      return;
    }
    setResetBusy(true);
    try {
      await updateUser(resetTarget, { password: resetPwd });
      notify(`Password untuk ${resetTarget.name} berhasil diperbarui.`);
      setResetTarget(null);
    } finally {
      setResetBusy(false);
    }
  }

  async function removeUser(target: PublicUser) {
    if (!window.confirm(`Hapus akun "${target.name}"?`)) return;
    setError('');
    try {
      await api.users.remove(target.id);
      setUsers((items) => items.filter((item) => item.id !== target.id));
      setMessage('Akun dihapus');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus akun');
    }
  }

  if (loading) {
    return (
      <div className="content">
        <Loader />
      </div>
    );
  }

  const koordinatorCount = users.filter((item) => item.role === 'koordinator').length;
  const localAccountCount = users.filter(
    (item) => item.role === 'instruktur_lokal' || item.role === 'observer',
  ).length;

  return (
    <div className="content">
      <PageHeader
        title={isAdmin ? 'Kelola Akun Koordinator' : 'Kelola Akun Tim'}
        subtitle={
          isAdmin
            ? 'Admin hanya membuat dan mengelola akun Koordinator Tim. Akun lokal hanya dapat dilihat.'
            : 'Koordinator Tim mengelola akun Instruktur Lokal dan Observer di seluruh lokal.'
        }
        actions={
          <Button variant="primary" onClick={openCreate}>
            + {isAdmin ? 'Koordinator' : 'Akun Tim'}
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="alert-success">{message}</Alert>}

      <div className="kpi-grid">
        <Stat label="Total akun terlihat" value={users.length} />
        <Stat label="Koordinator Tim" value={koordinatorCount} />
        <Stat label="Akun lokal" value={localAccountCount} />
      </div>

      <Card
        title="Daftar akun"
        subtitle={
          isAdmin
            ? 'Semua akun dapat dilihat. Hanya baris Koordinator Tim yang dapat diubah.'
            : 'Akun Instruktur Lokal dan Observer pada lokal yang tersedia.'
        }
      >
        {users.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Peran</th>
                  <th>Lokal</th>
                  <th>Jabatan</th>
                  <th>Status</th>
                  <th>Login terakhir</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((target) => {
                  const canEdit = editable(target);
                  return (
                    <tr key={target.id}>
                      <td>
                        {target.name}
                        {target.id === user?.id && <span className="small muted"> (Anda)</span>}
                      </td>
                      <td>{target.email}</td>
                      <td>
                        {canEdit && !isAdmin ? (
                          <Select
                            value={target.role}
                            onChange={(event) =>
                              updateUser(target, { role: event.target.value as Role })
                            }
                            style={{ minWidth: 160 }}
                          >
                            <option value="instruktur_lokal">Instruktur Lokal</option>
                            <option value="observer">Observer</option>
                          </Select>
                        ) : (
                          <Badge tone={target.role === 'admin' ? 'badge-amber' : 'badge-blue'}>
                            {roleLabel(target.role)}
                          </Badge>
                        )}
                      </td>
                      <td>
                        {canEdit && !isAdmin && target.role !== 'koordinator' ? (
                          <Select
                            value={target.localId || ''}
                            onChange={(event) =>
                              updateUser(target, {
                                localId: event.target.value
                                  ? (Number(event.target.value) as LocalId)
                                  : null,
                              })
                            }
                            style={{ minWidth: 140 }}
                          >
                            <option value="">Pilih lokal</option>
                            {LOCALS.map((local) => (
                              <option key={local.id} value={local.id}>
                                {local.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="small muted">
                            {target.localId ? localLabel(target.localId) : 'Global'}
                          </span>
                        )}
                      </td>
                      <td className="small muted">{target.position || '—'}</td>
                      <td>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={target.active}
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateUser(target, { active: event.target.checked })
                            }
                          />
                          <Badge tone={target.active ? 'badge-green' : 'badge-neutral'}>
                            {target.active ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </label>
                      </td>
                      <td className="nowrap small muted">
                        {target.lastLoginAt ? fmtDateTime(target.lastLoginAt) : 'Belum pernah'}
                      </td>
                      <td>
                        {canEdit ? (
                          <div className="actions">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(target)}>
                              Ubah
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openResetPassword(target)}>
                              Reset password
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => removeUser(target)}>
                              Hapus
                            </Button>
                          </div>
                        ) : (
                          <span className="small muted">Hanya lihat</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Belum ada akun.</Empty>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={
          editingUser
            ? `Ubah akun ${editingUser.name}`
            : isAdmin
              ? 'Tambah akun Koordinator Tim'
              : 'Tambah akun tim'
        }
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Batal</Button>
            <Button type="submit" form="create-user-form" variant="primary" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
        <form id="create-user-form" className="form-grid" onSubmit={saveUser}>
          <Field label="Nama lengkap" className="full">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </Field>
          <Field label="Email" className="full">
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </Field>
          <Field
            label={editingUser ? 'Password baru' : 'Password awal'}
            hint={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'}
          >
            <Input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              minLength={8}
              required={!editingUser}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Peran">
            {isAdmin || editingUser?.role === 'koordinator' ? (
              <Input value="Koordinator Tim" disabled />
            ) : (
              <Select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as Role })}
              >
                {creatableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {!isAdmin && (
            <Field label="Lokal" hint="Wajib untuk akun lokal">
              <Select
                value={form.localId}
                onChange={(event) => setForm({ ...form, localId: event.target.value })}
                required
              >
                <option value="">Pilih lokal</option>
                {LOCALS.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Jabatan" className={isAdmin ? 'full' : undefined}>
            <Input
              value={form.position}
              onChange={(event) => setForm({ ...form, position: event.target.value })}
              placeholder="Contoh: Instruktur Lokal 1"
            />
          </Field>
          <div className="full">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Aktif
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        title={resetTarget ? `Reset password · ${resetTarget.name}` : 'Reset password'}
        onClose={() => setResetTarget(null)}
        footer={
          <>
            <Button onClick={() => setResetTarget(null)}>Batal</Button>
            <Button type="submit" form="reset-password-form" variant="primary" disabled={resetBusy}>
              {resetBusy ? 'Menyimpan…' : 'Simpan Password'}
            </Button>
          </>
        }
      >
        <form id="reset-password-form" className="form-grid" onSubmit={submitResetPassword}>
          <Field label="Password baru" hint="Minimal 8 karakter" className="full">
            <Input
              type="password"
              value={resetPwd}
              onChange={(event) => setResetPwd(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Konfirmasi password baru" className="full">
            <Input
              type="password"
              value={resetConfirm}
              onChange={(event) => setResetConfirm(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
