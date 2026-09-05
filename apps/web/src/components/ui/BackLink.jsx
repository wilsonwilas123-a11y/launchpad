import { ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import { cx } from '../../lib/format';

/**
 * The way out of every screen that is not the front door.
 *
 * A bare arrow is not enough for someone who is not fluent with browsers: they
 * need the destination written out ("Back to Dashboard"), a hit area at least 44px
 * tall, and it has to be in the same place every time — top left. `data-back` is
 * there so the smoke suite can assert the destination instead of trusting copy.
 */
export function BackLink({ to, onClick, label = 'Back', srLabel, hideLabelClass, size = 'md', variant = 'ghost', className, ...rest }) {
  // title/aria-label need words: a responsive label is two <span>s, not a string.
  const text = typeof srLabel === 'string' ? srLabel : typeof label === 'string' ? label : 'Back';
  return (
    <Button
      to={to}
      onClick={onClick}
      size={size}
      variant={variant}
      className={cx('shrink-0 -ml-2 max-sm:!px-3', className)}
      title={text}
      aria-label={text}
      data-back-label={text}
      data-back={to || 'action'}
      {...rest}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.1} />
      {label ? <span className={hideLabelClass}>{label}</span> : null}
    </Button>
  );
}

/**
 * Keeps a BackLink on screen while the page scrolls, on phones only — desktop
 * headers are already sticky where it matters.
 */
export function BackBar({ children, className }) {
  return (
    <div
      className={cx(
        '-mx-5 mb-3 flex items-center gap-2 border-b border-line/70 bg-ink-900/85 px-3 py-2 backdrop-blur-xl',
        'sm:-mx-7 sm:mb-4 sm:px-5',
        'max-lg:sticky max-lg:top-0 max-lg:z-40 max-lg:-mt-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
