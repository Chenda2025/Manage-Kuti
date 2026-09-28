import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Protected } from './components/Protected'
import { Toasts } from './components/Toasts'
import { useAuth } from './lib/auth'
import { AttendanceHubPage } from './pages/AttendanceHubPage'
import { AttendanceMarkPage } from './pages/AttendanceMarkPage'
import { AttendanceReportPage } from './pages/AttendanceReportPage'
import { DashboardPage } from './pages/DashboardPage'
import { KutiDetailPage } from './pages/KutiDetailPage'
import { KutisPage } from './pages/KutisPage'
import { LoginPage } from './pages/LoginPage'
import { ResidentsPage } from './pages/ResidentsPage'
import { RolesPage } from './pages/RolesPage'
import { SettingsPage } from './pages/SettingsPage'
import { UsersPage } from './pages/UsersPage'

export default function App() {
  const user = useAuth((s) => s.user)

  return (
    <>
      <Toasts />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            user ? (
              <Protected>
                <AppShell />
              </Protected>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<DashboardPage />} />
          <Route
            path="kutis"
            element={
              <Protected permission="kutis.view">
                <KutisPage />
              </Protected>
            }
          />
          <Route
            path="kutis/:id"
            element={
              <Protected permission="kutis.view">
                <KutiDetailPage />
              </Protected>
            }
          />
          <Route
            path="residents"
            element={
              <Protected permission="residents.view">
                <ResidentsPage />
              </Protected>
            }
          />
          <Route
            path="attendance"
            element={
              <Protected permission="attendance.view">
                <AttendanceHubPage />
              </Protected>
            }
          />
          <Route
            path="attendance/:type"
            element={
              <Protected permission="attendance.view">
                <AttendanceMarkPage />
              </Protected>
            }
          />
          <Route
            path="attendance/:type/reports"
            element={
              <Protected permission="attendance.view">
                <AttendanceReportPage />
              </Protected>
            }
          />
          <Route
            path="settings"
            element={
              <Protected permission="settings.manage">
                <SettingsPage />
              </Protected>
            }
          />
          <Route
            path="users"
            element={
              <Protected permission="users.view">
                <UsersPage />
              </Protected>
            }
          />
          <Route
            path="roles"
            element={
              <Protected permission={['roles.manage', 'users.view']}>
                <RolesPage />
              </Protected>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </>
  )
}
