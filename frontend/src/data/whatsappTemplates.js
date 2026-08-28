export const DEFAULT_WHATSAPP_TEMPLATES = {
  agenda: [
    {
      id: 'recordatorio',
      name: 'Recordatorio de Cita',
      body: 'Hola {{nombre_cliente}}, te recordamos tu cita programada para el {{fecha}} a las {{hora}} para {{servicio}}. ¡Te esperamos!',
    },
    {
      id: 'confirmacion',
      name: 'Confirmación de Cita',
      body: 'Hola {{nombre_cliente}}, tu cita para el {{fecha}} a las {{hora}} ha sido confirmada.',
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
      body: 'Hola {{nombre_cliente}}, gracias por confiar en nosotros. ¿En qué podemos ayudarle hoy?',
    },
    {
      id: 'promocion',
      name: 'Promoción especial',
      body: 'Hola {{nombre_cliente}}, tenemos una promoción especial que podría interesarle.',
    },
  ],
}

export const WHATSAPP_VARIABLES = {
  agenda: ['nombre_cliente', 'fecha', 'hora', 'servicio'],
  oportunidades: ['nombre_cliente', 'empresa', 'ubicacion'],
  clientes: ['nombre_cliente', 'empresa'],
}
