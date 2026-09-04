import { Routes, Route, Navigate } from 'react-router-dom'

import { AppFrame, PageShell } from '@/components/layout/PageShell'
import { AuthGate } from '@/components/auth/AuthGate'
import { FeatureUnavailablePage } from '@/components/layout/FeatureUnavailablePage'
import { FEATURES } from '@/config/features'
import LoginPage from '@/modules/auth/pages/LoginPage'

import DashboardPage from '@/modules/dashboard/pages/DashboardPage'

import PosPage from '@/modules/pos/pages/PosPage'

import CajaPage from '@/modules/pos/pages/CajaPage'

import CxcPage from '@/modules/pos/pages/CxcPage'

import InventariosPage from '@/modules/inventarios/pages/InventariosPage'

import ActivosPage from '@/modules/activos/pages/ActivosPage'

import CalendarioPage from '@/modules/agenda/pages/CalendarioPage'

import GestionCitasPage from '@/modules/agenda/pages/GestionCitasPage'

import AgendarPage from '@/modules/agenda/pages/AgendarPage'

import PerfilPublicoPage from '@/modules/agenda/pages/PerfilPublicoPage'

import ClientesPage from '@/modules/crm/pages/ClientesPage'

import CrmOverviewPage from '@/modules/crm/pages/OverviewPage'

import LeadsPage from '@/modules/crm/pages/LeadsPage'

import PipelinePage from '@/modules/crm/pages/PipelinePage'

import SeguimientoPage from '@/modules/crm/pages/SeguimientoPage'

import CotizacionesPage from '@/modules/crm/pages/CotizacionesPage'

import CrmComprasPage from '@/modules/crm/pages/ComprasPage'
import ComprasPage from '@/modules/compras/pages/ComprasPage'

import VentasPage from '@/modules/crm/pages/VentasPage'

import OverviewPage from '@/modules/finanzas/pages/OverviewPage'

import GastosPage from '@/modules/finanzas/pages/GastosPage'

import PasivosPage from '@/modules/finanzas/pages/PasivosPage'

import PresupuestosPage from '@/modules/finanzas/pages/PresupuestosPage'

import CuentasPage from '@/modules/finanzas/pages/CuentasPage'

import IngresosPage from '@/modules/finanzas/pages/IngresosPage'

import GeneralesPage from '@/modules/reportes/pages/GeneralesPage'

import InventarioReportPage from '@/modules/reportes/pages/InventarioPage'

import AgendaReportPage from '@/modules/reportes/pages/AgendaReportPage'
import MembresiasPage from '@/modules/reportes/pages/MembresiasPage'
import DividendosPage from '@/modules/reportes/pages/DividendosPage'
import PersonalPage from '@/modules/reportes/pages/PersonalPage'

import SucursalesPage from '@/modules/configuracion/pages/SucursalesPage'

import ConfiguracionPage from '@/modules/configuracion/pages/ConfiguracionPage'

import UsuariosPage from '@/modules/configuracion/pages/UsuariosPage'

import CategoriasPage from '@/modules/configuracion/pages/CategoriasPage'

import PermisosPage from '@/modules/configuracion/pages/PermisosPage'

import MetodosPagoPage from '@/modules/configuracion/pages/MetodosPagoPage'

import IncidenciasPage from '@/modules/incidencias/pages/IncidenciasPage'

import RrhhOverviewPage from '@/modules/rrhh/pages/OverviewPage'
import DirectorioPage from '@/modules/rrhh/pages/DirectorioPage'
import SolicitudesPage from '@/modules/rrhh/pages/SolicitudesPage'
import RrhhCxcPage from '@/modules/rrhh/pages/CuentasPorCobrarPage'
import DocumentosPage from '@/modules/rrhh/pages/DocumentosPage'
import NominaPage from '@/modules/rrhh/pages/NominaPage'
import PerformancePage from '@/modules/rrhh/pages/PerformancePage'



export function AppRoutes() {

  return (

    <Routes>

      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/agendar"
        element={FEATURES.selfBooking ? <AgendarPage /> : <FeatureUnavailablePage title="Agendación pública próximamente" />}
      />

      <Route
        path="/agendar/perfil"
        element={FEATURES.selfBooking ? <PerfilPublicoPage /> : <FeatureUnavailablePage title="Perfil público próximamente" />}
      />

      <Route element={<AuthGate />}>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<AppFrame />}>

        <Route path="/pos" element={<PosPage />} />

        <Route element={<PageShell />}>

          <Route path="/dashboard" element={<DashboardPage />} />

          <Route path="/pos/caja" element={<CajaPage />} />

          <Route path="/pos/cuentas-por-cobrar" element={<CxcPage />} />

          <Route path="/inventarios" element={<InventariosPage />} />

          <Route path="/compras" element={<ComprasPage />} />
          <Route path="/compras/proveedores" element={<Navigate to="/compras?tab=proveedores" replace />} />
          <Route path="/compras/solicitudes-de-compra" element={<Navigate to="/compras?tab=solicitudes" replace />} />
          <Route path="/compras/configuracion" element={<Navigate to="/compras?tab=configuracion" replace />} />

          <Route path="/incidencias" element={<IncidenciasPage />} />

          <Route path="/activos" element={<Navigate to="/inventarios?tab=activos" replace />} />

          <Route path="/agenda" element={<Navigate to="/agenda/calendario" replace />} />

          <Route path="/agenda/calendario" element={<CalendarioPage />} />

          <Route path="/agenda/gestion" element={<GestionCitasPage />} />

          <Route path="/crm" element={<CrmOverviewPage />} />

          <Route path="/crm/clientes" element={<ClientesPage />} />

          <Route path="/crm/leads" element={<LeadsPage />} />

          <Route path="/crm/pipeline" element={<PipelinePage />} />

          <Route path="/crm/seguimiento" element={<SeguimientoPage />} />

          <Route path="/crm/cotizaciones" element={<CotizacionesPage />} />

          <Route path="/crm/compras" element={<CrmComprasPage />} />

          <Route path="/crm/ventas" element={<VentasPage />} />

          <Route path="/rrhh" element={<RrhhOverviewPage />} />
          <Route path="/rrhh/directorio" element={<DirectorioPage />} />
          <Route path="/rrhh/solicitudes" element={<SolicitudesPage />} />
          <Route path="/rrhh/cuentas-por-cobrar" element={<RrhhCxcPage />} />
          <Route path="/rrhh/documentos" element={<DocumentosPage />} />
          <Route path="/rrhh/nomina" element={FEATURES.payroll ? <NominaPage /> : <FeatureUnavailablePage title="Nómina próximamente" />} />
          <Route path="/rrhh/performance" element={FEATURES.performance ? <PerformancePage /> : <FeatureUnavailablePage title="Evaluaciones próximamente" />} />

          <Route path="/finanzas" element={<OverviewPage />} />

          <Route path="/finanzas/gastos" element={<GastosPage />} />

          <Route path="/finanzas/gastos-fijos" element={<Navigate to="/finanzas/gastos?tab=fijos" replace />} />

          <Route path="/finanzas/pasivos" element={<PasivosPage />} />

          <Route path="/finanzas/presupuestos" element={<PresupuestosPage />} />

          <Route path="/finanzas/cuentas" element={<CuentasPage />} />

          <Route path="/finanzas/ingresos" element={<IngresosPage />} />

          <Route path="/reportes" element={<Navigate to="/reportes/generales" replace />} />

          <Route path="/reportes/generales" element={<GeneralesPage />} />

          <Route path="/reportes/membresias" element={<MembresiasPage />} />

          <Route path="/reportes/inventario" element={<InventarioReportPage />} />

          <Route path="/reportes/agenda" element={<AgendaReportPage />} />

          <Route path="/reportes/dividendos" element={<DividendosPage />} />

          <Route path="/reportes/personal" element={<PersonalPage />} />

          <Route path="/configuracion" element={<ConfiguracionPage />} />

          <Route path="/configuracion/sucursales" element={<SucursalesPage />} />

          <Route path="/configuracion/usuarios" element={<UsuariosPage />} />

          <Route path="/configuracion/categorias" element={<CategoriasPage />} />

          <Route path="/configuracion/permisos" element={<PermisosPage />} />

          <Route path="/configuracion/metodos-pago" element={<MetodosPagoPage />} />

          <Route path="/configuracion/whatsapp" element={<Navigate to="/configuracion?open=whatsapp" replace />} />

        </Route>

      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />

      </Route>

    </Routes>

  )

}



export default AppRoutes

