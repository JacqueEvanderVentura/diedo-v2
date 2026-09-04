export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const PASSWORD_REQUIREMENTS = 'Entre 8 y 128 caracteres, una mayúscula y un carácter especial.'

export function newPasswordError(password) {
  const characters = [...(password || '')]
  if (characters.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (characters.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña debe tener como máximo ${PASSWORD_MAX_LENGTH} caracteres.`
  }
  if (!characters.some((character) => (
    character.toLocaleUpperCase() === character
    && character.toLocaleLowerCase() !== character
  ))) {
    return 'La contraseña debe incluir al menos una mayúscula.'
  }
  if (!characters.some((character) => !/[\p{L}\p{N}\s]/u.test(character))) {
    return 'La contraseña debe incluir al menos un carácter especial.'
  }
  return null
}
