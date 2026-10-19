/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  COMMON_MEASURE_UNITS,
  canonicalizeMeasureUnit,
  loadCustomMeasureUnits,
  mergeMeasureUnits,
  persistCustomMeasureUnit,
} from '@/modules/compras/lib/measureUnits'

describe('measureUnits', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('incluye unidades de medida comunes', () => {
    expect(COMMON_MEASURE_UNITS).toContain('Unidad')
    expect(COMMON_MEASURE_UNITS).toContain('Caja')
    expect(COMMON_MEASURE_UNITS).toContain('Litro')
    expect(COMMON_MEASURE_UNITS).toContain('Kilogramo')
  })

  it('persiste unidades personalizadas sin duplicar', () => {
    persistCustomMeasureUnit('Barril')
    persistCustomMeasureUnit('barril')
    persistCustomMeasureUnit('  Kit  ')
    expect(loadCustomMeasureUnits()).toEqual(['Barril', 'Kit'])
  })

  it('mezcla comunes, personalizadas y usadas sin repetir', () => {
    expect(mergeMeasureUnits(['Unidad', 'Caja'], ['caja'], ['Galón', ''])).toEqual([
      'Unidad',
      'Caja',
      'Galón',
    ])
  })

  it('normaliza unidades cortas a las del catálogo', () => {
    expect(canonicalizeMeasureUnit('ud')).toBe('Unidad')
    expect(canonicalizeMeasureUnit('L')).toBe('Litro')
    expect(canonicalizeMeasureUnit('unidad')).toBe('Unidad')
    expect(canonicalizeMeasureUnit('Barril')).toBe('Barril')
  })
})
