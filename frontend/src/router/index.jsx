import { Routes, Route, Navigate } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import DashboardPage from '@/modules/dashboard/pages/DashboardPage'
import PosPage from '@/modules/pos/pages/PosPage'
import CajaPage from '@/modules/pos/pages/CajaPage'
import CxcPage from '@/modules/pos/pages/CxcPage'
import InventariosPage from '@/modules/inventarios/pages/InventariosPage'
import ActivosPage from '@/modules/activos/pages/ActivosPage'
import AgendaPage from '@/modules/agenda/pages/AgendaPage'
import ClientesPage from '@/modules/crm/pages/ClientesPage'
import VentasPage from '@/modules/crm/pages/VentasPage'
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
      <Route
        path="/inventarios"
        element={
          <PageShell title="Inventarios" subtitle="Catálogo de productos y servicios.">
            <InventariosPage />
          </PageShell>
        }
      />
      <Route
        path="/activos"
        element={
          <PageShell title="Activos" subtitle="Bienes de la empresa: mobiliario, equipos y tecnología.">
            <ActivosPage />
          </PageShell>
        }
      />
      <Route
        path="/agenda"
        element={
          <PageShell title="Agenda" subtitle="Gestión de citas por día y semana.">
            <AgendaPage />
          </PageShell>
        }
      />
      <Route path="/crm" element={<Navigate to="/crm/clientes" replace />} />
      <Route
        path="/crm/clientes"
        element={
          <PageShell title="Clientes" subtitle="Directorio de clientes, historial y próximas citas.">
            <ClientesPage />
          </PageShell>
        }
      />
      <Route
        path="/crm/ventas"
        element={
          <PageShell title="Ventas" subtitle="Historial de ventas registradas.">
            <VentasPage />
          </PageShell>
        }
      />
      {['/finanzas/gastos', '/finanzas/ingresos', '/reportes', '/configuracion'].map((p) => (
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
