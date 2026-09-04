import { motion, useReducedMotion } from 'framer-motion';
import { cx } from '../../lib/format';

/**
 * Ambient page motion: one slowly drifting light field, two glow orbs and a
 * faint grid. Subtle enough to sit behind dense UI, alive enough that the page
 * is never a flat rectangle.
 */
export function AmbientBackdrop({ variant = 'landing', className, intensity = 1 }) {
  const reduce = useReducedMotion();
  const scale = (value) => (reduce ? 0 : value * intensity);

  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* base wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            variant === 'quiet'
              ? 'radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.06), transparent 60%)'
              : 'radial-gradient(90% 55% at 50% -8%, rgba(255,255,255,0.10), transparent 62%), radial-gradient(70% 50% at 8% 12%, rgba(255,255,255,0.045), transparent 60%)',
        }}
      />
      {/* drifting light */}
      <motion.div
        className="absolute left-1/2 top-[-18%] h-[52vh] w-[82vw] -translate-x-1/2 rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 65%)', opacity: scale(1) }}
        animate={reduce ? undefined : { x: [scale(-40), scale(50), scale(-40)], y: [0, scale(28), 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* orbs */}
      <motion.div
        className="absolute left-[6%] top-[42%] h-40 w-40 rounded-full blur-3xl"
        style={{ background: 'rgba(255,255,255,0.055)' }}
        animate={reduce ? undefined : { y: [scale(-14), scale(18), scale(-14)] }}
        transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[8%] top-[22%] h-24 w-24 rounded-full blur-2xl"
        style={{ background: 'rgba(255,255,255,0.07)' }}
        animate={reduce ? undefined : { y: [scale(10), scale(-16), scale(10)] }}
        transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      {/* hairline grid, faded at the edges */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '88px 88px',
          maskImage: 'radial-gradient(70% 60% at 50% 0%, #000 30%, transparent 75%)',
        }}
      />
      {/* grain keeps the dark ground from banding */}
      <div className="bg-grain absolute inset-0 opacity-[0.035] mix-blend-soft-light" />
    </div>
  );
}

/** Fine particles for the hero only — small, slow, mostly out of focus. */
export function DriftParticles({ count = 14, className }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const seeds = Array.from({ length: count }, (_, i) => {
    const n = (i * 9301 + 49297) % 233280;
    const rnd = n / 233280;
    return { left: `${(rnd * 100).toFixed(2)}%`, top: `${((i / count) * 100).toFixed(2)}%`, size: 1 + (i % 3), duration: 10 + (i % 7) * 2.5, delay: (i % 5) * 1.4 };
  });
  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {seeds.map((seed, index) => (
        <motion.span
          key={index}
          className="absolute rounded-full bg-white"
          style={{ left: seed.left, top: seed.top, width: seed.size, height: seed.size }}
          animate={{ y: [0, -26, 0], opacity: [0.06, 0.4, 0.06] }}
          transition={{ duration: seed.duration, repeat: Infinity, ease: 'easeInOut', delay: seed.delay }}
        />
      ))}
    </div>
  );
}
