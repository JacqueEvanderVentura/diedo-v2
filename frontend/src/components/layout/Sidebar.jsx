import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/data/navigation'
import { useUiStore } from '@/stores/uiStore'
import { CURRENT_USER } from '@/data/dashboard'

function NavItem({ item, collapsed, onNavigate }) {
  const Icon = Icons[item.icon] || Icons.Circle
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      data-testid={`nav-${item.id}`}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color] duration-200',
          isActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
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

function SidebarContent({ collapsed, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-20 items-center gap-3 px-5', collapsed && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 font-heading text-lg font-bold text-white">
          D
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-heading text-base font-bold tracking-tight text-slate-900">Diedo</p>
            <p className="text-[11px] font-medium text-slate-400">Vilma AI</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.id} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className={cn('border-t border-slate-100 p-3', collapsed && 'px-2')}>
        <div className={cn('flex items-center gap-3 rounded-xl p-2', collapsed && 'justify-center')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
            {CURRENT_USER.initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-800">{CURRENT_USER.name}</p>
              <p className="text-xs text-slate-400">{CURRENT_USER.role}</p>
            </div>
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
          sidebarCollapsed ? 'w-[76px]' : 'w-[248px]'
        )}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
        <button
          onClick={toggleCollapse}
          data-testid="sidebar-collapse-toggle"
          className="absolute -right-3 top-24 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:text-blue-600"
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
            className="fixed inset-y-0 left-0 z-50 w-[264px] border-r border-slate-100 bg-white lg:hidden"
          >
            <SidebarContent collapsed={false} onNavigate={closeSidebar} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
