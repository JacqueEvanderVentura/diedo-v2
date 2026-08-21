import { Menu, Search, Bell, MessageSquare, ChevronDown } from 'lucide-react'
import { useUiStore } from '@/stores/uiStore'
import { CURRENT_USER } from '@/data/dashboard'

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
        <button
          data-testid="navbar-notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        <button
          data-testid="navbar-messages"
          className="hidden h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 sm:flex"
        >
          <MessageSquare className="h-5 w-5" />
        </button>

        <div className="ml-1 flex items-center gap-3 rounded-xl border border-slate-100 py-1.5 pl-3 pr-2">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold text-slate-800">{CURRENT_USER.name}</p>
            <p className="text-[11px] font-medium text-blue-600">{CURRENT_USER.role}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-sm font-bold text-blue-700">
            {CURRENT_USER.initials}
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
      </div>
    </header>
  )
}
