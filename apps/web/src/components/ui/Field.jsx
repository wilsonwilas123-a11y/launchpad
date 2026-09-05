import { cx } from '../../lib/format';

/** Labelled control shell: every input in the product gets the same rhythm. */
export function Field({ label, hint, error, required, children, className, htmlFor, action }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={htmlFor} className="text-[14px] font-medium text-ink-100">
            {label}
            {required ? <span className="ml-1 text-ink-400">*</span> : null}
          </label>
          {action}
        </div>
      ) : null}
      {children}
      {error ? <p className="text-[14px] leading-relaxed text-red-200/90">{error}</p> : hint ? <p className="text-[14px] leading-relaxed text-ink-400">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, invalid, multiline, rows = 4, ...rest }) {
  if (multiline) {
    return <textarea rows={rows} className={cx('field resize-y min-h-[112px] leading-relaxed', invalid && 'border-red-400/40', className)} {...rest} />;
  }
  return <input className={cx('field h-11', invalid && 'border-red-400/40', className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx('field h-11 cursor-pointer appearance-none bg-[length:0] pr-9', className)} {...rest}>
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
        'group flex w-full items-center justify-between gap-4 rounded-tile border border-line bg-white/[0.02] px-4 py-3 text-left transition',
        'hover:border-white/20 disabled:opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[15px] text-ink-50">{label}</span>
        {hint ? <span className="block truncate text-[14px] text-ink-400">{hint}</span> : null}
      </span>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full border transition', checked ? 'border-white bg-white' : 'border-line-strong bg-white/[0.06]')}>
        <span
          className={cx(
            'absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full transition-all duration-200 ease-launch',
            checked ? 'left-[22px] bg-ink-900' : 'left-[3px] bg-ink-100',
          )}
        />
      </span>
    </button>
  );
}

/** Compact labelled row used in the builder's right panel. */
export function Row({ label, hint, children, className }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 py-2', className)}>
      <span className="min-w-0">
        <span className="block text-[14px] text-ink-100">{label}</span>
        {hint ? <span className="block text-[13.5px] text-ink-400">{hint}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">{children}</span>
    </div>
  );
}
