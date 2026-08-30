import { useSessionStore } from '@/stores/sessionStore'

export function currentSessionActor() {
  const user = useSessionStore.getState().user
  return {
    id: user?.userId || user?.id || null,
    name: user?.name || 'Sistema local',
    workspaceId: user?.workspaceId || null,
  }
}
