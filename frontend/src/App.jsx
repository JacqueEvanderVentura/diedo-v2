import { Toaster } from 'sonner'
import { AppRoutes } from './router'
import { useLenis } from './lib/useLenis'

export default function App() {
  useLenis(false)
  return (
    <>
      <AppRoutes />
      <Toaster
        position="top-right"
        richColors
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
