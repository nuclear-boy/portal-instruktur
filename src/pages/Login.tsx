import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Meta } from '../../shared/types';
import { BrandMark } from '../components/BrandMark';
import { Alert, Button, Field, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api
      .getMeta()
      .then((result) => setMeta(result.meta))
      .catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <BrandMark className="login-logo" />
          <div>
            <strong>Portal Instruktur</strong>
            <div className="small muted">Pelajar Islam Indonesia</div>
          </div>
        </div>

        <h1>Masuk ke portal</h1>
        <p className="sub">{meta?.eventName || 'Leadership Basic Training Pelajar Islam Indonesia'}</p>

        {error && <Alert>{error}</Alert>}

        <div className="form-stack" style={{ marginTop: 12 }}>
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@contoh.com"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Memproses…' : 'Masuk'}
          </Button>
        </div>

        <p className="login-foot">
          Akun dibuat oleh admin. Hubungi koordinator jika belum memiliki akses.
        </p>
      </form>
    </div>
  );
}
