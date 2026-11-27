import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from './ui';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Terjadi kesalahan pada aplikasi', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="login-page">
          <div className="login-card">
            <h1>Terjadi kesalahan</h1>
            <p className="sub">
              Halaman gagal ditampilkan. Muat ulang aplikasi; jika masih gagal, hubungi admin.
            </p>
            {import.meta.env.DEV && (
              <div className="alert alert-error">{this.state.error.message}</div>
            )}
            <div className="form-actions">
              <Button variant="primary" onClick={() => window.location.reload()}>
                Muat ulang
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
