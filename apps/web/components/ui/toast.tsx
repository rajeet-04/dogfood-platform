"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CircleCheck, CircleAlert, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "../../lib/cn";

export type ToastTone = "info" | "success" | "warning" | "danger";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastContextValue = {
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

const TONE_CLASS: Record<ToastTone, string> = {
  info: "text-info-fg",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
};

const DURATION = 5000;

/**
 * Transient confirmations for things that happen away from the user's focus.
 * Feedback for a form the user is looking at stays inline (see `ActionForm`) -
 * duplicating it as a toast would be noise.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setMounted(true);
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              role="region"
              aria-label="Status messages"
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
            >
              {toasts.map((toast) => {
                const Icon = ICONS[toast.tone];
                return (
                  <div
                    key={toast.id}
                    role="status"
                    className="animate-enter pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface-raised px-3.5 py-3 shadow-pop"
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn("mt-px size-4 shrink-0", TONE_CLASS[toast.tone])}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-small font-medium text-fg">{toast.title}</p>
                      {toast.description ? (
                        <p className="mt-0.5 text-caption text-fg-subtle">
                          {toast.description}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(toast.id)}
                      aria-label="Dismiss notification"
                      className="-mt-0.5 -mr-1 rounded-md p-1 text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // Rendering outside a provider should never break a page.
    return { push: () => {}, dismiss: () => {} };
  }
  return context;
}
