export function BackofficeSelect({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}
