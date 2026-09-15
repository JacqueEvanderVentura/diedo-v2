import { Button } from '@/components/ui/Button'
import { BackofficeSelect as Select } from './BackofficeSelect'

export function RoleAssignmentsEditor({ value, onChange, options, disabled = false }) {
  const update = (index, patch) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-semibold">Roles y alcance</legend>
      {value.map((assignment, index) => {
        const admin =
          options.roles?.find((role) => role.id === assignment.roleId)?.code === 'workspace_admin'
        return (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2"
          >
            <label className="text-sm">
              Rol {index + 1}
              <Select
                aria-label={`Rol ${index + 1}`}
                required
                value={assignment.roleId || ''}
                onChange={(e) => {
                  const role = options.roles.find((item) => item.id === e.target.value)
                  update(index, {
                    roleId: e.target.value,
                    ...(role?.code === 'workspace_admin'
                      ? { scopeType: 'workspace', branchId: '', legalEntityId: '' }
                      : {}),
                  })
                }}
              >
                <option value="">Selecciona un rol</option>
                {options.roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              Alcance {index + 1}
              <Select
                aria-label={`Alcance ${index + 1}`}
                value={assignment.scopeType}
                disabled={admin}
                onChange={(e) =>
                  update(index, { scopeType: e.target.value, branchId: '', legalEntityId: '' })
                }
              >
                <option value="workspace">Toda la compañía</option>
                <option value="legalEntity">Entidad legal</option>
                <option value="branch">Sucursal</option>
              </Select>
            </label>
            {assignment.scopeType === 'branch' && (
              <label className="text-sm">
                Sucursal {index + 1}
                <Select
                  aria-label={`Sucursal ${index + 1}`}
                  required
                  value={assignment.branchId || ''}
                  onChange={(e) => update(index, { branchId: e.target.value })}
                >
                  <option value="">Selecciona una sucursal</option>
                  {options.branches?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {assignment.scopeType === 'legalEntity' && (
              <label className="text-sm">
                Entidad legal {index + 1}
                <Select
                  aria-label={`Entidad legal ${index + 1}`}
                  required
                  value={assignment.legalEntityId || ''}
                  onChange={(e) => update(index, { legalEntityId: e.target.value })}
                >
                  <option value="">Selecciona una entidad</option>
                  {options.legalEntities?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {value.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                Quitar rol {index + 1}
              </Button>
            )}
          </div>
        )
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={value.length >= 100}
        onClick={() => onChange([...value, { roleId: '', scopeType: 'branch', branchId: '' }])}
      >
        Agregar rol
      </Button>
    </fieldset>
  )
}
