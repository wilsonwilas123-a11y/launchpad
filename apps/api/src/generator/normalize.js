/**
 * Validation + merging of model output.
 *
 * A local model's JSON is merged *over* a deterministically compiled base spec
 * rather than replacing it: valid fields win, missing or malformed ones keep
 * the compiler's value. That is what makes a 8B model usable for this job.
 */

const { BUILDERS, slugify } = require('./compile');
const { utils } = require('./interpret');

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONTS = ['display', 'serif', 'sans', 'grotesk', 'mono', 'condensed'];
const EFFECTS = ['grain', 'glow', 'grid', 'rules', 'marquee', 'letterbox', 'vignette', 'mono-labels', 'soft-shadow', 'aurora', 'index-numbers', 'micro-captions', 'outline-type', 'scanline', 'oversized-headline'];
const SPACING = ['tight', 'airy', 'roomy'];

const is = {
  str: (v) => typeof v === 'string' && v.trim().length > 0,
  shortStr: (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 400,
  num: (v) => typeof v === 'number' && Number.isFinite(v),
  arr: (v) => Array.isArray(v),
  obj: (v) => v && typeof v === 'object' && !Array.isArray(v),
  color: (v) => HEX.test(String(v || '').trim()),
};

function clean(value, max = 240) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function listOf(value, mapper, max = 8) {
  if (!Array.isArray(value)) return null;
  const out = value.slice(0, max).map(mapper).filter(Boolean);
  return out.length ? out : null;
}

/** Content field cleaners per section type — what a model may legally set. */
const CONTENT_FIELDS = {
  hero: {
    eyebrow: clean, headline: clean, subheadline: (v) => clean(v, 320),
    layout: (v) => (['centered', 'split', 'fullbleed'].includes(v) ? v : null),
    badges: (v) => listOf(v, (b) => clean(b, 48)),
    primary: (v) => (is.obj(v) && clean(v.label) ? { label: clean(v.label, 40), action: clean(v.action, 30) || '#waitlist' } : null),
    secondary: (v) => (is.obj(v) && clean(v.label) ? { label: clean(v.label, 40), action: clean(v.action, 30) || '#about' } : null),
    minHeight: (v) => (/%|vh|px$/.test(String(v || '')) ? clean(v, 8) : null),
  },
  about: { heading: clean, body: (v) => clean(v, 900), bullets: (v) => listOf(v, (b) => clean(b, 120)) },
  features: {
    heading: clean, sub: (v) => clean(v, 240),
    items: (v) => listOf(v, (i) => (is.obj(i) && clean(i.title) ? { title: clean(i.title, 60), body: clean(i.body, 240), icon: clean(i.icon, 24) || 'Sparkles' } : null), 6),
    columns: (v) => (is.num(v) && v >= 1 && v <= 4 ? Math.round(v) : null),
  },
  productShowcase: {
    heading: clean, sub: (v) => clean(v, 240),
    products: (v) =>
      listOf(
        v,
        (p) =>
          is.obj(p) && clean(p.name)
            ? { name: clean(p.name, 60), price: clean(p.price, 30) || 'On request', unit: clean(p.unit, 30) || '', blurb: clean(p.blurb, 200) || '', tag: clean(p.tag, 24) || '', cta: clean(p.cta, 30) || 'Reserve', imageAssetId: clean(p.imageAssetId, 40) || '' }
            : null,
        6,
      ),
    note: (v) => clean(v, 160),
  },
  gallery: { heading: clean, sub: (v) => clean(v, 200) },
  video: { heading: clean, body: (v) => clean(v, 260), caption: (v) => clean(v, 120) },
  pricing: {
    heading: clean, sub: (v) => clean(v, 240), note: (v) => clean(v, 160),
    plans: (v) =>
      listOf(
        v,
        (p) =>
          is.obj(p) && clean(p.name)
            ? { name: clean(p.name, 40), price: clean(p.price, 30) || '—', unit: clean(p.unit, 40) || '', blurb: clean(p.blurb, 140) || '', features: listOf(p.features, (f) => clean(f, 90), 8) || [], featured: Boolean(p.featured), cta: clean(p.cta, 30) || 'Choose' }
            : null,
        4,
      ),
  },
  testimonials: {
    heading: clean,
    items: (v) => listOf(v, (t) => (is.obj(t) && clean(t.quote) ? { quote: clean(t.quote, 300), name: clean(t.name, 40) || 'Verified', role: clean(t.role, 60) || '' } : null), 5),
  },
  countdown: {
    heading: clean, note: (v) => clean(v, 140),
    targetIso: (v) => (v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null),
    display: (v) => (['slabs', 'stack', 'inline'].includes(v) ? v : null),
    labels: (v) => listOf(v, (s) => clean(s, 12), 4),
  },
  waitlist: {
    heading: clean, body: (v) => clean(v, 300), placeholder: (v) => clean(v, 40), ctaLabel: (v) => clean(v, 40),
    incentives: (v) => listOf(v, (s) => clean(s, 80), 4), privacy: (v) => clean(v, 160), successCopy: (v) => clean(v, 200),
  },
  newsletter: { heading: clean, body: (v) => clean(v, 240), ctaLabel: (v) => clean(v, 40), cadence: (v) => clean(v, 60) },
  contact: {
    heading: clean, body: (v) => clean(v, 300), note: (v) => clean(v, 160),
    fields: (v) => listOf(v, (f) => (is.obj(f) && clean(f.label) ? { key: clean(f.key, 20) || clean(f.label, 20).toLowerCase(), label: clean(f.label, 40), type: ['text', 'email', 'textarea', 'tel', 'select'].includes(f.type) ? f.type : 'text' } : null), 6),
    channels: (v) => listOf(v, (c) => (is.obj(c) && clean(c.value) ? { label: clean(c.label, 30) || 'Contact', value: clean(c.value, 60) } : null), 4),
  },
  faq: { heading: clean, items: (v) => listOf(v, (f) => (is.obj(f) && clean(f.question) ? { question: clean(f.question, 160), answer: clean(f.answer, 420) } : null), 8) },
  social: { heading: clean, links: (v) => listOf(v, (l) => (is.obj(l) && clean(l.platform) ? { platform: clean(l.platform, 20), handle: clean(l.handle, 40) || '', url: clean(l.url, 120) || '#' } : null), 6) },
  cta: {
    heading: clean, body: (v) => clean(v, 300), note: (v) => clean(v, 160),
    primary: (v) => (is.obj(v) && clean(v.label) ? { label: clean(v.label, 40), action: clean(v.action, 30) || '#waitlist' } : null),
    secondary: (v) => (is.obj(v) && clean(v.label) ? { label: clean(v.label, 40), action: clean(v.action, 30) || '#about' } : null),
  },
  footer: {
    tagline: (v) => clean(v, 200), legal: (v) => clean(v, 120),
    columns: (v) => listOf(v, (c) => (is.obj(c) && clean(c.title) ? { title: clean(c.title, 30), links: listOf(c.links, (l) => clean(l, 40), 6) || [] } : null), 4),
  },
  logos: { heading: clean, items: (v) => listOf(v, (l) => (is.obj(l) && clean(l.name) ? { name: clean(l.name, 40) } : null), 8) },
  stats: { heading: clean, items: (v) => listOf(v, (s) => (is.obj(s) && clean(s.value) ? { value: clean(s.value, 24), label: clean(s.label, 60) || '', note: clean(s.note, 60) || '' } : null), 5) },
  eventDetails: { heading: clean, note: (v) => clean(v, 200), items: (v) => listOf(v, (i) => (is.obj(i) && clean(i.value) ? { label: clean(i.label, 30) || 'Info', value: clean(i.value, 120) } : null), 8) },
  speakers: { heading: clean, sub: (v) => clean(v, 200), items: (v) => listOf(v, (s) => (is.obj(s) && clean(s.name) ? { name: clean(s.name, 50), role: clean(s.role, 60) || '', topic: clean(s.topic, 120) || '', imageAssetId: clean(s.imageAssetId, 40) || '' } : null), 8) },
  schedule: {
    heading: clean, sub: (v) => clean(v, 200),
    days: (v) =>
      listOf(v, (d) => {
        if (!is.obj(d) || !clean(d.label)) return null;
        const slots = listOf(d.slots, (s) => (is.obj(s) && clean(s.title) ? { time: clean(s.time, 12) || '', title: clean(s.title, 80), who: clean(s.who, 60) || '' } : null), 10);
        return slots ? { label: clean(d.label, 60), slots } : null;
      }, 4),
  },
  tickets: {
    heading: clean, note: (v) => clean(v, 160),
    tiers: (v) => listOf(v, (t) => (is.obj(t) && clean(t.name) ? { name: clean(t.name, 40), price: clean(t.price, 30) || '—', unit: clean(t.unit, 30) || '', perks: listOf(t.perks, (p) => clean(p, 80), 6) || [], status: clean(t.status, 30) || '', cta: clean(t.cta, 30) || 'Get tickets' } : null), 4),
  },
  menu: {
    heading: clean, note: (v) => clean(v, 160),
    groups: (v) =>
      listOf(v, (g) => {
        if (!is.obj(g) || !clean(g.title)) return null;
        const items = listOf(g.items, (i) => (is.obj(i) && clean(i.name) ? { name: clean(i.name, 80), desc: clean(i.desc, 120) || '', price: clean(i.price, 20) || '' } : null), 10);
        return items ? { title: clean(g.title, 40), items } : null;
      }, 6),
  },
  team: { heading: clean, sub: (v) => clean(v, 200), items: (v) => listOf(v, (m) => (is.obj(m) && clean(m.name) ? { name: clean(m.name, 50), role: clean(m.role, 50) || '', bio: clean(m.bio, 200) || '', imageAssetId: clean(m.imageAssetId, 40) || '' } : null), 8) },
  problem: { heading: clean, body: (v) => clean(v, 600), points: (v) => listOf(v, (p) => clean(p, 160), 5) },
  solution: { heading: clean, body: (v) => clean(v, 600), points: (v) => listOf(v, (p) => clean(p, 160), 5) },
  album: {
    heading: clean, blurb: (v) => clean(v, 400), formats: (v) => listOf(v, (f) => clean(f, 40), 5),
    meta: (v) => listOf(v, (m) => (is.obj(m) && clean(m.value) ? { label: clean(m.label, 30) || '', value: clean(m.value, 60) } : null), 6),
  },
  tracklist: {
    heading: clean, note: (v) => clean(v, 200),
    items: (v) => listOf(v, (t, i) => (is.obj(t) && clean(t.title) ? { n: clean(t.n, 4) || String(i + 1).padStart(2, '0'), title: clean(t.title, 80), duration: clean(t.duration, 10) || '', note: clean(t.note, 40) || '' } : null), 16),
  },
  artistStory: { heading: clean, quote: (v) => clean(v, 200), paragraphs: (v) => listOf(v, (p) => clean(p, 700), 5) },
  preSave: {
    heading: clean, body: (v) => clean(v, 400), dateLabel: (v) => clean(v, 40), ctaLabel: (v) => clean(v, 40),
    platforms: (v) => listOf(v, (p) => (is.obj(p) && clean(p.name) ? { name: clean(p.name, 30), label: clean(p.label, 24) || 'Pre-save', url: clean(p.url, 120) || '#' } : null), 6),
  },
};

const SETTINGS_FIELDS = {
  align: (v) => (['left', 'center', 'right', 'bottom-left'].includes(v) ? v : null),
  padding: (v) => (['sm', 'md', 'lg', 'xl'].includes(v) ? v : null),
  columns: (v) => (is.num(v) && v >= 1 && v <= 6 ? Math.round(v) : null),
  layout: (v) => clean(v, 30),
  variant: (v) => clean(v, 30),
  top: (v) => (is.num(v) && v >= 0 && v <= 260 ? Math.round(v) : null),
  bottom: (v) => (is.num(v) && v >= 0 && v <= 260 ? Math.round(v) : null),
  bleed: (v) => (typeof v === 'boolean' ? v : null),
  fullBleed: (v) => (typeof v === 'boolean' ? v : null),
  rule: (v) => (typeof v === 'boolean' ? v : null),
  invert: (v) => (typeof v === 'boolean' ? v : null),
  mono: (v) => (typeof v === 'boolean' ? v : null),
  hoverReveal: (v) => (typeof v === 'boolean' ? v : null),
  positionCounter: (v) => (typeof v === 'boolean' ? v : null),
  emphasiseMiddle: (v) => (typeof v === 'boolean' ? v : null),
};

/** Copies legal, non-empty fields from `source` onto `target`. */
function mergeContent(target, source, type) {
  const fields = CONTENT_FIELDS[type];
  const applied = [];
  if (!is.obj(source) || !fields) return applied;
  for (const [key, validate] of Object.entries(fields)) {
    if (source[key] === undefined) continue;
    const value = validate(source[key]);
    if (value === null || value === undefined) continue;
    if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
    target[key] = value;
    applied.push(`${type}.${key}`);
  }
  return applied;
}

function mergeSettings(target, source, type) {
  const applied = [];
  if (!is.obj(source)) return applied;
  for (const [key, validate] of Object.entries(SETTINGS_FIELDS)) {
    if (source[key] === undefined) continue;
    const value = validate(source[key]);
    if (value === null || value === undefined) continue;
    target[key] = value;
    applied.push(`${type}.settings.${key}`);
  }
  return applied;
}

function mergeTheme(theme, incoming) {
  const applied = [];
  if (!is.obj(incoming)) return applied;
  const colors = theme.colors;
  if (is.obj(incoming.colors)) {
    for (const key of ['background', 'text', 'accent']) {
      const value = clean(incoming.colors[key], 9);
      if (is.color(value) && value.toLowerCase() !== colors[key].toLowerCase()) {
        colors[key] = value.toLowerCase();
        applied.push(`colors.${key}`);
      }
    }
    // Re-derive the dependent surfaces from the merged trio.
    if (applied.length) {
      const dark = utils.isDark(colors.background);
      theme.mode = dark ? 'dark' : 'light';
      colors.surface = dark ? utils.lighten(colors.background, 0.055) : utils.darken(colors.background, 0.035);
      colors.surfaceAlt = dark ? utils.lighten(colors.background, 0.1) : utils.darken(colors.background, 0.07);
      colors.textMuted = utils.mix(colors.text, colors.background, dark ? 0.45 : 0.5);
      colors.accentText = utils.isDark(colors.accent) ? '#ffffff' : '#0a0a0c';
      colors.border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,12,0.12)';
      colors.overlay = dark ? 'rgba(3,3,5,0.72)' : 'rgba(255,255,255,0.82)';
    }
  }
  if (is.str(incoming.mode)) {
    const mode = incoming.mode === 'light' ? 'light' : 'dark';
    if (mode !== theme.mode) {
      theme.mode = mode;
      applied.push('mode');
    }
  }
  if (is.obj(incoming.typography)) {
    const typo = theme.typography;
    if (FONTS.includes(incoming.typography.headingFont) && incoming.typography.headingFont !== typo.headingFont) {
      typo.headingFont = incoming.typography.headingFont;
      applied.push('typography.headingFont');
    }
    if (FONTS.includes(incoming.typography.bodyFont) && incoming.typography.bodyFont !== typo.bodyFont) {
      typo.bodyFont = incoming.typography.bodyFont;
      applied.push('typography.bodyFont');
    }
    const scale = Number(incoming.typography.scale);
    if (Number.isFinite(scale) && scale >= 0.95 && scale <= 1.45) {
      typo.scale = utils.round(scale, 3);
      applied.push('typography.scale');
    }
    const weight = Number(incoming.typography.headingWeight);
    if (Number.isFinite(weight) && weight >= 300 && weight <= 900) {
      typo.headingWeight = Math.round(weight / 50) * 50;
      applied.push('typography.headingWeight');
    }
  }
  const radius = Number(incoming.radius);
  if (Number.isFinite(radius) && radius >= 0 && radius <= 28) {
    theme.radius = Math.round(radius);
    applied.push('radius');
  }
  if (SPACING.includes(incoming.spacing) && incoming.spacing !== theme.spacing) {
    theme.spacing = incoming.spacing;
    applied.push('spacing');
  }
  if (is.str(incoming.visualStyle)) {
    theme.visualStyle = clean(incoming.visualStyle, 120);
    applied.push('visualStyle');
  }
  if (Array.isArray(incoming.effects)) {
    const effects = [...new Set(incoming.effects.filter((e) => EFFECTS.includes(e)))];
    if (effects.length) {
      theme.effects = effects;
      applied.push('effects');
    }
  }
  return applied;
}

/**
 * @param {object} baseSpec deterministic compileSpec() result
 * @param {object} json parsed model output
 * @param {{intent?:object, builderFor?:Function}} [options]
 */
function mergeLlmSpec(baseSpec, json, options = {}) {
  const report = { applied: [], added: [], removed: [], skipped: [], provider: 'ollama' };
  if (!is.obj(json)) {
    report.skipped.push('model output was not an object');
    return { spec: baseSpec, report };
  }

  const spec = JSON.parse(JSON.stringify(baseSpec));

  if (is.str(json.name)) {
    spec.name = clean(json.name, 60);
    spec.meta.slugHint = slugify(spec.name);
    report.applied.push('name');
  }
  if (is.str(json.tagline)) {
    spec.tagline = clean(json.tagline, 140);
    report.applied.push('tagline');
  }
  report.applied.push(...mergeTheme(spec.theme, json.theme).map((p) => `theme.${p}`));

  if (is.obj(json.nav)) {
    if (json.nav.cta && clean(json.nav.cta.label)) {
      spec.nav.cta = { label: clean(json.nav.cta.label, 40), action: clean(json.nav.cta.action, 30) || spec.nav.cta.action };
      report.applied.push('nav.cta');
    }
    const links = listOf(json.nav.links, (l) => (is.obj(l) && clean(l.label) ? { label: clean(l.label, 30), action: clean(l.action, 30) || `#${clean(l.label, 20).toLowerCase().replace(/\s+/g, '-')}` } : null), 6);
    if (links) {
      spec.nav.links = links;
      report.applied.push('nav.links');
    }
  }

  if (Array.isArray(json.sections)) {
    const byType = new Map(spec.sections.map((s) => [s.type, s]));
    const seen = new Set();
    json.sections.forEach((incoming) => {
      if (!is.obj(incoming) || !is.str(incoming.type) || !BUILDERS[incoming.type]) {
        if (incoming && incoming.type) report.skipped.push(`unknown section type "${incoming.type}"`);
        return;
      }
      const type = incoming.type;
      if (seen.has(type)) {
        report.skipped.push(`duplicate ${type} ignored`);
        return;
      }
      seen.add(type);
      let section = byType.get(type);
      if (!section) {
        section = { id: `${type}-llm`, type, label: type, order: spec.sections.length, content: {}, settings: { padding: 'md' }, assets: [], hidden: false, fromModel: true };
        spec.sections.splice(Math.max(0, spec.sections.length - 1), 0, section);
        byType.set(type, section);
        report.added.push(type);
      }
      report.applied.push(...mergeContent(section.content, incoming.content, type).map((f) => `sections.${f}`));
      report.applied.push(...mergeSettings(section.settings, incoming.settings || incoming, type).map((f) => `sections.${f}`));
    });

    // Order the page the way the model laid it out, keeping any sections it
    // never mentioned in their original relative position.
    const order = json.sections.map((s) => (s && s.type) || null).filter((t) => t && byType.has(t));
    const rest = spec.sections.filter((s) => !order.includes(s.type)).map((s) => s.type);
    const finalOrder = [...new Set([...order, ...rest, 'footer'])].filter((t) => byType.has(t));
    if (finalOrder.length === spec.sections.length) {
      spec.sections = finalOrder.map((type, index) => {
        const section = byType.get(type);
        section.order = index;
        section.id = `${type}-${String(index).padStart(2, '0')}`;
        return section;
      });
      report.applied.push('section order');
    }
  }

  if (Array.isArray(spec.sections)) {
    const hero = spec.sections.find((s) => s.type === 'hero');
    if (hero) {
      spec.headline = hero.content.headline || spec.headline;
      spec.subheadline = hero.content.subheadline || spec.subheadline;
    }
  }
  spec.meta = spec.meta || {};
  spec.meta.modelReport = report;
  return { spec, report };
}

/** Structural guard used before anything renders or gets published. */
function validateSpec(spec) {
  const errors = [];
  if (!is.obj(spec)) return { ok: false, errors: ['spec missing'] };
  if (!is.str(spec.name)) errors.push('name');
  if (!Array.isArray(spec.sections) || !spec.sections.length) errors.push('sections');
  if (!is.obj(spec.theme) || !is.color(spec.theme.colors && spec.theme.colors.background)) errors.push('theme.colors.background');
  (spec.sections || []).forEach((section, index) => {
    if (!BUILDERS[section.type]) errors.push(`sections[${index}].type (${section.type})`);
    if (!is.obj(section.content)) errors.push(`sections[${index}].content`);
  });
  if (!is.obj(spec.platform) || !Array.isArray(spec.platform.targets)) errors.push('platform.targets');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

module.exports = { mergeLlmSpec, validateSpec, mergeTheme, mergeContent, CONTENT_FIELDS, SETTINGS_FIELDS, clean, listOf };
