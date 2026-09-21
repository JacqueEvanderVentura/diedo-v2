import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from '@/modules/configuracion/lib/settingsHub'
import {
  filterSettingsSections,
  isSettingsBlockVisible,
  shouldForceExpandSettingsItem,
} from '@/modules/configuracion/lib/settingsSearch'

function titles(sections) {
  return sections.map((section) => ({
    title: section.title,
    items: section.items.map((item) => item.title),
  }))
}

describe('filterSettingsSections', () => {
  it('muestra toda la sección Cuenta al buscar el separador', () => {
    const result = filterSettingsSections(SETTINGS_SECTIONS, 'cuenta')
    expect(titles(result)).toEqual([
      { title: 'Cuenta', items: ['Perfil', 'Notificaciones', 'Seguridad'] },
    ])
    expect(result[0].items.every((item) => item.visibleBlockIds == null)).toBe(true)
  })

  it('no confunde Perfil con requisitos de perfiles', () => {
    const result = filterSettingsSections(SETTINGS_SECTIONS, 'perfil')
    expect(titles(result)).toEqual([{ title: 'Cuenta', items: ['Perfil'] }])
    expect(result[0].items[0].match).toBe('item')
    expect(shouldForceExpandSettingsItem(result[0].items[0], 'perfil')).toBe(false)
  })

  it('abre Cuenta → Perfil → Nombre del negocio con búsqueda parcial', () => {
    const result = filterSettingsSections(SETTINGS_SECTIONS, 'nombre del n')
    const cuenta = result.find((section) => section.title === 'Cuenta')
    expect(cuenta.items.map((item) => item.title)).toEqual(['Perfil'])
    expect(cuenta.items[0].visibleBlockIds).toEqual(['business-name'])
    expect(shouldForceExpandSettingsItem(cuenta.items[0], 'nombre del n')).toBe(true)
    expect(isSettingsBlockVisible(cuenta.items[0].visibleBlockIds, 'account')).toBe(false)
    expect(isSettingsBlockVisible(cuenta.items[0].visibleBlockIds, 'business-name')).toBe(true)
  })

  it('ignora acentos y mayúsculas', () => {
    const result = filterSettingsSections(SETTINGS_SECTIONS, 'APLICACION')
    expect(result.map((section) => section.title)).toEqual(['Aplicación'])
  })
})
