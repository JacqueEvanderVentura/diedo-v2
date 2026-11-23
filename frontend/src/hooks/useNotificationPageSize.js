import { useEffect, useState } from 'react'

export function useNotificationPageSize() {
  const [pageSize, setPageSize] = useState(() => resolvePageSize())

  useEffect(() => {
    const onResize = () => setPageSize(resolvePageSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return pageSize
}

function resolvePageSize() {
  if (typeof window === 'undefined') return 10
  const width = window.innerWidth
  if (width < 720) return 3
  if (width < 1200) return 6
  return 10
}