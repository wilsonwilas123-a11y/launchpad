import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cx } from '../../lib/format';

/**
 * The only button in the product. Variants differ by weight of commitment, not
 * by colour — the chrome is monochrome, so emphasis comes from fill and size.
 */
const VARIANTS = {
  primary: 'bg-white text-ink-900 hover:bg-ink-50 shadow-[0_10px_30px_-16px_rgba(255,255,255,0.5)]',
  secondary: 'border border-line-strong bg-white/[0.04] text-ink-50 hover:bg-white/[0.09] hover:border-white/25',
  ghost: 'text-ink-200 hover:text-white hover:bg-white/[0.06]',
  outline: 'border border-line text-ink-50 hover:border-white/30',
  danger: 'border border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20 hover:border-red-400/50',
};

const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-pill',
  md: 'h-10 px-4 text-sm gap-2 rounded-pill',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-pill',
  icon: 'h-9 w-9 justify-center rounded-full',
};

const spring = { type: 'spring', stiffness: 500, damping: 32, mass: 0.7 };

export function Button({ variant = 'primary', size = 'md', to, href, type = 'button', loading, disabled, className, children, ...rest }) {
  const classes = cx(
    'relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-200',
    'disabled:pointer-events-none disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  const content = (
    <>
      {loading ? <Spinner /> : null}
      {children}
    </>
  );
  const motionProps = { whileTap: disabled || loading ? undefined : { scale: 0.975 }, transition: spring };

  if (to) {
    return (
      <motion.div {...motionProps} className="inline-flex">
        <Link to={to} className={classes} aria-disabled={disabled} {...rest}>
          {content}
        </Link>
      </motion.div>
    );
  }
  if (href) {
    return (
      <motion.div {...motionProps} className="inline-flex">
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={classes} {...rest}>
          {content}
        </a>
      </motion.div>
    );
  }
  return (
    <motion.button type={type} disabled={disabled || loading} className={classes} {...motionProps} {...rest}>
      {content}
    </motion.button>
  );
}

function Spinner() {
  return (
    <span className="mr-0.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent opacity-80" aria-hidden />
  );
}

/** Square icon-only control for toolbars. */
export function IconButton({ label, className, children, ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-200 transition',
        'hover:border-white/25 hover:bg-white/[0.07] hover:text-white disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
