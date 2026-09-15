# Cloudflare + Railway: despliegue y dominio

## Configuración vigente — 15 de septiembre de 2026

- Frontend de producción: https://diedo-frontend-production.helios360erp.workers.dev
- Frontend de preview: https://diedo-frontend-preview.helios360erp.workers.dev
- Backend de Railway: https://api-production-b1fb.up.railway.app
- Repositorio: https://github.com/JacqueEvanderVentura/diedo-v2, rama `full-stack`.
- Dominio aprobado: `app.helios360erp.com`. Su activación queda pendiente del acceso al DNS; `workers.dev` permanece disponible.

Esta guía sustituye los estados históricos de migración registrados en versiones anteriores del documento.

## Publicación automática

GitHub Actions tiene el secreto `CLOUDFLARE_API_TOKEN` y la variable `CLOUDFLARE_ACCOUNT_ID` configurados. El token `diedo-github-actions` permite publicar Workers en la cuenta y gestionar rutas únicamente en la zona `helios360erp.com`. Nunca guardar su valor en el repositorio.

Los cambios de frontend en `full-stack` ejecutan `Deploy frontend to Cloudflare Workers`: instalación, build, pruebas, validación de Wrangler, publicación y comprobaciones HTTP. Los pull requests del mismo repositorio publican en el Worker de preview compartido. `Frontend CI` también valida build, pruebas y configuración.

Railway tiene el servicio `api` del proyecto `diedo-production` conectado al mismo repositorio y rama. Construye `backend/Dockerfile` desde la raíz, espera los checks de GitHub y ejecuta `python -m app.scripts.predeploy` antes del arranque. Su comprobación de disponibilidad es `/health/ready`. Se conservan PostgreSQL, almacenamiento y variables existentes.

La web usa `VITE_API_BASE_URL=/api-backend`. El Worker envía esas peticiones al origen fijo de Railway definido en `API_ORIGIN`; la lógica de negocio y los datos permanecen en Railway. Los archivos estáticos los sirve Cloudflare directamente. Las respuestas API no se almacenan en caché; las cookies conservan HttpOnly/Secure, usan SameSite=Lax y la ruta `/api-backend/api/v1/auth`. No se depende de cookies de terceros.

## Activar app.helios360erp.com cuando haya acceso al dominio

1. En Cloudflare, revisar la zona `helios360erp.com` y conservar todos los registros DNS necesarios, especialmente correo (MX, SPF, DKIM y DMARC). No borrar registros existentes al trasladar DNS.
2. En el registrador del dominio, sustituir los servidores de nombres actuales (`ns67.worldnic.com` y `ns68.worldnic.com`) por los asignados por Cloudflare:
   - `fish.ns.cloudflare.com`
   - `santino.ns.cloudflare.com`
3. Esperar a que Cloudflare muestre la zona como **Active**. La zona estaba **pending** al preparar esta integración. Si los servidores asignados cambian, usar los que muestre Cloudflare en ese momento.
4. Revisar que `app` no apunte a otro servicio. Resolver cualquier conflicto existente antes de activar el Worker en ese nombre.
5. Crear la variable de repositorio de GitHub `CLOUDFLARE_CUSTOM_DOMAIN` con el valor exacto `app.helios360erp.com`:

   ```powershell
   gh variable set CLOUDFLARE_CUSTOM_DOMAIN --body app.helios360erp.com --repo JacqueEvanderVentura/diedo-v2
   gh workflow run deploy-fe-pages.yml --ref full-stack --repo JacqueEvanderVentura/diedo-v2
   ```

6. El workflow genera la ruta `custom_domain` para producción y verifica tanto `workers.dev` como el dominio. Cloudflare administra el registro y certificado del Custom Domain. Esperar a que el certificado esté activo si la emisión aún está en curso.
7. Verificar https://app.helios360erp.com/login y probar acceso, recarga de página, renovación de sesión y logout con una cuenta de producción. Las credenciales locales de prueba no son credenciales de producción.

No hace falta crear `api.helios360erp.com`, cambiar Railway ni reconstruir con una URL diferente: el proxy sigue usando el origen de Railway. Preview conserva su dirección `workers.dev`.

## Validación y diagnóstico

Desde `frontend`, después del build y pruebas:

```powershell
node scripts/check-hosting.mjs https://diedo-frontend-production.helios360erp.workers.dev
```

La comprobación valida health, navegación SPA, cabeceras, caché, MIME de JS/CSS, 404 de archivos inexistentes, disponibilidad real de Railway y rechazo de acceso anónimo a `/auth/me`. Las pruebas unitarias verifican subida de archivos, cookies de renovación/logout, redirecciones y rechazo de orígenes externos.

- GitHub Actions: https://github.com/JacqueEvanderVentura/diedo-v2/actions
- Cloudflare Workers: https://dash.cloudflare.com/96ecfecb9fbc377880e4809b0b22037a/workers-and-pages
- Railway: https://railway.com/project/3ad8fb51-7f62-4229-93a4-daba5d21ab91

Si falla un check, revisar su paso antes de reintentar el despliegue. No desactivar las validaciones de Railway. Si el problema aparece únicamente con el dominio, `workers.dev` sigue disponible. Para retirar la asociación personalizada, eliminar `CLOUDFLARE_CUSTOM_DOMAIN` y volver a ejecutar el workflow; revisar la ruta y DNS resultantes en Cloudflare.
