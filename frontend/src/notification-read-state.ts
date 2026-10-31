import { useCallback, useEffect, useMemo, useState } from 'react'

export function notificationReadKey(user: { id?: number; email?: string; companyId?: number } | null) {
  return user ? `mavtrack:notifications:read:v1:${user.companyId ?? ''}:${user.id ?? user.email ?? ''}` : null
}

export function readNotificationIds(storage: Pick<Storage, 'getItem'>, key: string | null): Set<number> {
  if (!key) return new Set()
  try {
    const saved: unknown = JSON.parse(storage.getItem(key) || '[]')
    return new Set(Array.isArray(saved) ? saved.filter(id => Number.isSafeInteger(id) && id > 0) : [])
  } catch { return new Set() }
}

export function unreadNotificationCount(rows: { id: number }[], read: Set<number>) {
  return rows.filter(row => !read.has(row.id)).length
}

export function useNotificationReadState(key: string | null) {
  const [revision, setRevision] = useState(0)
  const readIds = useMemo(() => readNotificationIds(localStorage, key), [key, revision])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setRevision(value => value + 1)
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [key])
  const markRead = useCallback((rows: { id: number }[]) => {
    if (!key || rows.length === 0) return
    const next = readNotificationIds(localStorage, key)
    const previousSize = next.size
    rows.forEach(row => next.add(row.id))
    if (next.size === previousSize) return
    try { localStorage.setItem(key, JSON.stringify([...next])) } catch { return }
    setRevision(value => value + 1)
  }, [key])
  return { readIds, markRead }
}
