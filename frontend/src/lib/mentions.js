import { fullName } from '@/modules/rrhh/lib/rrhh'

export const MENTION_TOKEN_RE = /@\[([^\]]+)\]\((user|emp):([^)]+)\)/g

export function buildMentionCatalog(users = [], employees = []) {
  const items = []

  users
    .filter((u) => u.active !== false)
    .forEach((u) => {
      items.push({ type: 'user', id: u.id, label: u.name, hint: u.role || 'Usuario' })
    })

  employees
    .filter((e) => e.active !== false)
    .forEach((e) => {
      items.push({ type: 'emp', id: e.id, label: fullName(e), hint: e.position || 'Empleado' })
    })

  return items.sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

export function filterMentionCatalog(catalog, query = '') {
  const q = query.trim().toLowerCase()
  if (!q) return catalog.slice(0, 8)
  return catalog
    .filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint?.toLowerCase().includes(q)
    )
    .slice(0, 8)
}

export function buildMentionToken({ type, id, label }) {
  return `@[${label}](${type}:${id})`
}

export function parseMentionParts(text = '') {
  const parts = []
  let last = 0

  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ kind: 'text', value: text.slice(last, index) })
    parts.push({ kind: match[2], id: match[3], label: match[1] })
    last = index + match[0].length
  }

  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  if (!parts.length) parts.push({ kind: 'text', value: text })

  return parts
}

export function extractMentionedUserIds(text = '') {
  const ids = new Set()
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    if (match[2] === 'user') ids.add(match[3])
  }
  return [...ids]
}

export function plainMessagePreview(text = '', max = 80) {
  const plain = text.replace(MENTION_TOKEN_RE, (_, label) => `@${label}`)
  return plain.length > max ? `${plain.slice(0, max)}…` : plain
}

export function detectActiveMention(value, caret) {
  const before = value.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const chunk = before.slice(at + 1)
  if (chunk.includes(' ') || chunk.includes('\n') || chunk.includes('[')) return null
  return { start: at, query: chunk }
}
