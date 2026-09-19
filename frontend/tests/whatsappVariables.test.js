import { describe, expect, it } from 'vitest'
import {
  appointmentWhatsAppFields,
  buildCustomerWhatsAppVariables,
  buildBranchWhatsAppFields,
  buildLeadWhatsAppVariables,
  buildWhatsAppVariables,
  findNextCustomerAppointment,
  firstNameFromDisplayName,
  hasWhatsAppVariableValue,
  insertTemplateToken,
} from '@/lib/whatsappVariables'
import { fillTemplate } from '@/lib/whatsapp'

describe('whatsapp variables', () => {
  it('extrae el primer nombre antes del espacio', () => {
    expect(firstNameFromDisplayName('María José Pérez')).toBe('María')
  })

  it('rellena firstName en la plantilla de clientes', () => {
    const vars = buildWhatsAppVariables({ name: 'Ana Lucía', phone: '8095550000' })
    const message = fillTemplate('Hola {{firstName}}, tu teléfono es {{phone}}.', vars)
    expect(message).toBe('Hola Ana, tu teléfono es 8095550000.')
  })

  it('inserta tokens en la posición del cursor', () => {
    const result = insertTemplateToken('Hola ', 'firstName', 5)
    expect(result.body).toBe('Hola {{firstName}}')
    expect(result.caret).toBe(18)
  })

  it('rellena sucursal_1 y sucursal_2 desde sucursales activas', () => {
    const fields = buildBranchWhatsAppFields([
      { name: 'Principal', active: true },
      { name: 'Norte', active: true },
      { name: 'Cerrada', active: false },
    ])
    expect(fields.sucursal_1).toBe('Principal')
    expect(fields.sucursal_2).toBe('Norte')
    const message = fillTemplate('Visítenos en {{sucursal_1}} o {{sucursal_2}}.', fields)
    expect(message).toBe('Visítenos en Principal o Norte.')
  })

  it('usa el nombre del contacto y la empresa del vendedor en leads', () => {
    const vars = buildLeadWhatsAppVariables(
      { name: 'Claudette Cochon', company: '', phone: '8095550000' },
      { sellerName: 'Cortinaje del Este' },
    )
    const message = fillTemplate(
      'Hola {{nombre_cliente}}, soy de {{empresa}}. Nos gustaría conocer más sobre sus necesidades.',
      vars,
    )
    expect(message).toBe(
      'Hola Claudette Cochon, soy de Cortinaje del Este. Nos gustaría conocer más sobre sus necesidades.',
    )
  })

  it('detecta variables vacías vs con valor', () => {
    const vars = buildWhatsAppVariables({ name: 'Ana', phone: '809', company: '' })
    expect(hasWhatsAppVariableValue(vars, 'firstName')).toBe(true)
    expect(hasWhatsAppVariableValue(vars, 'empresa')).toBe(false)
  })

  it('arma variables de cita desde la próxima cita del cliente', () => {
    const appointments = [
      { customerId: 'c1', date: '2099-01-10', time: '10:00', serviceName: 'Corte', resourceName: 'Cabina 2', status: 'confirmada' },
      { customerId: 'c1', date: '2099-01-05', time: '09:00', serviceName: 'Tinte', resourceName: 'Cabina 1', status: 'confirmada' },
    ]
    const next = findNextCustomerAppointment(appointments, 'c1')
    expect(next?.serviceName).toBe('Tinte')
    const vars = buildCustomerWhatsAppVariables({ id: 'c1', name: 'Ana', phone: '809' }, appointments)
    expect(vars.cita_servicio).toBe('Tinte')
    expect(vars.cita_cabina).toBe('Cabina 1')
    expect(hasWhatsAppVariableValue(vars, 'cita_fecha')).toBe(true)
  })

  it('expone campos cita_* y alias fecha/hora en agenda', () => {
    const fields = appointmentWhatsAppFields({
      date: '2026-03-15',
      time: '14:30',
      serviceName: 'Manicure',
      resourceName: 'Cabina VIP',
    })
    expect(fields.cita_fecha).toBeTruthy()
    expect(fields.cita_hora).toBe('14:30')
    expect(fields.cita_cabina).toBe('Cabina VIP')
    expect(fields.fecha).toBe(fields.cita_fecha)
  })
})
