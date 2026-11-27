import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { Loader } from './ui';

export function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="full-loader">
        <Loader label="Memeriksa sesi…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="content">
        <div className="card">
          <h2>Akses ditolak</h2>
          <p>Halaman ini hanya dapat diakses oleh peran yang berwenang.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
