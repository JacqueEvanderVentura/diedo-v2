import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { buildCompletionPayload } from '../lib/completion'

export function CompleteAppointmentModal({ open, appointment, onClose, onConfirm, saving = false }) {
  const [step, setStep] = useState('timing')
  const [delayResponsibility, setDelayResponsibility] = useState('center')
  const [completionNote, setCompletionNote] = useState('')
  const [err, setErr] = useState('')

  const reset = () => {
    setStep('timing')
    setDelayResponsibility('center')
    setCompletionNote('')
    setErr('')
  }

  const close = () => {
    if (saving) return
    reset()
    onClose?.()
  }

  const confirm = async (punctuality) => {
    if (saving) return
    if (punctuality === 'delayed' && !delayResponsibility) {
      setErr('Indica quién causó el retraso.')
      return
    }
    setErr('')
    try {
      await onConfirm?.(buildCompletionPayload({
        punctuality,
        delayResponsibility,
        completionNote,
      }))
      reset()
    } catch (error) {
      setErr(error.message || 'No se pudo marcar la cita como cumplida.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Marcar como cumplida"
      testId="complete-appointment-modal"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {appointment?.customerName ? (
            <>¿Cómo se atendió la cita de <span className="font-semibold text-slate-800">{appointment.customerName}</span>?</>
          ) : (
            '¿La cita se atendió a tiempo?'
          )}
        </p>

        {step === 'timing' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              type="button"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => confirm('on_time')}
              disabled={saving}
              data-testid="complete-appointment-on-time"
            >
              <CheckCircle2 className="h-5 w-5" />
              Sí, a tiempo
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setStep('delay')}
              disabled={saving}
              data-testid="complete-appointment-delayed"
            >
              Con retraso
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'center', label: 'Centro' },
                { id: 'customer', label: 'Cliente' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setDelayResponsibility(option.id)}
                  data-testid={`complete-appointment-responsibility-${option.id}`}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-sm font-semibold transition-colors',
                    delayResponsibility === option.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-blue-200'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Nota (opcional)</label>
              <Input
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                placeholder="Detalle breve del retraso"
                data-testid="complete-appointment-note"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setStep('timing')} disabled={saving}>
                Volver
              </Button>
              <Button className="flex-1" onClick={() => confirm('delayed')} disabled={saving} data-testid="complete-appointment-save">
                {saving ? 'Guardando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        )}

        {err && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {err}
          </p>
        )}
      </div>
    </Modal>
  )
}
