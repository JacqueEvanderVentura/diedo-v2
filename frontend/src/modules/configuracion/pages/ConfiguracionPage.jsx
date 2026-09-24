import { useCallback, useMemo, useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, ChevronDown, Settings, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import UsuariosPage from './UsuariosPage'
import PermisosPage from './PermisosPage'
import SucursalesPage from './SucursalesPage'
import CategoriasPage from './CategoriasPage'
import MetodosPagoPage from './MetodosPagoPage'
import PlantillasWaPanel from '../components/PlantillasWaPanel'
import BillingDocumentsPanel from '../components/BillingDocumentsPanel'
import CrmModePanel from '../components/CrmModePanel'
import DataImportPanel from '../components/DataImportPanel'
import PerfilWorkspacePanel from '../components/PerfilWorkspacePanel'
import AgendaCabinasPanel from '../components/AgendaCabinasPanel'
import ChatChannelsPanel from '../components/ChatChannelsPanel'
import { SETTINGS_ITEMS, SETTINGS_SECTIONS } from '../lib/settingsHub'
import { filterSettingsSections, shouldForceExpandSettingsItem } from '../lib/settingsSearch'

function resolveOpenTarget(openParam) {
  if (!openParam) return null
  const direct = SETTINGS_ITEMS.find((item) => item.id === openParam)
  if (direct) return { itemId: direct.id, blockId: null }
  const parents = SETTINGS_ITEMS.filter((item) =>
    (item.blocks || []).some((block) => block.id === openParam),
  )
  if (parents.length === 1) return { itemId: parents[0].id, blockId: openParam }
  return null
}

function scrollToSettingsTarget(itemId, blockId) {
  const blockNode = blockId
    ? document.querySelector(`[data-settings-block="${itemId}:${blockId}"]`)
    : null
  const node = blockNode || document.getElementById(`config-hub-anchor-${itemId}`)
  node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const EMBED_MAP = {
  usuarios: UsuariosPage,
  permisos: PermisosPage,
  sucursales: SucursalesPage,
  categorias: CategoriasPage,
  'metodos-pago': MetodosPagoPage,
  whatsapp: PlantillasWaPanel,
  'billing-documents': BillingDocumentsPanel,
  'crm-mode': CrmModePanel,
  datos: DataImportPanel,
  perfil: PerfilWorkspacePanel,
  'agenda-cabinas': AgendaCabinasPanel,
  'chat-canales': ChatChannelsPanel,
}

function EmbedPanel({ embedKey, visibleBlockIds }) {
  const Component = EMBED_MAP[embedKey]
  if (!Component) return null
  return <Component embedded visibleBlockIds={visibleBlockIds} />
}

function SettingsRow({ item, open, onToggle, forceOpen, visibleBlockIds }) {
  const Icon = item.icon
  const isOpen = forceOpen || open === item.id
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
        id={`config-hub-anchor-${item.id}`}
        to={item.to}
        data-testid={`config-hub-${item.id}`}
        className="flex w-full scroll-mt-24 items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3.5 shadow-soft transition-colors hover:border-blue-200 hover:bg-blue-50/30"
      >
        {rowContent}
      </Link>
    )
  }

  if (item.kind === 'embed' || item.kind === 'stub') {
    return (
      <div
        id={`config-hub-anchor-${item.id}`}
        className="scroll-mt-24 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft"
      >
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
                  <EmbedPanel embedKey={item.embed} visibleBlockIds={visibleBlockIds} />
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
  const openTarget = useMemo(() => resolveOpenTarget(openParam), [openParam])
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(() => openTarget?.itemId ?? null)

  const sections = useMemo(() => filterSettingsSections(SETTINGS_SECTIONS, query), [query])
  const visibleItems = useMemo(() => sections.flatMap((section) => section.items), [sections])
  const hasForcedExpand = visibleItems.some((item) => shouldForceExpandSettingsItem(item, query))
  const hasExpanded = Boolean(openId) || hasForcedExpand

  useEffect(() => {
    if (openTarget?.itemId && openTarget.itemId !== openId) {
      setOpenId(openTarget.itemId)
    }
  }, [openTarget, openId])

  useEffect(() => {
    const queryActive = Boolean(query.trim())
    const targetId = queryActive ? visibleItems[0]?.id : openTarget?.itemId
    if (!targetId) return undefined
    const blockId = queryActive
      ? (visibleItems[0]?.match === 'block' ? visibleItems[0].visibleBlockIds?.[0] : null)
      : openTarget?.blockId
    const timer = window.setTimeout(() => scrollToSettingsTarget(targetId, blockId), 80)
    return () => window.clearTimeout(timer)
  }, [query, openTarget, visibleItems])

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
          <p className="text-sm text-slate-500">Personaliza tu experiencia en Helios 360</p>
        </div>
      </div>

      <div className="max-w-xl">
        <Input
          icon={Search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar ajustes, secciones o campos…"
          data-testid="config-hub-search"
        />
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500" data-testid="config-hub-empty">
          No hay ajustes que coincidan con “{query.trim()}”.
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.title}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{section.title}</h3>
            <div className="space-y-2">
              {section.items.map((item) => {
                const urlBlocks =
                  !query.trim() && openTarget?.blockId && item.id === openTarget.itemId
                    ? [openTarget.blockId]
                    : null
                return (
                <SettingsRow
                  key={item.id}
                  item={item}
                  open={openId}
                  onToggle={onToggle}
                  forceOpen={shouldForceExpandSettingsItem(item, query)}
                  visibleBlockIds={urlBlocks || item.visibleBlockIds}
                />
                )
              })}
            </div>
          </section>
        ))
      )}

      <footer className="border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
        <p className="font-semibold text-slate-500">Helios 360 v1.0.0</p>
        <p className="mt-1">© 2024 Todos los derechos reservados</p>
      </footer>
    </div>
  )
}
