import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type LiveEvent = { type: 'registry' } | { type: 'file'; id: string }
type Listener = (e: LiveEvent) => void

interface Ctx {
  subscribe: (fn: Listener) => () => void
  connected: boolean
}

const EventsContext = createContext<Ctx>({ subscribe: () => () => {}, connected: false })

// One EventSource for the whole app; components subscribe to what they need.
export function EventsProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>())
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as LiveEvent
      for (const fn of listeners.current) fn(e)
    }
    return () => es.close()
  }, [])

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn)
    return () => void listeners.current.delete(fn)
  }, [])
  const value = useMemo(() => ({ subscribe, connected }), [subscribe, connected])

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
}

export function useLiveEvent(fn: Listener) {
  const { subscribe } = useContext(EventsContext)
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe])
}

export const useConnected = () => useContext(EventsContext).connected
