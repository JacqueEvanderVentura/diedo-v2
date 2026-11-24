const API_PREFIX = '/api-backend'
const BOOKING_CONTEXT_PATH = '/api/v1/public/booking/context'
const BOOKING_OG_IMAGE = '/helios-360-full.png'
const BOOKING_CONTEXT_TIMEOUT_MS = 1500
const BRANCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LEGAL_ASSETS = {
  '/privacidad': '/privacidad/index.html',
  '/privacidad/': '/privacidad/index.html',
  '/privacidad/eliminar-datos': '/privacidad/eliminar-datos/index.html',
  '/privacidad/eliminar-datos/': '/privacidad/eliminar-datos/index.html',
  '/condiciones': '/condiciones/index.html',
  '/condiciones/': '/condiciones/index.html',
}
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

function errorResponse(message, status) {
  return Response.json({ message }, { status, headers: securityHeaders })
}

function isAgendarPath(pathname) {
  return pathname === '/agendar' || pathname.startsWith('/agendar/')
}

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function replaceMetaContent(html, { property, name }, content) {
  const safe = escapeHtmlAttr(content)
  const keyAttr = property ? 'property' : 'name'
  const keyValue = property || name
  const escaped = String(keyValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const marker = `${keyAttr}="${escaped}"`
  const replacement = property
    ? `<meta property="${property}" content="${safe}" />`
    : `<meta name="${name}" content="${safe}" />`
  const patterns = [
    new RegExp(`<meta\\s[^>]*${marker}[^>]*content="[^"]*"[^>]*\\/?>`, 'is'),
    new RegExp(`<meta\\s[^>]*content="[^"]*"[^>]*${marker}[^>]*\\/?>`, 'is'),
  ]
  for (const pattern of patterns) {
    if (pattern.test(html)) return html.replace(pattern, replacement)
  }
  return html.replace('</head>', `    ${replacement}\n  </head>`)
}

function bookingShareCopy(workspaceName) {
  if (workspaceName) {
    return {
      title: `Agenda tu cita con ${workspaceName}!`,
      description: `Reserva en línea con ${workspaceName}. Elige el horario que mejor te funcione.`,
      siteName: workspaceName,
      imageAlt: `Agenda tu cita con ${workspaceName}`,
    }
  }
  return {
    title: 'Agenda tu cita con nosotros!',
    description: 'Reserva tu cita en línea. Elige el horario que mejor te funcione.',
    siteName: 'Helios 360',
    imageAlt: 'Helios 360 — agenda en línea',
  }
}

function rewriteAgendarShareHtml(html, pageUrl, workspaceName) {
  const copy = bookingShareCopy(workspaceName)
  const imageUrl = `${pageUrl.origin}${BOOKING_OG_IMAGE}`
  let next = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttr(copy.title)}</title>`)
  next = replaceMetaContent(next, { name: 'description' }, copy.description)
  next = replaceMetaContent(next, { property: 'og:type' }, 'website')
  next = replaceMetaContent(next, { property: 'og:locale' }, 'es_DO')
  next = replaceMetaContent(next, { property: 'og:site_name' }, copy.siteName)
  next = replaceMetaContent(next, { property: 'og:title' }, copy.title)
  next = replaceMetaContent(next, { property: 'og:description' }, copy.description)
  next = replaceMetaContent(next, { property: 'og:url' }, pageUrl.href)
  next = replaceMetaContent(next, { property: 'og:image' }, imageUrl)
  next = replaceMetaContent(next, { property: 'og:image:alt' }, copy.imageAlt)
  next = replaceMetaContent(next, { property: 'og:image:type' }, 'image/png')
  next = replaceMetaContent(next, { name: 'twitter:card' }, 'summary_large_image')
  next = replaceMetaContent(next, { name: 'twitter:title' }, copy.title)
  next = replaceMetaContent(next, { name: 'twitter:description' }, copy.description)
  next = replaceMetaContent(next, { name: 'twitter:image' }, imageUrl)
  return next
}

function resolveApiOrigin(env) {
  try {
    const target = new URL(env.API_ORIGIN)
    if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/') {
      return null
    }
    return target.origin
  } catch {
    return null
  }
}

async function fetchWorkspaceName(apiOrigin, branchId) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), BOOKING_CONTEXT_TIMEOUT_MS)
    const response = await fetch(
      `${apiOrigin}${BOOKING_CONTEXT_PATH}?branchId=${encodeURIComponent(branchId)}`,
      { signal: controller.signal, cache: 'no-store' },
    )
    clearTimeout(timeout)
    if (!response.ok) return null
    const data = await response.json()
    const name = data.workspaceName || data.workspace_name
    return typeof name === 'string' && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

async function serveAgendarShell(request, env, url) {
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), request))
  if (!shell.ok) {
    return errorResponse('Archivo no encontrado', 404)
  }
  const branchId = url.searchParams.get('branch')
  const apiOrigin = resolveApiOrigin(env)
  const workspaceName = branchId && BRANCH_UUID_RE.test(branchId) && apiOrigin
    ? await fetchWorkspaceName(apiOrigin, branchId)
    : null
  const html = rewriteAgendarShareHtml(await shell.text(), url, workspaceName)
  const headers = new Headers(shell.headers)
  headers.set('Content-Type', 'text/html; charset=UTF-8')
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value)
  if (request.method === 'HEAD') {
    return new Response(null, { status: shell.status, headers })
  }
  return new Response(html, { status: shell.status, headers })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
      const legalAsset = LEGAL_ASSETS[url.pathname]
      if (legalAsset && ['GET', 'HEAD'].includes(request.method)) {
        return env.ASSETS.fetch(new Request(new URL(legalAsset, url), request))
      }
      if (['GET', 'HEAD'].includes(request.method) && isAgendarPath(url.pathname)) {
        return serveAgendarShell(request, env, url)
      }
      // Existing assets are served first. Only page navigations receive the SPA shell.
      if (['GET', 'HEAD'].includes(request.method)
        && request.headers.get('Sec-Fetch-Mode') === 'navigate'
        && !url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/fonts/')) {
        return env.ASSETS.fetch(new Request(new URL('/', url), request))
      }
      return errorResponse('Archivo no encontrado', 404)
    }
    const path = url.pathname.slice(API_PREFIX.length)
    if (!path.startsWith('/api/') && path !== '/health/ready') {
      return errorResponse('Ruta no encontrada', 404)
    }
    const origin = request.headers.get('Origin')
    if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      return errorResponse('Origen no autorizado', 403)
    }
    try {
      const target = new URL(env.API_ORIGIN)
      if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/') {
        return errorResponse('Servicio no configurado', 503)
      }
      const apiOrigin = target.origin
      target.pathname = path
      target.search = url.search
      const headers = new Headers(request.headers)
      for (const name of ['Host', 'Forwarded', 'X-Forwarded-Host', 'X-Forwarded-For', 'X-Forwarded-Proto']) {
        headers.delete(name)
      }
      const upstreamRequest = new Request(target, new Request(request, { headers, redirect: 'manual' }))
      const upstream = await fetch(upstreamRequest, { cache: 'no-store', redirect: 'manual' })
      const responseHeaders = new Headers(upstream.headers)
      responseHeaders.delete('Set-Cookie')
      for (const cookie of upstream.headers.getSetCookie()) {
        responseHeaders.append('Set-Cookie', cookie
          .replace(/;\s*Domain=[^;]+/gi, '')
          .replace(/;\s*Path=([^;]*)/gi, (_, value) => `; Path=${API_PREFIX}${value}`)
          .replace(/;\s*SameSite=None/gi, '; SameSite=Lax'))
      }
      const location = responseHeaders.get('Location')
      if (location) {
        const redirect = new URL(location, target)
        if (redirect.origin === apiOrigin) {
          responseHeaders.set('Location', `${url.origin}${API_PREFIX}${redirect.pathname}${redirect.search}`)
        }
      }
      responseHeaders.delete('Access-Control-Allow-Origin')
      responseHeaders.delete('Access-Control-Allow-Credentials')
      for (const [name, value] of Object.entries(securityHeaders)) responseHeaders.set(name, value)
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
    } catch {
      return errorResponse('No se pudo conectar con el servicio. Intenta nuevamente.', 502)
    }
  },
}