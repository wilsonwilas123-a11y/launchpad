import { cx } from '../../lib/format';

/**
 * Shared furniture for generated sites. Everything reads the theme through CSS
 * custom properties set by <SiteRenderer>, so a colour or type change repaints
 * without touching React state.
 */

const PADDING = { none: 0, sm: 0.45, md: 0.72, lg: 1, xl: 1.35 };

export function SectionShell({ section, index, children, wide, tight }) {
  const s = section.settings || {};
  const padFactor = PADDING[s.padding] ?? (tight ? 0.6 : 1);
  const style = {
    paddingBlock: `calc(var(--s-pad) * ${padFactor})`,
    textAlign: s.align === 'center' ? 'center' : undefined,
    background: s.invert ? 'var(--s-accent)' : undefined,
    color: s.invert ? 'var(--s-accent-ink)' : undefined,
    borderTop: s.rule === 'top' || s.top ? '1px solid var(--s-line)' : undefined,
    borderBottom: s.rule === 'bottom' || s.bottom ? '1px solid var(--s-line)' : undefined,
  };
  const full = s.bleed || s.fullBleed;
  return (
    <section
      id={section.type}
      data-section-id={section.id}
      data-type={section.type}
      className={cx('s-section relative', s.hoverReveal && 'group/section')}
      style={style}
    >
      {s.positionCounter ? (
        <span className="s-label absolute left-4 top-4 opacity-50 sm:left-8" style={{ fontFamily: 'var(--s-label)' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
      ) : null}
      <div className={cx('mx-auto px-5 sm:px-8', full ? 'max-w-none' : 'max-w-[var(--s-max)]')} style={full ? undefined : { maxWidth: 'var(--s-max)' }}>
        {s.positionCounter && s.align === 'center' ? <div className="mb-3" /> : null}
        <div className={cx(!full && 'mx-auto', wide ? 'max-w-[1200px]' : '', s.align === 'center' ? 'text-center' : '')}>{children}</div>
      </div>
    </section>
  );
}

export function Eyebrow({ children, className }) {
  if (!children) return null;
  return (
    <p className={cx('s-label mb-3 flex items-center gap-2 opacity-70', className)} style={{ justifyContent: 'inherit', fontFamily: 'var(--s-label)' }}>
      <span className="inline-block h-1 w-1 rounded-full" style={{ background: 'var(--s-accent)' }} />
      {children}
    </p>
  );
}

export function Heading({ as: Tag = 'h2', children, size = 1, className, style }) {
  if (!children) return null;
  return (
    <Tag
      className={cx('mx-auto', className)}
      style={{
        fontSize: `calc(var(--s-body) * ${2.35 * size * 1.9})`,
        lineHeight: 1.04,
        fontWeight: 'var(--s-heading-weight)',
        letterSpacing: 'var(--s-heading-tracking)',
        maxWidth: '22ch',
        marginInline: Tag === 'h1' ? undefined : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function Lead({ children, className, size = 1 }) {
  if (!children) return null;
  return (
    <p
      className={cx('s-muted mx-auto', className)}
      style={{ fontSize: `calc(var(--s-body) * ${1.05 * size})`, maxWidth: '58ch', marginTop: '1rem', lineHeight: 1.62 }}
    >
      {children}
    </p>
  );
}

/** Anchor-or-external CTA. `action` comes from the spec ("#waitlist", "mailto:…"). */
export function ActionButton({ action, children, variant = 'solid', onClick, type = 'button', disabled }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-[calc(var(--s-radius)*0.6)] px-5 py-2.5 text-[15px] font-medium transition duration-200 disabled:opacity-50';
  const styles =
    variant === 'solid'
      ? { background: 'var(--s-accent)', color: 'var(--s-accent-ink)', boxShadow: '0 12px 30px -18px rgba(0,0,0,0.6)' }
      : { border: '1px solid var(--s-line)', color: 'inherit', background: 'transparent' };
  const isExternal = typeof action === 'string' && /^(https?:|mailto:|tel:)/.test(action);
  const isAnchor = typeof action === 'string' && action.startsWith('#');
  const go = (event) => {
    if (isAnchor) {
      event.preventDefault();
      const target = document.getElementById(action.slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    onClick?.(event);
  };
  if (isExternal) {
    return (
      <a className={base} style={styles} href={action} target={action.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={base} style={styles} onClick={go} disabled={disabled}>
      {children}
    </button>
  );
}

export function Media({ src, alt = '', ratio = '4 / 3', className, treatment = 'contrast', radius }) {
  const filters = {
    contrast: 'contrast(1.06) saturate(0.92)',
    natural: 'none',
    mono: 'grayscale(1) contrast(1.08)',
    warm: 'sepia(0.16) saturate(1.05)',
    dreamy: 'blur(0.2px) saturate(1.1) brightness(1.04)',
  };
  return (
    <div
      className={cx('relative overflow-hidden', className)}
      style={{ aspectRatio: ratio, borderRadius: radius ?? 'var(--s-radius)', background: 'var(--s-surface-alt)' }}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: filters[treatment] || 'none' }} />
      ) : (
        <PlaceholderFrame />
      )}
    </div>
  );
}

/** The frame shown while an idea has no photography yet — never an empty hole. */
function PlaceholderFrame() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, color-mix(in srgb, var(--s-accent) 8%, transparent) 0 8px, transparent 8px 20px), radial-gradient(70% 70% at 50% 20%, color-mix(in srgb, var(--s-accent) 14%, transparent), transparent 70%)',
      }}
    >
      <span className="s-label absolute bottom-3 left-3 opacity-45" style={{ fontFamily: 'var(--s-label)' }}>
        image
      </span>
    </div>
  );
}

export function Grid({ columns = 3, children, className, gap = 'clamp(14px, 2.4vw, 26px)', minChild }) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gap,
        gridTemplateColumns: `repeat(auto-fit, minmax(${minChild || `max(220px, calc((100% - ${Number(columns) * 26}px) / ${Number(columns)}))`}, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

export function Card({ children, className, style, hover }) {
  return (
    <div
      className={cx('s-card relative p-5 text-left', hover && 'transition duration-300', className)}
      style={{ transitionProperty: 'transform, box-shadow, border-color', ...(hover ? {} : {}), ...style }}
      data-hover={hover || undefined}
    >
      {children}
    </div>
  );
}

export function Price({ value, unit }) {
  if (!value) return null;
  return (
    <p className="mt-2 flex items-baseline gap-1.5" style={{ fontFamily: 'var(--s-heading)' }}>
      <span className="text-2xl leading-none">{value}</span>
      {unit ? <span className="s-muted text-[13px]">{unit}</span> : null}
    </p>
  );
}

export function Bullets({ items: rawItems = [], check = true }) {
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  if (!items.length) return null;
  return (
    <ul className="mt-4 flex flex-col gap-2 text-left">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2.5 text-[15px]">
          {check ? (
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--s-accent)' }} />
          ) : null}
          <span className="s-muted">{item}</span>
        </li>
      ))}
    </ul>
  );
}
