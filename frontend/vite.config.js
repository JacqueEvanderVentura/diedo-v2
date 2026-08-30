import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const pagesBase = process.env.GITHUB_PAGES === 'true' ? '/diedo-v2/' : '/'
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    base: pagesBase,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    define: {
      'import.meta.env.VITE_HAS_SERPER': JSON.stringify(Boolean(env.SERPER_API_KEY)),
    },
    test: {
      include: ['tests/**/*.test.js'],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: true,
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api-backend': {
          target: apiProxyTarget,
          changeOrigin: true,
          cookiePathRewrite: {
            '/api/v1/auth': '/api-backend/api/v1/auth',
          },
          rewrite: (p) => p.replace(/^\/api-backend/, ''),
        },
        '/api/serp': {
          target: 'https://serpapi.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/serp/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('cookie')
              const key = env.SERPAPI_KEY
              if (key) {
                const sep = proxyReq.path.includes('?') ? '&' : '?'
                proxyReq.path += `${sep}api_key=${encodeURIComponent(key)}`
              }
            })
          },
        },
        '/api/serper': {
          target: 'https://google.serper.dev',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/serper/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.removeHeader('cookie')
              const key = env.SERPER_API_KEY
              if (key) {
                proxyReq.setHeader('X-API-KEY', key)
              }
            })
          },
        },
      },
    },
  }
})
