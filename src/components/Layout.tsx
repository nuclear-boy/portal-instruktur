import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '../../shared/types';
import { localLabel } from '../../shared/locals';
import { useAuth } from '../context/AuthContext';
import { cls, roleLabel } from '../lib/utils';
import { BrandMark } from './BrandMark';
import { Badge } from './ui';

const ICONS: Record<string, string> = {
  dashboard: 'M3 10.5 12 3l9 7.5V21H3z',
  lokal: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1',
  penilaian: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  peserta:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  pertemuan: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  jadwal: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 16l2 2 4-4',
  pemateri: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  monitoring: 'M3 3v18h18M7 16l4-5 4 3 5-7',
  laporan: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  admin:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.97 4.6H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8.9c.12.4.4.74.77.95.3.17.64.26.98.26H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z',
  profil: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
};

const NAV: { to: string; label: string; icon: string; roles?: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/lokal', label: 'Lokal & Tim', icon: 'lokal', roles: ['koordinator', 'observer'] },
  { to: '/peserta', label: 'Peserta', icon: 'peserta', roles: ['koordinator', 'observer'] },
  { to: '/jadwal', label: 'Jadwal Materi', icon: 'jadwal', roles: ['koordinator'] },
  {
    to: '/pertemuan',
    label: 'Pertemuan',
    icon: 'pertemuan',
    roles: ['koordinator', 'instruktur_lokal', 'observer'],
  },
  {
    to: '/penilaian',
    label: 'Penilaian Pemateri',
    icon: 'penilaian',
    roles: ['koordinator', 'observer'],
  },
  { to: '/pemateri', label: 'Data Pemateri', icon: 'pemateri', roles: ['koordinator', 'observer'] },
  {
    to: '/monitoring',
    label: 'Monitoring',
    icon: 'monitoring',
    roles: ['koordinator', 'instruktur_lokal', 'observer'],
  },
  {
    to: '/monitoring-pemateri',
    label: 'Monitoring Pemateri',
    icon: 'pemateri',
    roles: ['koordinator', 'instruktur_lokal'],
  },
  {
    to: '/laporan',
    label: 'Laporan & PDF',
    icon: 'laporan',
    roles: ['koordinator', 'instruktur_lokal', 'observer'],
  },
  {
    to: '/admin',
    label: 'Kelola Akun',
    icon: 'admin',
    roles: ['admin', 'koordinator'],
  },
  { to: '/profil', label: 'Profil', icon: 'profil' },
];

function NavIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.dashboard} />
    </svg>
  );
}

export function Layout() {
  const { user, meta, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('lbt-theme') === 'dark');
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : '';
    localStorage.setItem('lbt-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.dataset.theme === 'dark');
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const nav = NAV.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="app-shell">
      <aside className={cls('sidebar', menuOpen && 'open')}>
        <div className="brand">
          <BrandMark />
          <div className="brand-text">
            <strong>Portal Instruktur</strong>
            <span>{meta?.eventName || 'Leadership Basic Training'}</span>
          </div>
        </div>

        <nav className="nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cls('nav-item', isActive && 'active')}
            >
              <span className="nav-icon">
                <NavIcon name={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{user?.name?.slice(0, 1).toUpperCase() || '?'}</div>
            <div>
              <strong>{user?.name}</strong>
              <span>
                {roleLabel(user?.role)}
                {user?.localId ? ` · ${localLabel(user.localId)}` : ''}
              </span>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Keluar
          </button>
        </div>
      </aside>

      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen((value) => !value)} aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <BrandMark className="topbar-logo" alt="" />
          <div className="topbar-title">
            <span>{meta?.eventName || 'Portal Instruktur LBT'}</span>
            {meta?.location && <small>{meta.location}</small>}
          </div>
          <div className="topbar-actions">
            {user && <Badge tone="badge-green">{roleLabel(user.role)}</Badge>}
            <button className="icon-btn" onClick={() => setDark((value) => !value)} aria-label="Ganti tema">
              {dark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        <main className="main-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
