import { describe, expect, it } from 'vitest'
import {
  coerceWorkSchedule,
  getBlockError,
  normalizeWorkSchedule,
  validateWorkSchedule,
} from '@/modules/rrhh/lib/schedule'

describe('getBlockError', () => {
  it('acepta un bloque válido', () => {
    expect(getBlockError([{ start: '08:00', end: '12:00' }], 0)).toBeNull()
  })

  it('marca la entrada posterior a la salida con la sugerencia de medianoche', () => {
    const error = getBlockError([{ start: '20:00', end: '02:00' }], 0)
    expect(error).toMatch(/posterior a la salida/)
    expect(error).toMatch(/medianoche/)
  })

  it('marca la misma hora de entrada y salida', () => {
    expect(getBlockError([{ start: '09:00', end: '09:00' }], 0)).toMatch(/misma hora/)
  })

  it('marca un bloque incompleto', () => {
    expect(getBlockError([{ start: '09:00', end: '' }], 0)).toMatch(/Completa/)
  })

  it('marca ambos bloques que se solapan', () => {
    const blocks = [
      { start: '08:00', end: '12:00' },
      { start: '11:00', end: '14:00' },
    ]
    expect(getBlockError(blocks, 0)).toMatch(/solapa con el bloque 11:00 – 14:00/)
    expect(getBlockError(blocks, 1)).toMatch(/solapa con el bloque 08:00 – 12:00/)
  })

  it('permite bloques contiguos', () => {
    const blocks = [
      { start: '08:00', end: '12:00' },
      { start: '12:00', end: '14:00' },
    ]
    expect(getBlockError(blocks, 0)).toBeNull()
    expect(getBlockError(blocks, 1)).toBeNull()
  })
})

describe('validateWorkSchedule', () => {
  it('no devuelve errores para un horario válido', () => {
    expect(validateWorkSchedule({
      mon: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
      tue: [],
    })).toEqual([])
  })

  it('usa el nombre del día en español y reporta cada solape una sola vez', () => {
    const errors = validateWorkSchedule({
      wed: [
        { start: '08:00', end: '12:00' },
        { start: '11:00', end: '14:00' },
      ],
      fri: [{ start: '10:00', end: '09:00' }],
    })
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatch(/^Miércoles: Se solapa/)
    expect(errors[1]).toMatch(/^Viernes: La entrada no puede ser posterior/)
  })

  it('reporta bloques incompletos', () => {
    expect(validateWorkSchedule({ sat: [{ start: '', end: '10:00' }] })[0]).toMatch(/^Sábado: Completa/)
  })
})

describe('coerceWorkSchedule', () => {
  it('conserva bloques inválidos y el orden de captura', () => {
    const input = {
      mon: [
        { start: '14:00', end: '16:00' },
        { start: '10:00', end: '09:00' },
      ],
    }
    const coerced = coerceWorkSchedule(input)
    expect(coerced.mon).toEqual(input.mon)
    expect(coerced.sun).toEqual([])
    expect(normalizeWorkSchedule(input).mon).toEqual([{ start: '14:00', end: '16:00' }])
  })
})
