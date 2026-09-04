# Backlog de producción

Este documento es la fuente vigente para las funciones visibles cuyo código se conserva, pero que
permanecen desactivadas en producción hasta completar su integración. Las banderas se definen en
`frontend/src/config/features.js` y deben habilitarse solamente después de cumplir la aceptación.

| Prioridad | Función / bandera | Estado actual | Trabajo necesario | Criterio de aceptación |
|---|---|---|---|---|
| P0 | Agendación pública (`VITE_FEATURE_SELF_BOOKING`) | Usa estado local y confirmación simulada. | API pública protegida contra abuso, disponibilidad transaccional, perfil/claims, privacidad y confirmación real. | Reserva concurrente segura, pruebas E2E, límites de abuso y datos persistidos por workspace. |
| P0 | Invitaciones (`VITE_FEATURE_INVITATIONS`, `USER_INVITATIONS_ENABLED`) | El token existe, pero no hay canal de entrega. | Proveedor de correo, plantillas, reintentos, expiración, reenvío y recuperación. | Invitación entregada y aceptada sin exponer tokens en respuestas o logs. |
| P1 | Descubrimiento CRM (`VITE_FEATURE_CRM_DISCOVERY`) | Depende de proxies Vite y claves locales SERP. | Integración backend con secretos, cuotas, timeout, observabilidad y términos del proveedor. | Búsqueda auditada, limitada y sin claves en el navegador. |
| P1 | Nómina (`VITE_FEATURE_PAYROLL`) | Cálculos y cierres viven en Zustand. | Modelo contable, períodos, deducciones, aprobaciones, auditoría y API. | Cierre idempotente, autorizado, conciliable y cubierto por pruebas PostgreSQL. |
| P1 | Evaluaciones (`VITE_FEATURE_PERFORMANCE`) | Evaluaciones locales sin persistencia compartida. | Esquema, permisos, ciclos, formularios y API. | Datos aislados por workspace con historial y autorización horizontal. |
| P1 | Notificaciones (`VITE_FEATURE_NOTIFICATIONS`) | Panel y menciones dependen del navegador. | Persistencia, preferencias, entrega, lectura y eventos backend. | Estado consistente entre sesiones y usuarios con pruebas de permisos. |
| P2 | Horarios (`VITE_FEATURE_CALENDAR_SCHEDULES`) | Acción marcada como próxima. | Reglas recurrentes, excepciones, zonas horarias y edición concurrente. | Disponibilidad calculada desde datos persistidos y pruebas DST. |
| P2 | Packs regionales (`VITE_FEATURE_REGIONAL_MODULES`) | El pack dominicano sigue `planned`. | Reglas fiscales versionadas, validación legal y reportes regulatorios. | Pack aprobado funcionalmente y activable por entitlement. |
| P2 | Accounting, Payroll y Lodging | Definiciones backend con estado `planned`. | Contratos, persistencia, permisos, migraciones e interfaces completas. | Cambiar a `available` solo con CI y pruebas E2E verdes. |
| P2 | Imágenes de incidencias | Persisten como BLOB PostgreSQL. | Migración expand-and-contract al bucket y backfill verificable. | Lectura compatible durante el backfill y eliminación posterior de BLOBs. |
| P2 | Rendimiento frontend | El bundle principal supera el tamaño recomendado. | Dividir rutas y dependencias pesadas mediante carga diferida. | Chunks por módulo sin regresiones de navegación. |

También queda pendiente instrumentar rate limiting por identidad/IP, alertas operativas y una política
externa de respaldo para el bucket, ya que Railway Buckets no ofrece versionado ni backups nativos.
