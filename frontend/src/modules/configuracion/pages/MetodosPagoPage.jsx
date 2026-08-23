import { useState } from 'react'
import * as Icons from 'lucide-react'
import { toast } from 'sonner'
import { Plus, Trash2, CreditCard } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

export default function MetodosPagoPage() {
  const methods = useConfigStore((s) => s.paymentMethods)
  const toggle = useConfigStore((s) => s.togglePaymentMethod)
  const addMethod = useConfigStore((s) => s.addPaymentMethod)
  const deleteMethod = useConfigStore((s) => s.deletePaymentMethod)

  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  const submit = () => {
    if (!name.trim()) return setErr('Ingresa el nombre del método.')
    addMethod(name.trim()); toast.success('Método de pago agregado'); setName(''); setErr(''); setModalOpen(false)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 sm:p-8">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-700">
        <CreditCard className="h-4 w-4 shrink-0" /> Solo los métodos activos aparecen al cobrar en el POS.
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-slate-800">Métodos de pago</h3>
        <Button onClick={() => { setName(''); setErr(''); setModalOpen(true) }} data-testid="metodo-new-btn"><Plus className="h-4 w-4" /> Nuevo método</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="metodos-list">
        {methods.map((m) => {
          const Icon = Icons[m.icon] || Icons.Wallet
          return (
            <Card key={m.id} className="flex items-center gap-3 p-4" data-testid={`metodo-${m.id}`}>
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', m.enabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400')}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{m.name}</p>
                <p className="text-xs text-slate-400">{m.core ? 'Predefinido' : 'Personalizado'}</p>
              </div>
              <button
                onClick={() => toggle(m.id)}
                data-testid={`metodo-toggle-${m.id}`}
                className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', m.enabled ? 'bg-blue-600' : 'bg-slate-300')}
              >
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', m.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              {!m.core && (
                <button onClick={() => { deleteMethod(m.id); toast.success('Método eliminado') }} data-testid={`metodo-delete-${m.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              )}
            </Card>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo método de pago" testId="metodo-modal">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
            <Input value={name} onChange={(e) => { setName(e.target.value); setErr('') }} placeholder="Ej. PayPal" data-testid="metodo-field-name" />
          </div>
          {err && <p className="text-sm font-medium text-red-500">{err}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} data-testid="metodo-cancel">Cancelar</Button>
            <Button className="flex-1" onClick={submit} data-testid="metodo-save">Agregar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
