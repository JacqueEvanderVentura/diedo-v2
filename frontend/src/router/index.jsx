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
import GastosPage from '@/modules/finanzas/pages/GastosPage'
import IngresosPage from '@/modules/finanzas/pages/IngresosPage'
import GeneralesPage from '@/modules/reportes/pages/GeneralesPage'
import InventarioReportPage from '@/modules/reportes/pages/InventarioPage'
import AgendaReportPage from '@/modules/reportes/pages/AgendaReportPage'
import SucursalesPage from '@/modules/configuracion/pages/SucursalesPage'
import UsuariosPage from '@/modules/configuracion/pages/UsuariosPage'
import CategoriasPage from '@/modules/configuracion/pages/CategoriasPage'
import MetodosPagoPage from '@/modules/configuracion/pages/MetodosPagoPage'

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
      <Route
        path="/finanzas/gastos"
        element={
          <PageShell title="Gastos" subtitle="Gastos variables y fijos del negocio.">
            <GastosPage />
          </PageShell>
        }
      />
      <Route
        path="/finanzas/ingresos"
        element={
          <PageShell title="Ingresos" subtitle="Ingresos generados desde las ventas del POS.">
            <IngresosPage />
          </PageShell>
        }
      />
      <Route path="/reportes" element={<Navigate to="/reportes/generales" replace />} />
      <Route
        path="/reportes/generales"
        element={
          <PageShell title="Reportes · Generales" subtitle="Ventas y ticket promedio por período.">
            <GeneralesPage />
          </PageShell>
        }
      />
      <Route
        path="/reportes/inventario"
        element={
          <PageShell title="Reportes · Inventario" subtitle="Stock y rotación estimada.">
            <InventarioReportPage />
          </PageShell>
        }
      />
      <Route
        path="/reportes/agenda"
        element={
          <PageShell title="Reportes · Agenda" subtitle="Citas cumplidas vs no-show.">
            <AgendaReportPage />
          </PageShell>
        }
      />
      <Route path="/configuracion" element={<Navigate to="/configuracion/sucursales" replace />} />
      <Route path="/configuracion/sucursales" element={<PageShell title="Configuración · Sucursales" subtitle="Sucursales y ajustes generales del negocio."><SucursalesPage /></PageShell>} />
      <Route path="/configuracion/usuarios" element={<PageShell title="Configuración · Usuarios" subtitle="Equipo y roles (mock)."><UsuariosPage /></PageShell>} />
      <Route path="/configuracion/categorias" element={<PageShell title="Configuración · Categorías" subtitle="Categorías del catálogo POS."><CategoriasPage /></PageShell>} />
      <Route path="/configuracion/metodos-pago" element={<PageShell title="Configuración · Métodos de pago" subtitle="Métodos disponibles al cobrar."><MetodosPagoPage /></PageShell>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default AppRoutes
