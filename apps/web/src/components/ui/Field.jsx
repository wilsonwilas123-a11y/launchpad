import { cx } from '../../lib/format';

/** Labelled control shell: every input in the product gets the same rhythm. */
export function Field({ label, hint, error, required, children, className, htmlFor, action }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-100">
            {label}
            {required ? <span className="ml-1 text-ink-400">*</span> : null}
          </label>
          {action}
        </div>
      ) : null}
      {children}
      {error ? <p className="text-xs text-red-200/90">{error}</p> : hint ? <p className="text-xs leading-relaxed text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, invalid, multiline, rows = 4, ...rest }) {
  if (multiline) {
    return <textarea rows={rows} className={cx('field resize-y leading-relaxed', invalid && 'border-red-400/40', className)} {...rest} />;
  }
  return <input className={cx('field h-10', invalid && 'border-red-400/40', className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx('field h-10 cursor-pointer appearance-none bg-[length:0] pr-9', className)} {...rest}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'group flex w-full items-center justify-between gap-4 rounded-tile border border-line bg-white/[0.02] px-3.5 py-2.5 text-left transition',
        'hover:border-white/20 disabled:opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink-50">{label}</span>
        {hint ? <span className="block truncate text-xs text-ink-400">{hint}</span> : null}
      </span>
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full border transition', checked ? 'border-white bg-white' : 'border-line-strong bg-white/[0.06]')}>
        <span
          className={cx(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all duration-200 ease-launch',
            checked ? 'left-[18px] bg-ink-900' : 'left-[3px] bg-ink-100',
          )}
        />
      </span>
    </button>
  );
}

/** Compact labelled row used in the builder's right panel. */
export function Row({ label, hint, children, className }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 py-1.5', className)}>
      <span className="min-w-0">
        <span className="block text-[13px] text-ink-100">{label}</span>
        {hint ? <span className="block text-[11px] text-ink-400">{hint}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">{children}</span>
    </div>
  );
}
