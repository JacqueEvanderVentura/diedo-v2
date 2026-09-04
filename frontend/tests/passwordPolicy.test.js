import { describe, expect, it } from 'vitest'
import { newPasswordError } from '@/lib/passwordPolicy'

describe('new password policy', () => {
  it('acepta ocho caracteres con mayúscula y carácter especial', () => {
    expect(newPasswordError('Abcdefg!')).toBeNull()
  })

  it('rechaza contraseñas cortas, sin mayúscula o sin carácter especial', () => {
    expect(newPasswordError('Abc!')).toContain('8 caracteres')
    expect(newPasswordError('Abcdef😀')).toContain('8 caracteres')
    expect(newPasswordError('abcdefg!')).toContain('mayúscula')
    expect(newPasswordError('Abcdefgh')).toContain('carácter especial')
    expect(newPasswordError(`A!${'b'.repeat(127)}`)).toContain('128 caracteres')
  })

  it('acepta mayúsculas y símbolos Unicode', () => {
    expect(newPasswordError('ábcdefÑ★')).toBeNull()
  })
})
