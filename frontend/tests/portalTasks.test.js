import { describe, expect, it } from 'vitest'

const TABS = ['citas', 'tareas', 'facturas', 'pagos']

describe('portal pending tasks tab', () => {
  it('includes tareas between citas and facturas', () => {
    expect(TABS).toContain('tareas')
    expect(TABS.indexOf('tareas')).toBeGreaterThan(TABS.indexOf('citas'))
    expect(TABS.indexOf('tareas')).toBeLessThan(TABS.indexOf('facturas'))
  })
})