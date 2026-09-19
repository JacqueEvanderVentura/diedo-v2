export function IncrementalListFooter({ loaded, total, loading, hasMore, className = '' }) {
  if (!loaded && !loading) return null

  let message = `Mostrando ${loaded}`
  if (total > 0) {
    message += ` de ${total}`
  }
  if (loading) {
    message = 'Cargando más registros…'
  } else if (hasMore) {
    message += '. Sigue bajando para cargar más.'
  } else if (total > 0) {
    message += ' — listo.'
  }

  return (
    <p className={`py-6 text-center text-xs text-slate-500 ${className}`} data-testid="incremental-list-footer">
      {message}
    </p>
  )
}
