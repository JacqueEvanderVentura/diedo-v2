import { Routes, Route, Navigate } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import DashboardPage from '@/modules/dashboard/pages/DashboardPage'
import PosPage from '@/modules/pos/pages/PosPage'
import CajaPage from '@/modules/pos/pages/CajaPage'
import CxcPage from '@/modules/pos/pages/CxcPage'
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
      <Route path="/pos" element={<PosPage />} />
      <Route
        path="/pos/caja"
        element={
          <PageShell title="Caja" subtitle="Control de efectivo del turno.">
            <CajaPage />
          </PageShell>
        }
      />
      <Route
        path="/pos/cuentas-por-cobrar"
        element={
          <PageShell title="Cuentas por Cobrar" subtitle="Pagos pendientes de confirmar o cobrar.">
            <CxcPage />
          </PageShell>
        }
      />
      {['/inventarios', '/crm', '/crm/clientes', '/crm/pipeline', '/crm/seguimientos', '/agenda', '/finanzas/gastos', '/finanzas/ingresos', '/reportes', '/configuracion'].map((p) => (
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
