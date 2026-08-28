import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { AnimatedOutlet } from './AnimatedOutlet'
import { getPageMeta } from '@/data/navigation'

// Persistent chrome: sidebar stays mounted across module/submodule changes.
export function AppFrame() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="relative z-0 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-clip">
        <Outlet />
      </div>
    </div>
  )
}

// Standard inner frame: navbar + scrollable content.
// POS uses its own full-height frame, so it does NOT wrap in PageShell.
export function PageShell() {
  const { pathname } = useLocation()
  const { title, subtitle } = getPageMeta(pathname)

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <Navbar title={title} subtitle={subtitle} />
      <main className="relative z-0 min-h-0 flex-1 overflow-x-clip overflow-y-auto scrollbar-thin [scrollbar-gutter:stable]">
        <AnimatedOutlet />
      </main>
    </div>
  )
}

export default PageShell
