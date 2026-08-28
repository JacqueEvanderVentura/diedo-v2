import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { NAV_GROUPS } from '@/data/navigation'
import { useUiStore } from '@/stores/uiStore'
import { usePosStore } from '@/stores/posStore'
import { useConfigStore } from '@/stores/configStore'
import { CURRENT_USER } from '@/data/dashboard'
import { DiedoIcon } from '@/components/brand/DiedoIcon'

const PILL_SPRING = { type: 'spring', stiffness: 420, damping: 34 }
const RAIL_WIDTH = 76
const EXPANDED_WIDTH = 256
const SLIDE = { duration: 0.28, ease: [0.4, 0, 0.2, 1] }

function isGroupActive(group, pathname) {
  return group.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))
}

function isItemActive(item, pathname) {
  return pathname === item.to || pathname.startsWith(item.to + '/')
}

function measureRelative(el, ancestor) {
  const a = ancestor.getBoundingClientRect()
  const e = el.getBoundingClientRect()
  return {
    top: e.top - a.top,
    left: e.left - a.left,
    width: e.width,
    height: e.height,
  }
}

function ActivePill({ box, animate }) {
  return (
    <motion.div
      aria-hidden
      data-testid="nav-active-pill"
      className="pointer-events-none absolute z-0 rounded-xl bg-blue-50"
      initial={false}
      animate={
        box
          ? { top: box.top, left: box.left, width: box.width, height: box.height, opacity: 1 }
          : { opacity: 0 }
      }
      transition={animate ? PILL_SPRING : { duration: 0 }}
    >
      <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-blue-600" />
    </motion.div>
  )
}

function SingleItem({ item, collapsed, onNavigate }) {
  const Icon = Icons[item.icon] || Icons.Circle
  const { pathname } = useLocation()
  const active = isItemActive(item, pathname)

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      data-testid={`nav-${item.id}`}
      data-nav-module=""
      data-active={active ? 'true' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative z-10 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-out',
        collapsed && 'justify-center px-0',
        active ? 'text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.soon && (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
          Pronto
        </span>
      )}
    </NavLink>
  )
}

function GroupItem({ group, collapsed, open, onToggle, onNavigate }) {
  const Icon = Icons[group.icon] || Icons.Circle
  const navigate = useNavigate()
  const location = useLocation()
  const active = isGroupActive(group, location.pathname)
  const pendingCxc = usePosStore((s) => s.receivables.filter((r) => r.status === 'pending').length)

  if (collapsed) {
    return (
      <button
        onClick={() => {
          onNavigate?.()
          navigate(group.children[0].to)
        }}
        title={group.label}
        data-testid={`nav-${group.id}`}
        data-nav-module=""
        data-active={active ? 'true' : undefined}
        className={cn(
          'relative z-10 flex w-full items-center justify-center rounded-xl px-0 py-2.5 transition-all duration-200 ease-out',
          active ? 'text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        )}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => onToggle(group.id)}
        data-testid={`nav-group-${group.id}`}
        data-nav-module=""
        data-active={active ? 'true' : undefined}
        className={cn(
          'relative z-10 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-out',
          active ? 'text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <Icons.ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {group.children.map((c) => (
              <li key={c.to}>
                <NavLink
                  to={c.to}
                  end
                  onClick={onNavigate}
                  data-testid={`nav-sub-${c.to}`}
                  className={({ isActive }) =>
                    cn(
                      'relative z-10 flex items-center gap-2 rounded-lg py-2 pl-11 pr-3 text-sm transition-colors',
                      isActive
                        ? 'font-semibold text-blue-700'
                        : 'font-medium text-slate-500 hover:text-slate-800'
                    )
                  }
                >
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.to === '/pos/cuentas-por-cobrar' && pendingCxc > 0 && (
                    <span
                      data-testid="nav-cxc-badge"
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white"
                    >
                      {pendingCxc}
                    </span>
                  )}
                  {c.soon && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Pronto
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function deriveOpenGroups(pathname) {
  const next = {}
  NAV_GROUPS.forEach((g) => {
    if (g.children && isGroupActive(g, pathname)) next[g.id] = true
  })
  return next
}

function CollapseToggle({ collapsed, pinned, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="sidebar-collapse-toggle"
      title={pinned ? 'Contraer barra lateral' : 'Fijar barra lateral expandida'}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-600',
        pinned && 'text-blue-600'
      )}
    >
      <Icons.PanelLeft className={cn('h-[18px] w-[18px]', collapsed && 'scale-x-[-1]')} />
    </button>
  )
}

function SidebarContent({ collapsed, onNavigate, onClose, onToggleCollapse, pinned }) {
  const location = useLocation()
  const businessName = useConfigStore((s) => s.settings.businessName)
  const [open, setOpen] = useState(() => deriveOpenGroups(location.pathname))
  const navRef = useRef(null)
  const canAnimate = useRef(false)
  const [pill, setPill] = useState({ box: null, animate: false })

  useEffect(() => {
    if (collapsed) {
      setOpen({})
      return
    }
    setOpen((prev) => {
      const next = { ...prev }
      NAV_GROUPS.forEach((g) => {
        if (g.children && isGroupActive(g, location.pathname)) next[g.id] = true
      })
      return next
    })
  }, [location.pathname, collapsed])

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const measure = () => {
      const el = nav.querySelector('[data-nav-module][data-active="true"]')
      const nextBox = el ? measureRelative(el, nav) : null
      const nextAnimate = canAnimate.current
      setPill((prev) => {
        if (
          prev.animate === nextAnimate &&
          ((prev.box === null && nextBox === null) ||
            (prev.box &&
              nextBox &&
              Math.abs(prev.box.top - nextBox.top) < 0.5 &&
              Math.abs(prev.box.left - nextBox.left) < 0.5 &&
              Math.abs(prev.box.width - nextBox.width) < 0.5 &&
              Math.abs(prev.box.height - nextBox.height) < 0.5))
        ) {
          return prev
        }
        return { box: nextBox, animate: nextAnimate }
      })
    }

    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    const active = nav.querySelector('[data-nav-module][data-active="true"]')
    if (active) ro.observe(active)

    const id = requestAnimationFrame(() => {
      canAnimate.current = true
    })

    return () => {
      ro.disconnect()
      cancelAnimationFrame(id)
    }
  }, [location.pathname, collapsed, open])

  const toggle = (id) => setOpen((p) => ({ ...p, [id]: !p[id] }))

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {/* Brand */}
      <div className={cn('flex h-20 shrink-0 items-center gap-3 overflow-hidden px-4 transition-all duration-200 ease-out', collapsed && 'justify-center px-0')}>
        <DiedoIcon className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-heading text-base font-bold tracking-tight text-slate-900">{businessName || 'Diedo App'}</p>
            <p className="truncate text-[11px] font-medium text-slate-400">Admin Console</p>
          </div>
        )}
        {!collapsed && onToggleCollapse && (
          <CollapseToggle collapsed={false} pinned={pinned} onClick={onToggleCollapse} />
        )}
        {onClose && !collapsed && (
          <button
            onClick={onClose}
            data-testid="sidebar-close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <Icons.X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav — pill is a sibling overlay so it can translate between modules */}
      <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
        <div ref={navRef} className="relative flex flex-col gap-1 overflow-hidden px-3 py-2">
          {!collapsed && <ActivePill box={pill.box} animate={pill.animate} />}
          {NAV_GROUPS.map((g) =>
            g.children ? (
              <GroupItem
                key={g.id}
                group={g}
                collapsed={collapsed}
                open={!!open[g.id]}
                onToggle={toggle}
                onNavigate={onNavigate}
              />
            ) : (
              <SingleItem key={g.id} item={g} collapsed={collapsed} onNavigate={onNavigate} />
            )
          )}
        </div>
      </nav>

      {/* User footer */}
      <div className="shrink-0 overflow-hidden border-t border-slate-100 p-3">
        <div className={cn('flex items-center gap-3 rounded-xl p-2 transition-all duration-200 ease-out', collapsed && 'justify-center')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {CURRENT_USER.initials}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-slate-800">{CURRENT_USER.name}</p>
                <p className="text-xs text-slate-400">{CURRENT_USER.role}</p>
              </div>
              <button
                onClick={() => toast('Sesión cerrada (simulado)')}
                data-testid="sidebar-logout"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <Icons.LogOut className="h-[18px] w-[18px]" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  const { sidebarOpen, closeSidebar, sidebarCollapsed, toggleCollapse } = useUiStore()
  const [isDesktop, setIsDesktop] = useState(true)
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const leaveTimer = useRef(null)

  const pinned = !sidebarCollapsed

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!sidebarCollapsed) setHoverExpanded(false)
  }, [sidebarCollapsed])

  useEffect(() => () => clearTimeout(leaveTimer.current), [])

  const clearLeaveTimer = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
  }

  const handleHoverEnter = () => {
    if (!sidebarCollapsed) return
    clearLeaveTimer()
    setHoverExpanded(true)
  }

  const handleHoverLeave = () => {
    if (!sidebarCollapsed) return
    leaveTimer.current = setTimeout(() => {
      setHoverExpanded(false)
    }, 160)
  }

  const handleToggleCollapse = () => {
    clearLeaveTimer()
    setHoverExpanded(false)
    toggleCollapse()
  }

  const handleNavigate = () => {
    clearLeaveTimer()
    // Rail hover: stay open while the cursor remains over the sidebar.
    if (!sidebarCollapsed) setHoverExpanded(false)
  }

  if (isDesktop) {
    const panelWidth = pinned ? EXPANDED_WIDTH : hoverExpanded ? EXPANDED_WIDTH : RAIL_WIDTH

    return (
      <motion.aside
        data-testid="sidebar-desktop"
        className={cn(
          'relative hidden h-full shrink-0 lg:block',
          pinned ? 'z-30 overflow-hidden' : 'z-40 overflow-visible'
        )}
        initial={false}
        animate={{ width: pinned ? EXPANDED_WIDTH : RAIL_WIDTH }}
        transition={SLIDE}
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
      >
        <motion.div
          className={cn(
            'h-full overflow-hidden border-r border-slate-100 bg-white',
            !pinned && 'absolute inset-y-0 left-0 z-50',
            !pinned && hoverExpanded && 'shadow-[4px_0_32px_rgba(15,23,42,0.12)]'
          )}
          initial={false}
          animate={{ width: panelWidth }}
          transition={SLIDE}
        >
          <div className="h-full overflow-hidden" style={{ width: panelWidth }}>
            <SidebarContent
              collapsed={!pinned && !hoverExpanded}
              onNavigate={handleNavigate}
              onToggleCollapse={pinned || hoverExpanded ? handleToggleCollapse : undefined}
              pinned={pinned}
            />
          </div>
        </motion.div>
      </motion.aside>
    )
  }

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSidebar}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            data-testid="sidebar-drawer"
            className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-100 bg-white lg:hidden"
          >
            <SidebarContent collapsed={false} onNavigate={closeSidebar} onClose={closeSidebar} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
