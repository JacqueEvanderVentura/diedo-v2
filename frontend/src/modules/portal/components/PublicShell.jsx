import { HeliosIcon } from '@/components/brand/HeliosIcon'

export function PublicShell({ branchName, workspaceName, children, footer }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0e8]/40 to-slate-50">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4 sm:max-w-2xl">
          <div className="flex items-center gap-3">
            <HeliosIcon />
            <div>
              <p className="font-heading font-bold text-slate-900">{workspaceName || 'Portal del cliente'}</p>
              <p className="text-xs text-slate-500">{branchName}</p>
            </div>
          </div>
          {footer}
        </div>
      </header>
      <main className="px-4 py-8">{children}</main>
    </div>
  )
}
