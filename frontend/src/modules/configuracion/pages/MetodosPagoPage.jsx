import { useCallback, useEffect, useState } from 'react'
import * as Icons from 'lucide-react'
import { CreditCard, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { administrationGateway } from '@/services/administrationApi'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { configPageClass } from '../lib/pageShell'

function mapMethod(method) {
  return {
    id: method.id,
    code: method.code,
    name: method.name,
    icon: method.icon || 'Wallet',
    enabled: method.status === 'active',
    core: Boolean(method.isSystem),
    version: method.version,
  }
}

function methodCode(name) {
  return `${name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)}-${Date.now().toString(36).slice(-5)}`
}

export default function MetodosPagoPage({ embedded = false }) {
  const online = useSessionStore((state) => state.status === 'online')
  const localMethods = useConfigStore((state) => state.paymentMethods)
  const toggleLocal = useConfigStore((state) => state.togglePaymentMethod)
  const addLocal = useConfigStore((state) => state.addPaymentMethod)
  const deleteLocal = useConfigStore((state) => state.deletePaymentMethod)
  const [apiMethods, setApiMethods] = useState([])
  const [gatewayState, setGatewayState] = useState({ status: 'loading', source: null, error: null })
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const load = useCallback(async () => {
    if (!online) return
    setGatewayState({ status: 'loading', source: null, error: null })
    try {
      const result = await administrationGateway.read('paymentMethods')
      setApiMethods(result.data.map(mapMethod))
      setGatewayState({ status: result.status, source: result.source, error: result.error })
    } catch (error) {
      setGatewayState({ status: 'error', source: null, error })
    }
  }, [online])

  useEffect(() => { load() }, [load])

  const methods = online ? apiMethods : localMethods

  const submit = async () => {
    if (!name.trim()) return setErrorMessage('Ingresa el nombre del método.')
    try {
      if (online) {
        await administrationGateway.mutate('createPaymentMethod', {
          code: methodCode(name),
          name: name.trim(),
          icon: 'Wallet',
        })
      } else {
        addLocal(name.trim())
      }
      toast.success('Método de pago agregado')
      setName('')
      setErrorMessage('')
      setModalOpen(false)
      await load()
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo crear el método de pago.')
    }
  }

  const toggle = async (method) => {
    try {
      if (online) {
        await administrationGateway.mutate('updatePaymentMethod', method.id, {
          status: method.enabled ? 'inactive' : 'active',
          version: method.version,
        })
      } else {
        toggleLocal(method.id)
      }
      await load()
    } catch (error) {
      toast.error(error.message || 'No se pudo cambiar el estado.')
    }
  }

  const archive = async (method) => {
    try {
      if (online) await administrationGateway.mutate('archivePaymentMethod', method.id, method.version)
      else deleteLocal(method.id)
      toast.success('Método archivado')
      await load()
    } catch (error) {
      toast.error(error.message || 'No se pudo archivar el método.')
    }
  }

  return (
    <div className={configPageClass(embedded, 'max-w-[1200px]')}>
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-700">
        <CreditCard className="h-4 w-4 shrink-0" /> Solo los métodos activos aparecen al cobrar en el POS.
        {online && <span className="ml-auto text-xs">{gatewayState.status} · {gatewayState.source || 'sin fuente'}</span>}
      </div>
      {gatewayState.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{gatewayState.error.message}</p>}

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-slate-800">Métodos de pago</h3>
        <Button onClick={() => { setName(''); setErrorMessage(''); setModalOpen(true) }} data-testid="metodo-new-btn"><Plus className="h-4 w-4" /> Nuevo método</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="metodos-list">
        {methods.map((method) => {
          const Icon = Icons[method.icon] || Icons.Wallet
          return (
            <Card key={method.id} className="flex items-center gap-3 p-4" data-testid={`metodo-${method.id}`}>
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', method.enabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400')}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{method.name}</p><p className="text-xs text-slate-400">{method.core ? 'Predefinido' : 'Personalizado'}</p></div>
              <button onClick={() => toggle(method)} data-testid={`metodo-toggle-${method.id}`} className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', method.enabled ? 'bg-blue-600' : 'bg-slate-300')}><span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', method.enabled ? 'translate-x-5' : 'translate-x-0.5')} /></button>
              {!method.core && <button onClick={() => archive(method)} data-testid={`metodo-delete-${method.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
            </Card>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo método de pago" testId="metodo-modal">
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label><Input value={name} onChange={(event) => { setName(event.target.value); setErrorMessage('') }} placeholder="Ej. PayPal" data-testid="metodo-field-name" /></div>
          {errorMessage && <p className="text-sm font-medium text-red-500">{errorMessage}</p>}
          <div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} data-testid="metodo-cancel">Cancelar</Button><Button className="flex-1" onClick={submit} data-testid="metodo-save">Agregar</Button></div>
        </div>
      </Modal>
    </div>
  )
}
