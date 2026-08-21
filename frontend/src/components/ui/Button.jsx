import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  primary:
    'bg-blue-600 text-white shadow-sm shadow-blue-200 hover:bg-blue-700 active:scale-[0.98]',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 shadow-sm hover:bg-slate-50 active:scale-[0.98]',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100 active:scale-[0.98]',
  dangerSolid: 'bg-red-600 text-white shadow-sm shadow-red-200 hover:bg-red-700 active:scale-[0.98]',
}

const sizes = {
  sm: 'px-3 py-2 text-xs rounded-lg gap-1.5',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3.5 text-sm rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-xl',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-[background-color,box-shadow,transform,color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})
