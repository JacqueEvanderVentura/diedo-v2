import { cn } from '@/lib/utils'
import { hasWhatsAppVariableValue } from '@/lib/whatsappVariables'

export function WhatsAppVariableChips({
  chips = [],
  resolvedVariables = {},
  onInsert,
  onMouseDown,
  testIdPrefix,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((variable) => {
        const active = hasWhatsAppVariableValue(resolvedVariables, variable.key)
        return (
          <button
            key={variable.key}
            type="button"
            title={active ? `Valor: ${resolvedVariables[variable.key]}` : 'Sin dato para este contacto'}
            onMouseDown={onMouseDown}
            onClick={() => onInsert?.(variable.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors',
              active
                ? 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700'
                : 'border-slate-100 bg-slate-100 text-slate-400 hover:border-slate-200 hover:text-slate-500'
            )}
            data-testid={testIdPrefix ? `${testIdPrefix}-var-${variable.key}` : undefined}
            data-wa-var-active={active ? 'true' : 'false'}
          >
            {variable.label}
          </button>
        )
      })}
    </div>
  )
}
