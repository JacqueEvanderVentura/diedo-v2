import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { NAV_GROUPS } from '@/data/navigation'
import { useUiStore } from '@/stores/uiStore'
import { CURRENT_USER } from '@/data/dashboard'

function isGroupActive(group, pathname) {
  return group.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))
}

function SingleItem({ item, collapsed, onNavigate }) {
  const Icon = Icons[item.icon] || Icons.Circle
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      data-testid={`nav-${item.id}`}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-[background-color,color] duration-200',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <motion.span
              layoutId="nav-active"
              className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-blue-600"
            />
          )}
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && item.soon && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Pronto
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function GroupItem({ group, collapsed, open, onToggle, onNavigate }) {
  const Icon = Icons[group.icon] || Icons.Circle
  const navigate = useNavigate()
  const location = useLocation()
  const active = isGroupActive(group, location.pathname)

  if (collapsed) {
    return (
      <button
        onClick={() => navigate(group.children[0].to)}
        title={group.label}
        data-testid={`nav-${group.id}`}
        className={cn(
          'flex w-full items-center justify-center rounded-xl px-0 py-2.5 transition-colors',
          active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
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
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-[background-color,color] duration-200',
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
                      'relative flex items-center gap-2 rounded-lg py-2 pl-11 pr-3 text-sm transition-colors',
                      isActive
                        ? 'font-semibold text-blue-700'
                        : 'font-medium text-slate-500 hover:text-slate-800'
                    )
                  }
                >
                  <span className="flex-1 truncate">{c.label}</span>
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

function SidebarContent({ collapsed, onNavigate, onClose }) {
  const location = useLocation()
  const [open, setOpen] = useState({})

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev }
      NAV_GROUPS.forEach((g) => {
        if (g.children && isGroupActive(g, location.pathname)) next[g.id] = true
      })
      return next
    })
  }, [location.pathname])

  const toggle = (id) => setOpen((p) => ({ ...p, [id]: !p[id] }))

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn('flex h-20 shrink-0 items-center gap-3 px-5', collapsed && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 font-heading text-lg font-bold text-white">
          D
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-heading text-base font-bold tracking-tight text-slate-900">Diedo App</p>
            <p className="truncate text-[11px] font-medium text-slate-400">Admin Console</p>
          </div>
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

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin px-3 py-2">
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
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className={cn('flex items-center gap-3 rounded-xl p-2', collapsed && 'justify-center')}>
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

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (isDesktop) {
    return (
      <aside
        data-testid="sidebar-desktop"
        className={cn(
          'relative hidden shrink-0 border-r border-slate-100 bg-white transition-[width] duration-300 lg:block',
          sidebarCollapsed ? 'w-[76px]' : 'w-[256px]'
        )}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
        <button
          onClick={toggleCollapse}
          data-testid="sidebar-collapse-toggle"
          className="absolute -right-3 top-24 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-blue-600"
        >
          <Icons.ChevronLeft className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
        </button>
      </aside>
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
