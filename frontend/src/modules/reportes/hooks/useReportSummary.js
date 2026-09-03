import { useCallback, useEffect, useRef, useState } from 'react'

export function useReportSummary(fetcher, initialValue) {
  const [data, setData] = useState(initialValue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetcherRef.current())
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [fetcher, reload])

  return { data, loading, error, reload }
}
