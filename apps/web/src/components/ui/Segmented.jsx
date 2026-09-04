import { motion } from 'framer-motion';
import { cx } from '../../lib/format';

/** Sliding segmented control — device switcher, panel tabs, platform choice. */
export function Segmented({ options, value, onChange, size = 'md', className, layoutId }) {
  const small = size === 'sm';
  return (
    <div className={cx('relative inline-flex items-center gap-0.5 rounded-pill border border-line bg-white/[0.03] p-0.5', className)} role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cx(
              'relative isolate inline-flex items-center gap-1.5 rounded-pill font-medium transition-colors',
              small ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
              active ? 'text-ink-900' : 'text-ink-300 hover:text-white',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId || `seg-${options.map((o) => o.value).join('')}`}
                className="absolute inset-0 -z-10 rounded-pill bg-white"
                transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.7 }}
              />
            ) : null}
            {option.icon ? <option.icon className={cx(small ? 'h-3.5 w-3.5' : 'h-4 w-4', active ? 'opacity-90' : 'opacity-70')} strokeWidth={1.9} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small stepper for numeric settings (type scale, spacing, columns). */
export function Stepper({ value, onChange, min = 0, max = 10, step = 1, format = (v) => v, className }) {
  const clamp = (n) => Math.min(max, Math.max(min, n));
  return (
    <div className={cx('inline-flex items-center gap-1 rounded-pill border border-line bg-white/[0.03] px-1 py-0.5 font-mono text-[12px]', className)}>
      <button type="button" className="px-1.5 text-ink-300 transition hover:text-white" onClick={() => onChange(clamp(Number(value) - step))} aria-label="Decrease">
        −
      </button>
      <span className="min-w-[3.5ch] text-center tabular-nums">{format(value)}</span>
      <button type="button" className="px-1.5 text-ink-300 transition hover:text-white" onClick={() => onChange(clamp(Number(value) + step))} aria-label="Increase">
        +
      </button>
    </div>
  );
}

/** Range slider with a numeric read-out, used for spacing and scale. */
export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format = (v) => Number(v).toFixed(2) }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] text-ink-100">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-white/15 accent-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
        <span className="w-10 text-right font-mono text-[11px] tabular-nums text-ink-300">{format(value)}</span>
      </span>
    </label>
  );
}
