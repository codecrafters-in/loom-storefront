import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext({ push: () => {} })

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, { tone = 'info', duration = 3600 } = {}) => {
    const id = (nextId += 1)
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-fade-up rounded-xs border px-4 py-3 text-sm shadow-card ${
              t.tone === 'error'
                ? 'border-sale/30 bg-surface text-sale'
                : 'border-line bg-ink text-page'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
