import { Link } from 'react-router-dom'
import {
  Users,
  Shield,
  Store,
  Tag,
  CreditCard,
  PiggyBank,
  Package,
  FileText,
  UserCircle,
  Bell,
  Lock,
  Palette,
  Globe,
  Database,
  MessageCircle,
  Receipt,
  HelpCircle,
  CalendarDays,
  ChevronRight,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SECTIONS = [
  {
    title: 'Administración',
    items: [
      { title: 'Usuarios', subtitle: 'Gestiona los miembros del equipo', to: '/configuracion/usuarios', icon: Users, wired: true },
      { title: 'Permisos', subtitle: 'Roles y niveles de acceso', to: '/configuracion/permisos', icon: Shield, wired: true },
      { title: 'Sucursales', subtitle: 'Configura tus puntos de venta', to: '/configuracion/sucursales', icon: Store, wired: true },
      { title: 'Categorías', subtitle: 'Categorías de productos y servicios', to: '/configuracion/categorias', icon: Tag, wired: true },
      { title: 'Presupuestos', subtitle: 'Configura categorías de presupuesto', icon: PiggyBank },
      { title: 'Métodos de Pago', subtitle: 'Asocia métodos de pago con categorías', to: '/configuracion/metodos-pago', icon: CreditCard, wired: true },
      { title: 'Productos y Servicios', subtitle: 'Gestiona tu catálogo comercial', icon: Package },
      { title: 'Plantillas de Documentos', subtitle: 'Formatos base para CRM y RRHH', icon: FileText },
      { title: 'Documentación CRM', subtitle: 'Configura requisitos de perfiles', icon: FileText },
      { title: 'Impuestos de Nómina', subtitle: 'Configura aportes TSS e INFOTEP', icon: Receipt },
      { title: 'Agenda y Cabinas', subtitle: 'Horarios, cabinas y permisos por sucursal', icon: CalendarDays },
      { title: 'Datos de Facturación', subtitle: 'Logo y sello para facturas', icon: Receipt },
    ],
  },
  {
    title: 'Cuenta',
    items: [
      { title: 'Perfil', subtitle: 'Gestiona tu información personal', icon: UserCircle },
      { title: 'Notificaciones', subtitle: 'Configura alertas y preferencias', icon: Bell },
      { title: 'Seguridad', subtitle: 'Contraseña y autenticación', icon: Lock },
    ],
  },
  {
    title: 'Aplicación',
    items: [
      { title: 'Apariencia', subtitle: 'Temas y personalización visual', icon: Palette },
      { title: 'Idioma y Región', subtitle: 'Preferencias de localización', icon: Globe },
      { title: 'Datos', subtitle: 'Exportar e importar información', icon: Database },
    ],
  },
  {
    title: 'Comunicaciones',
    items: [{ title: 'Mensajes de WhatsApp', subtitle: 'Plantillas para Agenda, CRM y Clientes', icon: MessageCircle }],
  },
  {
    title: 'Facturación',
    items: [{ title: 'Plan y Pagos', subtitle: 'Gestiona tu suscripción', icon: CreditCard }],
  },
  {
    title: 'Soporte',
    items: [{ title: 'Centro de Ayuda', subtitle: 'Documentación y tutoriales', icon: HelpCircle }],
  },
]

function SettingsRow({ item }) {
  const Icon = item.icon
  const content = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="font-semibold text-slate-800">{item.title}</p>
        <p className="truncate text-sm text-slate-500">{item.subtitle}</p>
      </div>
      {item.wired ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Próximamente
        </span>
      )}
    </>
  )

  if (item.wired && item.to) {
    return (
      <Link
        to={item.to}
        data-testid={`config-hub-${item.title}`}
        className="flex w-full items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-soft transition-colors hover:border-blue-200 hover:bg-blue-50/30"
      >
        {content}
      </Link>
    )
  }

  return (
    <div
      data-testid={`config-hub-wip-${item.title}`}
      className="flex w-full cursor-not-allowed items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3.5 opacity-70"
    >
      {content}
    </div>
  )
}

export default function ConfiguracionPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6 sm:p-8" data-testid="configuracion-hub">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-heading text-xl font-bold text-slate-900">Configuración</h2>
          <p className="text-sm text-slate-500">Personaliza tu experiencia en Diedo App</p>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{section.title}</h3>
          <div className="space-y-2">
            {section.items.map((item) => (
              <SettingsRow key={item.title} item={item} />
            ))}
          </div>
        </section>
      ))}

      <footer className="border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
        <p className="font-semibold text-slate-500">Diedo App v1.0.0</p>
        <p className="mt-1">© 2024 Todos los derechos reservados</p>
      </footer>
    </div>
  )
}
