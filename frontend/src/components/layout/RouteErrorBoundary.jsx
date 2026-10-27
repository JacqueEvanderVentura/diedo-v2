import { useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}
