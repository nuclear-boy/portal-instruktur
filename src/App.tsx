import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Protected } from './components/Protected';
import { Loader } from './components/ui';

const AdminUsers = lazy(() =>
  import('./pages/AdminUsers').then((m) => ({ default: m.AdminUsers })),
);
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Locals = lazy(() => import('./pages/Locals').then((m) => ({ default: m.Locals })));
const Monitoring = lazy(() =>
  import('./pages/Monitoring').then((m) => ({ default: m.Monitoring })),
);
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const ParticipantDetail = lazy(() =>
  import('./pages/ParticipantDetail').then((m) => ({ default: m.ParticipantDetail })),
);
const Participants = lazy(() =>
  import('./pages/Participants').then((m) => ({ default: m.Participants })),
);
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Schedule = lazy(() => import('./pages/Schedule').then((m) => ({ default: m.Schedule })));
const SessionDetail = lazy(() =>
  import('./pages/SessionDetail').then((m) => ({ default: m.SessionDetail })),
);
const Sessions = lazy(() => import('./pages/Sessions').then((m) => ({ default: m.Sessions })));
const SpeakerAssessments = lazy(() =>
  import('./pages/SpeakerAssessments').then((m) => ({ default: m.SpeakerAssessments })),
);
const SpeakerMonitoring = lazy(() =>
  import('./pages/SpeakerMonitoring').then((m) => ({ default: m.SpeakerMonitoring })),
);
const Speakers = lazy(() => import('./pages/Speakers').then((m) => ({ default: m.Speakers })));

function PageFallback() {
  return (
    <div className="content">
      <Loader label="Memuat halaman…" />
    </div>
  );
}

export function App() {
  return (
    <Suspense
      fallback={
        <div className="full-loader">
          <Loader label="Memuat portal…" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<PageFallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="lokal"
            element={
              <Protected roles={['koordinator', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <Locals />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="peserta"
            element={
              <Protected roles={['koordinator', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <Participants />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="peserta/:id"
            element={
              <Protected roles={['koordinator', 'instruktur_lokal', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <ParticipantDetail />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="pertemuan"
            element={
              <Protected roles={['koordinator', 'instruktur_lokal', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <Sessions />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="pertemuan/:id"
            element={
              <Protected roles={['koordinator', 'instruktur_lokal', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <SessionDetail />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="penilaian"
            element={
              <Protected roles={['koordinator', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <SpeakerAssessments />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="penilaian/:id"
            element={
              <Protected roles={['koordinator', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <SpeakerAssessments />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="pemateri"
            element={
              <Protected roles={['koordinator', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <Speakers />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="monitoring"
            element={
              <Protected roles={['koordinator', 'instruktur_lokal', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <Monitoring />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="monitoring-pemateri"
            element={
              <Protected roles={['koordinator', 'instruktur_lokal']}>
                <Suspense fallback={<PageFallback />}>
                  <SpeakerMonitoring />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="laporan"
            element={
              <Protected roles={['koordinator', 'instruktur_lokal', 'observer']}>
                <Suspense fallback={<PageFallback />}>
                  <Reports />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="profil"
            element={
              <Suspense fallback={<PageFallback />}>
                <Profile />
              </Suspense>
            }
          />
          <Route
            path="jadwal"
            element={
              <Protected roles={['koordinator']}>
                <Suspense fallback={<PageFallback />}>
                  <Schedule />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="admin"
            element={
              <Protected roles={['admin', 'koordinator']}>
                <Suspense fallback={<PageFallback />}>
                  <AdminUsers />
                </Suspense>
              </Protected>
            }
          />
          <Route
            path="*"
            element={
              <Suspense fallback={<PageFallback />}>
                <NotFound />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
