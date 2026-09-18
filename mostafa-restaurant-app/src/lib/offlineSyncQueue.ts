/**
 * Lightweight Client-Side Offline Pending Queue
 * 
 * Rules:
 * 1. Supabase is the SOLE Source of Truth.
 * 2. Pending mutations queued during network disconnect.
 * 3. Every action stamped with an Idempotency Key (UUID/timestamp).
 * 4. Automatic flush upon network reconnect ('online' event).
 * 5. Re-submission absorbs existing record safely on Supabase (Idempotent).
 */

export interface QueuedAction {
  id: string // Client UUID
  idempotency_key: string
  action_type: 'create_order' | 'record_outcome' | 'record_expense'
  endpoint: string
  payload: any
  queued_at: string
  retry_count: number
}

const STORAGE_KEY = 'mostafa_offline_action_queue_v1'

let memoryQueue: QueuedAction[] = []

export function getOfflineQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return [...memoryQueue]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return [...memoryQueue]
  }
}

export function enqueueOfflineAction(action: Omit<QueuedAction, 'id' | 'queued_at' | 'retry_count'>): QueuedAction {
  const queue = getOfflineQueue()
  const newAction: QueuedAction = {
    ...action,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    queued_at: new Date().toISOString(),
    retry_count: 0,
  }
  queue.push(newAction)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch (err) {
      console.error('Failed to persist offline action queue:', err)
    }
  } else {
    memoryQueue = queue
  }
  return newAction
}

export function removeOfflineAction(actionId: string): void {
  const queue = getOfflineQueue().filter((a) => a.id !== actionId)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch (err) {
      console.error('Failed to update offline action queue:', err)
    }
  } else {
    memoryQueue = queue
  }
}


export async function flushOfflineQueue(
  executor: (action: QueuedAction) => Promise<{ success: boolean; shouldDrop: boolean }>
): Promise<{ flushed: number; remaining: number }> {
  const queue = getOfflineQueue()
  if (queue.length === 0) return { flushed: 0, remaining: 0 }

  let flushedCount = 0
  const remaining: QueuedAction[] = []

  for (const item of queue) {
    try {
      const res = await executor(item)
      if (res.success || res.shouldDrop) {
        flushedCount++
      } else {
        remaining.push({ ...item, retry_count: item.retry_count + 1 })
      }
    } catch {
      remaining.push({ ...item, retry_count: item.retry_count + 1 })
    }
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
    } catch {}
  }

  return { flushed: flushedCount, remaining: remaining.length }
}
