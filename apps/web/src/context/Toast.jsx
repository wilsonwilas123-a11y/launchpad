import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Info, TriangleAlert } from 'lucide-react';
import { cx } from '../lib/format';

/**
 * Product-wide feedback: "Link copied ✓", "Published", error strings from the
 * API. Toasts are stacked bottom-centre so they never cover the builder rails,
 * and the ones that matter carry an action — "Copy link", "View site", "Undo".
 */
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (message, options = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const tone = options.tone || 'default';
      // Actions need reading time; a plain notice does not.
      const ttl = options.duration ?? (options.action ? 6500 : tone === 'error' ? 6000 : 2600);
      setItems((list) => [...list.slice(-2), { id, message, tone, detail: options.detail, action: options.action }]);
      timers.current.set(id, setTimeout(() => dismiss(id), ttl));
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (message, options) => push(message, { ...options, tone: 'success' }),
      error: (message, options) => push(message, { ...options, tone: 'error' }),
      info: (message, options) => push(message, { ...options, tone: 'default' }),
      copy: (message, options) => push(message, { ...options, tone: 'copy' }),
    }),
    [push, dismiss],
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex flex-col items-center gap-2 px-4">
        <AnimatePresence initial={false}>
          {items.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
              className="pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-pill border border-line bg-ink-850/95 py-2 pl-4 pr-2 text-sm shadow-lift backdrop-blur"
            >
              <Tone tone={toast.tone} />
              <button type="button" onClick={() => dismiss(toast.id)} className="min-w-0 cursor-pointer truncate text-left" title="Dismiss">
                {toast.message}
                {toast.detail ? <span className={cx('ml-2', toast.tone === 'error' ? 'text-ink-300' : 'text-ink-300')}>{toast.detail}</span> : null}
              </button>
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action.onClick?.();
                    dismiss(toast.id);
                  }}
                  className="shrink-0 rounded-pill bg-white px-2.5 py-1 text-[13px] font-medium text-ink-900 transition hover:bg-white/85"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

function Tone({ tone }) {
  const cls = 'h-4 w-4 shrink-0';
  if (tone === 'success') return <Check className={`${cls} text-white`} strokeWidth={2.4} />;
  if (tone === 'error') return <TriangleAlert className={`${cls} text-ink-100`} strokeWidth={2} />;
  if (tone === 'copy') return <Copy className={cls} strokeWidth={2} />;
  return <Info className={`${cls} text-ink-200`} strokeWidth={2} />;
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
