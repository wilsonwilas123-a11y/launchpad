/** Small formatting helpers shared by the dashboard, builder and site renderer. */

export function bytes(value) {
  const n = Number(value) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(input) {
  if (!input) return '';
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(input).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function clockTime(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The pieces a countdown tile needs, clamped so a passed date reads as zero. */
export function countdownParts(targetIso, now = Date.now()) {
  const target = new Date(targetIso).getTime();
  const total = Number.isNaN(target) ? 0 : Math.max(0, target - now);
  const seconds = Math.floor(total / 1000);
  return {
    past: Number.isFinite(target) && target <= now,
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
    label: Number.isNaN(target) ? '' : new Date(target).toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit' }),
  };
}

export const pad2 = (n) => String(n).padStart(2, '0');

export function titleCase(text = '') {
  return String(text)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function initials(name = '') {
  const parts = String(name)
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '●';
  return parts.map((part) => part[0].toUpperCase()).join('');
}

export function truncate(text = '', max = 90) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Copy that survives being clicked twice — clipboard API, then execCommand. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Native share sheet where the platform has one (mobile), clipboard otherwise. */
export async function shareLink({ url, title = 'Launchpad', text }) {
  const payload = { title, text: text || undefined, url };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return { method: 'share' };
    } catch (error) {
      if (error && error.name === 'AbortError') return { method: 'cancelled' };
    }
  }
  return { method: (await copyText(url)) ? 'clipboard' : 'none' };
}

export function classList(...values) {
  return values.filter(Boolean).join(' ');
}

/** Tailwind-friendly class joiner. */
export const cx = (...values) => values.filter(Boolean).join(' ');

/** Turns the compiler's theme object into the CSS custom properties .lp-site reads. */
/** Videos and images are handled by different controls everywhere in the app. */
export function isVideo(name = '') {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(name)) || /^video\//i.test(String(name));
}

export function themeVars(theme = {}, platform = {}) {
  const colors = theme.colors || {};
  const typo = theme.typography || {};
  const stack = (key, fallback) => (key ? `var(--ff-${key})` : fallback);
  const scale = Number(typo.scale) || 1.14;
  return {
    '--s-bg': colors.background || '#0a0a0c',
    '--s-surface': colors.surface || '#131318',
    '--s-surface-alt': colors.surfaceAlt || '#1b1b21',
    '--s-text': colors.text || '#f6f6f7',
    '--s-muted': colors.textMuted || '#9a9aa4',
    '--s-accent': colors.accent || '#ffffff',
    '--s-accent-ink': colors.accentText || '#0a0a0c',
    '--s-line': colors.border || 'rgba(255,255,255,0.1)',
    '--s-overlay': colors.overlay || 'rgba(3,3,5,0.72)',
    '--s-radius': `${Number(theme.radius ?? 12)}px`,
    '--s-scale': String(scale),
    '--s-body': `${Number(typo.bodySize) || 16}px`,
    '--s-heading': stack(typo.headingFont, 'var(--ff-display)'),
    '--s-body-font': stack(typo.bodyFont, 'var(--ff-sans)'),
    '--s-label': stack(typo.labelFont, 'var(--ff-sans)'),
    '--s-heading-weight': String(typo.headingWeight || 600),
    '--s-heading-tracking': typo.headingTracking || '-0.03em',
    '--s-pad': `${Number(platform.sectionPadding) || 104}px`,
    '--s-max': `${Number(platform.maxWidth) || 1240}px`,
    '--s-title': `${Math.round(16 * scale ** 5)}px`,
  };
}
