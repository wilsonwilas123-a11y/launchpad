import { motion } from 'framer-motion';
import { Laptop, MonitorSmartphone, Smartphone } from 'lucide-react';
import { Button } from '../ui/Button';
import { cx } from '../../lib/format';
import { PLATFORM_OPTIONS, platformsFor } from '../../lib/wizard';

/**
 * Step 2 — platform target. The wording lives with the wizard's other options so
 * the summary on the dashboard card and this step can never drift apart.
 */
const ICONS = { mobile: Smartphone, desktop: Laptop, both: MonitorSmartphone };

export default function StepPlatform({ draft, set, onNext, onBack }) {
  const current = draft.selectedPlatforms.length === 2 ? 'both' : draft.selectedPlatforms[0] || 'both';

  return (
    <div className="flex flex-col gap-8">
      <p className="text-[15px] leading-relaxed text-ink-300">
        This is a layout decision, not a preview toggle. Launchpad composes different sections, grids and navigation for the screens you choose.
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        {PLATFORM_OPTIONS.map((choice, index) => {
          const active = current === choice.value;
          const Icon = ICONS[choice.value] || MonitorSmartphone;
          return (
            <motion.button
              key={choice.value}
              type="button"
              onClick={() => set({ selectedPlatforms: platformsFor(choice.value) })}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.4 }}
              whileHover={{ y: -3 }}
              className={cx(
                'group relative flex h-full flex-col gap-3 overflow-hidden rounded-card border p-5 text-left transition-colors',
                active ? 'border-white/70 bg-white/[0.08] shadow-glow' : 'border-line bg-ink-850/60 hover:border-white/25 hover:bg-white/[0.05]',
              )}
              aria-pressed={active}
            >
              <span className="flex items-center gap-3">
                <span className={cx('grid h-9 w-9 place-items-center rounded-full border transition', active ? 'border-white/40 bg-white text-ink-900' : 'border-line text-ink-100')}>
                  <Icon className="h-4 w-4" strokeWidth={1.9} />
                </span>
                <span className="font-display text-[19px] tracking-[-0.02em] text-white">{choice.label}</span>
              </span>
              <span className="text-[13.5px] leading-relaxed text-ink-300">{choice.body}</span>
              <ul className="mt-auto flex flex-col gap-1.5 pt-2">
                {choice.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-[12.5px] text-ink-300">
                    <span aria-hidden className={cx('mt-[6px] h-1 w-1 shrink-0 rounded-full', active ? 'bg-white' : 'bg-ink-400')} />
                    {point}
                  </li>
                ))}
              </ul>
            </motion.button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button size="lg" onClick={onNext}>
          Choose a design direction
        </Button>
      </div>
    </div>
  );
}
