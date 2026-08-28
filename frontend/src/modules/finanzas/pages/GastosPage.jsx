import { useSearchParams } from 'react-router-dom'
import { Receipt, Repeat } from 'lucide-react'
import { GastosVariablesTab } from '../components/GastosVariablesTab'
import { GastosFijosTab } from '../components/GastosFijosTab'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'variables', label: 'Gastos Variables', icon: Receipt },
  { id: 'fijos', label: 'Gastos Fijos', icon: Repeat },
]

export default function GastosPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') || 'variables'
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'variables'

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="gastos-page">
      <div className="grid w-full max-w-md grid-cols-2 rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setParams({ tab: t.id })}
              data-testid={`gastos-tab-${t.id}`}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      <AnimatedTabPanel panelKey={tab}>
        {tab === 'fijos' ? <GastosFijosTab /> : <GastosVariablesTab />}
      </AnimatedTabPanel>
    </div>
  )
}
