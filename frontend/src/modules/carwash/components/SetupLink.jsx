export function SetupLink({ href, children }) {
  return <a className="font-semibold text-blue-700 underline underline-offset-4" href={href} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (abre otra pestaña)</span></a>
}
