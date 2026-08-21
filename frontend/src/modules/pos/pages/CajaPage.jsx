import { useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Banknote, TrendingUp, ReceiptText, Wallet, PlusCircle, Lock, Unlock, Clock } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ExpenseModal } from '../components/ExpenseModal'

const fmtTime = (iso) =>
  new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function Stat({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <Card className="p-5" data-testid={`caja-stat-${label}`}>
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight text-slate-900">{value}</p>
    </Card>
  )
}

export default function CajaPage() {
  const register = usePosStore((s) => s.register)
  const cashSales = usePosStore((s) => s.cashSales)
  const expenses = usePosStore((s) => s.expenses)
  const getCashExpenses = usePosStore((s) => s.getCashExpenses)
  const getCashInDrawer = usePosStore((s) => s.getCashInDrawer)
  const openRegister = usePosStore((s) => s.openRegister)
  const closeRegister = usePosStore((s) => s.closeRegister)
  const lastCloseSummary = usePosStore((s) => s.lastCloseSummary)

  const [openInput, setOpenInput] = useState('')
  const [expenseOpen, setExpenseOpen] = useState(false)

  const handleOpen = () => {
    openRegister(openInput || 0)
    toast.success(`Caja abierta con ${formatDOP(openInput || 0)}`)
    setOpenInput('')
  }

  const handleClose = () => {
    closeRegister()
    toast.success('Caja cerrada. Revisa el resumen del turno.')
  }

  if (!register.open) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6 sm:p-8">
        <Card className="p-8" data-testid="caja-open-card">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Unlock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-slate-900">Abrir caja</h2>
              <p className="text-sm text-slate-400">Registra el efectivo inicial del turno.</p>
            </div>
          </div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Efectivo inicial (DOP$)</label>
          <input
            type="number"
            value={openInput}
            onChange={(e) => setOpenInput(e.target.value)}
            placeholder="0.00"
            data-testid="caja-opening-input"
            className="mb-4 w-full rounded-xl border-0 bg-white py-3 px-4 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
          <Button className="w-full" size="lg" onClick={handleOpen} data-testid="caja-open-btn">
            <Unlock className="h-4 w-4" /> Abrir caja
          </Button>
        </Card>

        {lastCloseSummary && (
          <Card className="p-6" data-testid="caja-last-close">
            <h3 className="mb-4 font-heading text-lg font-semibold text-slate-800">Último cierre</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-500"><dt>Efectivo inicial</dt><dd className="font-medium text-slate-700">{formatDOP(lastCloseSummary.openingCash)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Ventas en efectivo</dt><dd className="font-medium text-slate-700">{formatDOP(lastCloseSummary.cashSales)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Gastos</dt><dd className="font-medium text-red-600">−{formatDOP(lastCloseSummary.expenses)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-heading font-bold text-slate-900">Efectivo esperado</dt><dd className="font-heading text-lg font-bold text-blue-600">{formatDOP(lastCloseSummary.expected)}</dd></div>
              <p className="pt-1 text-xs text-slate-400">Cerrada el {fmtTime(lastCloseSummary.closedAt)}</p>
            </dl>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-semibold text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Caja abierta · desde {fmtTime(register.openedAt)}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setExpenseOpen(true)} data-testid="caja-add-expense">
            <PlusCircle className="h-4 w-4" /> Registrar gasto
          </Button>
          <Button variant="dangerSolid" onClick={handleClose} data-testid="caja-close-btn">
            <Lock className="h-4 w-4" /> Cerrar caja
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Banknote} label="Efectivo inicial" value={formatDOP(register.openingCash)} tone="brand" />
        <Stat icon={TrendingUp} label="Ventas en efectivo" value={formatDOP(cashSales)} tone="green" />
        <Stat icon={ReceiptText} label="Gastos del turno" value={`−${formatDOP(getCashExpenses())}`} tone="red" />
        <Stat icon={Wallet} label="Efectivo en caja" value={formatDOP(getCashInDrawer())} tone="amber" />
      </div>

      <Card className="p-6" data-testid="caja-expenses-list">
        <h3 className="mb-4 font-heading text-lg font-semibold text-slate-800">Gastos del turno</h3>
        {expenses.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Sin gastos registrados" description="Los gastos que registres descuentan el efectivo de la caja." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-3" data-testid={`caja-expense-${e.id}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
                    <ReceiptText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{e.concept}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" /> {fmtTime(e.createdAt)}</p>
                  </div>
                </div>
                <p className="font-heading font-bold text-red-600">−{formatDOP(e.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </div>
  )
}
