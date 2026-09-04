/**
 * The master prompt builder (Section 6 of the product spec).
 *
 * Design gallery selection + the user's own words + the follow-up "fill a few
 * details" answers are compiled into one prompt. That prompt is what the
 * generator is given, and it is stored on the project so the builder can show
 * exactly what the AI was told.
 */

/**
 * The one prompt Launchpad shows the model — and the user. Everything they
 * picked in the wizard has to be readable here, because the builder exposes
 * this text verbatim as "what Launchpad was told".
 */
function buildMasterPrompt(userDescription, design = {}, details = {}) {
  const list = (items, fallback) => (Array.isArray(items) && items.length ? items.join(', ') : fallback || null);
  const lines = [];

  lines.push(`Website type: ${design.category || details.websiteType || 'general'}`);
  lines.push(`Business/Project name: ${details.businessName || 'not given — invent one that fits the idea'}`);
  if (details.tagline) lines.push(`Tagline: ${details.tagline}`);

  lines.push('');
  lines.push("User's original description:");
  lines.push(`"${String(userDescription || '').trim() || 'no description provided'}"`);

  const extras = [];
  if (details.audience) extras.push(`Who it is for: ${details.audience}`);
  if (details.goal) extras.push(`What the site must achieve: ${details.goal}`);
  if (details.visualDirection) extras.push(`Visual direction, in the user's own words: ${details.visualDirection}`);
  if (extras.length) lines.push('', ...extras);

  lines.push('', 'Selected design direction:');
  lines.push(`- Style: ${list(design.styleTags, 'modern, considered')}`);
  lines.push(`- Layout: ${design.layoutHints || 'large type, generous spacing, one idea per screen'}`);
  lines.push(`- Color palette: ${list(design.colorPalette, 'monochrome')}`);
  if (design.name && design.id !== 'ai-chosen') lines.push(`- Direction name: ${design.name}`);

  const platforms = list(details.platforms);
  if (platforms) lines.push('', `Platforms to optimise for: ${platforms}`);

  lines.push('', `Sections to include: ${list(details.desiredSections, 'choose the sections this launch actually needs' )}`);
  if (details.excludedSections && details.excludedSections.length) {
    lines.push(`Do NOT include these sections — the user removed them: ${details.excludedSections.join(', ')}`);
  }
  if (details.extraNotes) lines.push(`Additional notes: ${details.extraNotes}`);

  lines.push('', 'Generate a structured website specification (theme, sections, section order, copy, CTAs) matching the above.');
  return lines.join('\n');
}

/**
 * When a user skips the gallery, Launchpad infers a design direction from the
 * written description so the master prompt keeps the same shape — the builder
 * shows "AI-chosen direction" with the tags it derived.
 */
function inferDesignDirection({ keywords = [], websiteType = 'other', visualDirection = '' }) {
  const styleTags = [];
  const push = (tag) => {
    if (tag && !styleTags.includes(tag)) styleTags.push(tag);
  };

  const k = new Set(keywords);
  if (k.has('dark') || k.has('black')) push('dark');
  if (k.has('light') || k.has('white') && !k.has('black')) push('light');
  if (k.has('minimal') || k.has('clean') || k.has('sparse')) push('minimal');
  if (k.has('bold') || k.has('loud') || k.has('maximal')) push('bold');
  if (k.has('large') || k.has('oversized') || k.has('typography')) push('large-typography');
  if (k.has('futuristic') || k.has('tech') || k.has('neon')) push('futuristic');
  if (k.has('luxury') || k.has('premium') || k.has('editorial') || k.has('fashion')) push('editorial-luxury');
  if (k.has('warm') || k.has('cozy') || k.has('organic')) push('warm');
  if (k.has('cinematic') || k.has('film') || k.has('moody')) push('cinematic');
  if (!styleTags.length) push('modern');

  const palette = paletteFromKeywords(k);
  return {
    id: 'ai-chosen',
    name: 'AI-chosen direction',
    category: websiteType,
    thumbnailUrl: null,
    styleTags,
    layoutHints: layoutHintsFor(websiteType, styleTags),
    colorPalette: palette,
    inferred: true,
    visualDirection: visualDirection || null,
  };
}

function paletteFromKeywords(keywords) {
  const has = (w) => keywords.has(w);
  const bg = has('light') && !has('dark') ? '#f7f6f3' : '#08080a';
  const fg = bg === '#08080a' ? '#f6f6f7' : '#111114';
  let accent = '#ffffff';
  if (has('purple') || has('violet') || has('lavender')) accent = '#8b5cf6';
  else if (has('green') || has('emerald')) accent = '#34d399';
  else if (has('blue')) accent = '#60a5fa';
  else if (has('red') || has('crimson')) accent = '#f87171';
  else if (has('orange') || has('amber') || has('gold')) accent = '#fbbf24';
  else if (has('pink')) accent = '#f472b6';
  else if (bg === '#f7f6f3') accent = '#111114';
  return [bg, fg, accent];
}

function layoutHintsFor(websiteType, styleTags) {
  const base = {
    product: 'Full-bleed hero image, oversized product photography, sparse nav',
    business: 'Split hero with proof badges, generous whitespace, card-based services',
    startup: 'Centered hero on dark gradient, product screenshot below, three-column feature row',
    event: 'Poster-led hero, countdown band, line-up grid, timetable rows',
    app: 'Device mockup hero, feature list with screenshots, store badges in footer',
    music: 'Artwork-first hero, large type, tracklist rows, release countdown band',
    'personal-brand': 'Portrait-split hero, editorial pull quotes, index of work',
    community: 'Statement hero, member photo strip, benefits grid, join band',
    campaign: 'Bold headline hero, live counters, story blocks, prominent sign-up band',
    portfolio: 'Grid of work with hover detail, minimal chrome, type-led index',
    restaurant: 'Room-at-night hero, menu in two columns, photographer-led gallery',
    other: 'Editorial hero, alternating media blocks, generous margins',
  };
  const hints = [base[websiteType] || base.other];
  if (styleTags.includes('minimal')) hints.push('wide margins, single accent colour, no boxes');
  if (styleTags.includes('bold')) hints.push('display type at maximum scale, hard-edged blocks');
  if (styleTags.includes('large-typography')) hints.push('headline larger than the viewport half');
  if (styleTags.includes('cinematic')) hints.push('letterboxed imagery, dark overlays, slow fades');
  return hints.join(', ');
}

module.exports = { buildMasterPrompt, inferDesignDirection, paletteFromKeywords };
