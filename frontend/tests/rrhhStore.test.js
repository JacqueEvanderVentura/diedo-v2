// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  updateProfile: vi.fn(),
  uploadEmployeeAttachment: vi.fn(),
  employeeAttachments: vi.fn(),
  deleteEmployeeAttachment: vi.fn(),
}))

vi.mock('@/services/masterDataApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    employeesGateway: {
      getState: () => ({ status: 'ready', source: 'api' }),
      mutate: mocks.mutate,
      read: vi.fn(),
    },
    masterDataApi: {
      ...actual.masterDataApi,
      uploadEmployeeAttachment: mocks.uploadEmployeeAttachment,
      employeeAttachments: mocks.employeeAttachments,
      deleteEmployeeAttachment: mocks.deleteEmployeeAttachment,
    },
  }
})

vi.mock('@/services/hrApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    hrApi: {
      ...actual.hrApi,
      updateProfile: mocks.updateProfile,
    },
  }
})

import { useRrhhStore } from '@/stores/rrhhStore'
import { useSessionStore } from '@/stores/sessionStore'

const createdEmployee = {
  id: 'emp-new',
  employeeNumber: 'EMP-100',
  firstName: 'Camila',
  lastName: 'Núñez',
  email: null,
  phone: null,
  position: 'Especialista',
  department: 'Operaciones',
  contractType: 'Indefinido',
  documentType: 'cedula',
  documentId: '001-1234567-8',
  hireDate: '2026-03-01',
  platformUserId: null,
  branches: [{ id: 'branch-1', code: 'MAIN', name: 'Principal' }],
  supervisorIds: [],
  schedule: { version: 1, timezone: 'America/Santo_Domingo', week: {} },
  status: 'active',
  version: 1,
  attachmentCount: 0,
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z',
}

describe('rrhhStore alta de empleado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({
      status: 'online',
      user: {
        branchIds: ['branch-1'],
        effectivePermissionCodes: ['employee.manage', 'hr.profile.manage', 'hr.profile.read'],
      },
    })
    useRrhhStore.setState({ employees: [], employeeProfiles: [] })
    mocks.mutate.mockResolvedValue(createdEmployee)
    mocks.updateProfile.mockResolvedValue({
      employeeId: 'emp-new',
      salary: 42000,
      initialSalary: 42000,
      vacationDays: 0,
      residenceLocation: 'Santo Domingo, DN',
      profileVersion: 2,
    })
    mocks.uploadEmployeeAttachment.mockRejectedValue(new Error('falló el archivo'))
    mocks.employeeAttachments.mockResolvedValue([])
  })

  it('crea el empleado aunque falle el contrato y no mete salario en el maestro', async () => {
    const file = new File(['pdf'], 'contrato.pdf', { type: 'application/pdf' })
    const saved = await useRrhhStore.getState().addEmployee({
      firstName: 'Camila',
      lastName: 'Núñez',
      position: 'Especialista',
      hireDate: '2026-03-01',
      branchIds: ['branch-1'],
      documentType: 'cedula',
      documentId: '001-1234567-8',
      salary: 42000,
      residenceLocation: 'Santo Domingo, DN',
      attachments: [{ pendingFile: file, name: 'contrato.pdf' }],
    })

    expect(mocks.mutate).toHaveBeenCalledWith(
      'createEmployee',
      expect.not.objectContaining({ salary: expect.anything() })
    )
    expect(mocks.mutate.mock.calls[0][1]).toMatchObject({
      documentType: 'cedula',
      documentId: '001-1234567-8',
    })
    expect(mocks.mutate.mock.calls[0][1]).not.toHaveProperty('residenceLocation')
    expect(mocks.updateProfile).toHaveBeenCalledWith('emp-new', expect.objectContaining({
      salary: 42000,
      residenceLocation: 'Santo Domingo, DN',
    }))
    expect(useRrhhStore.getState().employees).toHaveLength(1)
    expect(saved.id).toBe('emp-new')
    expect(saved.attachmentWarning).toMatch(/falló el archivo/)
  })

  it('sube contrato y documentos con su clasificación al crear', async () => {
    mocks.uploadEmployeeAttachment.mockResolvedValue({ id: 'att-x' })
    mocks.employeeAttachments.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const pdf = new File(['pdf'], 'contrato.pdf', { type: 'application/pdf' })
    const img = new File(['img'], 'cedula.png', { type: 'image/png' })
    const cert = new File(['pdf'], 'certificado.pdf', { type: 'application/pdf' })

    const saved = await useRrhhStore.getState().addEmployee({
      firstName: 'Camila',
      lastName: 'Núñez',
      position: 'Especialista',
      hireDate: '2026-03-01',
      branchIds: ['branch-1'],
      attachments: [{ pendingFile: pdf, name: 'contrato.pdf' }],
      documents: [
        { pendingFile: img, name: 'cedula.png' },
        { pendingFile: cert, name: 'certificado.pdf' },
      ],
    })

    const classifications = mocks.uploadEmployeeAttachment.mock.calls.map(([, form]) => form.get('classification'))
    expect(classifications).toEqual(['labor_contract', 'employee_document', 'employee_document'])
    expect(mocks.employeeAttachments).toHaveBeenCalledTimes(1)
    expect(saved.attachmentCount).toBe(3)
    expect(saved.attachmentWarning).toBeUndefined()
  })
})

describe('rrhhStore edición de documentos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({
      status: 'online',
      user: {
        branchIds: ['branch-1'],
        effectivePermissionCodes: ['employee.manage', 'hr.profile.manage', 'hr.profile.read'],
      },
    })
    useRrhhStore.setState({
      employees: [{
        ...createdEmployee,
        branchIds: ['branch-1'],
        jefeIds: [],
        workSchedule: {},
        scheduleVersion: 1,
      }],
      employeeProfiles: [],
    })
    mocks.mutate.mockResolvedValue(createdEmployee)
    mocks.uploadEmployeeAttachment.mockResolvedValue({ id: 'doc-new' })
    mocks.deleteEmployeeAttachment.mockResolvedValue(undefined)
    mocks.employeeAttachments.mockResolvedValue([{ id: 'contract-1' }, { id: 'doc-keep' }, { id: 'doc-new' }])
  })

  it('borra documentos quitados, sube los nuevos y no toca el contrato', async () => {
    const img = new File(['img'], 'titulo.png', { type: 'image/png' })
    const saved = await useRrhhStore.getState().updateEmployee('emp-new', {
      attachments: [{ id: 'contract-1', name: 'contrato.pdf' }],
      existingContractIds: ['contract-1'],
      documents: [
        { id: 'doc-keep', name: 'cedula.png' },
        { pendingFile: img, name: 'titulo.png' },
      ],
      existingDocumentIds: ['doc-keep', 'doc-old'],
    })

    expect(mocks.deleteEmployeeAttachment).toHaveBeenCalledTimes(1)
    expect(mocks.deleteEmployeeAttachment).toHaveBeenCalledWith('emp-new', 'doc-old')
    expect(mocks.uploadEmployeeAttachment).toHaveBeenCalledTimes(1)
    expect(mocks.uploadEmployeeAttachment.mock.calls[0][1].get('classification')).toBe('employee_document')
    expect(saved.attachmentCount).toBe(3)
  })

  it('avisa si fallan los documentos sin perder el guardado', async () => {
    mocks.uploadEmployeeAttachment.mockRejectedValue(new Error(''))
    const img = new File(['img'], 'titulo.png', { type: 'image/png' })
    const saved = await useRrhhStore.getState().updateEmployee('emp-new', {
      documents: [{ pendingFile: img, name: 'titulo.png' }],
      existingDocumentIds: [],
    })

    expect(saved.attachmentWarning).toMatch(/No se pudieron guardar los documentos/)
    expect(mocks.employeeAttachments).not.toHaveBeenCalled()
  })
})
