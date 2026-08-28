import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Calendar, Target, Users, MessageCircle, Save } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { WHATSAPP_VARIABLES } from '@/data/whatsappTemplates'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { configPageClass } from '../lib/pageShell'

const TABS = [
  { id: 'agenda', label: 'Agenda', icon: Calendar },
  { id: 'oportunidades', label: 'Oportunidades', icon: Target },
  { id: 'clientes', label: 'Clientes', icon: Users },
]

export default function PlantillasWaPanel({ embedded = false }) {
  const stored = useConfigStore((s) => s.whatsappTemplates)
  const updateWhatsappTemplates = useConfigStore((s) => s.updateWhatsappTemplates)

  const [tab, setTab] = useState('agenda')
  const [draft, setDraft] = useState(() => structuredClone(stored))

  useEffect(() => {
    setDraft(structuredClone(stored))
  }, [stored])

  const templates = draft[tab] || []
  const variables = WHATSAPP_VARIABLES[tab] || []

  const setBody = (id, body) => {
    setDraft((d) => ({
      ...d,
      [tab]: (d[tab] || []).map((t) => (t.id === id ? { ...t, body } : t)),
    }))
  }

  const save = () => {
    updateWhatsappTemplates('agenda', draft.agenda)
    updateWhatsappTemplates('oportunidades', draft.oportunidades)
    updateWhatsappTemplates('clientes', draft.clientes)
    toast.success('Plantillas de WhatsApp guardadas')
  }

  return (
    <div className={configPageClass(embedded, 'max-w-4xl')} data-testid="plantillas-wa-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
            <MessageCircle className="h-5 w-5 text-emerald-500" />
            Plantillas de WhatsApp
          </h3>
          <p className="mt-1 text-sm text-slate-500">Mensajes prellenados para Agenda, CRM y Clientes.</p>
        </div>
        <Button onClick={save} data-testid="plantillas-wa-save">
          <Save className="h-4 w-4" /> Guardar cambios
        </Button>
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <Card className="space-y-6 p-6">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Variables disponibles</h4>
          <div className="flex flex-wrap gap-2">
            {variables.map((v) => (
              <span
                key={v}
                className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-blue-600"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {templates.map((tpl) => (
            <div key={tpl.id}>
              <label className="text-base font-medium text-slate-800">{tpl.name}</label>
              <textarea
                value={tpl.body}
                onChange={(e) => setBody(tpl.id, e.target.value)}
                rows={4}
                placeholder="Escribe el mensaje aquí..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                data-testid={`plantilla-wa-${tab}-${tpl.id}`}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
