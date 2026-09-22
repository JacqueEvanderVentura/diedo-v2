import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeFloatingPosition } from '@/lib/floatingPosition'

afterEach(() => vi.unstubAllGlobals())

describe('posición de menús flotantes', () => {
  it('devuelve coordenadas top/left junto al borde derecho del botón', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 })

    expect(computeFloatingPosition({
      anchorRect: { left: 220, right: 248, top: 120, bottom: 148, width: 28, height: 28 },
      menuWidth: 260,
      menuHeight: 180,
      placement: 'auto',
      align: 'end',
    })).toEqual({
      top: 154,
      left: 8,
      flip: false,
    })
  })

  it('abre arriba y permanece dentro del viewport cuando no cabe debajo', () => {
    vi.stubGlobal('window', { innerWidth: 390, innerHeight: 640 })

    expect(computeFloatingPosition({
      anchorRect: { left: 340, right: 372, top: 590, bottom: 622, width: 32, height: 32 },
      menuWidth: 260,
      menuHeight: 180,
      placement: 'auto',
      align: 'end',
    })).toEqual({
      top: 404,
      left: 112,
      flip: true,
    })
  })
})
