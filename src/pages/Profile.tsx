import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { roleLabel } from '../lib/utils';

export function Profile() {
  const { user, refresh } = useAuth();
  const canChangePassword = Boolean(user);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak sama');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setMessage('Password berhasil diperbarui');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <PageHeader title="Profil" subtitle="Informasi akun dan keamanan." />

      <div className="grid grid-2">
        <Card title="Data akun">
          <div className="list">
            <div className="list-row">
              <div className="main-text">
                <span>Nama</span>
                <strong>{user?.name}</strong>
              </div>
            </div>
            <div className="list-row">
              <div className="main-text">
                <span>Email</span>
                <strong>{user?.email}</strong>
              </div>
            </div>
            <div className="list-row">
              <div className="main-text">
                <span>Peran</span>
                <strong>{roleLabel(user?.role)}</strong>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Ubah password">
          <form className="form-stack" onSubmit={submit}>
            {message && <Alert tone="alert-success">{message}</Alert>}
            {error && <Alert>{error}</Alert>}
            <Field label="Password lama">
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={!canChangePassword}
                required
              />
            </Field>
            <Field label="Password baru" hint="Minimal 8 karakter">
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                disabled={!canChangePassword}
                required
              />
            </Field>
            <Field label="Ulangi password baru">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                disabled={!canChangePassword}
                required
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy || !canChangePassword}>
              {busy ? 'Menyimpan…' : 'Simpan password'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
