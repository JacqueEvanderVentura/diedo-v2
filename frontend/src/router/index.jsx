import { Routes, Route, Navigate } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import DashboardPage from '@/modules/dashboard/pages/DashboardPage'
import PosPage from '@/modules/pos/pages/PosPage'
import PlaceholderPage from '@/components/layout/PlaceholderPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <PageShell title="Vista General" subtitle="Aquí está lo que sucede en tu negocio hoy.">
            <DashboardPage />
          </PageShell>
        }
      />
      <Route
        path="/pos"
        element={<PosPage />}
      />
      {['/inventarios', '/crm/clientes', '/agenda', '/finanzas/gastos', '/reportes', '/configuracion'].map((p) => (
        <Route
          key={p}
          path={p}
          element={
            <PageShell title="Módulo en desarrollo" subtitle="Esta sección llega en una próxima fase.">
              <PlaceholderPage path={p} />
            </PageShell>
          }
        />
      ))}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default AppRoutes
