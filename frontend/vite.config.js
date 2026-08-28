import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    define: {
      'import.meta.env.VITE_HAS_SERPER': JSON.stringify(Boolean(env.SERPER_API_KEY)),
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: true,
      hmr: {
        clientPort: 443,
        protocol: 'wss',
      },
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api/serp': {
          target: 'https://serpapi.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/serp/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
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
