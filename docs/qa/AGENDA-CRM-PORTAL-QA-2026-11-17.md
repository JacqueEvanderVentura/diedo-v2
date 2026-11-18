# Handoff de pruebas QA — Agenda (doble cupo) / CRM duplicados / Tareas del portal

**Para:** QA manual (local o ambiente QA)  
**Rama:** cambios → `qa` → (tras smoke) `full-stack`  
**Fecha:** 2026-11-17  
**Migraciones:** `20261030_0085` (empleado compartido), `20261117_0086` (portal tasks)

Tres entregas en un solo push:

1. **Doble cupo Helios** (especialista/cabina ×2 staff) + **autoagenda pública cupo 1** + modal **cita pendiente** en `/agendar`.
2. **Clientes duplicados** en CRM (manual + auto; jerarquía cédula → teléfono → email).
3. **Tareas del portal** (consentimiento informado PDF + aceptación irreversible en portal cliente).

Transcripts de referencia: chats `08e6b20b`, `cfafa9b8`, `381b3e68` (agent-transcripts).

---

## 1. Antes de empezar

### URL correcta (QA remoto)

| | URL |
|---|---|
| **Frontend QA** | https://diedo-frontend-qa.helios360erp.workers.dev |
| **API QA** | https://api-qa-6ed7.up.railway.app |

No uses preview/production para estas pruebas. Local: `http://localhost:3000` + API local con migraciones al día.

### Usuario y sucursal

- Workspace: **franchesko-columna** (QA remoto) o tu workspace local con agenda + CRM.
- Staff con permisos de **agenda**, **`customer.manage`** (para duplicados) y **workspace update** (configuración tareas portal).
- Autoagenda: `/agendar?branch={branchId}` y portal `/agendar/portal?branch={branchId}`.

### Cuándo QA ya tiene este código

Worker QA y Railway `api` en rama `qa` solo tienen el código tras el **push a `origin qa`** y builds verdes.

Señales rápidas post-deploy:

1. **Configuración** muestra ítem **Tareas del portal**.
2. **CRM → Clientes** muestra botón **Duplicados** (con `customer.manage`).
3. Segunda cita mismo especialista en Helios abre modal **Confirmar doble cita** (no oculta el horario).

Si falta alguna señal, esperar CI + Railway QA antes de marcar Fail.

### `data-testid` útiles

`appointment-employee-double-book`, `calendar-employee-double-book`, `self-booking-pending-choice`, `self-booking-pending-keep`, `self-booking-pending-replace`, `clientes-duplicates-btn`, `clientes-duplicates-modal`, `portal-tasks-create`, `portal-task-check-{id}`, `customer-detail-portal-tasks`.

---

## 2. Qué probar (orden sugerido)

Marca Pass / Fail. Si falla: captura + hora + URL + pasos.

### A — Agenda Helios: doble cupo especialista (staff)

#### A1 — Formulario nueva cita

1. Crea cita **confirmada**: especialista X, bloque ej. 14:00.
2. Nueva cita: **mismo especialista**, **misma fecha/hora** solapada.
3. El horario debe **seguir visible** (antes se ocultaba).
4. Guardar → modal **Confirmar doble cita** / **¿Desea proceder igualmente?** / **Proceder igualmente**.
5. Debe quedar **2** citas confirmadas.

#### A2 — Tercer cupo

1. Intenta una **3.ª** cita mismo especialista y bloque.
2. Debe fallar con mensaje tipo **ya tiene 2 personas en ese horario** — **sin** modal de confirmación.

#### A3 — Calendario (drag)

1. Con 1 cita del especialista a las H:00, arrastra otra cita del mismo especialista a H:00.
2. Modal doble cita; al confirmar, operación OK.
3. Con **2** citas ya a H:00, intentar tercera → bloqueo/error.

#### A4 — Cabina (regresión)

1. Dos citas misma cabina mismo bloque → OK.
2. Tercera → error con nombre de cabina.

---

### B — Portal `/agendar`: cupo 1 + cita pendiente

#### B1 — Slot ocupado (público)

1. Staff confirma cita a un cliente en un slot.
2. En `/agendar`, otro cliente: ese horario **no** debe ofrecerse o debe fallar al confirmar (409 / no disponible).
3. No debe existir **segundo** cliente público en el mismo slot.

#### B2 — Cliente con cita futura en la sucursal

**Precondición:** cliente con cita confirmada futura en sucursal S.

1. `/agendar` sucursal S, identificar cliente → puede mostrar resumen de cita pendiente.
2. Completar **nueva** reserva y confirmar → modal **Ya tienes una cita** (servicio, fecha, hora).
3. **Agendar sin borrar existente** → 2 citas futuras en S (si el nuevo slot está libre).
4. Repetir → **Borrar existente y agendar esta solamente** → solo la nueva; anterior cancelada.
5. **Cancelar** en modal → no se crea reserva.

---

### C — CRM: clientes duplicados

**Precondición:** usuario con **`customer.manage`**, API online.

#### C1 — Ver grupos

1. **CRM → Clientes** → **Duplicados**.
2. Modal **Clientes duplicados**; contador de grupos/clientes o empty **Sin duplicados**.
3. Crear dos clientes activos con el **mismo teléfono** → grupo badge **Teléfono**.

#### C2 — Merge manual

1. Radio **Conservar** en el cliente deseado; al menos 2 marcados.
2. **Combinar grupo** → toast **Clientes combinados**; un activo; el otro archivado.
3. Si el conservado no tenía email y el archivado sí, email copiado.

#### C3 — Merge automático

1. Con 2+ grupos, **Combinar automáticamente**.
2. Toast con N grupos / M archivados; grupos desaparecen o reducen.

#### C4 — Permisos

1. Usuario **sin** `customer.manage`: **no** debe verse botón Duplicados.
2. Panel **SimplifiedCustomersPanel**: botón duplicados abre el mismo modal (si la vista está disponible).

---

### D — Tareas del portal (consentimiento)

#### D1 — Staff: publicar plantilla

1. **Configuración → Tareas del portal**.
2. Título (ej. Consentimiento informado), texto checkbox (default *He leído y acepto los términos y condiciones*), **PDF** válido, **Publicar para todos los clientes**.
3. Lista: **Activa**, **Todos los clientes**; vista previa PDF.

**Edge:** archivo no-PDF rechazado; **Desactivar** plantilla.

#### D2 — Cliente: aceptar

1. Identificar cliente → **portal** (`/agendar/portal`).
2. Tab **Tareas** (orden: Citas → Tareas → Facturas → Pagos); badge si pendiente.
3. **Ver documento** → PDF; marcar checkbox → **Guardar aceptación** → toast **Aceptación guardada.**
4. Recargar: **Completada**, checkbox bloqueado, **Aceptado el …**

#### D3 — CRM estado

1. Ficha del mismo cliente → **Tareas del portal** (no confundir con tareas internas CRM) → **Aceptada** + fecha.

#### D4 — Demo portal

1. Sesión demo: **no** debe cargar tareas (by design).

---

## 3. Tests automatizados (CI / local)

```bash
# Frontend (muestra)
cd frontend
npm test -- --run selfBookingAvailability.test.js calendarResourceMove.test.js duplicateCustomersModal.test.jsx portalTasks.test.js

# Backend
cd backend
python -m pytest tests/unit/test_agenda_resource_capacity.py tests/unit/test_public_booking_capacity.py tests/unit/test_public_booking_pending.py tests/unit/test_customer_duplicates.py tests/test_customer_duplicates_api.py tests/test_portal_tasks.py -q
```

Gate local completo: `npm run prepush` en `frontend/` y `backend/`.

---

## 4. Alcance explícito fuera de v1

- Firma digital / upload de archivo por cliente en portal.
- Bloquear reserva hasta completar tareas.
- Asignación de tareas por cliente individual (solo “todos los clientes”).
- Doble cupo desde autoagenda pública en bloque ocupado.
- Tercera cita mismo bloque en staff (debe bloquearse).

---

## 5. Credenciales de integración (solo local/test)

| Clave | Valor |
|-------|--------|
| Owner email | `owner@erp.dev` |
| Password | `phase-two-owner-password-not-a-secret` |

En QA remoto: staff real del workspace, no cuentas inventadas sin ACL de producción.