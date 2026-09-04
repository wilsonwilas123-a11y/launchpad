import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { STEPS } from '../../lib/wizard';
import { cx } from '../../lib/format';

/** Vertical step rail with a progress line that fills as you move. */
export default function StepRail({ current, onJump, furthest }) {
  return (
    <nav aria-label="Progress" className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-0">
      {STEPS.map((step, index) => {
        const state = index === current ? 'current' : index < current ? 'done' : 'next';
        const jumpable = index <= furthest;
        return (
          <div key={step.key} className="relative flex flex-1 items-center gap-3 lg:flex-none">
            {index > 0 ? <span aria-hidden className={cx('absolute left-[13px] top-0 hidden h-full w-px lg:block', index <= current ? 'bg-white/25' : 'bg-line')} style={{ transform: 'translateY(-50%)' }} /> : null}
            <button
              type="button"
              disabled={!jumpable}
              onClick={() => jumpable && onJump(index)}
              className={cx(
                'group relative flex items-center gap-2.5 rounded-pill px-1 py-1 text-left transition',
                jumpable ? 'cursor-pointer' : 'cursor-not-allowed',
              )}
            >
              <span
                className={cx(
                  'relative grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border text-[11px] font-medium transition',
                  state === 'done' && 'border-white/45 bg-white/10 text-white',
                  state === 'current' && 'border-white bg-white text-ink-900',
                  state === 'next' && 'border-line bg-transparent text-ink-400',
                )}
              >
                {state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                {state === 'current' ? (
                  <motion.span layoutId="rail-halo" className="absolute -inset-1 rounded-full border border-white/25" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                ) : null}
              </span>
              <span className={cx('hidden text-[13px] transition lg:block', state === 'current' ? 'text-white' : state === 'done' ? 'text-ink-200' : 'text-ink-500')}>
                {step.label}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
