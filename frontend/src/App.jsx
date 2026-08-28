import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { AppRoutes } from './router'
import { useLenis } from './lib/useLenis'
import { useSessionStore } from './stores/sessionStore'

export default function App() {
  useLenis(false)
  const bootstrap = useSessionStore((s) => s.bootstrap)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <>
      <AppRoutes />
      <Toaster
        position="top-center"
        richColors
        expand={false}
        visibleToasts={1}
        toastOptions={{
          style: {
            borderRadius: '0.75rem',
            fontFamily: 'Inter, sans-serif',
          },
        }}
      />
    </>
  )
}
