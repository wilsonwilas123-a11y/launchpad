import { motion } from 'framer-motion';
import { cx } from '../../lib/format';

/**
 * The status vocabulary, used identically on the dashboard cards, in the builder
 * top bar and next to the project name. Each state reads at a glance:
 *   Draft      muted, inert
 *   Generating pulsing dot, animated
 *   Ready      outlined "Ready to publish"
 *   Publishing pulsing
 *   Live       solid white pill with a dot, and the address underneath
 */
const TONES = {
  draft: { label: 'Draft', className: 'border-line bg-white/[0.04] text-ink-300', dot: 'bg-ink-400' },
  generating: { label: 'Generating…', className: 'border-white/25 bg-white/[0.08] text-white', dot: 'bg-white animate-pulse-soft', animate: true },
  ready: { label: 'Ready to publish', className: 'border-dashed border-white/30 bg-transparent text-ink-100', dot: null },
  publishing: { label: 'Publishing…', className: 'border-white/25 bg-white/[0.08] text-white', dot: 'bg-white animate-pulse-soft', animate: true },
  live: { label: 'Live', className: 'border-white bg-white text-ink-900', dot: 'bg-ink-900' },
};

export function StatusPill({ status = 'draft', slug, host, size = 'md', className, onClick, title }) {
  const tone = TONES[status] || TONES.draft;
  const small = size === 'sm';
  const interactive = Boolean(onClick);
  const pillClass = cx(
    'inline-flex items-center gap-1.5 rounded-pill border font-medium tracking-tight transition',
    small ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13.5px]',
    tone.className,
    interactive && 'cursor-pointer hover:brightness-110',
  );
  const pulse = tone.animate ? { animate: { opacity: [1, 0.72, 1] }, transition: { duration: 1.9, repeat: Infinity, ease: 'easeInOut' } } : {};
  const inner = (
    <>
      {tone.dot ? <span className={cx('h-1.5 w-1.5 rounded-full', tone.dot)} /> : null}
      {tone.label}
    </>
  );
  return (
    <span className={cx('inline-flex flex-col items-start gap-1', className)}>
      {interactive ? (
        <motion.button type="button" onClick={onClick} title={title} className={pillClass} whileTap={{ scale: 0.97 }} {...pulse}>
          {inner}
        </motion.button>
      ) : tone.animate ? (
        <motion.span className={pillClass} {...pulse}>
          {inner}
        </motion.span>
      ) : (
        <span className={pillClass} title={title}>
          {inner}
        </span>
      )}
      {status === 'live' && slug ? (
        <span className={cx('font-mono text-[12px] leading-none text-ink-300', interactive && 'transition hover:text-white')}>{host || 'launchpad.app'}/{slug}</span>
      ) : null}
    </span>
  );
}

/** The in-builder variant: "Saved" / "Generating your changes…" / "Published • Live at …" */
export function SaveState({ state = 'saved', url, onCopy, className }) {
  const map = {
    saved: { text: 'Saved', dot: 'bg-ink-400', spin: false },
    saving: { text: 'Saving…', dot: 'bg-white/70', spin: false },
    dirty: { text: 'Unsaved changes', dot: 'bg-amber-300/80', spin: false },
    generating: { text: 'Generating your changes…', dot: 'bg-white', spin: true },
    publishing: { text: 'Publishing…', dot: 'bg-white', spin: true },
    published: { text: url ? `Published • Live at ${url}` : 'Published', dot: 'bg-emerald-300', spin: false },
  };
  const item = map[state] || map.saved;
  const clickable = state === 'published' && url && onCopy;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onCopy}
      title={clickable ? 'Tap to copy the link' : undefined}
      className={cx(
        'inline-flex items-center gap-2 rounded-pill border border-line px-3 py-1.5 text-[13px] text-ink-200 transition',
        clickable && 'cursor-pointer hover:border-white/25 hover:bg-white/[0.06] hover:text-white',
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', item.dot, item.spin && 'animate-pulse-soft')} />
      {item.text}
      {clickable ? <span className="text-[11.5px] uppercase tracking-[0.14em] text-ink-400">copy</span> : null}
    </button>
  );
}
