import { useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatDOP } from '@/lib/format'
import { PREVIEW_SERVICES } from '../data/preview'

function PreviewField({ label, value = '', placeholder = '', type = 'text', testId }) {
  return <label className="block min-w-0 text-xs font-semibold text-slate-700">{label}<Input className="mt-2" type={type} value={value} placeholder={placeholder} readOnly data-testid={testId} /></label>
}

// Demo previews never mutate connected data.
export function CarwashPreviewModal({ preview, onClose }) {
  const contentRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = contentRef.current?.closest('[role="dialog"]')
    const focusable = () => [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])]
    focusable()[0]?.focus()
    const trap = (event) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    dialog?.addEventListener('keydown', trap)
    return () => { dialog?.removeEventListener('keydown', trap); previous?.focus?.() }
  }, [])
  const isService = preview.type === 'service'
  const service = preview.service
  return (
    <Modal open onClose={onClose} title={isService ? (service ? 'Editar Servicio / Lavado' : 'Agregar Tipo de Servicio / Lavado') : 'Registrar Nuevo Lavado'} testId="carwash-preview-modal" wide bodyClassName="p-0 sm:p-0">
      <div ref={contentRef} className="flex max-h-[70dvh] min-h-0 flex-col">
        <div className="min-h-0 space-y-5 overflow-y-auto p-5">
          <p className="rounded-xl bg-blue-50 p-3 text-sm leading-relaxed text-blue-800">Vista previa con datos ficticios. Este formulario no guarda cambios ni registra cobros.</p>
          {isService ? (
            <>
              <PreviewField label="Nombre del servicio *" value={service?.name} placeholder="Ej. Lavado premium SUV" testId="carwash-preview-service-name" />
              <PreviewField label="Precio de venta sin impuestos (RD$) *" value={service?.price} placeholder="600.00" type="number" testId="carwash-preview-service-price" />
              <div className="grid gap-4 sm:grid-cols-2">
                <PreviewField label="Comisión lavador (%) *" value={service?.washerRate || '20'} type="number" testId="carwash-preview-washer-rate" />
                <PreviewField label="Comisión encargado (%) *" value={service?.supervisorRate || '5'} type="number" testId="carwash-preview-supervisor-rate" />
              </div>
            </>
          ) : (
            <>
              <PreviewField label="Seleccionar cliente *" placeholder="Seleccione un cliente…" testId="carwash-preview-customer" />
              <div className="grid gap-4 sm:grid-cols-3">
                <PreviewField label="Placa / Matrícula *" placeholder="Ej. A123456" testId="carwash-preview-plate" />
                <PreviewField label="Marca / Modelo" placeholder="Ej. Corolla" testId="carwash-preview-model" />
                <PreviewField label="Color del vehículo" placeholder="Ej. Gris" testId="carwash-preview-color" />
              </div>
              <fieldset><legend className="mb-2 text-xs font-semibold text-slate-700">Tipo de lavado / Servicio *</legend>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {PREVIEW_SERVICES.map((item) => <label key={item.id} className="flex items-center gap-3 p-3 text-sm"><input type="checkbox" disabled data-testid={`carwash-preview-check-${item.id}`} /><span className="min-w-0 flex-1">{item.name}</span><span className="font-medium text-emerald-600">{formatDOP(item.price)}</span></label>)}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2"><PreviewField label="Lavador asignado *" placeholder="Seleccione lavador…" testId="carwash-preview-washer" /><PreviewField label="Encargado supervisor *" placeholder="Seleccione encargado…" testId="carwash-preview-supervisor" /></div>
              <PreviewField label="Método de pago previsto" placeholder="Se confirmará al completar el lavado" testId="carwash-preview-payment" />
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 bg-white p-4">
          <Button variant="secondary" onClick={onClose} data-testid="carwash-preview-close">Cerrar</Button>
          <Button disabled data-testid="carwash-preview-save" title="Las operaciones están deshabilitadas en la demo">{isService ? 'Guardar servicio' : 'Registrar lavado'}</Button>
        </div>
      </div>
    </Modal>
  )
}
