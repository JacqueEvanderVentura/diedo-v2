import { CORE_MODULES, toggleModuleSelection } from '../backofficeForm'
import { moduleLabel } from '@/lib/moduleLabels'

export function ModulePicker({ modules, selected, onChange, disabled = false }) {
  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-2">
        {modules.map((module) => (
          <button
            key={module.code}
            type="button"
            aria-pressed={selected.includes(module.code)}
            disabled={disabled || CORE_MODULES.has(module.code)}
            onClick={() => onChange(toggleModuleSelection(selected, module.code, modules))}
            className={`rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${selected.includes(module.code) ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200' : 'bg-slate-100 text-slate-600'}`}
          >
            {moduleLabel(module.code, module.name)}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Al activar un módulo se incluyen sus requisitos. Al quitar un requisito también se quitan
        los módulos que dependen de él.
      </p>
    </div>
  )
}
