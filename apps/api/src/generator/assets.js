/**
 * Asset intelligence.
 *
 * Launchpad decides where an image belongs from four signals combined at once:
 *   website type + the user's description + the asset slot it was uploaded to
 *   + the free-text description the user gave it ("this is our first office,
 *   use it in the About section").
 * Nothing here can reject an image: unknown assets become `general` and always
 * keep a place in the Assets library, even when no section auto-uses them.
 */

const SLOT_SYNONYMS = {
  logo: ['logo', 'wordmark', 'mark', 'icon', 'brand mark', 'signature', 'favi'],
  campaign: ['campaign', 'key visual', 'hero', 'cover', 'headline image', 'poster'],
  hero: ['hero', 'restaurant', 'room', 'storefront', 'shop', 'front', 'campaign', 'main'],
  poster: ['poster', 'flyer', 'key art', 'artwork', 'banner'],
  product: ['product', 'sneaker', 'shoe', 'bottle', 'pack', 'packshot', 'garment', 'jacket', 'tee', 'item', 'merch'],
  lifestyle: ['lifestyle', 'model', 'wearing', 'street', 'on location', 'in use'],
  detail: ['detail', 'texture', 'close', 'material', 'fabric', 'stitch', 'macro'],
  work: ['work', 'project', 'case study', 'client', 'job', 'build', 'output'],
  projects: ['project', 'work', 'case study', 'client'],
  clients: ['client', 'press', 'logo strip', 'partner'],
  team: ['team', 'staff', 'chef', 'founder', 'crew', 'people', 'office'],
  interior: ['interior', 'inside', 'venue', 'space', 'office', 'kitchen', 'dining', 'room'],
  venue: ['venue', 'location', 'site', 'hall', 'ground', 'outdoor'],
  speakers: ['speaker', 'panelist', 'host', 'presenter', 'line-up', 'lineup', 'artist'],
  sponsors: ['sponsor', 'partner', 'backer', 'supporter'],
  partners: ['partner', 'sponsor', 'supporter'],
  past: ['previous', 'last year', 'archive', '2019', '2021', 'recap', 'past'],
  events: ['event', 'meetup', 'flyer', 'session'],
  screens: ['screenshot', 'screen', 'dashboard', 'ui', 'app view', 'interface'],
  mockups: ['mockup', 'device', 'laptop shot', 'phone shot', 'in context'],
  brand: ['brand', 'guideline', 'palette', 'identity', 'stationery'],
  press: ['press', 'coverage', 'article', 'award', 'badge'],
  video: ['video', 'film', 'clip', 'teaser', 'trailer', 'loop', 'showreel', 'gif'],
  artist: ['artist', 'portrait', 'profile', 'headshot', 'me', 'photo of'],
  portrait: ['portrait', 'headshot', 'face', 'me', 'selfie'],
  headshots: ['headshot', 'portrait', 'speaking', 'stage'],
  artwork: ['artwork', 'album', 'single', 'cover', 'ep', 'sleeve', 'release art'],
  live: ['live', 'show', 'gig', 'concert', 'stage', 'crowd', 'backstage', 'performance'],
  food: ['food', 'dish', 'plate', 'meal', 'menu item'],
  menu: ['menu', 'card', 'list', 'price list'],
  support: ['support', 'endorsement', 'partner', 'ngo'],
  field: ['field', 'ground', 'protest', 'community', 'on site'],
  main: ['main', 'primary', 'first', 'feature'],
  gallery: ['gallery', 'photo', 'image', 'picture', 'shot'],
};

/** Description keywords that point at a target section. */
const SECTION_SYNONYMS = {
  hero: ['hero', 'first thing', 'front page', 'top of the page', 'landing', 'banner'],
  about: ['about', 'our story', 'story', 'who we are', 'mission', 'background', 'history', 'bio'],
  artistStory: ['story', 'artist story', 'bio', 'behind the music', 'origin'],
  features: ['feature', 'features', 'benefit', 'what you get', 'how it works'],
  productShowcase: ['product', 'products', 'collection', 'shop', 'drop', 'catalogue', 'catalog', 'merch'],
  gallery: ['gallery', 'photos', 'photography', 'lookbook', 'images', 'grid'],
  video: ['video', 'film', 'teaser', 'trailer', 'watch'],
  pricing: ['pricing', 'price', 'plans', 'packages', 'tiers'],
  testimonials: ['testimonial', 'reviews', 'quotes', 'what people say'],
  countdown: ['countdown', 'timer', 'launch date', 'drop date'],
  waitlist: ['waitlist', 'wait list', 'sign up', 'signup', 'early access', 'join'],
  contact: ['contact', 'get in touch', 'enquiry', 'booking', 'book'],
  faq: ['faq', 'questions'],
  social: ['social', 'instagram', 'tiktok', 'twitter', 'links'],
  cta: ['call to action', 'cta', 'closing', 'final'],
  newsletter: ['newsletter', 'subscribe', 'weekly', 'monthly'],
  footer: ['footer', 'bottom', 'legal'],
  eventDetails: ['details', 'venue', 'location', 'where', 'address', 'directions'],
  speakers: ['speaker', 'line-up', 'lineup', 'performer', 'artist', 'headliner'],
  schedule: ['schedule', 'timetable', 'agenda', 'program', 'running order'],
  tickets: ['ticket', 'admission', 'entry', 'rsvp'],
  menu: ['menu', 'dishes', 'food'],
  team: ['team', 'founders', 'people', 'staff', 'chefs'],
  stats: ['stats', 'numbers', 'metrics', 'impact'],
  logos: ['sponsor', 'partner', 'press', 'logo strip', 'as seen in'],
  album: ['album', 'release', 'record', 'artwork', 'single'],
  tracklist: ['tracklist', 'track list', 'songs', 'tracks'],
  preSave: ['pre-save', 'presave', 'pre-add', 'spotify', 'apple music'],
  solution: ['solution', 'how we fix', 'approach'],
  problem: ['problem', 'the gap', 'why'],
};

const CATEGORY_LABEL = {
  logo: 'Logo or mark',
  campaign: 'Campaign image',
  hero: 'Hero image',
  poster: 'Poster / key art',
  product: 'Product photo',
  lifestyle: 'Lifestyle photo',
  detail: 'Detail shot',
  work: 'Work sample',
  projects: 'Project image',
  clients: 'Client logo',
  team: 'Team photo',
  interior: 'Interior photo',
  venue: 'Venue photo',
  speakers: 'Speaker photo',
  sponsors: 'Sponsor logo',
  partners: 'Partner logo',
  past: 'Previous event photo',
  events: 'Event flyer',
  screens: 'Product screenshot',
  mockups: 'Mockup',
  brand: 'Brand asset',
  press: 'Press asset',
  video: 'Video',
  artist: 'Artist photo',
  portrait: 'Portrait',
  headshots: 'Portrait',
  artwork: 'Artwork',
  live: 'Live photo',
  food: 'Food photo',
  menu: 'Menu image',
  support: 'Supporter logo',
  field: 'Field photo',
  main: 'Main image',
  gallery: 'Photo',
  general: 'Custom asset',
};

/** Which sections each asset category is normally useful in, per website type. */
function recommendSections(category, websiteType, description = '') {
  const byType = {
    music: { artwork: ['hero', 'album', 'preSave'], artist: ['artistStory', 'hero'], live: ['gallery', 'artistStory'], video: ['video'] },
    event: { poster: ['hero'], venue: ['eventDetails', 'gallery'], speakers: ['speakers'], sponsors: ['logos'], past: ['gallery'] },
    product: { campaign: ['hero'], product: ['productShowcase', 'gallery'], lifestyle: ['gallery', 'about'], detail: ['gallery'] },
    startup: { screens: ['solution', 'productShowcase'], mockups: ['gallery'], team: ['team'], logo: ['nav', 'footer'] },
    app: { screens: ['hero', 'productShowcase'], mockups: ['gallery'], video: ['video'] },
    business: { hero: ['hero'], work: ['gallery'], team: ['team'], interior: ['about'] },
    restaurant: { hero: ['hero'], food: ['menu', 'gallery'], menu: ['menu'], interior: ['gallery', 'about'], team: ['team'] },
    portfolio: { projects: ['gallery'], portrait: ['about'], clients: ['logos'] },
    'personal-brand': { portrait: ['hero', 'about'], work: ['gallery'], press: ['logos'], headshots: ['gallery'] },
    campaign: { hero: ['hero'], field: ['gallery', 'about'], support: ['logos'] },
    community: { people: ['hero', 'gallery'], screens: ['features'], events: ['schedule'] },
  };
  const forCategory = (byType[websiteType] || {})[category];
  if (forCategory) return forCategory;
  const generic = {
    logo: ['nav', 'footer'],
    video: ['video'],
    gallery: ['gallery'],
    general: ['gallery'],
  };
  return generic[category] || ['gallery'];
}

/**
 * Reads an explicit placement instruction — "use it in the About section" —
 * which always beats Launchpad's own guess. Deliberately strict: a loose scan
 * of the whole note would move images the user never asked to move.
 */
function parseSectionIntent(description = '') {
  const text = String(description).toLowerCase();
  const explicit = text.match(/(?:use (?:it )?(?:in|for)|place (?:it )?in|put (?:it )?in|add (?:it )?to|goes in|goes into)\s+(?:the\s+|our\s+|my\s+)?([a-z -]{3,24}?)\s*(?:section|area|block|band|slot|page|$)/);
  if (!explicit) return null;
  const needle = explicit[1];
  for (const [section, words] of Object.entries(SECTION_SYNONYMS)) {
    if (words.some((w) => needle.includes(w))) return section;
  }
  return null;
}

/** Fallback signal: only used when the asset category says nothing. */
function matchSectionKeywords(text = '') {
  const haystack = String(text).toLowerCase();
  for (const [section, words] of Object.entries(SECTION_SYNONYMS)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(haystack))) return section;
  }
  return null;
}

/** Guess the asset category from filename + user description. Never fails. */
const FILLER_WORDS = new Set([
  'photo', 'photograph', 'picture', 'pic', 'image', 'img', 'shot', 'snap', 'scan', 'still', 'frame',
  'file', 'asset', 'upload', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'the', 'of', 'and', 'with', 'for',
]);
function categorise(asset, websiteType) {
  const haystack = [asset.filename, asset.name, asset.description, asset.originalSlot]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (asset.assetCategory && asset.assetCategory !== 'general' && CATEGORY_LABEL[asset.assetCategory]) {
    return { category: asset.assetCategory, matched: 'slot', keyword: null };
  }
  // Words like "photo", "shot" or "image" describe the file, not what is in it,
  // so they carry no signal of their own — "product photo of the runner" must
  // read as *product*, not as a portrait. A match on filler alone is kept as a
  // last resort.
  let best = null;
  let weak = null;
  for (const [category, words] of Object.entries(SLOT_SYNONYMS)) {
    for (const word of words) {
      const re = new RegExp(`(^| )${word.replace(/[- ]/g, '[- ]')}(/|s)?( |$)`);
      if (!re.test(haystack)) continue;
      const signal = word
        .split(/[ -]+/)
        .filter((token) => token && !FILLER_WORDS.has(token))
        .reduce((sum, token) => sum + token.length, 0);
      const candidate = { category, matched: 'keywords', keyword: word, score: signal + (haystack.startsWith(word) ? 3 : 0) };
      if (signal > 0) {
        if (!best || candidate.score > best.score) best = candidate;
      } else if (!weak) {
        weak = candidate;
      }
    }
  }
  best = best || weak;
  if (best) return { category: best.category, matched: best.matched, keyword: best.keyword };
  if (/\.(mp4|mov|webm|gif)$/i.test(asset.filename || '')) return { category: 'video', matched: 'mime', keyword: 'video' };
  if (/svg/i.test(asset.mime || '')) return { category: 'logo', matched: 'mime', keyword: 'svg' };
  return { category: websiteType === 'music' ? 'live' : 'general', matched: 'fallback', keyword: null };
}

/** Normalises an uploaded asset into the documented metadata shape. */
function hydrateAsset(asset, websiteType) {
  const { category, matched, keyword } = categorise(asset, websiteType);
  const fromDescription = parseSectionIntent(asset.description);
  const recommendedSections = recommendSections(category, websiteType, asset.description);
  return {
    ...asset,
    name: asset.name || prettifyFilename(asset.filename || 'asset'),
    description: asset.description || '',
    assetCategory: category,
    categoryLabel: CATEGORY_LABEL[category] || 'Custom asset',
    categorisedBy: matched,
    categorisedFrom: keyword,
    recommendedSections,
    suggestedSection: fromDescription || recommendedSections[0] || matchSectionKeywords(`${asset.description || ''} ${asset.filename || ''}`) || 'gallery',
    selectedSection: asset.selectedSection || fromDescription || null,
    caption: asset.caption || '',
  };
}

function prettifyFilename(filename) {
  return String(filename || 'asset')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
    .slice(0, 40);
}

/** Why an asset landed where it did — surfaced in the builder so it feels legible. */
function explainPlacement(asset, sectionType, websiteType) {
  const parts = [`${asset.categoryLabel || CATEGORY_LABEL[asset.assetCategory] || 'Image'}`];
  if (asset.selectedSection) parts.push(`you pinned it to ${labelOf(asset.selectedSection)}`);
  else if (asset.categorisedBy === 'keywords') parts.push(`“${asset.categorisedFrom}” in your note reads as ${labelOf(sectionType)}`);
  else if (asset.categorisedBy === 'slot') parts.push(`uploaded for ${labelOf(sectionType)}`);
  else parts.push(`${labelOf(websiteType)} sites usually use ${asset.assetCategory} images in ${labelOf(sectionType)}`);
  return parts.join(' — ') + '.';
}

const labelOf = (value) =>
  ({
    hero: 'the hero', about: 'About', gallery: 'the gallery', productShowcase: 'products', album: 'the release',
    preSave: 'pre-save', artistStory: 'the artist story', speakers: 'the line-up', team: 'the team', video: 'video',
    eventDetails: 'event details', logos: 'the logo strip', menu: 'the menu', nav: 'the header', footer: 'the footer',
    schedule: 'the schedule', features: 'features', pricing: 'pricing', tickets: 'tickets', countdown: 'the countdown',
    waitlist: 'the waitlist', cta: 'the closing call to action', solution: 'the solution block',
  }[value] || value);

/**
 * Assigns every asset to a section of the compiled spec. Mutates
 * `section.assets`, `spec.assetMap` and `asset.usage`.
 */
function assignAssets(spec, assets) {
  const hydrated = assets.map((a) => (a.assetCategory ? a : hydrateAsset(a, spec.websiteType)));
  spec.assets = hydrated;
  const map = [];
  const sections = spec.sections.filter((s) => !s.hidden);
  const byType = new Map(sections.map((s) => [s.type, s]));
  const used = new Set();

  const push = (section, asset, reason) => {
    if (!section) return false;
    section.assets = section.assets || [];
    if (!section.assets.includes(asset.id)) section.assets.push(asset.id);
    used.add(asset.id);
    map.push({ assetId: asset.id, filename: asset.filename, section: section.type, reason, slot: nextSlot(section, asset) });
    return true;
  };

  // 1. Explicit user choice wins.
  hydrated.forEach((asset) => {
    if (!asset.selectedSection) return;
    if (asset.selectedSection === 'nav' || asset.selectedSection === 'footer') {
      const target = byType.get(asset.selectedSection === 'nav' ? 'footer' : 'footer') || sections[sections.length - 1];
      if (push(target, asset, `You pinned ${asset.name} to the ${asset.selectedSection === 'nav' ? 'header' : 'footer'}.`)) {
        asset.usage = asset.selectedSection;
        spec[asset.assetCategory === 'logo' ? 'logoAssetId' : 'footerAssetId'] = asset.id;
        if (asset.assetCategory === 'logo') spec.logoAssetId = asset.id;
      }
      return;
    }
    const target = byType.get(asset.selectedSection);
    if (target && push(target, asset, `You chose ${labelOf(target.type)} for this image.`)) asset.usage = target.type;
  });

  // 2. Category-aware placement, respecting the recommended section list.
  hydrated.forEach((asset) => {
    if (used.has(asset.id)) return;
    if (asset.assetCategory === 'logo') {
      spec.logoAssetId = asset.id;
      used.add(asset.id);
      map.push({ assetId: asset.id, filename: asset.filename, section: 'nav', reason: `Logo set as the site mark — it appears in the header and footer.`, slot: 'logo' });
      asset.usage = 'nav';
      return;
    }
    const candidates = (asset.recommendedSections || []).filter((s) => byType.has(s));
    const target = candidates.map((t) => byType.get(t)).find(Boolean);
    if (target && push(target, asset, explainPlacement(asset, target.type, spec.websiteType))) {
      asset.usage = target.type;
      // Hero and showcase slots feed directly from the first image of that kind.
      if (target.type === 'hero' && !target.content.imageAssetId) target.content.imageAssetId = asset.id;
      if (target.type === 'album' && !target.content.artworkAssetId) target.content.artworkAssetId = asset.id;
      if (target.type === 'artistStory' && !target.content.imageAssetId) target.content.imageAssetId = asset.id;
      if (target.type === 'speakers') {
        const item = (target.content.items || []).find((i) => !i.imageAssetId);
        if (item) item.imageAssetId = asset.id;
      }
      if (target.type === 'team') {
        const item = (target.content.items || []).find((i) => !i.imageAssetId);
        if (item) item.imageAssetId = asset.id;
      }
      return;
    }
    // 3. Showcase slots take product images one by one.
    const showcase = byType.get('productShowcase');
    if (showcase && ['product', 'work', 'screens', 'mockups', 'main'].includes(asset.assetCategory)) {
      const item = (showcase.content.products || []).find((p) => !p.imageAssetId);
      if (item) {
        item.imageAssetId = asset.id;
        used.add(asset.id);
        showcase.assets.push(asset.id);
        map.push({ assetId: asset.id, filename: asset.filename, section: 'productShowcase', reason: `Matched to “${item.name}” as its product image.`, slot: `product:${item.name}` });
        asset.usage = 'productShowcase';
        return;
      }
    }
    // 4. Anything left goes to the gallery, which is designed to absorb extras.
    const gallery = byType.get('gallery') || sections.find((s) => s.type === 'about') || sections[0];
    if (gallery && push(gallery, asset, `Kept in ${labelOf(gallery.type)} so the image is not wasted. You can move it anywhere in the builder.`)) {
      asset.usage = gallery.type;
      if (gallery.content.assetIds) gallery.content.assetIds.push(asset.id);
      return;
    }
    asset.usage = null;
    map.push({ assetId: asset.id, filename: asset.filename, section: null, reason: 'Saved in the Assets library, not used yet — drag it onto a section to use it.', slot: 'library' });
  });

  spec.assetMap = map;
  spec.stats = { assets: hydrated.length, used: used.size, unused: hydrated.length - used.size };
  return spec;
}

function nextSlot(section, asset) {
  const count = (section.assets || []).length;
  return `${section.type}:${count}:${asset.assetCategory}`;
}

/** The ctx.assets view the section builders query while compiling. */
function createAssetView(assets, intent) {
  const hydrated = (assets || []).map((a) => (a.assetCategory && a.recommendedSections ? a : hydrateAsset(a, intent.websiteType)));
  const byCategory = (category) => hydrated.filter((a) => a.assetCategory === category);
  const first = (...categories) => {
    for (const c of categories) {
      const found = byCategory(c)[0];
      if (found) return found;
    }
    return null;
  };
  const view = {
    all: hydrated,
    byCategory: (c) => byCategory(c),
    forCategory: (c) => byCategory(c),
    forSection: (section) => hydrated.filter((a) => (a.selectedSection || a.suggestedSection) === section),
    campaignImage: first('campaign', 'hero', 'poster', 'main', 'artwork'),
    artwork: first('artwork', 'poster'),
    artist: first('artist', 'portrait', 'headshots'),
    portrait: first('portrait', 'artist', 'headshots'),
    interior: first('interior', 'venue', 'field', 'work'),
    video: byCategory('video')[0] || hydrated.find((a) => /mp4|mov|webm/.test(a.mime || '')) || null,
    screens: byCategory('screens').concat(byCategory('mockups')),
  };
  if (!view.campaignImage && hydrated.length) view.campaignImage = hydrated[0];
  if (!view.any && hydrated.length) view.any = hydrated[0];
  return view;
}

module.exports = {
  hydrateAsset,
  categorise,
  parseSectionIntent,
  matchSectionKeywords,
  recommendSections,
  assignAssets,
  createAssetView,
  CATEGORY_LABEL,
  SLOT_SYNONYMS,
  SECTION_SYNONYMS,
};
