import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, KeyRound, LogOut, Settings, User } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { CURRENT_USER } from '@/data/dashboard'
import { useConfigStore } from '@/stores/configStore'
import {
  canChangeOwnPassword,
  canEditProfile,
  canViewProfile,
  hasPermission,
} from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ChangePasswordModal } from './ChangePasswordModal'
import { ProfileModal } from './ProfileModal'

function MenuItem({ icon: Icon, label, onClick, danger, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      )}
    >
      <Icon className={cn('h-4 w-4', danger ? 'text-red-400' : 'text-slate-400')} />
      {label}
    </button>
  )
}

export function UserProfileMenu() {
  const navigate = useNavigate()
  const anchorRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  const users = useConfigStore((s) => s.users)
  const permissions = useConfigStore((s) => s.permissions)

  const user = useMemo(
    () => users.find((u) => u.id === CURRENT_USER.id) || { ...CURRENT_USER, email: '', active: true, branchIds: [] },
    [users]
  )

  const displayName = user.name || CURRENT_USER.name
  const displayRole = user.role || CURRENT_USER.role
  const initials =
    CURRENT_USER.initials ||
    displayName
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()

  const showProfile = canViewProfile(permissions, displayRole)
  const showEditProfile = canEditProfile(permissions, displayRole)
  const showChangePassword = canChangeOwnPassword(permissions, displayRole)
  const showConfig = hasPermission(permissions, displayRole, 'configuracion', 'Ver')

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const closeMenu = () => setOpen(false)

  const openProfile = () => {
    closeMenu()
    setProfileOpen(true)
  }

  const openPassword = () => {
    closeMenu()
    setPasswordOpen(true)
  }

  const goConfig = () => {
    closeMenu()
    navigate('/configuracion')
  }

  const logout = () => {
    closeMenu()
    toast.info('Sesión cerrada (demo). En producción redirigiría al login.')
  }

  const hasMenuItems = showProfile || showChangePassword || showConfig

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid="navbar-profile-menu"
        onClick={() => setOpen((o) => !o)}
        className="ml-1 flex items-center gap-3 rounded-xl border border-slate-100 py-1.5 pl-3 pr-2 transition-colors hover:bg-slate-50"
      >
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-semibold text-slate-800">{displayName}</p>
          <p className="text-[11px] font-medium text-blue-600">{displayRole}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-sm font-bold text-blue-700">
          {initials}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      <DropdownPanel
        open={open}
        anchorRef={anchorRef}
        menuRef={menuRef}
        align="end"
        width={240}
        estimatedHeight={200}
        zIndex={120}
        testId="profile-menu-panel"
      >
        <div className="border-b border-slate-100 px-3 py-2.5 sm:hidden">
          <p className="text-sm font-semibold text-slate-800">{displayName}</p>
          <p className="text-xs text-blue-600">{displayRole}</p>
        </div>

        {!hasMenuItems ? (
          <p className="px-3 py-4 text-center text-sm text-slate-400">Sin opciones de perfil disponibles.</p>
        ) : (
          <>
            {showProfile && (
              <MenuItem icon={User} label={showEditProfile ? 'Mi perfil' : 'Ver perfil'} onClick={openProfile} testId="profile-menu-view" />
            )}
            {showChangePassword && (
              <MenuItem icon={KeyRound} label="Cambiar contraseña" onClick={openPassword} testId="profile-menu-password" />
            )}
            {showConfig && (
              <MenuItem icon={Settings} label="Configuración" onClick={goConfig} testId="profile-menu-config" />
            )}
          </>
        )}

        <div className="my-1 border-t border-slate-100" />
        <MenuItem icon={LogOut} label="Cerrar sesión" onClick={logout} danger testId="profile-menu-logout" />
      </DropdownPanel>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} user={user} permissions={permissions} />
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} userId={user.id} />
    </>
  )
}
