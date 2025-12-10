import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type Toast = { id: string; title: string; description?: string; variant?: 'success' | 'error' | 'info' }

type ToastContextValue = {
  push: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // add toast and auto-dismiss after 3.5 seconds
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, ...toast }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="glass px-4 py-3 rounded-full flex items-center gap-3 shadow-lg">
            <div className={`h-2 w-2 rounded-full ${dotClass(t.variant)}`} />
            <div>
              <div className="text-sm font-medium">{t.title}</div>
              {t.description ? <div className="text-xs text-muted">{t.description}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// return color class for toast variant indicator dot
function dotClass(variant?: Toast['variant']) {
  if (variant === 'success') return 'bg-[--color-success]'
  if (variant === 'error') return 'bg-[--color-danger]'
  return 'bg-white'
}


