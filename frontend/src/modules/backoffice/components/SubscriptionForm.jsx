import { useState } from 'react'
import { backofficeApi } from '@/services/backofficeApi'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BackofficeSelect as Select } from './BackofficeSelect'

export const subscriptionLabels = {
  active: 'Activa',
  trial: 'Prueba',
  cancelled: 'Cancelada',
  expired: 'Vencida',
  scheduled: 'Inicio pendiente',
}

function localDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function SubscriptionForm({ workspaceId, subscription, onSaved, onReload }) {
  const [status, setStatus] = useState(subscription.status)
  const [start, setStart] = useState(localDateTime(subscription.startedAt))
  const [end, setEnd] = useState(localDateTime(subscription.endsAt))
  const [notes, setNotes] = useState(subscription.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const data = await backofficeApi.updateSubscription(workspaceId, {
        version: subscription.version,
        status,
        startedAt: new Date(start).toISOString(),
        endsAt: end ? new Date(end).toISOString() : null,
        notes: notes || null,
      })
      onSaved(data)
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la suscripción.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Estado efectivo: <strong>{subscriptionLabels[subscription.effectiveStatus]}</strong>. Las
        fechas se muestran en tu zona horaria.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Estado de suscripción
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {['active', 'trial', 'cancelled', 'expired'].map((item) => (
              <option key={item} value={item}>
                {subscriptionLabels[item]}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          Inicio de suscripción
          <Input
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Fin de suscripción
          <Input
            type="datetime-local"
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <label className="block text-sm">
        Notas
        <textarea
          className="mt-1 w-full rounded-xl border border-slate-200 p-3"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="text-xs text-slate-500">
        Una suscripción cancelada, vencida o aún no iniciada bloquea los módulos comerciales. La
        suspensión de la compañía se gestiona por separado.
      </p>
      {error && (
        <div role="alert" className="text-sm text-amber-800">
          {error}
          <Button type="button" variant="secondary" size="sm" onClick={onReload}>
            Recargar datos actuales
          </Button>
        </div>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar vigencia'}
      </Button>
    </form>
  )
}
