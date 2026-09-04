import { Menu, Search } from 'lucide-react'
import { useUiStore } from '@/stores/uiStore'
import { FEATURES } from '@/config/features'
import { NotificationsPanel } from './NotificationsPanel'
import { UserProfileMenu } from './UserProfileMenu'

export function Navbar({ title, subtitle }) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  return (
    <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center gap-4 border-b border-slate-100 bg-white/85 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={toggleSidebar}
        data-testid="navbar-menu-toggle"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
          {title}
        </h1>
        {subtitle && <p className="truncate text-xs text-slate-400 sm:text-sm">{subtitle}</p>}
      </div>

      <div className="relative hidden max-w-sm flex-1 md:block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          data-testid="navbar-search"
          placeholder="Buscar datos, reportes..."
          className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-transparent transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
        />
      </div>

      <div className="flex items-center gap-1.5">
        {FEATURES.notifications && <NotificationsPanel />}
        <UserProfileMenu />
      </div>
    </header>
  )
}
