import { Switch } from '@/components/ui/Switch'

export function EmitNcfToggle({
  checked = false,
  onChange,
  disabled = false,
  testId = 'emit-ncf-toggle',
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 text-xs text-slate-500">
        El ITBIS se calcula por ítem según su configuración
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
          Emitir NCF
        </span>
        <Switch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          aria-label="Emitir NCF"
          testId={testId}
        />
      </div>
    </div>
  )
}
