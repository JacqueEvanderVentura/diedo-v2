// Existing assets and browser SPA navigations are served directly by Cloudflare.
// Only unmatched non-navigation requests reach this fallback.
export default {
  fetch() {
    return new Response('Archivo no encontrado', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    })
  },
}
