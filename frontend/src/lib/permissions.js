import { actionId } from '@/data/permisos'

export function hasPermission(permissions, role, moduleId, action) {
  if (!role || !permissions) return false
  return !!permissions[actionId(moduleId, action)]?.[role]
}

export function canViewProfile(permissions, role) {
  return hasPermission(permissions, role, 'perfil', 'Ver perfil')
}

export function canChangeOwnPassword(permissions, role) {
  return hasPermission(permissions, role, 'perfil', 'Cambiar propia clave')
}

export function canEditProfile(permissions, role) {
  return hasPermission(permissions, role, 'perfil', 'Editar perfil')
}

export function canViewConfig(permissions, role) {
  return hasPermission(permissions, role, 'configuracion', 'Ver')
}
