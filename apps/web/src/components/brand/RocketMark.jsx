import { motion, useReducedMotion } from 'framer-motion';
import { cx } from '../../lib/format';

/**
 * The Launchpad mark: a quiet rocket that floats on a 2.6s ease-in-out loop and,
 * on hover, tilts, thrusts upward once and settles. Deliberately small — the
 * animation should read as craft, not as a cartoon.
 */
export function RocketMark({ size = 34, float = true, className, glow = true, spinFlames = true }) {
  const reduce = useReducedMotion();
  const hovering = { rotate: -7, y: -6, scale: 1.045 };
  const settle = { rotate: 0, y: 0, scale: 1 };

  return (
    <motion.span
      className={cx('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      whileHover={reduce ? undefined : { ...hovering, transition: { type: 'spring', stiffness: 520, damping: 18 } }}
      onHoverEnd={undefined}
    >
      <motion.svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        className="relative z-10"
        animate={float && !reduce ? { y: [0, -6, 0] } : { y: 0, ...settle }}
        transition={
          float && !reduce
            ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
            : { type: 'spring', stiffness: 460, damping: 20 }
        }
        whileHover={reduce ? undefined : hovering}
      >
        <path
          d="M16 4.4c4.1 3 6 6.9 6 11.3 0 2.4-.7 4.4-2 6.1h-8c-1.3-1.7-2-3.7-2-6.1C10 11.3 11.9 7.4 16 4.4Z"
          fill="currentColor"
        />
        <circle cx="16" cy="13.6" r="2.5" fill="#07070a" />
        <path d="M10.6 20.2 8 23.4l3.4-.6M21.4 20.2 24 23.4l-3.4-.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
        {spinFlames ? (
          <motion.path
            d="M14.4 23.2h3.2l-1.6 4.4-1.6-4.4Z"
            fill="currentColor"
            animate={reduce ? undefined : { opacity: [0.45, 1, 0.6, 0.95, 0.45], scaleY: [0.85, 1.15, 0.95, 1.1, 0.85] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '16px 23px' }}
          />
        ) : (
          <path d="M14.4 23.2h3.2l-1.6 4.4-1.6-4.4Z" fill="currentColor" opacity="0.8" />
        )}
      </motion.svg>
      {glow && !reduce ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.28), transparent 68%)' }}
          animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.95, 1.12, 0.95] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}
    </motion.span>
  );
}

/** Wordmark lockup used in the nav, the builder bar and the auth pages. */
export function Logo({ size = 'md', href = '/', showWord = true, className }) {
  const dims = { sm: { mark: 22, text: 'text-[15px]' }, md: { mark: 28, text: 'text-[17px]' }, lg: { mark: 38, text: 'text-2xl' } }[size];
  return (
    <a href={href} className={cx('group inline-flex items-center gap-2.5 text-white', className)}>
      <RocketMark size={dims.mark} />
      {showWord ? (
        <span className={cx('font-display font-medium tracking-[-0.02em]', dims.text)}>
          Launchpad
          <span className="ml-0.5 inline-block h-1 w-1 translate-y-[-2px] rounded-full bg-white/70 transition group-hover:bg-white" />
        </span>
      ) : null}
    </a>
  );
}
