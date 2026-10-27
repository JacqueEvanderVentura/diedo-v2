import { describe, expect, it } from 'vitest'
import { publicHttpErrorMessage, readResponseRequestId } from '@/lib/httpError'

describe('publicHttpErrorMessage', () => {
  it('nunca repite Error interno del servidor en 500', () => {
    expect(publicHttpErrorMessage(500, { message: 'Error interno del servidor.' }, 'abc-1'))
      .toBe('No pudimos completar la acción. Si sigue, copia este código: abc-1.')
    expect(publicHttpErrorMessage(500, { message: 'Error interno del servidor.' }))
      .toBe('No pudimos completar la acción. Inténtalo de nuevo.')
  })

  it('conserva el mensaje de 409 y 403', () => {
    expect(publicHttpErrorMessage(409, { message: 'Ya existe una categoría con este nombre.' }))
      .toBe('Ya existe una categoría con este nombre.')
    expect(publicHttpErrorMessage(403, { message: 'Gestionar categorías requiere alcance sobre todo el workspace.' }))
      .toBe('Gestionar categorías requiere alcance sobre todo el workspace.')
  })

  it('lee requestId del cuerpo o del header', () => {
    expect(readResponseRequestId({ headers: { get: () => 'from-header' } }, { requestId: 'from-body' }))
      .toBe('from-body')
    expect(readResponseRequestId({ headers: { get: () => 'from-header' } }, {}))
      .toBe('from-header')
  })
})
