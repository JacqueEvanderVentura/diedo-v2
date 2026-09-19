# Cloudflare + Railway: despliegue y dominio

## Configuración vigente — 15 de septiembre de 2026

- Frontend de producción: https://diedo-frontend-production.helios360erp.workers.dev
- Frontend de preview: https://diedo-frontend-preview.helios360erp.workers.dev
- Backend de Railway: https://api-production-b1fb.up.railway.app
- Repositorio: https://github.com/JacqueEvanderVentura/diedo-v2, rama `full-stack`.
- Dominio aprobado: `app.helios360erp.com`. El usuario confirmó que `helios360erp.com` está en **la cuenta de Cloudflare de su compañero**, distinta de la cuenta del Worker actual. La conexión queda pendiente del acceso a esa cuenta; `workers.dev` permanece disponible.

Esta guía sustituye los estados históricos de migración registrados en versiones anteriores del documento.

## Publicación automática

GitHub Actions tiene el secreto `CLOUDFLARE_API_TOKEN` y la variable `CLOUDFLARE_ACCOUNT_ID` configurados para la cuenta del Worker actual. El token `diedo-github-actions` permite publicar allí; sus permisos sobre la zona pendiente de esa cuenta **no dan acceso al dominio en la cuenta del compañero**. Nunca guardar su valor en el repositorio.

Los cambios de frontend en `full-stack` ejecutan el workflow unificado **CI** (job `deploy`): instalación, build, pruebas, validación de Wrangler, publicación y comprobaciones HTTP. Los pull requests del mismo repositorio publican en el Worker de preview compartido. El job `frontend` del mismo workflow valida build, pruebas y configuración sin desplegar.

Railway tiene el servicio `api` del proyecto `diedo-production` conectado al mismo repositorio y rama. Construye `backend/Dockerfile` desde la raíz, espera los checks de GitHub y ejecuta `python -m app.scripts.predeploy` antes del arranque. Su comprobación de disponibilidad es `/health/ready`. Se conservan PostgreSQL, almacenamiento y variables existentes.

La web usa `VITE_API_BASE_URL=/api-backend`. El Worker envía esas peticiones al origen fijo de Railway definido en `API_ORIGIN`; la lógica de negocio y los datos permanecen en Railway. Los archivos estáticos los sirve Cloudflare directamente. Las respuestas API no se almacenan en caché; las cookies conservan HttpOnly/Secure, usan SameSite=Lax y la ruta `/api-backend/api/v1/auth`. No se depende de cookies de terceros.

## Activar app.helios360erp.com cuando haya acceso al dominio

**No seguir las instrucciones anteriores de cambiar nameservers a la cuenta actual.** La zona pendiente observada allí no es la zona de la cuenta del compañero. No transferir el dominio ni cambiar su DNS por esta suposición.

La vía recomendada, pendiente de acceso y de confirmar la cuenta de destino, es publicar el frontend en la misma cuenta que administra el dominio y asociar allí su Custom Domain. Se conserva el backend en Railway.

1. Obtener acceso autorizado a la cuenta del compañero y verificar el Account ID, la zona `helios360erp.com`, su estado y el registro `app`. No asumir que la zona está activa sin comprobarlo.
2. Preparar la publicación del Worker en esa cuenta. Configurar las credenciales de GitHub para la cuenta elegida y ajustar las URLs de comprobación del workflow: actualmente apuntan al `workers.dev` de la cuenta original. Cambiar únicamente `CLOUDFLARE_ACCOUNT_ID` no completa esta adaptación.
3. Publicar y comprobar la web y su conexión con Railway en la nueva cuenta antes de asociar el dominio. Mantener disponible el Worker original durante la transición.
4. Con la zona activa y el Worker en la cuenta correcta, resolver cualquier conflicto de `app` y habilitar `CLOUDFLARE_CUSTOM_DOMAIN=app.helios360erp.com`. El script ya prepara esa ruta; no habilitar la variable con la conexión actual a la otra cuenta.
5. Ejecutar el workflow adaptado y verificar DNS, certificado y https://app.helios360erp.com/login. Cloudflare administra el registro y certificado del Custom Domain. Probar acceso, recarga de página, renovación de sesión y logout con una cuenta de producción.

No hace falta crear `api.helios360erp.com` ni cambiar Railway: el proxy sigue usando su origen actual. La cuenta del compañero y sus registros aún no se han inspeccionado. Cualquier traslado del dominio sería una alternativa separada que requiere decidirlo expresamente con el usuario.

Referencia: [Custom Domains de Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

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
