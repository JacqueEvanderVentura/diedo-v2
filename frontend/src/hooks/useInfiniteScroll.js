import { useEffect, useRef } from 'react'

/**
 * Dispara onLoadMore cuando el sentinel entra en vista (scroll del viewport o de rootRef).
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  rootRef,
  rootMargin = '400px',
}) {
  const sentinelRef = useRef(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore

  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = rootRef?.current ?? null
    if (!sentinel || !hasMore || loading) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMoreRef.current?.()
        }
      },
      { root, rootMargin, threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, rootRef, rootMargin])

  return sentinelRef
}
