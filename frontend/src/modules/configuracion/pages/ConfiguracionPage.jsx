import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
  ChevronDown,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import UsuariosPage from './UsuariosPage'
import PermisosPage from './PermisosPage'
import SucursalesPage from './SucursalesPage'
import CategoriasPage from './CategoriasPage'
import MetodosPagoPage from './MetodosPagoPage'
import PlantillasWaPanel from '../components/PlantillasWaPanel'

const EMBED_MAP = {
  usuarios: UsuariosPage,
  permisos: PermisosPage,
  sucursales: SucursalesPage,
  categorias: CategoriasPage,
  'metodos-pago': MetodosPagoPage,
  whatsapp: PlantillasWaPanel,
}

const SECTIONS = [
  {
    title: 'Administración',
    items: [
      { id: 'usuarios', title: 'Usuarios', subtitle: 'Gestiona los miembros del equipo', icon: Users, kind: 'embed', embed: 'usuarios' },
      { id: 'permisos', title: 'Permisos', subtitle: 'Roles y niveles de acceso', icon: Shield, kind: 'embed', embed: 'permisos' },
      { id: 'sucursales', title: 'Sucursales', subtitle: 'Configura tus puntos de venta', icon: Store, kind: 'embed', embed: 'sucursales' },
      { id: 'categorias', title: 'Categorías', subtitle: 'Categorías de productos y servicios', icon: Tag, kind: 'embed', embed: 'categorias' },
      { id: 'presupuestos', title: 'Presupuestos', subtitle: 'Configura categorías de presupuesto', icon: PiggyBank, kind: 'navigate', to: '/finanzas/presupuestos' },
      { id: 'metodos-pago', title: 'Métodos de Pago', subtitle: 'Asocia métodos de pago con categorías', icon: CreditCard, kind: 'embed', embed: 'metodos-pago' },
      { id: 'productos', title: 'Productos y Servicios', subtitle: 'Gestiona tu catálogo comercial', icon: Package, kind: 'navigate', to: '/inventarios' },
      { id: 'plantillas-docs', title: 'Plantillas de Documentos', subtitle: 'Formatos base para CRM y RRHH', icon: FileText, kind: 'stub' },
      { id: 'doc-crm', title: 'Documentación CRM', subtitle: 'Configura requisitos de perfiles', icon: FileText, kind: 'stub' },
      { id: 'impuestos-nomina', title: 'Impuestos de Nómina', subtitle: 'Configura aportes TSS e INFOTEP', icon: Receipt, kind: 'stub' },
      { id: 'agenda-cabinas', title: 'Agenda y Cabinas', subtitle: 'Horarios, cabinas y permisos por sucursal', icon: CalendarDays, kind: 'stub' },
      { id: 'datos-facturacion', title: 'Datos de Facturación', subtitle: 'Logo y sello para facturas', icon: Receipt, kind: 'stub' },
    ],
  },
  {
    title: 'Cuenta',
    items: [
      { id: 'perfil', title: 'Perfil', subtitle: 'Gestiona tu información personal', icon: UserCircle, kind: 'stub' },
      { id: 'notificaciones', title: 'Notificaciones', subtitle: 'Configura alertas y preferencias', icon: Bell, kind: 'stub' },
      { id: 'seguridad', title: 'Seguridad', subtitle: 'Contraseña y autenticación', icon: Lock, kind: 'stub' },
    ],
  },
  {
    title: 'Aplicación',
    items: [
      { id: 'apariencia', title: 'Apariencia', subtitle: 'Temas y personalización visual', icon: Palette, kind: 'stub' },
      { id: 'idioma', title: 'Idioma y Región', subtitle: 'Preferencias de localización', icon: Globe, kind: 'stub' },
      { id: 'datos', title: 'Datos', subtitle: 'Exportar e importar información', icon: Database, kind: 'stub' },
    ],
  },
  {
    title: 'Comunicaciones',
    items: [
      {
        id: 'whatsapp',
        title: 'Mensajes de WhatsApp',
        subtitle: 'Plantillas para Agenda, CRM y Clientes',
        icon: MessageCircle,
        kind: 'embed',
        embed: 'whatsapp',
      },
    ],
  },
  {
    title: 'Facturación',
    items: [{ id: 'plan', title: 'Plan y Pagos', subtitle: 'Gestiona tu suscripción', icon: CreditCard, kind: 'stub' }],
  },
  {
    title: 'Soporte',
    items: [{ id: 'ayuda', title: 'Centro de Ayuda', subtitle: 'Documentación y tutoriales', icon: HelpCircle, kind: 'stub' }],
  },
]

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items)

function EmbedPanel({ embedKey }) {
  const Component = EMBED_MAP[embedKey]
  if (!Component) return null
  return <Component embedded />
}

function SettingsRow({ item, open, onToggle }) {
  const Icon = item.icon
  const isOpen = open === item.id
  const isEmbedOrStub = item.kind === 'embed' || item.kind === 'stub'

  const rowContent = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="font-semibold text-slate-800">{item.title}</p>
        <p className="truncate text-sm text-slate-500">{item.subtitle}</p>
      </div>
      {item.kind === 'navigate' ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
      ) : isEmbedOrStub ? (
        <ChevronDown
          className={cn('h-5 w-5 shrink-0 text-slate-300 transition-transform', isOpen && 'rotate-180')}
        />
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Próximamente
        </span>
      )}
    </>
  )

  if (item.kind === 'navigate') {
    return (
      <Link
        to={item.to}
        data-testid={`config-hub-${item.id}`}
        className="flex w-full items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-soft transition-colors hover:border-blue-200 hover:bg-blue-50/30"
      >
        {rowContent}
      </Link>
    )
  }

  if (item.kind === 'embed' || item.kind === 'stub') {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          data-testid={`config-hub-${item.id}`}
          aria-expanded={isOpen}
          className={cn(
            'flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/80',
            isOpen && 'border-b border-slate-100 bg-slate-50/50'
          )}
        >
          {rowContent}
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-4 sm:px-6">
                {item.kind === 'embed' ? (
                  <EmbedPanel embedKey={item.embed} />
                ) : (
                  <p className="py-6 text-center text-sm text-slate-400">Próximamente</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return null
}

export default function ConfiguracionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openParam = searchParams.get('open')
  const [openId, setOpenId] = useState(() => {
    if (openParam && ALL_ITEMS.some((i) => i.id === openParam)) return openParam
    return null
  })

  const hasExpanded = Boolean(openId)

  useEffect(() => {
    if (openParam && ALL_ITEMS.some((i) => i.id === openParam) && openParam !== openId) {
      setOpenId(openParam)
    }
  }, [openParam, openId])

  const onToggle = useCallback(
    (id) => {
      setOpenId((prev) => {
        const next = prev === id ? null : id
        if (next) {
          setSearchParams({ open: next }, { replace: true })
        } else {
          setSearchParams({}, { replace: true })
        }
        return next
      })
    },
    [setSearchParams]
  )

  const containerWidth = useMemo(
    () => (hasExpanded ? 'max-w-[1400px]' : 'max-w-3xl'),
    [hasExpanded]
  )

  return (
    <div
      className={cn('mx-auto w-full space-y-8 p-6 transition-all sm:p-8', containerWidth)}
      data-testid="configuracion-hub"
    >
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
              <SettingsRow key={item.id} item={item} open={openId} onToggle={onToggle} />
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
