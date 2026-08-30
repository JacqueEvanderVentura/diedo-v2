# ADR-0001 — Decisiones fundacionales de las Fases 0 y 1

- Estado: aceptado
- Fecha: 2026-08-29
- Alcance: Foundation, IAM, configuración y límites de módulos posteriores

## Contexto

El MVP mezclaba identidad, demo, persistencia local y datos reales. Antes de implementar módulos
transaccionales era necesario fijar las decisiones que afectan IDs, autorización, almacenamiento y
propiedad de futuros aggregates.

## Decisiones

1. Un `workspace_membership` puede tener varios `role_assignments`, cada uno con scope y vigencia.
   `primaryRole` es únicamente una presentación determinista de la sesión y nunca reemplaza el
   conjunto efectivo de asignaciones.
2. El login selecciona la única membership activa o la marcada como primaria. El cambio posterior
   usa `POST /api/v1/auth/switch-workspace`, rota/revoca la sesión anterior y el frontend limpia los
   cachés de gateways antes de hidratar el nuevo workspace.
3. El refresh token es opaco, rotatorio y se entrega solo en cookie `HttpOnly`, `SameSite=Lax`, con
   path de auth. `Secure` es obligatorio en staging/producción. JavaScript conserva el access token
   únicamente en memoria.
4. No se activa RLS en este corte. El aislamiento se impone mediante scope obligatorio en
   repositorios, IDs de workspace, FKs compuestas, autorización efectiva y pruebas de aislamiento.
   RLS puede añadirse como defensa adicional sin sustituir estas reglas.
5. Inventario se modelará como ledger por sucursal y almacén/ubicación. La sucursal es el límite de
   autorización; el almacén es la unidad operativa de stock. Fase 3 cerrará el aggregate y sus
   invariantes.
6. CRM y POS reutilizarán un único aggregate de cotización comercial (`sales_quote`) con un campo de
   origen. CRM administra el pipeline; Sales/POS administra finalización, snapshots y venta.
7. La CxC de clientes y los adelantos/deudas de empleados son dominios separados. Pueden proyectarse
   a Finanzas mediante movimientos comunes, pero no comparten identidad, permisos ni tabla mutable.
8. La “membresía” comercial es una suscripción de cliente. Nunca se representa con
   `workspace_membership`, que queda reservado a IAM.
9. Finanzas cubre gestión operativa de caja, ingresos, gastos, pasivos y presupuestos. No se anuncia
   contabilidad formal hasta contar con plan de cuentas, asientos, cierres y paquete regional
   verificado.
10. Cada adjunto pertenece a un aggregate y se expone mediante rutas anidadas. El objeto vive fuera
    de PostgreSQL; la base conserva metadata, checksum, clasificación, actor y política de
    retención. No habrá upload genérico sin owner ni base64 durable en el navegador.

## Consecuencias

- La autorización consulta tanto permisos como módulo habilitado y scope jerárquico vigente.
- Cambiar de workspace no puede reutilizar respuestas o IDs del tenant anterior.
- Los futuros módulos deben respetar estos límites o crear un ADR que los sustituya explícitamente.
- La ausencia de RLS exige mantener pruebas negativas de acceso horizontal en cada corte vertical.
