/**
 * Natural-language customization.
 *
 * "Make the hero more premium and add a countdown." becomes a list of ops on
 * the structured config — never a string replace on HTML. Two paths produce
 * those ops: the local model (when Ollama is up) and Launchpad's own rule
 * interpreter (always available, and used when the model's ops are invalid).
 * Ops are also applied in the builder's panels, so both paths stay in sync.
 */

const { BUILDERS, slugify } = require('./compile');
const { analyze, buildTheme } = require('./interpret');
const { designById } = require('../catalog/designs');
const { clean } = require('./normalize');
const { parseDateLoose } = require('./dates');

const TONES = ['premium', 'luxurious', 'luxury', 'minimal', 'bold', 'cinematic', 'futuristic', 'warm', 'playful', 'technical', 'editorial', 'quiet', 'expensive', 'dramatic', 'clean'];

const COLOR_WORDS = {
  black: '#000000', white: '#ffffff', ivory: '#f8f6ef', cream: '#f4efe6', bone: '#efeade',
  grey: '#8a8a90', gray: '#8a8a90', charcoal: '#1c1d21', navy: '#101a33', blue: '#3b82f6',
  sky: '#38bdf8', cyan: '#22d3ee', teal: '#14b8a6', green: '#22c55e', emerald: '#10b981',
  lime: '#a3e635', yellow: '#facc15', gold: '#c9a227', amber: '#f59e0b', orange: '#f97316',
  red: '#ef4444', crimson: '#dc2626', pink: '#f472b6', rose: '#fb7185', purple: '#8b5cf6',
  violet: '#7c5cff', lavender: '#a78bfa', indigo: '#4f46e5', burgundy: '#7f1d2d', beige: '#e6ddcb',
};

const SECTION_WORDS = {
  hero: ['hero', 'header', 'top of the page', 'first section', 'landing block'],
  about: ['about', 'about section', 'our story', 'story section', 'bio'],
  features: ['features', 'feature section', 'benefits', 'what you get'],
  productShowcase: ['product showcase', 'products', 'product section', 'product cards', 'shop', 'collection', 'the drop'],
  gallery: ['gallery', 'photo gallery', 'photos', 'image grid', 'photo grid'],
  video: ['video', 'video section', 'film', 'teaser'],
  pricing: ['pricing', 'pricing section', 'plans', 'packages', 'price table'],
  testimonials: ['testimonials', 'testimonials section', 'reviews', 'quotes section', 'social proof'],
  countdown: ['countdown', 'countdown section', 'timer', 'launch timer', 'count down'],
  waitlist: ['waitlist', 'wait list', 'signup form', 'sign-up form', 'email capture', 'join list'],
  newsletter: ['newsletter', 'subscribe block', 'email list section'],
  contact: ['contact', 'contact section', 'contact form', 'enquiry form'],
  faq: ['faq', 'faq section', 'questions', 'q and a'],
  social: ['social links', 'social', 'social section', 'links section', 'handles'],
  cta: ['cta', 'call to action', 'closing section', 'final cta'],
  footer: ['footer', 'site footer'],
  logos: ['logo strip', 'sponsors', 'press strip', 'partners strip'],
  stats: ['stats', 'numbers', 'metrics band', 'impact numbers'],
  eventDetails: ['event details', 'event info', 'details section', 'venue info'],
  speakers: ['speakers', 'line-up', 'lineup', 'speakers section', 'artists section'],
  schedule: ['schedule', 'timetable', 'agenda', 'running order'],
  tickets: ['tickets', 'ticketing', 'ticket section'],
  menu: ['menu', 'food menu', 'drinks list'],
  team: ['team', 'team section', 'founders section', 'people section'],
  problem: ['problem', 'problem section'],
  solution: ['solution', 'solution section', 'how we fix it'],
  album: ['album', 'release section', 'record section', 'ep section'],
  tracklist: ['tracklist', 'track list', 'songs', 'tracklist section'],
  artistStory: ['artist story', 'biography', 'story section'],
  preSave: ['pre-save', 'presave', 'pre-add', 'early access section'],
};

const ALIAS_TO_TYPE = (() => {
  const map = new Map();
  for (const [type, words] of Object.entries(SECTION_WORDS)) {
    for (const word of words) map.set(word, type);
  }
  return map;
})();

/* ------------------------------------------------------------------- apply */

const findSection = (spec, key) =>
  spec.sections.find((s) => s.id === key || s.type === key || String(s.type).toLowerCase() === String(key).toLowerCase());

function sectionIdFor(spec, key) {
  const found = findSection(spec, key) || findSection(spec, ALIAS_TO_TYPE.get(String(key).toLowerCase()));
  return found ? found.id : null;
}

function insertIndex(spec, { after, before }) {
  if (after) {
    const index = spec.sections.findIndex((s) => s.id === sectionIdFor(spec, after) || s.type === after);
    if (index !== -1) return index + 1;
  }
  if (before) {
    const index = spec.sections.findIndex((s) => s.id === sectionIdFor(spec, before) || s.type === before);
    if (index !== -1) return index;
  }
  const footer = spec.sections.findIndex((s) => s.type === 'footer');
  return footer === -1 ? spec.sections.length : footer;
}

function renormaliseOrder(spec) {
  spec.sections.forEach((section, index) => {
    section.order = index;
    if (!/^[a-z]+-\d\d$/.test(section.id)) section.id = `${section.type}-${String(index).padStart(2, '0')}`;
  });
}

/** Rebuilds a section with the same engine that generated the page. */
function sectionFactory(spec) {
  const description = (spec.meta && spec.meta.description) || `${spec.name}. ${spec.tagline || ''}`;
  const design = spec.meta && spec.meta.designId && spec.meta.designId !== 'ai-chosen' ? designById(spec.meta.designId) : null;
  const intent = analyze({
    description,
    websiteType: spec.websiteType,
    design,
    platform: spec.platform,
    visualDirection: spec.theme.visualStyle,
    details: { desiredSections: [] },
  });
  const theme = { ...spec.theme };
  const platform = spec.platform;
  return (type) => {
    const { createCopy } = require('./copy');
    const { buildContext } = require('./compile');
    const ctx = {
      intent,
      theme,
      platform,
      copy: createCopy(spec.seed || intent.seed, { ...buildContext(intent), websiteType: spec.websiteType, brand: spec.name }),
      slug: slugify(spec.name),
      assets: { all: [], byCategory: () => [], forCategory: () => [], forSection: (t) => (spec.assets || []).filter((a) => (a.selectedSection || a.suggestedSection) === t) },
      sections: spec.sections,
    };
    ctx.ctx = ctx.copy.ctx || buildContext(intent);
    const built = BUILDERS[type] ? BUILDERS[type](ctx) : { content: {}, settings: {} };
    return { content: built.content || {}, settings: built.settings || {} };
  };
}

const OPS = {
  addSection(spec, op, context) {
    const type = op.type && BUILDERS[op.type] ? op.type : ALIAS_TO_TYPE.get(String(op.type || '').toLowerCase());
    if (!type) return { ok: false, reason: `unknown section type "${op.type}"` };
    const existing = spec.sections.find((s) => s.type === type);
    if (existing && !existing.hidden) return { ok: true, changed: false, reason: `${type} is already on the page` };
    const generated = existing ? null : context.factory(type);
    const section = existing || {
      id: `${type}-new`,
      type,
      label: type,
      content: generated.content,
      settings: { padding: 'md', ...generated.settings },
      assets: [],
      hidden: false,
    };
    if (existing) existing.hidden = false;
    if (op.content) require('./normalize').mergeContent(section.content, op.content, type);
    spec.sections.splice(insertIndex(spec, op), 0, section);
    renormaliseOrder(spec);
    return { ok: true, changed: true, text: `Added ${labelOf(type)}` };
  },

  removeSection(spec, op) {
    const section = findSection(spec, op.type) || findSection(spec, ALIAS_TO_TYPE.get(String(op.type || '').toLowerCase()));
    if (!section) return { ok: false, reason: `no ${op.type} section to remove` };
    if (section.type === 'hero' || section.type === 'footer') return { ok: false, reason: `${section.type} cannot be removed` };
    spec.sections = spec.sections.filter((s) => s.id !== section.id);
    renormaliseOrder(spec);
    return { ok: true, changed: true, text: `Removed ${labelOf(section.type)}` };
  },

  showSection(spec, op) {
    const section = findSection(spec, op.type);
    if (!section) return OPS.addSection(spec, op, arguments[2]);
    section.hidden = false;
    return { ok: true, changed: true, text: `Showed ${labelOf(section.type)}` };
  },

  moveSection(spec, op) {
    const section = findSection(spec, op.type);
    if (!section) return { ok: false, reason: 'section not found' };
    spec.sections = spec.sections.filter((s) => s.id !== section.id);
    spec.sections.splice(insertIndex(spec, op), 0, section);
    renormaliseOrder(spec);
    const where = op.after ? `after ${labelOf(op.after)}` : op.before ? `before ${labelOf(op.before)}` : 'in a better position';
    return { ok: true, changed: true, text: `Moved ${labelOf(section.type)} ${where}` };
  },

  setField(spec, op) {
    const section = findSection(spec, op.type);
    if (!section) return { ok: false, reason: 'section not found' };
    const path = String(op.path || '').replace(/^content\./, '');
    if (!/^[a-zA-Z]+$/.test(path)) return { ok: false, reason: 'unsupported field path' };
    const value = clean(String(op.value == null ? '' : op.value), 500);
    if (!value) return { ok: false, reason: 'empty value' };
    section.content[path] = value;
    if (section.type === 'hero' && path === 'headline') spec.headline = value;
    return { ok: true, changed: true, text: `Updated ${labelOf(section.type)} ${path}` };
  },

  updateSettings(spec, op) {
    const section = findSection(spec, op.type);
    if (!section) return { ok: false, reason: 'section not found' };
    const { SETTINGS_FIELDS } = require('./normalize');
    const applied = [];
    for (const [key, raw] of Object.entries(op.settings || {})) {
      const validate = SETTINGS_FIELDS[key];
      if (!validate) continue;
      const value = validate(raw);
      if (value === null || value === undefined) continue;
      section.settings[key] = value;
      applied.push(`${key}=${value}`);
    }
    if (op.content) require('./normalize').mergeContent(section.content, op.content, section.type);
    if (!applied.length && !op.content) return { ok: false, reason: 'nothing valid to change' };
    return { ok: true, changed: true, text: `${labelOf(section.type)}: ${applied.join(', ') || 'content updated'}` };
  },

  setTheme(spec, op) {
    const value = op.value;
    const path = String(op.path || '');
    const [group, key] = path.split('.');
    if (group === 'colors') {
      if (!/^(background|text|accent|surface|border|textMuted)$/.test(key)) return { ok: false, reason: 'unsupported colour' };
      let hex = typeof value === 'string' ? value.trim().toLowerCase() : null;
      if (hex && COLOR_WORDS[hex.replace(/^(#)/, '')]) hex = COLOR_WORDS[hex.replace(/^#/, '')];
      if (hex && !/^#[0-9a-f]{6}$/i.test(hex)) {
        const word = Object.keys(COLOR_WORDS).find((w) => hex.includes(w));
        if (word) hex = COLOR_WORDS[word];
      }
      if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return { ok: false, reason: `"${value}" is not a colour I understand` };
      spec.theme.colors[key === 'surface' || key === 'border' || key === 'textMuted' ? key : key] = hex;
      syncThemeFromColors(spec);
      return { ok: true, changed: true, text: `${key === 'background' ? 'Background' : key === 'text' ? 'Text' : 'Accent'} set to ${hex}` };
    }
    if (path === 'mode') {
      const mode = value === 'light' ? 'light' : 'dark';
      invertToMode(spec, mode);
      return { ok: true, changed: true, text: `Switched to ${mode} mode` };
    }
    if (path === 'typography.headingFont') {
      const map = { serif: 'serif', sans: 'sans', sansserif: 'sans', mono: 'mono', monospace: 'mono', display: 'display', grotesk: 'grotesk', condensed: 'condensed' };
      const font = map[String(value).toLowerCase().replace(/[^a-z]/g, '')];
      if (!font) return { ok: false, reason: 'unknown font' };
      spec.theme.typography.headingFont = font;
      return { ok: true, changed: true, text: `Headings now use ${font}` };
    }
    if (path === 'radius') {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, reason: 'radius needs a number' };
      spec.theme.radius = Math.max(0, Math.min(28, Math.round(n)));
      return { ok: true, changed: true, text: `Corner radius ${spec.theme.radius}px` };
    }
    if (path === 'spacing') {
      const n = String(value);
      if (!['tight', 'airy', 'roomy'].includes(n)) return { ok: false, reason: 'spacing must be tight, airy or roomy' };
      spec.theme.spacing = n;
      respaceSections(spec);
      return { ok: true, changed: true, text: `Spacing set to ${n}` };
    }
    if (path === 'visualStyle') {
      spec.theme.visualStyle = clean(String(value), 120) || spec.theme.visualStyle;
      return { ok: true, changed: true, text: 'Visual style updated' };
    }
    if (path === 'typography.scale') {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, reason: 'scale needs a number' };
      spec.theme.typography.scale = Math.max(0.95, Math.min(1.45, Number(n.toFixed(3))));
      return { ok: true, changed: true, text: `Type scale ${spec.theme.typography.scale}` };
    }
    return { ok: false, reason: `unsupported theme path "${path}"` };
  },

  addThemeEffect(spec, op) {
    const allowed = ['grain', 'glow', 'grid', 'rules', 'marquee', 'letterbox', 'vignette', 'mono-labels', 'soft-shadow', 'aurora', 'outline-type', 'oversized-headline'];
    if (!allowed.includes(op.effect)) return { ok: false, reason: 'unknown effect' };
    if (spec.theme.effects.includes(op.effect)) return { ok: true, changed: false, reason: `${op.effect} already applied` };
    spec.theme.effects.push(op.effect);
    return { ok: true, changed: true, text: `Added ${op.effect}` };
  },

  removeThemeEffect(spec, op) {
    if (!spec.theme.effects.includes(op.effect)) return { ok: true, changed: false, reason: 'not applied' };
    spec.theme.effects = spec.theme.effects.filter((e) => e !== op.effect);
    return { ok: true, changed: true, text: `Removed ${op.effect}` };
  },

  addProduct(spec, op) {
    const showcase = findSection(spec, 'productShowcase');
    if (!showcase) return { ok: false, reason: 'no product section on this page' };
    const name = clean(String(op.name || ''), 60);
    if (!name) return { ok: false, reason: 'product needs a name' };
    showcase.content.products = showcase.content.products || [];
    showcase.content.products.push({
      name,
      price: clean(String(op.price || ''), 30) || 'On request',
      unit: clean(String(op.unit || ''), 30) || 'incl. tax',
      blurb: clean(String(op.blurb || ''), 200) || 'Details to follow — replace this line in the builder.',
      tag: '',
      cta: 'Reserve on the list',
      features: [],
    });
    return { ok: true, changed: true, text: `Added “${name}” to products` };
  },

  addFaq(spec, op) {
    let faq = findSection(spec, 'faq');
    if (!faq) {
      const result = OPS.addSection(spec, { type: 'faq' }, arguments[2]);
      faq = findSection(spec, 'faq');
      if (!faq) return result;
    }
    const question = clean(String(op.question || ''), 160);
    if (!question) return { ok: false, reason: 'faq needs a question' };
    faq.content.items = faq.content.items || [];
    faq.content.items.push({ question, answer: clean(String(op.answer || ''), 420) || 'Answer this in the builder — it is a placeholder.' });
    return { ok: true, changed: true, text: `Added a FAQ item` };
  },

  addTestimonial(spec, op) {
    let section = findSection(spec, 'testimonials');
    if (!section) {
      const result = OPS.addSection(spec, { type: 'testimonials' }, arguments[2]);
      section = findSection(spec, 'testimonials');
      if (!section) return result;
    }
    const quote = clean(String(op.quote || ''), 300);
    if (!quote) return { ok: false, reason: 'testimonial needs a quote' };
    section.content.items = section.content.items || [];
    section.content.items.push({ quote, name: clean(String(op.name || ''), 40) || 'Verified', role: clean(String(op.role || ''), 60) || '' });
    return { ok: true, changed: true, text: 'Added a testimonial' };
  },

  setPlatform(spec, op) {
    const mode = ['mobile', 'desktop', 'both'].includes(op.mode) ? op.mode : null;
    if (!mode) return { ok: false, reason: 'mode must be mobile, desktop or both' };
    const targets = mode === 'both' ? ['mobile', 'desktop'] : [mode];
    const interpret = require('./interpret');
    spec.platform = interpret.buildPlatformConfig({ platform: { targets } });
    respaceSections(spec);
    return { ok: true, changed: true, text: `Optimised for ${spec.platform.label.toLowerCase()}` };
  },

  setName(spec, op) {
    const name = clean(String(op.name || ''), 60);
    if (!name) return { ok: false, reason: 'name is empty' };
    spec.name = name;
    spec.sections.forEach((s) => {
      if (!s.content) return;
      ['heading', 'headline', 'subheadline', 'body', 'tagline', 'note'].forEach((key) => {
        const value = s.content[key];
        if (typeof value === 'string' && value.includes(spec.meta?.previousName || '')) s.content[key] = value;
      });
    });
    return { ok: true, changed: true, text: `Renamed to ${name}` };
  },

  setCountdownTarget(spec, op) {
    const section = findSection(spec, 'countdown');
    if (!section) return OPS.addSection(spec, { type: 'countdown' }, arguments[2]);
    const raw = op.targetIso || op.value || '';
    let date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      const loose = parseDateLoose(raw);
      if (!loose) return { ok: false, reason: 'that date did not parse' };
      date = new Date(loose);
    }
    section.content.targetIso = date.toISOString();
    return { ok: true, changed: true, text: `Countdown now targets ${date.toDateString()}` };
  },

  applyTone(spec, op, context) {
    return applyTone(spec, op.section || 'hero', op.tone, context);
  },
};

function labelOf(type) {
  const words = SECTION_WORDS[type];
  return words ? words[0].replace(/\b\w/g, (c) => c.toUpperCase()) : type;
}

function syncThemeFromColors(spec) {
  const { utils } = require('./interpret');
  const colors = spec.theme.colors;
  // A palette edit can make the ink match the ground ("make it white") — the
  // renderer must never be handed text it cannot show.
  if (utils.contrastRatio(colors.text, colors.background) < 2.5) colors.text = utils.inkOn(colors.background);
  const dark = utils.isDark(colors.background);
  if (utils.contrastRatio(colors.accent, colors.background) < 1.3) colors.accent = dark ? '#ffffff' : '#000000';
  spec.theme.mode = dark ? 'dark' : 'light';
  colors.surface = dark ? utils.lighten(colors.background, 0.055) : utils.darken(colors.background, 0.035);
  colors.surfaceAlt = dark ? utils.lighten(colors.background, 0.1) : utils.darken(colors.background, 0.07);
  const muted = utils.mix(colors.text, colors.background, dark ? 0.42 : 0.34);
  colors.textMuted = utils.contrastRatio(muted, colors.background) >= 3
    ? muted
    : utils.mix(colors.text, colors.background, dark ? 0.24 : 0.2);
  colors.accentText = utils.inkOn(colors.accent);
  colors.border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,12,0.12)';
  colors.overlay = dark ? 'rgba(3,3,5,0.72)' : 'rgba(255,255,255,0.82)';
}

function invertToMode(spec, mode) {
  const colors = spec.theme.colors;
  if (mode === 'light') {
    colors.background = '#fafaf8';
    colors.text = '#101014';
  } else {
    colors.background = '#0a0a0c';
    colors.text = '#f6f6f7';
  }
  syncThemeFromColors(spec);
}

function respaceSections(spec) {
  const base = spec.platform.sectionPadding || 96;
  const roomy = spec.theme.spacing === 'roomy' ? 1.14 : spec.theme.spacing === 'tight' ? 0.86 : 1;
  spec.sections.forEach((section) => {
    const weight = { hero: 1, cta: 0.8, countdown: 0.55, newsletter: 0.55, social: 0.5, footer: 0.45, logos: 0.35 }[section.type] ?? 0.75;
    section.settings.padding = weight >= 0.9 ? 'xl' : weight >= 0.7 ? 'lg' : weight >= 0.5 ? 'md' : 'sm';
    section.settings.top = Math.round(base * weight * roomy);
    section.settings.bottom = Math.round(base * weight * roomy);
  });
}

const TONE_PRESETS = {
  premium: () => ({
    theme: { effects: ['grain', 'vignette'], spacing: 'roomy', radius: 6, typography: { scaleBoost: 0.05, weight: 600, tracking: '-0.035em' } },
    hero: { align: 'center', padding: 'xl', overlayBoost: 0.08, dropBadges: true },
    headline: (name) => [`${name}, made the slow way`, `Nothing about ${name} is accidental`, `${name}: fewer things, better`],
  }),
  luxurious: () => TONE_PRESETS.premium(),
  luxury: () => TONE_PRESETS.premium(),
  expensive: () => TONE_PRESETS.premium(),
  minimal: () => ({
    theme: { effects: [], spacing: 'roomy', radius: 4, typography: { scaleBoost: 0.02, weight: 500, tracking: '-0.02em' } },
    hero: { align: 'center', padding: 'lg', dropBadges: true, dropSecondary: false },
    headline: (name) => [`${name}. That is the pitch.`, `Simply ${name}`, `${name}, stripped back`],
  }),
  clean: () => TONE_PRESETS.minimal(),
  quiet: () => TONE_PRESETS.minimal(),
  bold: () => ({
    theme: { effects: ['outline-type', 'marquee'], spacing: 'airy', radius: 0, typography: { scaleBoost: 0.12, weight: 800, tracking: '-0.05em' } },
    hero: { align: 'left', padding: 'lg', overlayBoost: 0 },
    headline: (name) => [`${name.toUpperCase()}, LOUD AND CLEAR`, `This is ${name}. Bring it.`, `${name} does not do subtle`],
  }),
  dramatic: () => TONE_PRESETS.bold(),
  cinematic: () => ({
    theme: { effects: ['letterbox', 'grain', 'vignette'], spacing: 'roomy', radius: 2, typography: { scaleBoost: 0.07, weight: 600, tracking: '-0.03em' } },
    hero: { align: 'bottom-left', padding: 'xl', overlayBoost: 0.14, minHeight: '92vh' },
    headline: (name) => [`${name}, shot like a film`, `${name}: the long take`, `Everything about ${name} is framed`],
  }),
  futuristic: () => ({
    theme: { effects: ['glow', 'grid', 'mono-labels'], spacing: 'airy', radius: 2, typography: { headingFont: 'grotesk', scaleBoost: 0.06, weight: 700, tracking: '-0.04em' } },
    hero: { align: 'center', padding: 'xl', overlayBoost: 0.04 },
    headline: (name) => [`${name} from 2031`, `${name}: the next version of now`, `Built ahead of schedule — ${name}`],
  }),
  warm: () => ({
    theme: { effects: ['soft-shadow'], spacing: 'airy', radius: 20, typography: { headingFont: 'serif', scaleBoost: 0.02, weight: 500, tracking: '-0.01em' } },
    hero: { align: 'left', padding: 'lg', overlayBoost: -0.05 },
    headline: (name) => [`${name}, made to feel like somewhere`, `Come in, it is ${name}`, `${name} keeps the lights low`],
  }),
  playful: () => ({
    theme: { effects: ['marquee'], spacing: 'airy', radius: 22, typography: { scaleBoost: 0.04, weight: 750, tracking: '-0.02em' } },
    hero: { align: 'center', padding: 'lg' },
    headline: (name) => [`${name}, but make it fun`, `Warning: ${name} is contagious`, `${name} — the good kind of trouble`],
  }),
  technical: () => ({
    theme: { effects: ['grid', 'mono-labels'], spacing: 'tight', radius: 8, typography: { headingFont: 'mono', scaleBoost: -0.02, weight: 600, tracking: '-0.01em' } },
    hero: { align: 'left', padding: 'lg' },
    headline: (name) => [`${name}: the short version`, `${name} // ship faster`, `Docs first, ${name} second`],
  }),
  editorial: () => ({
    theme: { effects: ['rules'], spacing: 'roomy', radius: 0, typography: { headingFont: 'serif', bodyFont: 'serif', scaleBoost: 0.03, weight: 500, tracking: '-0.015em' } },
    hero: { align: 'left', padding: 'lg' },
    headline: (name) => [`${name}: the feature`, `The case for ${name}`, `${name}, in its own words`],
  }),
};

function applyTone(spec, sectionType, tone, context) {
  const key = String(tone || '').toLowerCase().replace(/[^a-z]/g, '');
  const preset = TONE_PRESETS[key] && TONE_PRESETS[key]();
  if (!preset) return { ok: false, reason: `I do not have a “${tone}” treatment` };
  const section = findSection(spec, sectionType);
  if (!section) return { ok: false, reason: `${sectionType} is not on this page` };

  const { utils } = require('./interpret');
  if (preset.theme.effects) spec.theme.effects = dedupe([...spec.theme.effects, ...preset.theme.effects]);
  if (preset.theme.spacing) spec.theme.spacing = preset.theme.spacing;
  if (preset.theme.radius != null) spec.theme.radius = preset.theme.radius;
  if (preset.theme.typography) {
    const typo = spec.theme.typography;
    typo.scale = utils.round(Math.min(1.45, Math.max(0.95, typo.scale + (preset.theme.typography.scaleBoost || 0))), 3);
    if (preset.theme.typography.weight) typo.headingWeight = preset.theme.typography.weight;
    if (preset.theme.typography.tracking) typo.headingTracking = preset.theme.typography.tracking;
    if (preset.theme.typography.headingFont) typo.headingFont = preset.theme.typography.headingFont;
    if (preset.theme.typography.bodyFont) typo.bodyFont = preset.theme.typography.bodyFont;
  }
  respaceSections(spec);

  if (section.type === 'hero') {
    const h = preset.hero || {};
    if (h.align) section.settings.align = h.align;
    if (h.padding) section.settings.padding = h.padding;
    if (h.minHeight) section.content.minHeight = h.minHeight;
    if (h.overlayBoost && section.content.imageAssetId) {
      section.content.overlay = Math.max(0, Math.min(0.9, Number(section.content.overlay || 0.4) + h.overlayBoost));
    }
    if (h.dropBadges) delete section.content.badges;
    const pool = preset.headline ? preset.headline(spec.name) : null;
    if (pool) {
      const index = (spec.toneShifts || 0) % pool.length;
      section.content.headline = pool[index];
      spec.toneShifts = (spec.toneShifts || 0) + 1;
    }
  } else {
    if (preset.hero && preset.hero.align) section.settings.align = preset.hero.align;
  }
  spec.theme.visualStyle = dedupe([...String(spec.theme.visualStyle || '').split(', ').filter(Boolean), key]).slice(0, 4).join(', ');
  return { ok: true, changed: true, text: `${labelOf(section.type)} now reads ${key}` };
}

const dedupe = (list) => [...new Set(list.filter(Boolean))];

function applyOps(spec, ops, contextIn) {
  const results = [];
  const next = JSON.parse(JSON.stringify(spec));
  // Callers that hand over raw ops (the model, a test, a re-run after undo)
  // still need to be able to materialise a new section, so the copy factory is
  // derived from the spec itself when the caller did not pass one.
  const given = contextIn || {};
  const context = typeof given.factory === 'function' ? given : { ...given, factory: sectionFactory(next) };
  for (const op of ops || []) {
    if (!op || typeof op.op !== 'string') {
      results.push({ ok: false, reason: 'op without a valid "op" name' });
      continue;
    }
    const handler = OPS[op.op];
    if (!handler) {
      results.push({ ok: false, reason: `unsupported op "${op.op}"` });
      continue;
    }
    let outcome;
    try {
      outcome = handler(next, op, context);
    } catch (error) {
      outcome = { ok: false, reason: `${op.op} failed: ${error.message}` };
    }
    results.push({ ...outcome, op: op.op });
  }
  const changed = results.some((r) => r.changed);
  return { spec: changed ? next : spec, results, changed, summaryTexts: results.filter((r) => r.changed).map((r) => r.text), failures: results.filter((r) => !r.ok).map((r) => r.reason) };
}

/* ------------------------------------------------------------------- rules */

function findSectionMention(text) {
  let best = null;
  for (const [type, words] of Object.entries(SECTION_WORDS)) {
    for (const word of words) {
      const re = new RegExp(`(?:the\\s+|an?\\s+|my\\s+)?${word.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}(?:\\s+section)?\\b`, 'i');
      const m = text.match(re);
      if (m && (!best || m.index < best.index)) best = { type, index: m.index, length: m[0].length };
    }
  }
  return best;
}

/** Colour intent shared by every rule branch, so a date + a palette in one
 *  sentence does not have to pick a winner. */
function colourOps(lower) {
  const colorWords = Object.keys(COLOR_WORDS).filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (!colorWords.length) return { ops: [], readAs: null };
  const colourNoun = /\b(colou?rs?|palette|background|accent|theme|tint)\b/.test(lower);
  const repaintVerb = /\b(make|turn|switch|change|set|use|go|want|prefer|recolou?r)\b/.test(lower);
  if (!(colourNoun || repaintVerb || colorWords.length > 1)) return { ops: [], readAs: null };
  const ops = [];
  const dark = colorWords.filter((w) => ['black', 'charcoal', 'navy', 'burgundy'].includes(w));
  const light = colorWords.filter((w) => ['white', 'ivory', 'cream', 'bone', 'beige'].includes(w));
  const accentCandidates = colorWords.filter((w) => !dark.includes(w) && !light.includes(w));
  if (dark.length) ops.push({ op: 'setTheme', path: 'colors.background', value: COLOR_WORDS[dark[0]] });
  if (light.length && !dark.length) ops.push({ op: 'setTheme', path: 'colors.background', value: COLOR_WORDS[light[0]] });
  if (light.length && dark.length) ops.push({ op: 'setTheme', path: 'colors.text', value: COLOR_WORDS[light[0]] });
  if (accentCandidates.length) ops.push({ op: 'setTheme', path: 'colors.accent', value: COLOR_WORDS[accentCandidates[0]] });
  else if (!/\bbackground\b|\btext\b/.test(lower) && colorWords.length === 1) ops.push({ op: 'setTheme', path: 'colors.accent', value: COLOR_WORDS[colorWords[0]] });
  return { ops, readAs: `Colours: ${colorWords.join(' + ')}` };
}

/**
 * Launchpad's own interpreter for edit commands. Deterministic, offline, and
 * used whenever Ollama is unavailable or returns ops the validator rejects.
 */
function parseCommandRules(command, spec) {
  const text = String(command || '').trim();
  const lower = text.toLowerCase();
  const ops = [];
  const notes = [];
  if (!text) return { ops, notes, matched: false };

  // 1. Removals — "remove the pricing section", "drop the faq", "hide testimonials".
  //    "drop" is a noun in this product (a sneaker drop), so it only counts as a
  //    verb in the exact phrase "drop the …", and the section has to be named in
  //    the words that follow the verb — never guessed from the rest of the sentence.
  const removal = lower.match(/\b(?:remove|delete|hide|get rid of|no more|drop the|take out)\s+(?:the\s+|our\s+|a\s+|an\s+)?([a-z -]{3,28}?)(?:\s+section|\s+block|\s+band)?\b/i);
  if (removal) {
    const captured = removal[1].trim();
    const resolved = (findSectionMention(captured) || {}).type || ALIAS_TO_TYPE.get(captured) || null;
    if (resolved && findSection(spec, resolved)) {
      ops.push({ op: 'removeSection', type: resolved });
      return { ops, notes, matched: true, readAs: `Remove ${labelOf(resolved)}` };
    }
  }

  // 2. Additions — "add a countdown", "include testimonials", "bring back the faq"
  const addition = lower.match(/\b(?:add|include|insert|bring back|show|re-add|put in|we need)\s+(?:a\s+|an\s+|the\s+|back\s+)?([a-z -]{3,30}?)(?:\s+section|\s+block|\s+band|,|\s+to\b|\s+the\s+|\s+above|\s+below|\s+before|\s+after|$)/i);
  if (addition) {
    const mention = findSectionMention(lower);
    const type = mention ? mention.type : ALIAS_TO_TYPE.get(addition[1].trim());
    if (type && BUILDERS[type]) {
      const op = { op: 'addSection', type };
      const after = lower.match(/\b(?:after|below|under|following)\s+(?:the\s+)?([a-z -]{3,24})/i);
      const before = lower.match(/\b(?:before|above)\s+(?:the\s+)?([a-z -]{3,24})/i);
      if (after) op.after = findSectionMention(after[1])?.type || after[1].trim();
      if (before) op.before = findSectionMention(before[1])?.type || before[1].trim();
      const dateMatch = type === 'countdown' ? lower.match(/\b(?:by|on|until|to)\s+(.{3,48})$/i) : null;
      if (dateMatch) {
        const iso = humanDate(dateMatch[1]) || parseDateLoose(dateMatch[1]);
        if (iso) {
          ops.push(op);
          ops.push({ op: 'setCountdownTarget', targetIso: iso });
          const colour = colourOps(lower);
          ops.push(...colour.ops);
          return {
            ops,
            notes,
            matched: true,
            readAs: [colour.readAs, `Add ${labelOf(type)} counting down to ${new Date(iso).toUTCString().slice(5, 16)}`].filter(Boolean).join(' · '),
          };
        }
      }
      const colour = colourOps(lower);
      if (colour.ops.length) return { ops: [op, ...colour.ops], notes, matched: true, readAs: `${colour.readAs} · Add ${labelOf(type)}` };
      return { ops: [op], notes, matched: true, readAs: `Add ${labelOf(type)}` };
    }
  }

  // 2b. A date on its own — "the drop is on 3 December", "move the launch to
  //     next friday" — retargets the countdown even when no section was named.
  if (/\b(countdown|timer|drop|launch|release|pre-?order)\b/.test(lower) && !addition) {
    const cue = lower.match(/\b(?:on|by|until|to|at)\s+(.{3,48})$/i);
    const iso = cue ? humanDate(cue[1]) || parseDateLoose(cue[1]) : parseDateLoose(lower.replace(/[^a-z0-9 ]/g, ' '));
    if (iso) {
      ops.push({ op: 'setCountdownTarget', targetIso: iso });
      const colour = colourOps(lower);
      ops.push(...colour.ops);
      return {
        ops,
        notes,
        matched: true,
        readAs: [colour.readAs, `Countdown set to ${new Date(iso).toUTCString().slice(5, 16)}`].filter(Boolean).join(' · '),
      };
    }
  }

  // 3. Move — "move the countdown above the waitlist"
  const move = lower.match(/\bmove\s+(?:the\s+)?([a-z -]{3,24})\s+(?:above|before)\s+(?:the\s+)?([a-z -]{3,24})/i) || lower.match(/\bmove\s+(?:the\s+)?([a-z -]{3,24})\s+(?:below|after)\s+(?:the\s+)?([a-z -]{3,24})/i);
  if (move) {
    const what = findSectionMention(move[1])?.type || ALIAS_TO_TYPE.get(move[1].trim());
    const anchorWord = move[2].trim();
    const anchor = findSectionMention(anchorWord)?.type || ALIAS_TO_TYPE.get(anchorWord);
    const above = /\b(above|before)\b/.test(lower);
    if (what && anchor) {
      return { ops: [{ op: 'moveSection', type: what, ...(above ? { before: anchor } : { after: anchor }) }], notes, matched: true, readAs: `Move ${labelOf(what)} ${above ? 'above' : 'below'} ${labelOf(anchor)}` };
    }
  }

  // 4. Tone on a section — "make the hero more luxurious"
  const tone = lower.match(/\b(?:make|give|keep|set)\s+(?:the\s+|our\s+)?([a-z -]{3,20})\s+(?:even\s+)?(?:more|less|a bit more|really|very|slightly)?\s*([a-z-]+)?/i);
  const toneWord = TONES.find((t) => lower.includes(t));
  if (toneWord) {
    const sectionMention = findSectionMention(lower);
    const sectionType = sectionMention ? sectionMention.type : /hero|header|top/.test(lower) ? 'hero' : 'hero';
    ops.push({ op: 'applyTone', section: sectionType, tone: toneWord });
    if (/whole|site|page|website|everything|entire/.test(lower)) notes.push('applied-site-wide');
    return { ops, notes, matched: true, readAs: `Make ${labelOf(sectionType)} more ${toneWord}` };
  }

  // 5. Colours — "make the colors black and purple", "accent should be green"
  const colour = colourOps(lower);
  if (colour.ops.length) return { ops: [...ops, ...colour.ops], notes, matched: true, readAs: colour.readAs };

  if (/\b(dark mode|darker|black theme|switch to dark)\b/.test(lower)) return { ops: [{ op: 'setTheme', path: 'mode', value: 'dark' }], notes, matched: true, readAs: 'Switch to dark' };
  if (/\b(light mode|brighter|white theme|switch to light)\b/.test(lower)) return { ops: [{ op: 'setTheme', path: 'mode', value: 'light' }], notes, matched: true, readAs: 'Switch to light' };

  // 6. Size and spacing
  if (/\b(cta|button|call to action)\b/.test(lower) && /\b(bigger|larger|bolder|more prominent|stand out|increase|grow)\b/.test(lower)) {
    const cta = findSection(spec, 'cta') || findSection(spec, 'hero');
    if (cta) return { ops: [{ op: 'updateSettings', type: cta.type, settings: { padding: 'xl', size: 'lg', emphasis: 'high' }, content: cta.type === 'hero' ? undefined : {} }], notes, matched: true, readAs: 'Make the CTA bigger' };
  }
  if (/\b(headline|heading|title|h1)\b/.test(lower) && /\b(bigger|larger|bolder|more|increase)\b/.test(lower)) {
    const current = spec.theme.typography.scale;
    return { ops: [{ op: 'setTheme', path: 'typography.scale', value: Math.min(1.45, current + 0.08) }], notes, matched: true, readAs: 'Bigger headline' };
  }
  if (/\b(headline|heading)\b/.test(lower) && /\b(smaller|less|reduce|tone down)\b/.test(lower)) {
    return { ops: [{ op: 'setTheme', path: 'typography.scale', value: Math.max(0.98, spec.theme.typography.scale - 0.07) }], notes, matched: true, readAs: 'Smaller headline' };
  }
  if (/\b(more|a lot more|extra)\s+spacing|more\s+breathing\s+room|more\s+whitespace/.test(lower)) return { ops: [{ op: 'setTheme', path: 'spacing', value: 'roomy' }], notes, matched: true, readAs: 'More spacing' };
  if (/\b(tighter|less spacing|smaller gaps|denser)\b/.test(lower)) return { ops: [{ op: 'setTheme', path: 'spacing', value: 'tight' }], notes, matched: true, readAs: 'Tighter spacing' };
  if (/\b(rounded|rounder|soften the corners)\b/.test(lower)) return { ops: [{ op: 'setTheme', path: 'radius', value: 20 }], notes, matched: true, readAs: 'Rounder corners' };
  if (/\b(square corners|no radius|sharp corners)\b/.test(lower)) return { ops: [{ op: 'setTheme', path: 'radius', value: 0 }], notes, matched: true, readAs: 'Square corners' };

  // 7. Whole-site style switches
  const styleSwitch = lower.match(/\b(?:change|switch|make|turn)(?:\s+the)?\s+(?:website|site|page|design|whole thing)?\s*(?:to|to a|into)?\s*(?:a\s+)?([a-z-]+)\s+(?:style|look|theme|direction|aesthetic)\b/i);
  const styleWord = styleSwitch && TONES.find((t) => styleSwitch[1].includes(t.split(' ')[0]));
  if (styleWord) {
    return { ops: [{ op: 'applyTone', section: 'hero', tone: styleWord }, { op: 'setTheme', path: 'visualStyle', value: styleWord }], notes, matched: true, readAs: `Restyle to ${styleWord}` };
  }

  // 8. Explicit copy edits
  const headlineEdit = text.match(/\b(?:change|set|rewrite)(?:\s+the)?\s+(hero\s+)?headline\s+(?:to|as|:)\s*["'“]?(.+?)["'”]?\s*$/i);
  if (headlineEdit) {
    return { ops: [{ op: 'setField', type: 'hero', path: 'headline', value: headlineEdit[2] }], notes, matched: true, readAs: 'Replace the headline' };
  }
  const ctaLabel = text.match(/\b(?:cta|button)\s*(?:label\s*)?(?:should say|says?|to|:)\s*["'“]?(.{3,40})["'”]?\s*$/i);
  if (ctaLabel) {
    const target = findSection(spec, 'hero') ? 'hero' : 'cta';
    return { ops: [{ op: 'setField', type: target, path: 'primary', value: { label: ctaLabel[1] } }], notes, matched: true, readAs: 'Change the CTA label' };
  }
  const rename = text.match(/\b(?:rename|call it|change the name to)\s+["'“]?([A-Za-z0-9&'. -]{2,40})["'”]?/i);
  if (rename) return { ops: [{ op: 'setName', name: rename[1] }], notes, matched: true, readAs: `Rename to ${rename[1]}` };

  // 9. Content additions
  const product = text.match(/\badd (?:a |the )?product(?: called| named)? ["'“]?([A-Za-z0-9&' -]{2,40})["'”]?(?:\s+(?:at|for|—|-)\s*(₦|\$|£|€)?\s?([\d,.]+))?/i);
  if (product) {
    return { ops: [{ op: 'addProduct', name: product[1].trim(), price: product[2] ? `${product[2]}${product[3]}` : null }], notes, matched: true, readAs: `Add product “${product[1].trim()}”` };
  }
  const faqItem = text.match(/\badd (?:an? )?faq (?:item |question )?(?:about|on) ([a-z -]{3,40})/i);
  if (faqItem) {
    return { ops: [{ op: 'addFaq', question: `What about ${faqItem[1].trim()}?`, answer: `Answer this in the builder — Launchpad left a placeholder about ${faqItem[1].trim()}.` }], notes, matched: true, readAs: `Add a FAQ about ${faqItem[1].trim()}` };
  }
  const testimonial = text.match(/\badd (?:a )?testimonial (?:from )?["'“]?([A-Za-z. -]{2,30})["'”]?(?::| that says | saying )?(.*)$/i);
  if (testimonial) {
    return { ops: [{ op: 'addTestimonial', name: testimonial[1].trim(), quote: (testimonial[2] || '').trim() || null }], notes, matched: true, readAs: `Add a testimonial from ${testimonial[1].trim()}` };
  }

  // 10. Platform + alignment
  if (/\b(mobile first|optimise for mobile|make it mobile)/.test(lower)) return { ops: [{ op: 'setPlatform', mode: 'mobile' }], notes, matched: true, readAs: 'Optimise for mobile' };
  if (/\b(desktop first|optimise for (?:desktop|laptop)|bigger screens)/.test(lower)) return { ops: [{ op: 'setPlatform', mode: 'desktop' }], notes, matched: true, readAs: 'Optimise for desktop' };
  if (/\b(responsive|both screens|mobile and laptop|everywhere)/.test(lower)) return { ops: [{ op: 'setPlatform', mode: 'both' }], notes, matched: true, readAs: 'Make it responsive' };
  const align = lower.match(/\b(center|centre|left[- ]align|right[- ]align|align (?:it )?(left|right|center))\b/);
  if (align) {
    const mention = findSectionMention(lower);
    const type = mention ? mention.type : 'hero';
    const value = /right/.test(lower) ? 'right' : /left/.test(lower) ? 'left' : 'center';
    return { ops: [{ op: 'updateSettings', type, settings: { align: value } }], notes, matched: true, readAs: `Align ${labelOf(type)} ${value}` };
  }
  if (/\b(shorter|trim|too long|cut it down)\b/.test(lower)) {
    return { ops: [{ op: 'setTheme', path: 'spacing', value: 'tight' }], notes, matched: true, readAs: 'Tighten the page' };
  }
  if (/\b(glow|neon|luminous)\b/.test(lower)) return { ops: [{ op: 'addThemeEffect', effect: 'glow' }], notes, matched: true, readAs: 'Add glow' };
  if (/\b(grain|filmic|35mm|analogue|analog)\b/.test(lower)) return { ops: [{ op: 'addThemeEffect', effect: 'grain' }], notes, matched: true, readAs: 'Add film grain' };
  if (/\b(grid lines|blueprint)\b/.test(lower)) return { ops: [{ op: 'addThemeEffect', effect: 'grid' }], notes, matched: true, readAs: 'Add grid lines' };

  const mention = findSectionMention(lower);
  if (mention && findSection(spec, mention.type) && /\b(improve|better|stronger|sharpen|rewrite|fix)\b/.test(lower)) {
    return { ops: [{ op: 'applyTone', section: mention.type, tone: 'premium' }], notes, matched: true, readAs: `Sharpen ${labelOf(mention.type)}` };
  }

  return { ops: [], notes, matched: false };
}

function humanDate(value) {
  const raw = String(value).toLowerCase();
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = raw.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/);
  if (m) {
    const now = new Date();
    const month = months[m[2].slice(0, 3)];
    const year = new Date(now.getFullYear(), month, Number(m[1])) < now ? now.getFullYear() + 1 : now.getFullYear();
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  const weekday = raw.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (weekday) {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const target = names.indexOf(weekday[1]);
    const date = new Date();
    date.setDate(date.getDate() + ((target - date.getDay() + 7) % 7 || 7));
    return date.toISOString().slice(0, 10);
  }
  return null;
}

module.exports = { applyOps, parseCommandRules, colourOps, applyTone, TONE_PRESETS, TONES, SECTION_WORDS, ALIAS_TO_TYPE, labelOf, respaceSections, syncThemeFromColors, sectionFactory, findSection };
