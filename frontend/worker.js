const API_PREFIX = '/api-backend'
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
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
