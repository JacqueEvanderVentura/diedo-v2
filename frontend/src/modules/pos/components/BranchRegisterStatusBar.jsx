import { Building2 } from 'lucide-react'
import { resolveBranchRegisterOpen } from '../lib/registerBranchState'
import { cn } from '@/lib/utils'

export function BranchRegisterStatusBar({
  branches = [],
  cajaBranchId,
  registerByBranch = {},
  posState,
  onSelect,
  className,
}) {
  const activeBranches = branches.filter((branch) => branch.active !== false)
  if (activeBranches.length <= 1) return null

  return (
    <div className={cn('rounded-xl border border-slate-100 bg-white p-3 shadow-soft', className)} data-testid="caja-branch-status-bar">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Building2 className="h-3.5 w-3.5" />
        Cajas por sucursal
      </div>
      <div className="flex flex-wrap gap-2">
        {activeBranches.map((branch) => {
          const open = resolveBranchRegisterOpen(
            { cajaBranchId, registerByBranch, register: posState?.register },
            branch.id
          )
          const selected = branch.id === cajaBranchId
          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => onSelect?.(branch.id)}
              data-testid={`caja-branch-status-${branch.id}`}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                selected
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-slate-50'
              )}
            >
              <span className="block font-semibold">{branch.name}</span>
              <span className={cn('text-xs font-medium', open ? 'text-emerald-600' : 'text-slate-400')}>
                {open ? 'Abierta' : 'Cerrada'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
