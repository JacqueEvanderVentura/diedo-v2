# QA — Agenda fase 3

Fecha: 2026-09-22

## Entorno seguro

- Backend local con `APP_ENV=test`.
- PostgreSQL descartable `postgresql+psycopg://erp:erp@127.0.0.1:5434/erp_test`.
- Frontend y API temporales en `127.0.0.1:3200` y `127.0.0.1:8200` para el E2E.
- Correo desactivado y sin llamadas de escritura a producción.
- El runner full stack reconstruyó únicamente `erp_test`.

## Evidencia RED antes de la corrección

Las pruebas se agregaron y ejecutaron antes de modificar la implementación.

- Frontend dirigido: 5 fallos y 1 aprobación.
  - La tarjeta continuó mostrando `08:00` y no mostró la nota.
  - La cabecera y las celdas de Hora no tenían comportamiento `sticky`.
  - El cálculo del menú devolvió `left: 1012` para un botón situado cerca del borde izquierdo de un viewport de 1280 px.
- Backend dirigido: 1 fallo.
  - `POST /api/v1/appointments` aceptó 61 caracteres en `notes` y respondió `201`.
  - La respuesta persistió los 61 caracteres, confirmando que el límite anterior era de 2,000.

## Corrección validada

- Las notas nuevas y modificadas admiten hasta 60 caracteres en frontend y API.
- Una nota histórica de más de 60 puede conservarse al editar otros campos; un cambio diferente que siga excediendo el límite responde `400` con `parameter: "notes"`.
- La vista Día muestra hasta 15 caracteres, contando la elipsis, y usa `Sin nota` cuando corresponde.
- Semana y Mes conservan la hora.
- La columna Hora permanece en la misma coordenada horizontal después de desplazar las cabinas.
- El menú de WhatsApp se calcula con `top/left`, queda dentro del viewport y permanece junto a su botón después del scroll.
- El menú conserva la selección de plantillas y la apertura de la vista previa.
- Un fallo simulado `503` mantiene abierto el formulario, conserva la nota escrita y muestra el mensaje real de la API.
- No se agregó migración y la columna existente conserva su capacidad para notas históricas.

## Resultados GREEN

- Frontend dirigido: 12/12 pruebas.
- Frontend completo: 444/444 pruebas en 117 archivos.
- Backend dirigido: 2/2 pruebas.
- Suite completa de Agenda: 10/10 pruebas, incluyendo permisos `403`, conflictos de horario y versión `409`.
- E2E full stack móvil/escritorio: 1/1 aprobado en `erp_test`.
- Build de producción frontend: aprobado, 3,302 módulos transformados.
- Ruff sobre backend modificado: lint y formato aprobados.
- Mypy backend: aprobado, sin errores en 172 archivos fuente.

El build mantiene advertencias preexistentes en `PipelinePage.jsx` por atributos `disabled` duplicados y avisos de tamaño de chunks. Esos archivos no forman parte de esta fase.

## Entrega

- Cambios sin commit, push ni despliegue.
- Los prepush completos y el build Docker quedan reservados para cuando se autorice el commit, según el flujo acordado.
