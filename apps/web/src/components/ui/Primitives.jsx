import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { cx } from '../../lib/format';

/** Modal used for share, delete confirmation and asset previews. */
export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 22, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}
            className={cx('panel relative w-full overflow-hidden bg-ink-850/95', width)}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg leading-tight">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-[13px] leading-relaxed text-ink-300">{subtitle}</p> : null}
              </div>
              <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-full p-1.5 text-ink-300 transition hover:bg-white/[0.07] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="px-5 py-4">{children}</div>
            {footer ? <footer className="flex items-center justify-end gap-2 border-t border-line bg-white/[0.02] px-5 py-3.5">{footer}</footer> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** A selectable card — used by the wizard's type/platform cards and the gallery. */
export function ChoiceCard({ selected, onClick, children, className, disabled }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-card border p-4 text-left transition-colors duration-200',
        selected ? 'border-white/70 bg-white/[0.07] shadow-glow' : 'border-line bg-ink-850/60 hover:border-white/25 hover:bg-white/[0.045]',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
      aria-pressed={Boolean(selected)}
    >
      {children}
    </motion.button>
  );
}

export function Chip({ active, children, onClick, className, title }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium transition',
        active ? 'border-white/70 bg-white text-ink-900' : 'border-line bg-white/[0.03] text-ink-200',
        onClick && !active && 'hover:border-white/30 hover:text-white',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Tag({ children, className, mono }) {
  return (
    <span className={cx('inline-flex items-center rounded-pill border border-line bg-white/[0.03] px-2 py-0.5 text-[11px] text-ink-300', mono && 'font-mono', className)}>
      {children}
    </span>
  );
}

export function Divider({ className, label }) {
  if (!label) return <div className={cx('rule', className)} />;
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-line" />
      <span className="micro">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, className }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-white/[0.015] px-6 py-12 text-center', className)}>
      {Icon ? (
        <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-ink-850 text-ink-200">
          <Icon className="h-5 w-5" strokeWidth={1.7} />
        </span>
      ) : null}
      <h3 className="font-display text-xl leading-tight">{title}</h3>
      {body ? <p className="max-w-sm text-sm leading-relaxed text-ink-300">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Thin progress bar for the generation overlay. */
export function Progress({ value = 0, className }) {
  return (
    <div className={cx('h-[3px] w-full overflow-hidden rounded-pill bg-white/[0.07]', className)}>
      <motion.div
        className="h-full rounded-pill bg-white"
        animate={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 22 }}
      />
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-line bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-ink-200">{children}</kbd>;
}
