import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { STEPS } from '../../lib/wizard';
import { cx } from '../../lib/format';

/**
 * Horizontal step rail with a progress line that fills as you move.
 *
 * Deliberately horizontal at every breakpoint: it lives inside a fixed-height
 * header on desktop, and a vertical list there has nowhere to grow — it just
 * spills out of the header and over whatever sits beneath it. A horizontal
 * line has no such ceiling, only a floor on width, which is the one dimension
 * both the header and the mobile block actually have to spare.
 */
export default function StepRail({ current, onJump, furthest }) {
  return (
    <nav aria-label="Progress" className="flex items-center">
      {STEPS.map((step, index) => {
        const state = index === current ? 'current' : index < current ? 'done' : 'next';
        const jumpable = index <= furthest;
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center">
            <button
              type="button"
              disabled={!jumpable}
              onClick={() => jumpable && onJump(index)}
              className={cx(
                'group relative flex items-center gap-2 rounded-pill px-1 py-1 transition',
                jumpable ? 'cursor-pointer' : 'cursor-not-allowed',
              )}
            >
              <span
                className={cx(
                  'relative grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border text-[13px] font-medium transition',
                  state === 'done' && 'border-white/45 bg-white/10 text-white',
                  state === 'current' && 'border-white bg-white text-ink-900',
                  state === 'next' && 'border-line bg-transparent text-ink-400',
                )}
              >
                {state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                {state === 'current' ? (
                  <motion.span
                    layoutId="rail-halo"
                    className="absolute -inset-1 rounded-full border border-white/25"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                ) : null}
              </span>
              <span
                className={cx(
                  'hidden whitespace-nowrap text-[13.5px] transition lg:block',
                  state === 'current' ? 'text-white' : state === 'done' ? 'text-ink-200' : 'text-ink-500',
                )}
              >
                {step.label}
              </span>
            </button>

            {!isLast ? (
              <span
                aria-hidden
                className={cx('mx-2 h-px w-6 shrink-0 rounded-full sm:w-8', index < current ? 'bg-white/40' : 'bg-line')}
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}