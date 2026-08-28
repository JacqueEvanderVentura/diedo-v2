import { useLocation, useOutlet } from 'react-router-dom'
import { ViewTransition } from '@/components/ui/ViewTransition'
import { cn } from '@/lib/utils'

export function AnimatedOutlet({ layoutKey, className }) {
  const location = useLocation()
  const outlet = useOutlet()
  const key = layoutKey ?? location.pathname

  return (
    <ViewTransition transitionKey={key} className={cn('min-h-full w-full', className)}>
      {outlet}
    </ViewTransition>
  )
}
