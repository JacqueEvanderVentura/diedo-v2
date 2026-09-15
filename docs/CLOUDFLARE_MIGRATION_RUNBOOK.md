# Publicar la web gratis, paso a paso

## Qué vamos a usar

- **Cloudflare** aloja la web en una dirección gratuita terminada en `workers.dev`.
- **Railway** mantiene la API: https://api-production-b1fb.up.railway.app
- **Resend** queda en modo de pruebas con `Helios 360 ERP <onboarding@resend.dev>`.
- No se requiere comprar un dominio ni cambiar servidores DNS. Railway conserva su coste actual.

`helios360erp.com` se añadió a Cloudflare, pero no se confirmó su propiedad. No lo usamos para la web, la API ni el correo. Su aviso “Invalid nameservers” no impide usar workers.dev.

## 1. Activar la dirección gratuita de Cloudflare

Abre https://dash.cloudflare.com/96ecfecb9fbc377880e4809b0b22037a/workers-and-pages e inicia sesión.
Cloudflare indica que abrir esta sección por primera vez crea el subdominio workers.dev de la cuenta. Si solicita completar la configuración, usa la opción gratuita.

Resultado esperado: la cuenta tiene un subdominio terminado en workers.dev. No necesitas pulsar Buy domain ni configurar DNS.

## 2. Dar acceso a la herramienta de publicación

Wrangler es la herramienta que sube los archivos desde este ordenador. Ya está instalado en el proyecto.
Abre PowerShell y ejecuta estas líneas una por una:

```powershell
cd C:\Users\jeanp\Code\erp-back\frontend
npx wrangler login
npx wrangler whoami
```

El primer comando de Wrangler abre el navegador para que autorices tu cuenta. El segundo comprueba el acceso. No pegues contraseñas ni claves en el chat.

Después de autorizar puedo continuar con la publicación desde esta tarea.

## 3. Lo que se verifica antes de publicar

Estos pasos corresponden a quien realiza el despliegue:

1. Reconciliar la copia local y full-stack antes de publicar: local `8380ffa`, remoto observado `362e775`. Conservar los cambios locales y registrar el SHA final.
2. Ejecutar las pruebas; compilar con la URL Railway y todas las funcionalidades pendientes desactivadas. Las variables exactas están en `.github/workflows/deploy-fe-pages.yml`.
3. Ejecutar `npx wrangler deploy --dry-run --env preview`. Este comando valida sin publicar.
4. Publicar con `npx wrangler deploy --env preview`. Copiar la URL real que devuelve, sin inventar el nombre de cuenta.
5. Añadir esa URL exacta a CORS_ORIGINS de la API, conservando las anteriores. CORS es la lista de webs que pueden llamar a la API desde el navegador.
6. Probar inicio de sesión, renovación, cierre de sesión y lectura de archivos. Las cookies cruzan sitios distintos (workers.dev y railway.app); comprobar también navegadores que bloquean cookies de terceros antes de dar la migración por terminada.
7. Validar y publicar producción con `npx wrangler deploy --dry-run --env production` y después `npx wrangler deploy --env production`. Autorizar su URL exacta en CORS.

No retirar Railway hasta superar las pruebas reales. El plazo de 48 horas empieza después de esa validación.

## 4. Correo de prueba sin dominio

En Resend crea una cuenta y una API key con permiso de envío. Guarda la clave directamente en Variables del servicio api de Railway. Nunca la guardes en Git.

```dotenv
RESEND_API_KEY=<clave privada>
EMAIL_FROM=Helios 360 ERP <onboarding@resend.dev>
EMAIL_ENABLED=false
RESEND_REQUEST_TIMEOUT_SECONDS=10
```

El remitente de prueba permite enviar al correo asociado a tu cuenta de Resend; no permite notificar a todos los usuarios del ERP. Los flujos funcionales siguen pendientes de un desarrollo posterior.

Antes de un ensayo real, indicar el correo de esa cuenta. Desde backend, con las dependencias instaladas y la clave disponible en ese entorno, ejecutar una sola vez (sustituir TU_CORREO):

```powershell
python -m app.scripts.send_resend_test --to TU_CORREO --idempotency-key prueba-inicial-sin-dominio-001
```

El comando habilita el envío solo para esa ejecución. Un resultado sent con provider_id confirma aceptación por Resend; revisar el buzón para confirmar recepción. No se ha enviado ningún correo en esta adaptación.

## 5. Publicaciones automáticas y recuperación

GitHub necesita el secreto CLOUDFLARE_API_TOKEN y la variable CLOUDFLARE_ACCOUNT_ID. Se configuran en Settings → Secrets and variables → Actions del repositorio; esto puede requerir al propietario. La automatización debe publicar únicamente tras superar las pruebas y el build. Actualmente falta validar su ejecución en GitHub.

Conservar la web anterior: https://web-production-be856.up.railway.app
Después de 48 horas de validación, retirar la publicación anterior de Railway y GitHub Pages. No hacerlo mientras la nueva web esté pendiente de publicar o de probar.

Para recuperar una versión anterior de Cloudflare, consultar `npx wrangler versions list --env production` y usar `npx wrangler rollback ID_VERSION --env production` con una versión verificada. Esto no modifica PostgreSQL.

## Estado comprobado en esta adaptación

- Wrangler 4.131.2 instalado; falta iniciar sesión en la terminal.
- Cloudflare conectado por API; todavía sin subdominio workers.dev.
- API Railway: /health/ready respondió 200. El último intento de despliegue aparece FAILED, con error al actualizar appointments durante la migración. Resolver ese fallo antes de redesplegar la API; una versión anterior sigue atendiendo.
- Pruebas nuevas ejecutadas antes de implementar: fallaron por workers_dev ausente y remitente antiguo, respectivamente.
- Después del cambio: 5 pruebas de configuración de Cloudflare y 27 pruebas de configuración, correo y CORS del backend pasan.
- Publicación, CORS real, sesión en Cloudflare, prueba real de correo y retirada de servicios: pendientes.

Referencias: [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [limitación del remitente de Resend](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Publicación de prueba realizada

- Copia actualizada: C:/Users/jeanp/Code/erp-cloudflare-free, rama codex/cloudflare-free.
- Base remota: 362e775; commit publicado: 8ec37e5.
- URL: https://diedo-frontend-preview.helios360erp.workers.dev
- Versión Cloudflare: 132b3634-6d02-4511-a275-3dcbb0eeea93.
- 82 archivos y 297 pruebas pasan; build y dry-run pasan.
- HTTPS, health, SPA, MIME de JS/CSS, cabeceras y caché comprobados.
- check-hosting.mjs detectó un fallo: un JS inexistente devuelve HTML con 200 en modo SPA puro. Pendiente resolver antes de producción; un Worker mínimo exige revisar la decisión original de no añadir lógica de servidor.
- CORS_ORIGINS guardado en Railway conservando ambos orígenes anteriores y añadiendo preview, con skipDeploys=true. Aún no está activo en el proceso de API; OPTIONS devuelve 400.
- Resolver la migración fallida de la API antes de redesplegar y comprobar login/refresh/logout. Railway sigue activo.
- Resend sigue preparado en erp-back; pendiente integrar sobre la base actual y hacer el envío real.
