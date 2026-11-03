import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { branchIdsLabel, isAllBranchSelection } from '@/lib/branches'
import { computeFloatingPosition } from '@/lib/floatingPosition'
import { cn } from '@/lib/utils'

export function BranchMultiSelect({
  branches = [],
  branchIds = [],
  onChange,
  className,
  testId = 'branch-multi-select',
  allLabel = 'Todas las sucursales',
  selectionMode = 'multiple',
  disabled = false,
  showAllOption = true,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const [menuStyle, setMenuStyle] = useState({ top: 0, left: 0, width: 0, flip: false })
  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.active !== false),
    [branches]
  )

  const updatePosition = () => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(rect.width, 260)
    const rowHeight = 40
    const allExtra = selectionMode === 'multiple' && showAllOption ? rowHeight + 12 : 0
    const estimatedHeight = Math.min(activeBranches.length * rowHeight + allExtra + 16, 320)
    const menuHeight = menuRef.current?.getBoundingClientRect().height || estimatedHeight
    const next = computeFloatingPosition({
      anchorRect: rect,
      menuWidth: width,
      menuHeight,
    })
    setMenuStyle({ ...next, width })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    requestAnimationFrame(updatePosition)
  }, [open, activeBranches.length, selectionMode, showAllOption])

  useEffect(() => {
    if (!open) return
    const onScroll = () => updatePosition()
    const onResize = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, activeBranches.length, selectionMode, showAllOption])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (event.target.closest?.('[data-branch-multi-menu]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const label = selectionMode === 'single'
    ? (branchIds.length
      ? activeBranches.find((branch) => branch.id === branchIds[0])?.name || 'Sucursal'
      : 'Seleccionar sucursal…')
    : showAllOption
      ? branchIdsLabel(activeBranches, branchIds, { allLabel })
      : (branchIds.length
        ? branchIdsLabel(activeBranches, branchIds, { allLabel: '' })
        : 'Seleccionar sucursales…')

  const toggleAll = () => onChange?.([])

  const toggleBranch = (branchId) => {
    if (selectionMode === 'single') {
      onChange?.(branchIds.includes(branchId) ? [] : [branchId])
      setOpen(false)
      return
    }
    const selected = new Set(branchIds)
    if (selected.has(branchId)) {
      selected.delete(branchId)
    } else {
      selected.add(branchId)
    }
    onChange?.([...selected])
  }

  const allSelected = selectionMode === 'multiple' && showAllOption && isAllBranchSelection(branchIds)

  const menu = open ? (
    <div
      ref={menuRef}
      data-branch-multi-menu
      style={{
        position: 'fixed',
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        zIndex: 120,
      }}
      className="max-h-60 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-xl scrollbar-thin"
      data-testid={`${testId}-menu`}
    >
      {selectionMode === 'multiple' && showAllOption && (
        <>
          <button
            type="button"
            onClick={toggleAll}
            data-testid={`${testId}-all`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border',
                allSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
              )}
            >
              {allSelected && <Check className="h-3 w-3" />}
            </span>
            {allLabel}
          </button>
          <div className="my-1 border-t border-slate-100" />
        </>
      )}

      {activeBranches.map((branch) => {
        const checked = showAllOption
          ? !allSelected && branchIds.includes(branch.id)
          : branchIds.includes(branch.id)
        const isSingleActive = selectionMode === 'single' && branchIds.includes(branch.id)
        return (
          <button
            key={branch.id}
            type="button"
            onClick={() => toggleBranch(branch.id)}
            data-testid={`${testId}-option-${branch.id}`}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50',
              selectionMode === 'single' && isSingleActive && 'bg-blue-50 font-semibold text-blue-700',
            )}
          >
            {selectionMode === 'multiple' ? (
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border',
                  checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                )}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
            ) : (
              isSingleActive ? <Check className="h-4 w-4 shrink-0 text-blue-600" /> : <span className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{branch.name}</span>
          </button>
        )
      })}
    </div>
  ) : null

  return (
    <div ref={rootRef} className={cn('relative', className)} data-testid={testId}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((value) => !value)}
        data-testid={`${testId}-trigger`}
        className={cn(
          'flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {typeof document !== 'undefined' && createPortal(menu, document.body)}
    </div>
  )
}
