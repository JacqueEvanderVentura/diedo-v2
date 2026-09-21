import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  SIMPLIFIED_CRM_SECTIONS,
  resolveSimplifiedCrmSection,
} from '@/modules/crm/lib/crmNavigation'

export function SimplifiedCrmSectionNav({ className, trailing = null }) {
  const { pathname, search } = useLocation()
  const activeSection = resolveSimplifiedCrmSection(pathname, search)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-wrap gap-2" data-testid="crm-simplified-sections">
        {SIMPLIFIED_CRM_SECTIONS.map((section) => {
          const active = activeSection === section.id
          return (
            <NavLink
              key={section.id}
              to={section.to}
              data-testid={section.testId || `crm-simplified-section-${section.id}`}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {section.label}
            </NavLink>
          )
        })}
      </div>
      {trailing}
    </div>
  )
}
