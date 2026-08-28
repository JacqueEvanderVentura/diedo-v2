import { cn } from '@/lib/utils'

export function configPageClass(embedded, maxWidth = 'max-w-[1400px]') {
  return cn(
    'mx-auto w-full space-y-6',
    embedded ? 'px-0 pb-2' : `p-6 sm:p-8 ${maxWidth}`
  )
}
