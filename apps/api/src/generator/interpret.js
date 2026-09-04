/**
 * The interpretation + compilation step.
 *
 * 1. analyze() reads the user's natural-language description (plus optional
 *    visual-direction notes and the design-gallery pick) into an `intent`.
 * 2. compileSpec() turns that intent into a structured website specification:
 *    theme, typography, platform behaviour and an ordered list of sections,
 *    each with its own content and settings. Nothing here produces HTML —
 *    the React app renders this object, which is why the builder can edit it.
 */

const { createCopy, hashString, CITIES, MATERIALS, fill } = require('./copy');
const { typeById } = require('../catalog/websiteTypes');

const COLOR_WORDS = {
  black: '#000000',
  white: '#ffffff',
  offwhite: '#f7f5f0',
  cream: '#f4efe6',
  bone: '#efeade',
  ivory: '#f8f6ef',
  grey: '#8a8a90',
  gray: '#8a8a90',
  silver: '#c7c7cf',
  charcoal: '#1c1d21',
  graphite: '#15161a',
  navy: '#101a33',
  blue: '#3b82f6',
  sky: '#38bdf8',
  cyan: '#22d3ee',
  teal: '#14b8a6',
  green: '#22c55e',
  emerald: '#10b981',
  lime: '#a3e635',
  yellow: '#facc15',
  gold: '#c9a227',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  crimson: '#dc2626',
  pink: '#f472b6',
  rose: '#fb7185',
  purple: '#8b5cf6',
  violet: '#7c5cff',
  lavender: '#a78bfa',
  indigo: '#4f46e5',
  burgundy: '#7f1d2d',
  brown: '#7c5a3c',
  tan: '#b08d57',
  beige: '#e6ddcb',
  sand: '#d9c9a8',
  maroon: '#6d1b2e',
  mint: '#6ee7b7',
};

const MOOD_WORDS = [
  'minimal', 'minimalist', 'luxury', 'premium', 'bold', 'loud', 'quiet', 'cinematic', 'moody',
  'futuristic', 'retro', 'playful', 'serious', 'editorial', 'refined', 'raw', 'technical', 'warm',
  'cool', 'dark', 'light', 'bright', 'dusty', 'industrial', 'organic', 'elegant', 'gritty', 'sprawling',
];

const SECTION_HINTS = [
  { section: 'countdown', re: /\b(countdown|count down|launch (date|day)|timer|drop date|until launch)\b/i },
  { section: 'waitlist', re: /\b(wait ?list|waitlist|early access|sign ?up form|join the list|notify me)\b/i },
  { section: 'gallery', re: /\b(gallery|photos|photography|image grid|look ?book|scattered photos)\b/i },
  { section: 'pricing', re: /\b(pricing|price list|plans|packages|tiers|costs?)\b/i },
  { section: 'testimonials', re: /\b(testimonials?|reviews?|what .{0,20} say|quotes? from)\b/i },
  { section: 'faq', re: /\b(faq|questions|q&a|f\.a\.q)\b/i },
  { section: 'contact', re: /\b(contact|get in touch|enquir|enroll|book a (call|table)|dm)\b/i },
  { section: 'video', re: /\b(video|film|teaser|trailer|showreel|loop)\b/i },
  { section: 'newsletter', re: /\b(news ?letter|subscribe|weekly email|updates by email)\b/i },
  { section: 'team', re: /\b(team|founders?|about us|the people|crew|chefs?)\b/i },
  { section: 'speakers', re: /\b(speakers?|line ?up|artists? performing|performers?|headliners?)\b/i },
  { section: 'schedule', re: /\b(schedule|timetable|agenda|program(me)?|lineup times)\b/i },
  { section: 'tickets', re: /\b(tickets?|admission|entry pass|rsvp)\b/i },
  { section: 'menu', re: /\b(menu|dishes?|food list|cocktail list)\b/i },
  { section: 'tracklist', re: /\b(track ?list|songs?|tracklist)\b/i },
  { section: 'preSave', re: /\b(pre-?save|pre-?add|spotify presave|apple music pre-?save)\b/i },
  { section: 'social', re: /\b(social (links|media|handles)|instagram|tiktok|twitter|x\.com|youtube)\b/i },
  { section: 'stats', re: /\b(stats|numbers?|metrics|results? so far|impact numbers)\b/i },
  { section: 'logos', re: /\b(sponsors?|partners?|press|as seen in|featured in)\b/i },
  { section: 'about', re: /\b(about|our story|the story|who we are|mission|bio graphy|biography)\b/i },
  { section: 'features', re: /\b(features?|what you get|benefits|how it works)\b/i },
  { section: 'productShowcase', re: /\b(products|product (photos|info|information|page|shots|range|line|cards?)|collection|catalogue|catalog|merch|the drop)\b/i },
  { section: 'eventDetails', re: /\b(venue|location|where|address|directions|parking)\b/i },
  { section: 'problem', re: /\b(problem|pain point|the gap|frustration)\b/i },
  { section: 'solution', re: /\b(solution|approach|how we fix)\b/i },
];

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/** Reads the description. Every field is optional and degrades gracefully. */
function analyze(input = {}) {
  const description = String(input.description || '').trim();
  const lower = description.toLowerCase();
  const websiteType = input.websiteType && input.websiteType !== 'auto' ? input.websiteType : guessType(description);
  const typeDef = typeById(websiteType);
  const design = input.design || null;
  const details = input.details || {};

  const brand =
    details.businessName?.trim() ||
    extractBrand(description) ||
    fallbackBrand(websiteType);

  const audience =
    input.targetAudience ||
    matchGroup(lower, /(?:for|aimed at|targeting|built for|designed for)\s+((?:[^.,;]{4,70}?))(?=\s+(?:who|that|and|in|with|\band\b)|[.,;]|$)/i) ||
    defaultAudience(websiteType);

  const goal =
    input.goal ||
    matchGroup(lower, /(?:i want to|goal is to|the point is to|to)\s+((?:launch|sell|collect|grow|book|promote|raise|get|build)[^.\n]{4,70})/i) ||
    null;

  const colors = extractColors(lower);
  const moods = MOOD_WORDS.filter((m) => new RegExp(`\\b${m}\\b`).test(lower));
  const extraMood = (input.visualDirection || '').toLowerCase().match(/[a-z-]{4,}/g) || [];
  const styleNotes = [
    ...moods,
    ...extraMood.filter((w) => MOOD_WORDS.includes(w)),
    ...(design && Array.isArray(design.styleTags) ? design.styleTags.map((t) => t.toLowerCase()) : []),
  ];

  const sections = new Set();
  SECTION_HINTS.forEach(({ section, re }) => {
    if (re.test(description) || re.test(details.extraNotes || '')) sections.add(section);
  });
  (details.desiredSections || []).forEach((s) => sections.add(s));
  if (/waitlist/i.test(description)) sections.add('waitlist');
  if (/countdown/i.test(description)) sections.add('countdown');

  const prices = (description.match(/(?:₦|\$|£|€|NGN|USD)\s?\d[\d,.]*/g) || []).map((p) => p.trim());
  const productNameList = extractProductNames(description);
  const featuresList = extractAfterLabel(description, /(?:features?|what you get|benefits)[:\-\n]+([^.\n]{6,300})/i);
  const trackList = extractAfterLabel(description, /(?:track ?list|tracks|songs?)[:\-\n]+([^.\n]{6,400})/i);
  const speakersList = extractAfterLabel(description, /(?:speakers?|line ?up|headliners?|performers?)[:\-\n]+([^.\n]{6,300})/i);
  const venue = matchGroup(lower, /(?:at|in|venue:?)\s+((?:[^.,;\n]{4,40}?))(?=\s*(?:on|at|,\|\.$|;))|\b(?:at|in)\s+([A-Z][\w' -]{3,26})/);
  const city = (description.match(/\b(?:in|based in|from|around)\s+([A-Z][a-zA-Z' -]{2,18})\b/) || [])[1] || pickSeed(CITIES, description);
  const year = (description.match(/\b(19|20)\d{2}\b/) || [])[0] || String(new Date().getFullYear());
  const launch = extractDate(description);
  const cta = matchGroup(lower, /(?:cta|button|call to action)[:\s]+["'“]?(.{3,40}?)["'”]?(?:$|[.,;\n])/i) || null;
  const tagline =
    details.tagline ||
    matchGroup(lower, /tagline[:\s]+["'“]?(.{6,80}?)["'”]?(?:$|[.\n])/i) ||
    null;
  const typographyHint = (lower.match(/\b(serif|monospace|mono|sans[- ]?serif|grotesk|condensed|display type|large typography|oversized type|typography)\b/) || [])[1] || null;

  const keywords = new Set([
    ...lower.split(/[^a-z0-9-]+/).filter(Boolean),
    ...(colors.names || []),
    ...moods,
  ]);

  return {
    description,
    websiteType,
    typeDef,
    brand,
    brandLower: brand.toLowerCase(),
    audience,
    goal,
    tagline,
    keywords,
    colors,
    moods: [...new Set([...moods, ...styleNotes])].slice(0, 8),
    requestedSections: [...sections],
    prices,
    products: productNameList,
    features: featuresList,
    tracks: trackList,
    speakers: speakersList,
    venue: venue || null,
    city,
    year,
    launchDate: launch.date,
    launchOffsetDays: launch.offsetDays,
    cta,
    typographyHint,
    visualDirection: input.visualDirection || null,
    design,
    details,
    platform: input.platform || { targets: ['mobile', 'desktop'], mode: 'both' },
    extraNotes: details.extraNotes || input.extraNotes || '',
    assetDescriptions: (input.assets || []).map((a) => `${a.assetCategory || ''} ${a.description || ''} ${a.name || ''}`).join(' ').toLowerCase(),
    seed: hashString(`${brand}|${description}|${websiteType}|${design ? design.id : 'none'}|${details.tagline || ''}`),
  };
}

function guessType(text) {
  const t = String(text || '').toLowerCase();
  const table = [
    [/restaurant|cafe|coffee|bistro|dining|menu|chef|food/, 'restaurant'],
    [/album|ep\b|single|release|artist|musician|track|mixtape|song|dj\b|concert|tour/, 'music'],
    [/conference|festival|party|wedding|meetup|workshop|summit|gala|screening|night\b|event/, 'event'],
    [/startup|saas|platform|api|mvp|investors?|seed round|app\b/, 'startup'],
    [/mobile app|ios app|android app|the app|app called/, 'app'],
    [/portfolio|freelance|my work|designer|photographer|developer who/, 'portfolio'],
    [/community|membership|discord|guild|club|network of/, 'community'],
    [/campaign|petition|fund ?rais|donations?|vote|awareness/, 'campaign'],
    [/personal brand|my brand|i am a\b|my name is|my own/, 'personal-brand'],
    [/product|brand|streetwear|fashion|clothing|sneaker|collection|shop|store|merch|skincare|candle/, 'product'],
    [/business|agency|studio|salon|clinic|firm|consult|services?/, 'business'],
  ];
  for (const [re, type] of table) if (re.test(t)) return type;
  return 'other';
}

function extractBrand(text) {
  const patterns = [
    /(?:called|named|dubbed|branded)\s+["'“]?([A-Za-z0-9&'. -]{2,28})["'”]?(?=[.,;\n]| for | that | which |\s(?:i want|we|i am|create|the)|$)/i,
    /brand\s+(?:called|named)\s+["'“]?([A-Za-z0-9&'. -]{2,28})["'”]?/i,
    ["^i'?m launching (?:a|an)?\\s*(?:new\\s+)?(?:[^.,;]{0,48}?)(?:\\s(?:called|named)\\s+)([A-Za-z0-9&'. -]{2,28})", 'i'],
    [/launching\s+["'“]([A-Za-z0-9&'. -]{2,28})["'”]/i],
    [/^(?:i am|i'?m|my name is|this is)\s+([A-Z][A-Za-z][A-Za-z]{1,17})\b(?=\s*[,.;]|\s+(?:here|and|a|the|on)\b)/, 'i'],
    [/^([A-Z][A-Za-z0-9&']{1,20})\s+[-–—:]/],
    [/["'“]([A-Z][A-Za-z0-9&'. -]{1,24})["'”]/],
    /\b(?:by|from)\s+([A-Z][A-Za-z0-9&']{2,20})\b(?=[,.)\s]|$)/,
    /\b((?:[A-Z][A-Za-z0-9&']{1,20}[ ]?){1,3})\s+(?:is|are)\s+(?:a|an|the)\b/,
  ];
  for (const p of patterns) {
    if (!Array.isArray(p) && p instanceof RegExp) {
      const m = text.match(p);
      const value = cleanBrand(m && m[1]);
      if (value) return value;
    } else if (Array.isArray(p)) {
      const m = text.match(new RegExp(p[0], p[1]));
      const value = cleanBrand(m && m[1]);
      if (value) return value;
    }
  }
  return null;
}

function cleanBrand(raw) {
  if (!raw) return null;
  let value = String(raw).trim().replace(/[.,;:]+$/, '').replace(/^(?:the)\s+/i, '');
  value = value.replace(/\b(premium|new|cool|simple|clean)\s+(?=[a-z])/g, '');
  if (!value || value.length > 30) return null;
  if (/^(a|an|the|it|this|our|my)$|website|app|brand|platform/i.test(value.trim())) return null;
  // Prefer an all-caps or short token if the match contains one ("NOVA" not "NOVA streetwear")
  const caps = value.match(/\b([A-Z][A-Z0-9&']{1,12})\b/);
  if (caps && value.split(/\s+/).length > 1) return caps[1];
  return value.trim();
}

function fallbackBrand(type) {
  const map = {
    product: 'The New Label',
    startup: 'Newco',
    business: 'Our Studio',
    event: 'The Night',
    app: 'The App',
    music: 'The Release',
    'personal-brand': 'Your Name',
    community: 'The Group',
    campaign: 'The Cause',
    portfolio: 'Selected Work',
    restaurant: 'The Table',
    other: 'The Project',
  };
  return map[type] || 'The Project';
}

function defaultAudience(type) {
  return {
    product: 'people who notice details',
    startup: 'teams drowning in spreadsheets',
    business: 'locals who want it done once, properly',
    event: 'anyone who was there last time',
    app: 'people with too many tabs open',
    music: 'people who play records loud',
    'personal-brand': 'founders and creative directors',
    community: 'builders who want a room, not a feed',
    campaign: 'voters who have not been asked yet',
    portfolio: 'design leads hiring for one project',
    restaurant: 'diners who read the menu twice',
    other: 'the people it is for',
  }[type];
}

function matchGroup(text, patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  for (const re of list) {
    const m = text.match(re);
    if (!m) continue;
    const value = (m[1] || m[2] || '').trim();
    if (value && value.length > 2 && value.length < 90) return value.replace(/^[:\s-]+/, '');
  }
  return null;
}

function extractColors(lower) {
  const words = lower.split(/[^a-z]+/).filter(Boolean);
  const names = [];
  const hexes = [];
  for (const w of words) {
    if (COLOR_WORDS[w] && !names.includes(w)) {
      names.push(w);
      hexes.push(COLOR_WORDS[w]);
    }
  }
  const explicit = (lower.match(/#[0-9a-f]{6}\b/g) || []);
  const dark = /\b(dark|black|noir|midnight|charcoal)\b/.test(lower) && !/\blight (background|mode|theme)\b/.test(lower);
  const light = /\b(light|white|cream|ivory|bone|bright|airy)\b/.test(lower) && !/\bblack\b(?!.?and.? ?(logo|type|text))/.test(lower.replace(/black and white/g, 'monochrome'));
  return { names, hexes: [...explicit, ...hexes], dark, light, mode: dark && !light ? 'dark' : light && !dark ? 'light' : null };
}

function extractProductNames(text) {
  const list = extractListAfter(text, /(?:products?|collection|items?|pieces?|sneakers?|flavours?|variants?|plans?)[^:]{0,24}:([^.\n]{4,400})/i);
  if (list.length) return list.slice(0, 6).map((n) => titleish(n));
  const quoted = (text.match(/["'“]([A-Za-z0-9 '&-]{3,24})["'”]/g) || [])
    .map((q) => q.replace(/["'“]/g, '').trim())
    .filter((q) => q.length > 2 && !/^(i am|we|the|our)/i.test(q));
  return quoted.length >= 2 ? quoted.slice(0, 6).map((q) => titleish(q)) : [];
}

function extractListAfter(text, re) {
  const m = text.match(re);
  if (!m) return [];
  return m[1]
    .split(/,| and |\+|\/|\n|•/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);
}

function extractAfterLabel(text, re) {
  return extractListAfter(text, re);
}

function titleish(s) {
  return String(s).trim().replace(/\s+/g, ' ').replace(/^(.)|\s(.)/g, (c) => c.toUpperCase());
}

function extractDate(text) {
  const t = String(text);
  const rel = t.match(/\bin\s+(\d{1,2})\s*(day|week|month)s?\b/i);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const days = unit === 'week' ? n * 7 : unit === 'month' ? n * 30 : n;
    return { date: addDays(new Date(), days), offsetDays: days };
  }
  const monthDay = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  if (monthDay) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    const day = Number(monthDay[2]);
    const year = Number(monthDay[3] || new Date().getFullYear());
    const date = new Date(Date.UTC(year, month, day, 19, 0, 0));
    if (month !== undefined && !Number.isNaN(date.getTime())) return { date, offsetDays: daysFromNow(date) };
  }
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 19, 0, 0);
    return { date, offsetDays: daysFromNow(date) };
  }
  return { date: null, offsetDays: null };
}

const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const daysFromNow = (date) => Math.max(1, Math.round((date.getTime() - Date.now()) / 86400000));
function pickSeed(list, seedText) {
  return list[hashString(seedText) % list.length];
}

/* ------------------------------------------------------------------ theme */

function buildTheme(intent) {
  const design = intent.design;
  const palette = design ? design.colorPalette.slice() : intent.colors.hexes.length >= 2 ? intent.colors.hexes.slice(0, 3) : defaultPalette(intent);
  let [background, text, accent] = [palette[0] || '#0a0a0c', palette[1] || '#f6f6f7', palette[2] || palette[1] || '#ffffff'];

  // Colour words in the description can override the gallery pick's ink/accent
  const names = intent.colors.names;
  const dark = intent.colors.dark || (isDark(background) && !intent.colors.light);
  if (names.length) {
    const inks = names.filter((n) => ['black', 'charcoal', 'graphite', 'navy', 'midnight'].includes(n));
    const lights = names.filter((n) => ['white', 'cream', 'bone', 'ivory', 'offwhite', 'beige', 'sand', 'grey', 'gray', 'silver'].includes(n));
    const accents = names.filter((n) => !inks.includes(n) && !lights.includes(n));
    if (dark) {
      background = COLOR_WORDS[inks[0]] || background;
      text = COLOR_WORDS[lights[0]] || text;
      if (accents[0]) accent = COLOR_WORDS[accents[0]];
      else if (lights.length && !accents.length) accent = COLOR_WORDS[lights[0]];
    } else if (lights.length || inks.length) {
      background = COLOR_WORDS[lights[0]] || background;
      text = COLOR_WORDS[inks[0]] || text;
      if (accents[0]) accent = COLOR_WORDS[accents[0]];
    } else if (accents[0]) {
      accent = COLOR_WORDS[accents[0]];
    }
  }

  // Whatever the user's colour words did to the picked direction, the ink has to
  // read on the resulting ground — "clean white" on a dark template used to
  // produce white-on-white body copy.
  if (contrastRatio(text, background) < 2.5) text = inkOn(background);
  const mode0 = isDark(background) ? 'dark' : 'light';
  if (contrastRatio(accent, background) < 1.3) accent = mode0 === 'dark' ? '#f2f2f4' : '#17171b';
  if (contrastRatio(accent, background) < 1.3) accent = mode0 === 'dark' ? '#ffffff' : '#000000';

  const mode = isDark(background) ? 'dark' : 'light';
  const effects = new Set(design ? design.effects || [] : []);
  if (intent.moods.includes('futuristic')) effects.add('glow');
  if (intent.moods.includes('cinematic')) effects.add('letterbox');
  if (intent.moods.includes('minimal')) effects.delete('grain');

  const typo = design ? { ...design.typography } : { heading: 'display', body: 'sans', scale: 1.14, tracking: '-0.03em', weight: 600 };
  const hint = intent.typographyHint;
  if (hint === 'serif') typo.heading = 'serif';
  if (hint === 'monospace' || hint === 'mono') { typo.heading = 'mono'; typo.body = 'mono'; }
  if (hint === 'grotesk' || hint === 'condensed') typo.heading = hint === 'condensed' ? 'condensed' : 'grotesk';
  if (/(large|oversized|big)\s+(type|typography)|bold typography/i.test(intent.description)) {
    typo.scale = Math.max(1.26, typo.scale || 1.14);
    effects.add('oversized-headline');
  }

  return {
    mode,
    colors: {
      background,
      surface: mode === 'dark' ? lighten(background, 0.055) : darken(background, 0.035),
      surfaceAlt: mode === 'dark' ? lighten(background, 0.1) : darken(background, 0.07),
      text,
      textMuted: contrastRatio(mix(text, background, mode === 'dark' ? 0.42 : 0.34), background) >= 3
        ? mix(text, background, mode === 'dark' ? 0.42 : 0.34)
        : mix(text, background, mode === 'dark' ? 0.24 : 0.2),
      accent,
      accentText: inkOn(accent),
      border: mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,12,0.12)',
      overlay: mode === 'dark' ? 'rgba(3,3,5,0.72)' : 'rgba(255,255,255,0.82)',
    },
    typography: {
      headingFont: typo.heading || 'display',
      bodyFont: typo.body || 'sans',
      labelFont: effects.has('mono-labels') ? 'mono' : 'sans',
      scale: round(typo.scale || 1.14, 3),
      headingWeight: typo.weight || 600,
      headingTracking: typo.tracking || '-0.03em',
      bodySize: 16,
    },
    radius: design && design.radius != null ? design.radius : effects.has('soft-shadow') ? 18 : mode === 'dark' ? 12 : 10,
    spacing: (design && design.spacing) || (intent.moods.includes('minimal') ? 'roomy' : 'airy'),
    visualStyle: intent.moods.length ? intent.moods.slice(0, 4).join(', ') : design ? design.styleTags.slice(0, 3).join(', ') : 'modern, clean',
    effects: [...effects],
    imagery: {
      treatment: mode === 'dark' ? 'contrast' : 'natural',
      radius: 12,
      fit: 'cover',
    },
    designId: design ? design.id : null,
    designName: design ? design.name : 'AI-chosen direction',
  };
}

function defaultPalette(intent) {
  const dark = intent.colors.dark || !intent.colors.light;
  if (intent.websiteType === 'restaurant') return dark ? ['#12100e', '#f8f3ea', '#c99b6a'] : ['#f7f4ef', '#1a1714', '#8a5c3b'];
  if (intent.websiteType === 'music') return dark ? ['#07060b', '#f5f2ff', '#c9c1ff'] : ['#f6f5f9', '#121016', '#5b4bff'];
  if (intent.websiteType === 'event') return dark ? ['#0a0a0d', '#ffffff', '#f5c518'] : ['#fffdf5', '#111114', '#e0532f'];
  if (intent.websiteType === 'startup' || intent.websiteType === 'app') return dark ? ['#07080c', '#e9eef5', '#8bb8ff'] : ['#f7f8fb', '#101323', '#4f46e5'];
  if (intent.websiteType === 'portfolio' || intent.websiteType === 'personal-brand') return dark ? ['#0b0b0d', '#f6f6f7', '#b9b9c4'] : ['#fafaf8', '#141414', '#8f8f9a'];
  return dark ? ['#0a0a0c', '#f6f6f7', '#ffffff'] : ['#fbfbfa', '#111114', '#1c1c1f'];
}

/* --------------------------------------------------- platform configuration */

function buildPlatformConfig(intent) {
  const raw = intent.platform || {};
  const targets = Array.isArray(raw.targets) && raw.targets.length ? raw.targets : ['mobile', 'desktop'];
  const hasMobile = targets.includes('mobile');
  const hasDesktop = targets.includes('desktop');
  const mode = hasMobile && hasDesktop ? 'both' : hasMobile ? 'mobile' : 'desktop';
  const typeDefaults = {
    mobile: { scale: 0.86, density: 'comfortable', nav: 'sheet', radiusBias: 4, maxW: 620, grid: 1, sectionPadding: 56 },
    desktop: { scale: 1.06, density: 'wide', nav: 'topbar', radiusBias: 0, maxW: 1280, grid: 3, sectionPadding: 128 },
    both: { scale: 1, density: 'balanced', nav: 'adaptive', radiusBias: 2, maxW: 1240, grid: 3, sectionPadding: 104 },
  };
  const preset = typeDefaults[mode];
  return {
    targets,
    mode,
    label: mode === 'mobile' ? 'Mobile' : mode === 'desktop' ? 'Laptop / Desktop' : 'Mobile + Laptop',
    behavior:
      mode === 'both'
        ? 'Fluid responsive: mobile → tablet → laptop → desktop, with layout, type, imagery and navigation re-composed at each step.'
        : mode === 'mobile'
          ? 'Mobile-first: thumb-reachable actions, stacked sections, single-column rhythm, compressed type ramp.'
          : 'Desktop-optimised: wide editorial grids, hover detail, larger imagery and multi-column layout.',
    typeScale: preset.scale,
    density: preset.density,
    navStyle: preset.nav,
    maxWidth: preset.maxW,
    gridColumns: preset.grid,
    sectionPadding: preset.sectionPadding,
    radiusBias: preset.radiusBias,
    breakpoints: mode === 'both' ? [430, 768, 1024, 1280] : mode === 'mobile' ? [390, 430] : [1024, 1280, 1512],
    notes:
      mode === 'both'
        ? 'Generated with distinct mobile and desktop compositions rather than a scaled-down desktop layout.'
        : `Optimised for ${preset === typeDefaults.mobile ? 'phone screens' : 'laptop and desktop screens'}; other sizes still render safely.`,
  };
}

/* --------------------------------------------------------------- utilities */

/**
 * Hex (or rgb()/rgba()) → [r,g,b]. Design palettes are authored with shorthands
 * like #fff, and every derived colour (muted text, surface, button ink) comes
 * through here — a value we could not read used to fall back to near-black and
 * silently produce invisible body copy on a dark site.
 */
function hexToRgb(hex) {
  const raw = String(hex || '').trim().toLowerCase();
  const fn = raw.match(/rgba?\(([^)]+)\)/);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean).map((v) => parseFloat(v));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) return parts.slice(0, 3);
    return [10, 10, 12];
  }
  let v = raw.replace('#', '');
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  if (v.length === 8) v = v.slice(0, 6);
  if (!/^[0-9a-f]{6}$/.test(v)) return [10, 10, 12];
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
function rgbToHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
/** WCAG relative luminance — the only honest way to judge legibility. */
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The ink (near-white or near-black) that actually reads on `background`. */
function inkOn(background, onLight = '#0a0a0c', onDark = '#ffffff') {
  return contrastRatio(onDark, background) >= contrastRatio(onLight, background) ? onDark : onLight;
}

function isDark(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
function lighten(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r, g, b].map((v) => v + (255 - v) * amount));
}
function darken(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r, g, b].map((v) => v * (1 - amount)));
}
function mix(a, b, amount) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  return rgbToHex(pa.map((v, i) => v + (pb[i] - v) * amount));
}
const round = (n, p = 2) => Number(n.toFixed(p));

module.exports = {
  analyze,
  buildTheme,
  buildPlatformConfig,
  contrastRatio,
  luminance,
  inkOn,
  extractBrand,
  extractColors,
  extractDate,
  guessType,
  SECTION_HINTS,
  COLOR_WORDS,
  utils: { hexToRgb, rgbToHex, isDark, lighten, darken, mix, round, luminance, contrastRatio, inkOn },
};
