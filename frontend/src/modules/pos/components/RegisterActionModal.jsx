import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock, Unlock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Open / close cash register without leaving Terminal POS.
 */
export function RegisterActionModal({ open, mode, onClose }) {
  const branches = useConfigStore((s) => s.branches)
  const branchId = usePosStore((s) => s.branchId)
  const cajaBranchId = usePosStore((s) => s.cajaBranchId)
  const mutating = usePosStore((s) => s.mutating)
  const setCajaBranch = usePosStore((s) => s.setCajaBranch)
  const openRegister = usePosStore((s) => s.openRegister)
  const closeRegister = usePosStore((s) => s.closeRegister)
  const getCashInDrawer = usePosStore((s) => s.getCashInDrawer)
  const canManageRegister = useSessionStore((s) => s.hasPermission('pos.register.manage'))

  const [openInput, setOpenInput] = useState('')
  const [closeInput, setCloseInput] = useState('')
  const [closeError, setCloseError] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState(branchId || cajaBranchId || '')

  const activeBranches = branches.filter((branch) => branch.active !== false)
  const selectedBranch = activeBranches.find((branch) => branch.id === selectedBranchId)
  const expectedCash = mode === 'close' ? getCashInDrawer() : 0

  const syncRegisterViewForPosBranch = usePosStore((s) => s.syncRegisterViewForPosBranch)

  useEffect(() => {
    if (!open) return
    syncRegisterViewForPosBranch().catch(() => null)
    setOpenInput('')
    setCloseInput('')
    setCloseError('')
    setSelectedBranchId(branchId || cajaBranchId || activeBranches[0]?.id || '')
    // Reset form only when the dialog opens — not on every render (activeBranches is unstable).
  }, [open])

  const ensureCajaBranch = () => {
    if (selectedBranchId && selectedBranchId !== cajaBranchId) {
      setCajaBranch(selectedBranchId)
    }
  }

  const handleOpen = async () => {
    if (!canManageRegister) {
      toast.error('No tienes permiso para gestionar la apertura de caja.')
      return
    }
    ensureCajaBranch()
    try {
      await openRegister(openInput || 0)
      toast.success(`Caja abierta con ${formatDOP(openInput || 0)}`)
      onClose()
    } catch (operationError) {
      toast.error(operationError.message || 'No se pudo abrir la caja.')
    }
  }

  const handleClose = async () => {
    if (!canManageRegister) {
      toast.error('No tienes permiso para cerrar la caja.')
      return
    }
    const countedCash = Number(closeInput)
    if (!closeInput.trim() || !Number.isFinite(countedCash) || countedCash < 0) {
      setCloseError('Ingresa el efectivo real contado (un monto mayor o igual a cero).')
      return
    }
    try {
      await closeRegister(countedCash)
      toast.success('Caja cerrada. Revisa el resumen del turno.')
      onClose()
    } catch (operationError) {
      toast.error(operationError.message || 'No se pudo cerrar la caja.')
    }
  }

  const isOpenMode = mode === 'open'

  return (
    <Modal
      open={open}
      onClose={() => {
        if (mutating) return
        onClose()
      }}
      title={isOpenMode ? 'Abrir caja' : 'Arqueo y cierre de caja'}
      testId={isOpenMode ? 'pos-register-open-modal' : 'pos-register-close-modal'}
    >
      {!canManageRegister && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No tienes permiso para {isOpenMode ? 'abrir' : 'cerrar'} la caja. Solicita acceso a un supervisor.
        </p>
      )}

      {isOpenMode ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Registra el efectivo inicial del turno{selectedBranch ? ` en ${selectedBranch.name}` : ''}.
          </p>
          {activeBranches.length > 1 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
              <Select
                value={selectedBranchId}
                onChange={setSelectedBranchId}
                disabled={Boolean(mutating)}
                options={activeBranches.map((branch) => ({ value: branch.id, label: branch.name }))}
                data-testid="pos-register-open-branch"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Efectivo inicial (RD$)</label>
            <input
              type="number"
              value={openInput}
              onChange={(e) => setOpenInput(e.target.value)}
              placeholder="0.00"
              data-testid="pos-register-opening-input"
              className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={Boolean(mutating)}>
              Cancelar
            </Button>
            <Button onClick={handleOpen} disabled={Boolean(mutating) || !canManageRegister} data-testid="pos-register-open-btn">
              <Unlock className="h-4 w-4" /> Abrir caja
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Efectivo esperado</span>
              <span className="font-semibold text-slate-800">{formatDOP(expectedCash)}</span>
            </div>
            {closeInput.trim() && Number.isFinite(Number(closeInput)) && Number(closeInput) >= 0 && (
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-slate-500">
                <span>Diferencia estimada</span>
                <span
                  className={cn(
                    'font-semibold',
                    Math.abs(Number(closeInput) - expectedCash) > 0.009 ? 'text-amber-700' : 'text-emerald-700'
                  )}
                >
                  {formatDOP(Number(closeInput) - expectedCash)}
                </span>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="pos-counted-cash" className="mb-1.5 block text-sm font-medium text-slate-700">
              Efectivo real contado (RD$)
            </label>
            <input
              id="pos-counted-cash"
              type="number"
              min="0"
              step="0.01"
              value={closeInput}
              onChange={(event) => {
                setCloseInput(event.target.value)
                setCloseError('')
              }}
              placeholder="0.00"
              autoFocus
              data-testid="pos-register-counted-input"
              className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
            {closeError && <p className="mt-1.5 text-sm font-medium text-red-600">{closeError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={Boolean(mutating)}>
              Cancelar
            </Button>
            <Button
              variant="dangerSolid"
              onClick={handleClose}
              disabled={Boolean(mutating) || !canManageRegister}
              data-testid="pos-register-confirm-close-btn"
            >
              <Lock className="h-4 w-4" /> Confirmar cierre
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
