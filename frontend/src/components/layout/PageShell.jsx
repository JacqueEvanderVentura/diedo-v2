import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'

// Standard app frame: sidebar + navbar + scrollable content.
// POS uses its own full-height frame, so it does NOT wrap in PageShell.
export function PageShell({ title, subtitle, children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  )
}

export default PageShell
