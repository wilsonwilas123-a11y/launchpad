import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, Loader2 } from 'lucide-react';
import { AmbientBackdrop } from '../motion/AmbientBackdrop';
import { RocketMark } from '../brand/RocketMark';
import { Progress } from '../ui/Primitives';
import { Button } from '../ui/Button';
import { cx } from '../../lib/format';

/**
 * The cinematic build screen. Timings come from the API's own pacing envelope —
 * which is measured from the last real generation — so the checklist finishes
 * when the work finishes rather than pretending a fixed two seconds. When the
 * response lands early, the remaining steps are walked quickly instead of
 * freezing on the last item.
 */
export default function GenerationOverlay({ steps = [], elapsedHintMs, finished, result, onEnter }) {
  const [index, setIndex] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const startedAt = useRef(Date.now());
  const ready = finished && index >= steps.length - 1;

  const schedule = useMemo(() => (steps.length ? steps : DEFAULT_STEPS), [steps]);

  useEffect(() => {
    if (finished) {
      const timer = setTimeout(() => setIndex((value) => Math.min(schedule.length - 1, value + 1)), 140);
      return () => clearTimeout(timer);
    }
    const step = schedule[Math.min(index, schedule.length - 1)];
    const remaining = Math.max(320, (step?.ms || 520) - 0);
    const timer = setTimeout(() => setIndex((value) => Math.min(schedule.length - 1, value + 1)), remaining);
    return () => clearTimeout(timer);
  }, [index, finished, schedule]);

  const progress = (index + (ready ? 1 : 0.35)) / schedule.length;

  return (
    <motion.div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-ink-900 px-5 py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45 }}>
      <AmbientBackdrop />
      <div className="relative w-full max-w-[620px]">
        <div className="mb-8 flex items-center gap-4">
          <RocketMark size={38} />
          <div>
            <AnimatePresence mode="wait">
              {!ready ? (
                <motion.h1 key="building" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="font-display text-[clamp(1.7rem,4.6vw,2.5rem)] font-medium leading-tight tracking-[-0.035em]">
                  Building your launch…
                </motion.h1>
              ) : (
                <motion.h1 key="ready" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="font-display text-[clamp(1.7rem,4.6vw,2.5rem)] font-medium leading-tight tracking-[-0.035em]">
                  Your website is ready 🚀
                </motion.h1>
              )}
            </AnimatePresence>
            <p className="mt-1 text-[13.5px] text-ink-300">
              {ready ? `${result?.sections?.length || schedule.length} sections, ${result?.assets?.length || 0} assets, one live address.` : elapsedHintMs ? `Local model · ${Math.round(elapsedHintMs / 100) / 10}s typical` : 'This is the real thing being assembled, not a spinner.'}
            </p>
          </div>
        </div>

        <Progress value={Math.min(1, progress)} />

        <ol className="mt-7 flex flex-col">
          {schedule.map((step, position) => {
            const state = position < index ? 'done' : position === index ? (finished && position === schedule.length - 1 ? 'done' : 'active') : 'pending';
            return (
              <li key={step.key || position} className={cx('flex items-start gap-3.5 border-b border-line py-3.5 transition-opacity', state === 'pending' && 'opacity-45')}>
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border">
                  {state === 'done' ? (
                    <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 24 }} className="grid h-6 w-6 place-items-center rounded-full bg-white text-ink-900">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </motion.span>
                  ) : state === 'active' ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full border border-white/40 bg-white/[0.08]">
                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[15px]', state === 'active' ? 'text-white' : 'text-ink-100')}>{step.label}</span>
                  <AnimatePresence>
                    {state === 'active' && step.detail ? (
                      <motion.span initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="block overflow-hidden text-[12.5px] leading-relaxed text-ink-400">
                        {step.detail}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
                {state === 'done' ? <span className="mt-1 shrink-0 font-mono text-[11px] text-ink-500">{Math.round((step.ms || 420) / 100) / 10}s</span> : null}
              </li>
            );
          })}
        </ol>

        {result?.generation?.masterPrompt || result?.masterPrompt ? (
          <div className="mt-6 rounded-card border border-line bg-white/[0.02]">
            <button type="button" onClick={() => setShowPrompt((value) => !value)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
              <span className="text-[13px] text-ink-100">See the prompt Launchpad was given</span>
              <ChevronDown className={cx('ml-auto h-4 w-4 text-ink-400 transition-transform', showPrompt && 'rotate-180')} />
            </button>
            {showPrompt ? (
              <pre className="max-h-[240px] overflow-auto border-t border-line px-4 py-3 font-mono text-[11.5px] leading-relaxed text-ink-300 whitespace-pre-wrap">
                {result.generation?.masterPrompt || result.masterPrompt}
              </pre>
            ) : null}
          </div>
        ) : null}

        {ready ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-ink-300">Everything below is editable — colours, sections, copy, images.</p>
            <Button size="lg" onClick={onEnter} className="group">
              Open my site
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </motion.div>
        ) : (
          <p className="mt-6 text-[12px] text-ink-500">
            {Math.round((Date.now() - startedAt.current) / 1000)}s in · generation runs locally, so it takes the time it takes
          </p>
        )}
      </div>
    </motion.div>
  );
}

const DEFAULT_STEPS = [
  { key: 'understand', label: 'Understanding your idea', detail: 'Reading the description for brand, audience, mood and asks', ms: 480 },
  { key: 'plan', label: 'Planning your website', detail: 'Deciding the promise of the page and how to order it', ms: 440 },
  { key: 'layout', label: 'Creating your layout', detail: 'Composing hero, rhythm and density for the target screens', ms: 520 },
  { key: 'sections', label: 'Selecting sections', detail: 'Choosing only the sections your launch needs', ms: 460 },
  { key: 'design', label: 'Applying your design direction and visual style', detail: 'Palette, type scale, effects and spacing', ms: 500 },
  { key: 'assets', label: 'Adding your assets', detail: 'Matching each image to the section it belongs in', ms: 440 },
  { key: 'optimise', label: 'Optimizing for your selected platform', detail: 'Re-composing navigation, grids and type for the targets', ms: 560 },
  { key: 'publish', label: 'Preparing your live website', detail: 'Building the shareable URL', ms: 560 },
];
