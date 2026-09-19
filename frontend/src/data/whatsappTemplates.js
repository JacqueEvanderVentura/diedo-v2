export const DEFAULT_WHATSAPP_TEMPLATES = {
  agenda: [
    {
      id: 'recordatorio',
      name: 'Recordatorio de Cita',
      body: 'Hola {{nombre_cliente}}, te recordamos tu cita programada para el {{fecha}} a las {{hora}} para {{servicio}} en {{sucursal}}. ¡Te esperamos!',
    },
    {
      id: 'confirmacion',
      name: 'Confirmación de Cita',
      body: 'Hola {{nombre_cliente}}, tu cita para {{servicio}} el {{fecha}} a las {{hora}} en {{sucursal}} ha sido confirmada.',
    },
    {
      id: 'enlace-agendacion',
      name: 'Enlace de agendación',
      body: 'Hola {{nombre_cliente}}, agenda tu próxima cita aquí: {{enlace}}',
    },
  ],
  oportunidades: [
    {
      id: 'seguimiento',
      name: 'Seguimiento inicial',
      body: 'Hola {{nombre_cliente}}, soy de {{empresa}}. Nos gustaría conocer más sobre sus necesidades.',
    },
    {
      id: 'propuesta',
      name: 'Enviar propuesta',
      body: 'Hola {{nombre_cliente}}, le envío la información solicitada sobre nuestros servicios.',
    },
  ],
  clientes: [
    {
      id: 'saludo',
      name: 'Saludo de seguimiento',
      body: 'Hola {{firstName}}, gracias por confiar en nosotros. ¿En qué podemos ayudarle hoy?',
    },
    {
      id: 'promocion',
      name: 'Promoción especial',
      body: 'Hola {{nombre_cliente}}, tenemos una promoción especial que podría interesarle.',
    },
  ],
}

export const WHATSAPP_VARIABLES = {
  agenda: ['nombre_cliente', 'fecha', 'hora', 'servicio', 'sucursal', 'sucursal_1', 'sucursal_2', 'enlace'],
  oportunidades: ['nombre_cliente', 'empresa', 'ubicacion', 'sucursal_1', 'sucursal_2'],
  clientes: ['nombre_cliente', 'empresa', 'sucursal_1', 'sucursal_2'],
}
