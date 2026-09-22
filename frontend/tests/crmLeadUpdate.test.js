import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crmApi } from '@/services/crmApi'
import { useCrmStore } from '@/stores/crmStore'
import { useSessionStore } from '@/stores/sessionStore'

const lead = {
  id: 'lead-1', name: 'Anterior', company: '', website: 'https://empresa.example/',
  instagramUrl: 'https://www.instagram.com/anterior/', version: 1,
}

describe('edición de leads del CRM', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useSessionStore.setState({ status: 'online' })
    useCrmStore.setState({ leads: [{ ...lead }], opportunities: [], error: null })
  })

  it('envía IG separado del sitio web y muestra la respuesta persistida', async () => {
    const instagramUrl = 'https://www.instagram.com/nuevo/'
    const update = vi.spyOn(crmApi, 'updateLead').mockResolvedValue({
      ...lead, name: 'Nuevo', instagramUrl, version: 2,
    })
    await useCrmStore.getState().updateLead(lead.id, { name: 'Nuevo', instagramUrl })
    expect(update).toHaveBeenCalledWith(lead.id, {
      version: 1, name: 'Nuevo', instagramUrl,
    })
    expect(useCrmStore.getState().leads[0]).toMatchObject({ name: 'Nuevo', instagramUrl, version: 2 })
  })

  it('revierte el cambio optimista si falla el PATCH y expone el error real', async () => {
    const error = new Error('API sin conexión')
    vi.spyOn(crmApi, 'updateLead').mockRejectedValue(error)
    await expect(useCrmStore.getState().updateLead(lead.id, { name: 'No guardado' }))
      .rejects.toThrow('API sin conexión')
    expect(useCrmStore.getState().leads[0].name).toBe('Anterior')
    expect(useCrmStore.getState().error).toBe(error)
  })

  it('mantiene Empresa vacía al crear un lead que solo tiene contacto', async () => {
    const create = vi.spyOn(crmApi, 'createLead').mockResolvedValue({
      ...lead, id: 'lead-new', name: 'Solo contacto', company: '', version: 1,
    })
    const sync = useCrmStore.getState().syncLeadsToPipeline
    useCrmStore.setState({ syncLeadsToPipeline: vi.fn().mockResolvedValue([]) })
    try {
      await useCrmStore.getState().addLead({
        name: 'Solo contacto', company: '', branchId: 'branch-1',
      })
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Solo contacto', company: '',
      }))
    } finally {
      useCrmStore.setState({ syncLeadsToPipeline: sync })
    }
  })
})
