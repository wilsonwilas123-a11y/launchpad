import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Menu as MenuIcon, X } from 'lucide-react';
import { SiteCtx } from './SiteContext';
import { SECTIONS } from './sections';
import { ActionButton } from './primitives';
import { api } from '../../lib/api';
import { cx, themeVars } from '../../lib/format';

/**
 * The website renderer. Given a spec it paints the whole site — used identically
 * by the builder preview, the /preview route and the published page, so what the
 * owner sees is literally what visitors get.
 *
 * device      'desktop' | 'mobile'  (changes composition, not just width)
 * live        true on the published URL → forms submit for real
 * selected/onSelect  builder affordances; absent everywhere else
 */
export function SiteRenderer({ spec, device = 'desktop', live = false, slug = null, editable = false, selected = null, onSelect, className, compact = false }) {
  const assetsById = useMemo(() => {
    const map = {};
    (spec?.assets || []).forEach((asset) => {
      map[asset.id] = { ...asset, alt: asset.alt || asset.caption || asset.filename, url: asset.url };
    });
    return map;
  }, [spec?.assets]);

  const [menuOpen, setMenuOpen] = useState(false);
  const theme = spec?.theme || {};
  const platform = spec?.platform || {};
  const vars = useMemo(() => ({ ...themeVars(theme, platform), ...(compact ? { '--s-pad': '46px' } : {}) }), [theme, platform, compact]);

  const FormSlot = useCallback(
    (props) => <SiteForm {...props} live={live} slug={slug} />,
    [live, slug],
  );

  const context = useMemo(
    () => ({ assets: assetsById, live, slug, editable, selected, select: onSelect || (() => {}), FormSlot }),
    [assetsById, live, slug, editable, selected, onSelect, FormSlot],
  );

  if (!spec) return null;
  const sections = (spec.sections || []).filter((section) => !section.hidden);
  const mobile = device === 'mobile';

  return (
    <SiteCtx.Provider value={context}>
      <div
        className={cx('lp-site relative min-h-full overflow-hidden', className)}
        data-device={mobile ? 'mobile' : 'desktop'}
        data-effect={(theme.effects || []).join(' ')}
        data-mode={theme.mode}
        style={vars}
      >
        {theme.effects?.includes('glow') ? <span className="s-hero-glow" aria-hidden /> : null}
        <SiteNav spec={spec} mobile={mobile} open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />
        <main>
          {sections.map((section, index) => {
            const Renderer = SECTIONS[section.type];
            if (!Renderer) return null;
            return (
              <SectionFrame key={section.id || `${section.type}-${index}`} section={section} index={index} editable={editable} selected={selected} onSelect={onSelect}>
                <Renderer section={section} content={section.content || {}} index={index} spec={spec} />
              </SectionFrame>
            );
          })}
        </main>
      </div>
    </SiteCtx.Provider>
  );
}

function SectionFrame({ section, index, editable, selected, onSelect, children }) {
  const isSelected = selected === section.id;
  if (!editable) return children;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(section.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(section.id);
        }
      }}
      className={cx('relative cursor-pointer transition-shadow', isSelected && 'is-selected')}
      style={isSelected ? { boxShadow: 'inset 0 0 0 2px var(--s-accent)' } : undefined}
      title={isSelected ? 'Selected in the panel on the right' : 'Click to edit this section'}
    >
      {children}
      <span
        className={cx(
          'pointer-events-none absolute left-3 top-3 z-10 rounded-pill px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] opacity-0 transition',
          isSelected ? 'opacity-100' : 'group-hover:opacity-70',
        )}
        style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)' }}
      >
        {section.label || section.type}
      </span>
    </div>
  );
}

function SiteNav({ spec, mobile, open, onToggle }) {
  const nav = spec.nav || { links: [] };
  const style = nav.style || 'blur';
  const solid = style === 'solid';
  if (!nav.links?.length && !nav.cta) return null;
  return (
    <header
      className="sticky top-0 z-30"
      style={{
        background: solid ? 'var(--s-bg)' : 'color-mix(in srgb, var(--s-bg) 72%, transparent)',
        backdropFilter: style === 'blur' ? 'saturate(140%) blur(12px)' : undefined,
        borderBottom: '1px solid var(--s-line)',
      }}
    >
      <div className="mx-auto flex items-center gap-4 px-5 py-3.5 sm:px-8" style={{ maxWidth: 'var(--s-max)' }}>
        <a href="#hero" className="mr-auto flex items-baseline gap-2 truncate text-[17px]" style={{ fontFamily: 'var(--s-heading)', fontWeight: 600 }}>
          {spec.name}
        </a>
        <nav className={cx('hidden items-center gap-7 lg:flex', mobile && 'hidden')}>
          {nav.links.slice(0, 6).map((link, index) => (
            <a
              key={index}
              href={link.action || '#'}
              className="text-[13.5px] opacity-75 transition hover:opacity-100"
              style={{ fontFamily: 'var(--s-label)' }}
            >
              {link.label}
            </a>
          ))}
        </nav>
        {nav.cta?.label ? (
          <div className="hidden sm:block">
            <ActionButton action={nav.cta.action}>
              <span style={{ padding: '8px 16px', fontSize: 13.5, display: 'inline-flex', borderRadius: 'calc(var(--s-radius)*0.6)' }}>{nav.cta.label}</span>
            </ActionButton>
          </div>
        ) : null}
        <button type="button" onClick={onToggle} aria-label="Menu" className="lg:hidden">
          {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <motion.nav
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="lg:hidden"
          style={{ borderTop: '1px solid var(--s-line)' }}
        >
          <ul className="mx-auto flex flex-col px-5 py-2" style={{ maxWidth: 'var(--s-max)' }}>
            {nav.links.map((link, index) => (
              <li key={index}>
                <a href={link.action || '#'} className="block py-2.5 text-[15px]" style={{ borderBottom: '1px solid var(--s-line)' }}>
                  {link.label}
                </a>
              </li>
            ))}
            {nav.cta?.label ? (
              <li className="py-3">
                <ActionButton action={nav.cta.action}>
                  <span style={{ padding: '10px 18px', display: 'inline-flex', borderRadius: 'calc(var(--s-radius)*0.6)' }}>{nav.cta.label}</span>
                </ActionButton>
              </li>
            ) : null}
          </ul>
        </motion.nav>
      ) : null}
    </header>
  );
}

/**
 * The form used by waitlist / newsletter / contact / pre-save. On the published
 * site it posts to the API and shows the server's own confirmation; inside the
 * builder it renders the same fields but stays inert on purpose.
 */
function SiteForm({ kind = 'waitlist', fields, placeholder, label, successCopy, privacy, live, slug }) {
  const [values, setValues] = useState({});
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!live || !slug) {
      setMessage('Forms start collecting once the site is published.');
      setState('preview');
      return;
    }
    setState('sending');
    try {
      const result = await api.submitForm(slug, { kind, ...values });
      setState('done');
      setMessage(result.message || successCopy || 'Done.');
    } catch (error) {
      setState('error');
      setMessage(error.message);
    }
  };

  const extraFields = (fields || []).filter((field) => field.type !== 'email');
  const emailFirst = (fields || []).some((f) => f.type === 'email') || kind !== 'contact';

  if (state === 'done') {
    return (
      <div className="mx-auto max-w-[520px] text-left sm:text-center">
        <p className="text-[17px]" style={{ fontFamily: 'var(--s-heading)' }}>
          {successCopy || 'You are in.'}
        </p>
        <p className="s-muted mt-1.5 text-[14px]">{message}</p>
      </div>
    );
  }

  const inputStyle = { background: 'var(--s-surface)', border: '1px solid var(--s-line)', borderRadius: 'calc(var(--s-radius)*0.6)', color: 'var(--s-text)' };

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-[520px] flex-col gap-2.5 text-left">
      {emailFirst ? (
        <input
          type="email"
          required
          placeholder={placeholder || 'you@email.com'}
          value={values.email || ''}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
          className="w-full px-4 py-3 text-[15px] outline-none"
          style={inputStyle}
          aria-label="Email address"
        />
      ) : null}
      {extraFields.map((field, index) =>
        field.type === 'textarea' ? (
          <textarea
            key={index}
            rows={4}
            placeholder={field.label}
            required={kind === 'contact'}
            value={values[field.key] || ''}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            className="w-full resize-y px-4 py-3 text-[15px] outline-none"
            style={inputStyle}
          />
        ) : (
          <input
            key={index}
            type={field.type || 'text'}
            placeholder={field.label}
            value={values[field.key] || ''}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            className="w-full px-4 py-3 text-[15px] outline-none"
            style={inputStyle}
          />
        ),
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={state === 'sending'}
          className="px-5 py-3 text-[15px] font-medium transition disabled:opacity-60"
          style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)', borderRadius: 'calc(var(--s-radius)*0.6)' }}
        >
          {state === 'sending' ? 'Sending…' : label || 'Join the list'}
        </button>
        {privacy ? <span className="s-muted text-[12px]">{privacy}</span> : null}
      </div>
      {message ? (
        <p className="text-[13px]" style={{ color: state === 'error' ? 'inherit' : undefined, opacity: 0.85 }}>
          {message}
        </p>
      ) : null}
    </form>
  );
}

export default SiteRenderer;
