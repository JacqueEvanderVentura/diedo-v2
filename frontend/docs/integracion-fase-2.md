# Integración full-stack — Fase 2

Estado histórico: implementación parcial reabierta por el plan Backend ↔ Frontend V2 el 2026-08-29.

Este documento conserva la evidencia del corte original. Fase 2 sigue abierta hasta tener historias
full-stack reales de cliente, empleado, horario y adjunto, además de la paridad demo/API.

Este documento registra el cierre frontend de clientes compartidos, personal básico y adjuntos del
plan Backend ↔ Frontend. Los fixtures locales se conservan como fuente explícita del entorno demo y
no se usan como fallback silencioso de la API.

## Fuente de datos

- Online: la API es la fuente de verdad; una lectura fallida puede conservar únicamente la última
  copia disponible en memoria y las mutaciones quedan bloqueadas.
- Demo explícito: `VITE_DEMO_SEED_ENABLED=true` usa el snapshot generado desde
  `demo-data/v1/manifest.json` sin intentar acceder a la API.
- Los fixtures canónicos mantienen cinco clientes y trece empleados con IDs estables. Los campos de
  salario, banco, nómina y evaluaciones permanecen aislados para la Fase 9 y no entran al contrato ni
  a la UI básica.
- Ningún cliente, empleado o adjunto se persiste como store de negocio en `localStorage`; los
  adjuntos tampoco se convierten a base64 en el navegador.

## Clientes compartidos

`customersStore` sustituyó las colecciones duplicadas de POS, Agenda y CRM. `CustomerPicker`, el
directorio CRM, la conversión de leads y la autoagenda consumen el mismo registro e identificador.
El cliente de mostrador sigue siendo una opción sintética de UI y no compite con el maestro.

Las escrituras demo viven solamente en memoria para permitir recorrer el MVP. Las escrituras online
usan `POST/PATCH /api/v1/customers`; si fallan, no se replican localmente ni aparentan éxito.

## Empleados básicos

RRHH y Agenda consumen el mismo registro de empleados, sucursales, supervisores y horarios. El
directorio deja de depender de `SEED_EMPLOYEES`, y el formulario solo envía los campos permitidos por
Fase 2. El adapter elimina defensivamente salario, banco, vacaciones, nómina y evaluaciones antes de
construir un payload API.

## Estados visibles y limpieza

CRM Clientes y RRHH Directorio muestran si la fuente está `loading`, `ready`, `stale`, `error` o
`demo`, con reintento seguro. Cambiar workspace o cerrar sesión limpia cachés sensibles en memoria.
Las sucursales visibles de la sesión online alimentan el registro compartido para evitar IDs locales
divergentes.

## Verificación

- 15 pruebas unitarias de gateways, sesión, storage, módulos y adapters, más 6 pruebas E2E;
- build Vite de producción correcto;
- recorrido real en Edge: cliente creado en CRM visible en POS y Agenda, 13 empleados canónicos en
  RRHH, sin campos protegidos de Fase 9;
- `localStorage` contiene únicamente la versión de la política de almacenamiento, sin PII.
