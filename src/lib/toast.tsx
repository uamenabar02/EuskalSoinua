"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface Toast {
  id: number;
  message: string;
  icon?: string;
}

interface ToastContextValue {
  toast: (message: string, icon?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, icon?: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-24 md:bottom-28 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass border border-white/10 rounded-full px-4 py-2.5 text-sm font-medium flex items-center gap-2 shadow-xl animate-fade-up max-w-md"
          >
            {t.icon ? <span className="text-base">{t.icon}</span> : null}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op if used outside provider (shouldn't happen in practice)
    return { toast: () => {} };
  }
  return ctx;
}
