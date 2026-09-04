/**
 * Section compilation: turns an `intent` (see interpret.js) into the ordered,
 * structured specification the React renderer consumes. Every section is data —
 * content + settings + asset references — so the builder can edit it, the AI
 * edit endpoint can patch it, and publishing can snapshot it.
 */

const { createCopy, fill, pick, hashString, MATERIALS, ROLES } = require('./copy');
const { typeById } = require('../catalog/websiteTypes');
const { analyze, buildTheme, buildPlatformConfig, utils } = require('./interpret');
const { createAssetView, assignAssets } = require('./assets');

const { isDark, mix, round } = utils;
const uid = (prefix, n) => `${prefix}-${String(n).padStart(2, '0')}`;
const money = (n) => `₦${n.toLocaleString('en-NG')}`;

/** Values injected into the copy banks so generated text quotes the user back. */
function buildContext(intent) {
  const rand = createCopy(intent.seed, {}).rand;
  const noun = deriveNoun(intent);
  const pricePool = intent.prices.length ? intent.prices : [money(38000 + Math.floor(rand() * 20) * 2500)];
  const launchDate = intent.launchDate || new Date(Date.now() + (18 + Math.floor(rand() * 26)) * 86400000);
  const formatted = formatDate(launchDate);
  return {
    websiteType: intent.websiteType,
    brand: intent.brand,
    noun,
    audience: intent.audience,
    value:
      intent.extraNotes && intent.extraNotes.length > 8
        ? intent.extraNotes.split(/[.\n]/)[0].toLowerCase().replace(/^(i want|we want|because)\s+/i, '')
        : defaultValue(intent.websiteType, intent),
    count: String(120 + Math.floor(rand() * 8) * 60),
    days: String(3 + Math.floor(rand() * 5)),
    hours: String(1 + Math.floor(rand() * 3)),
    weeks: String(2 + Math.floor(rand() * 5)),
    seconds: String(1 + Math.floor(rand() * 4)),
    points: String(24 + Math.floor(rand() * 40)),
    years: String(3 + Math.floor(rand() * 12)),
    price: pricePool[0],
    prices: pricePool,
    date: formatted.long,
    dateShort: formatted.short,
    iso: launchDate.toISOString(),
    time: `${18 + Math.floor(rand() * 2)}:00`,
    venue: intent.venue || pick(rand, ['Freedom Park', 'The Yard, Ikoyi', 'Nike Art Gallery', 'Grounds for Cultural Services', 'Warehouse 9']),
    city: intent.city,
    year: intent.year,
    material: pick(rand, MATERIALS),
    role: pick(rand, ROLES),
    format: pick(rand, ['panel', 'workshop', 'listening', 'keynote', 'open-air']),
    act: String(4 + Math.floor(rand() * 5)),
    unit: pick(rand, ['workspace', 'seat', 'member', 'project']),
    phone: `+234 80${Math.floor(rand() * 90000 + 10000)} ${Math.floor(rand() * 900 + 100)}`,
    radius: String(12 + Math.floor(rand() * 20)),
    launchDate,
  };
}

function deriveNoun(intent) {
  const d = intent.description;
  const patterns = [
    /(?:premium|luxury|new|independent|local|modern)?\s*([a-z-]{3,18})\s+(?:brand|label|studio|agency|company|platform|app|festival|event|restaurant|cafe|community|campaign|portfolio|release|album|ep|line|collection)/i,
    /(?:launching|building|making|releasing)\s+(?:a|an|my|our)?\s*([a-z-]{3,18})/i,
    /([a-z-]{4,18})\s+(?:with|for)\s+(?:large|big|bold|cinematic)/i,
  ];
  for (const re of patterns) {
    const m = d.match(re);
    if (m && m[1] && !/^(website|site|page|thing|stuff)$/.test(m[1])) return m[1].toLowerCase();
  }
  return { product: 'product', startup: 'workflow', business: 'service', event: 'night', app: 'app', music: 'record', 'personal-brand': 'work', community: 'community', campaign: 'campaign', portfolio: 'work', restaurant: 'menu', other: 'project' }[intent.websiteType] || 'project';
}

function defaultValue(type, intent) {
  const map = {
    product: 'less, but better',
    startup: 'nobody has to chase an update again',
    business: 'the job gets done once',
    event: 'one night people will still be talking about',
    app: 'your phone stops being the bottleneck',
    music: 'it sounds like the room it was made in',
    'personal-brand': 'senior attention on a small-team budget',
    community: 'people who actually turn up',
    campaign: 'pressure with a paper trail',
    portfolio: 'work that ships and keeps working',
    restaurant: 'cooking that does not need explaining',
    other: 'it should have existed years ago',
  };
  const m = intent.description.match(/(?:because|so that|which means|the point is)\s+([^.\n]{8,80})/i);
  return m ? m[1].trim() : map[type];
}

function formatDate(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return {
    long: `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`,
    short: `${date.getDate()} ${months[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`,
  };
}

/* ------------------------------------------------------------- section defs */

const BUILDERS = {
  hero(ctx) {
    const { intent, theme, platform, copy } = ctx;
    const campaign = ctx.assets.campaignImage;
    const layout = intent.design && intent.design.preview && intent.design.preview.kind === 'hero-split'
      ? 'split'
      : theme.effects.includes('letterbox') || intent.typeDef.heroLayout === 'fullbleed'
        ? 'fullbleed'
        : intent.typeDef.heroLayout === 'centered' || !campaign ? 'centered' : intent.typeDef.heroLayout;
    return {
      content: {
        eyebrow: copy.heroEyebrow(),
        headline: intent.tagline && intent.tagline.length < 60 ? intent.tagline : firstSentence(intent.description, copy.heroHeadline()),
        subheadline: copy.heroSub(),
        primary: { label: intent.cta || copy.ctaLabel(), action: primaryAction(intent) },
        secondary: intent.websiteType === 'music' ? { label: 'Hear the first single', action: '#tracklist' } : { label: secondaryLabel(intent), action: secondaryTarget(intent) },
        layout,
        imageAssetId: layout === 'centered' ? null : campaign ? campaign.id : null,
        overlay: layout === 'fullbleed' ? (isDark(theme.colors.background) ? 0.66 : 0.4) : 0,
        badges: badgesFor(ctx),
        portraitAssetId: ctx.assets.portrait ? ctx.assets.portrait.id : null,
        meta: ctx.assets.artwork ? { artworkAssetId: ctx.assets.artwork.id } : null,
        minHeight: platform.mode === 'mobile' ? '82vh' : '88vh',
      },
      settings: { align: layout === 'centered' ? 'center' : layout === 'split' ? 'left' : 'bottom-left', padding: 'xl', bleed: layout === 'fullbleed' },
    };
  },

  about(ctx) {
    const { copy, theme } = ctx;
    return {
      content: {
        heading: ctx.intent.websiteType === 'personal-brand' ? 'Who is behind this' : `Why ${ctx.intent.brand} exists`,
        body: copy.about(),
        bullets: [
          `Started in ${ctx.ctx.city}, still ${ctx.ctx.city}`,
          `Made for ${ctx.ctx.audience}`,
          `${ctx.ctx.value} — that is the whole brief`,
        ],
        imageAssetId: ctx.assets.interior ? ctx.assets.interior.id : ctx.assets.any ? ctx.assets.any.id : null,
        stats: [
          { value: `${ctx.ctx.years}`, label: 'founding year' },
          { value: `${ctx.ctx.count}`, label: labelForCount(ctx.intent.websiteType) },
          { value: `${ctx.ctx.days}`, label: 'day reply, maximum' },
        ],
      },
      settings: { columns: 2, padding: 'lg', rule: theme.effects.includes('rules') },
    };
  },

  features(ctx) {
    const items = customFeatures(ctx) || ctx.copy.featureList(ctx.intent.websiteType === 'music' ? 3 : 4);
    return {
      content: {
        heading: ctx.intent.goal ? `What that looks like in practice` : `How ${ctx.intent.brand} works`,
        sub: ctx.intent.audience ? `Built with ${ctx.intent.audience}, not for a theoretical someone.` : '',
        items: items.map((item, i) => ({ ...item, icon: ICONS[i % ICONS.length] })),
        columns: 3,
      },
      settings: { padding: 'lg', variant: ctx.theme.radius >= 16 ? 'cards' : 'grid' },
    };
  },

  productShowcase(ctx) {
    const { intent } = ctx;
    const products = productsFor(ctx);
    return {
      content: {
        heading: intent.websiteType === 'startup' || intent.websiteType === 'app' ? `${intent.brand}, in the product` : 'The drop',
        sub: intent.websiteType === 'product' ? `Made in runs of ${ctx.ctx.count}. Restocks are announced to the waitlist first.` : 'Everything below is real, available and priced without a sales call.',
        products,
        layout: products.length === 1 ? 'feature' : 'grid',
        note: 'Prices include duties for local orders.',
      },
      settings: { padding: 'lg', columns: products.length > 2 ? 3 : 2, hoverReveal: true },
    };
  },

  gallery(ctx) {
    const images = ctx.assets.forSection('gallery');
    const layout = ctx.platform.mode === 'mobile' ? 'filmstrip' : images.length > 5 ? 'masonry' : 'grid';
    return {
      content: {
        heading: ctx.intent.websiteType === 'portfolio' ? 'Selected work' : ctx.intent.websiteType === 'restaurant' ? 'The room, the plates' : 'Shot on the phone, in the room',
        sub: images.length ? '' : 'Add a few photos in the builder and they will appear here automatically.',
        assetIds: images.map((a) => a.id),
        captions: ctx.intent.websiteType === 'portfolio' ? 'Project year and client on hover' : 'off',
        layout,
      },
      settings: { padding: 'lg', gaps: 'tight', aspect: '4/5' },
    };
  },

  video(ctx) {
    const asset = ctx.assets.video;
    return {
      content: {
        heading: 'Watch it move',
        body: asset && asset.description ? asset.description : `A ninety-second cut of ${ctx.intent.brand}. Sound on, obviously.`,
        posterAssetId: (asset && asset.posterAssetId) || (ctx.assets.campaignImage ? ctx.assets.campaignImage.id : null),
        url: asset ? asset.url || null : null,
        caption: asset ? asset.name || 'Untitled cut' : 'Teaser — press play',
        ratio: '16/9',
      },
      settings: { padding: 'lg', frame: true, letterbox: ctx.theme.effects.includes('letterbox') },
    };
  },

  pricing(ctx) {
    const plans = plansFor(ctx);
    return {
      content: {
        heading: 'Pricing, up front',
        sub: `No demo call required. ${ctx.intent.websiteType === 'startup' ? 'Cancel by replying to any invoice.' : 'Everything includes tax.'}`,
        plans,
        note: ctx.intent.websiteType === 'startup' ? 'Annual is two months free, no lock-in clauses.' : 'Payment on delivery, receipts by email.',
      },
      settings: { padding: 'lg', emphasiseMiddle: true },
    };
  },

  testimonials(ctx) {
    return {
      content: {
        heading: 'What people said after',
        items: ctx.copy.testimonials(ctx.platform.mode === 'mobile' ? 2 : 3),
        layout: ctx.theme.effects.includes('rules') ? 'quotes' : 'cards',
      },
      settings: { padding: 'md', rule: true },
    };
  },

  countdown(ctx) {
    const target = ctx.ctx.launchDate;
    return {
      content: {
        heading: `${ctx.intent.brand} ${ctx.intent.websiteType === 'music' ? 'is out' : ctx.intent.websiteType === 'event' ? 'opens' : 'drops'} in`,
        note: `${formatDate(target).long}, ${ctx.ctx.time} ${ctx.ctx.city === 'Lagos' ? 'WAT' : 'local time'}`,
        targetIso: target.toISOString(),
        labels: ['days', 'hrs', 'min', 'sec'],
        display: ctx.platform.mode === 'mobile' ? 'stack' : 'slabs',
        cta: { label: ctx.intent.cta || ctx.copy.ctaLabel(), action: '#waitlist' },
      },
      settings: { padding: 'md', band: true, mono: true },
    };
  },

  waitlist(ctx) {
    return {
      content: {
        heading: `Get on the ${ctx.intent.brand} list`,
        body: `Two emails, maximum: one when the ${ctx.ctx.noun} opens, one when it closes. Positions go out in order.`,
        placeholder: 'you@email.com',
        ctaLabel: 'Join the waitlist',
        incentives: [
          `${ctx.ctx.days} hours early access`,
          'A number you can screenshot',
          'No resale drama',
        ],
        privacy: 'We never pass your address on. One click to leave.',
        successCopy: `You are on the list. We will email ${ctx.ctx.date}.`,
      },
      settings: { padding: 'md', fields: ['email'], positionCounter: true },
    };
  },

  newsletter(ctx) {
    return {
      content: {
        heading: 'The monthly note',
        body: `What ${ctx.intent.brand} is working on, once a month, written by the people doing it.`,
        placeholder: 'you@email.com',
        ctaLabel: 'Subscribe',
        cadence: 'First Monday, 9am',
      },
      settings: { padding: 'md', fields: ['email'] },
    };
  },

  contact(ctx) {
    return {
      content: {
        heading: 'Talk to a person',
        body: `${ctx.intent.websiteType === 'business' ? 'Call, or send the details and we will quote it back the same day.' : 'Questions, collaborations, press — this form reaches everyone.'}`,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'email', required: true },
          { key: 'message', label: 'What do you need?', type: 'textarea', required: true },
        ],
        channels: [
          { label: 'Call', value: ctx.ctx.phone, kind: 'tel' },
          { label: 'Email', value: `hello@${ctx.slug}.app`, kind: 'mailto' },
          { label: 'Studio', value: `${ctx.ctx.city} · Mon–Fri ${9}:${30}–${17}:${30}`, kind: 'text' },
        ],
        note: 'We reply inside a day. If it is urgent, call.',
      },
      settings: { padding: 'lg', columns: 2 },
    };
  },

  faq(ctx) {
    return {
      content: { heading: 'The questions we get', items: ctx.copy.faq(ctx.platform.mode === 'mobile' ? 3 : 4), layout: 'accordion' },
      settings: { padding: 'lg', columns: 1 },
    };
  },

  social(ctx) {
    const handles = ['instagram', 'tiktok', 'x', 'youtube', 'spotify', 'bandcamp'];
    const chosen = handles.slice(0, ctx.intent.websiteType === 'music' ? 5 : 3);
    return {
      content: {
        heading: ctx.intent.websiteType === 'music' ? 'Where it lives' : 'Elsewhere',
        links: chosen.map((p) => ({ platform: p, handle: `@${ctx.intent.brandLower.replace(/[^a-z0-9]/g, '')}`, url: `https://${p === 'x' ? 'x.com' : p === 'spotify' ? 'open.spotify.com' : p}.${p === 'bandcamp' ? 'bandcamp.com' : ''}/${ctx.intent.brandLower.replace(/[^a-z0-9]/g, '')}` })),
      },
      settings: { padding: 'md', layout: 'row' },
    };
  },

  cta(ctx) {
    const pair = ctx.copy.closerPair();
    return {
      content: {
        heading: pair.headline,
        body: pair.body,
        primary: { label: ctx.intent.cta || ctx.copy.ctaLabel(), action: primaryAction(ctx.intent) },
        secondary: { label: 'Read the story', action: '#about' },
        note: ctx.intent.websiteType === 'event' ? `${ctx.ctx.count} tickets left at this tier.` : `Reply within ${ctx.ctx.hours} hours, usually sooner.`,
      },
      settings: { padding: 'xl', fullBleed: true, invert: !isDark(ctx.theme.colors.background) },
    };
  },

  footer(ctx) {
    const intent = ctx.intent;
    return {
      content: {
        tagline: intent.tagline || `${intent.brand} — ${ctx.ctx.noun} for ${ctx.ctx.audience}.`,
        columns: [
          { title: intent.brand, links: [labelForSection(ctx.sections, 'about'), labelForSection(ctx.sections, 'gallery'), labelForSection(ctx.sections, 'contact')].filter(Boolean) },
          { title: 'Elsewhere', links: ['Instagram', 'TikTok', 'Newsletter'] },
          { title: 'Legal', links: ['Terms', 'Privacy', 'Refunds'] },
        ],
        legal: `© ${new Date().getFullYear()} ${intent.brand}. All rights reserved.`,
        social: ['instagram', 'tiktok', 'x'],
        credits: 'Built with Launchpad',
      },
      settings: { padding: 'md', columns: 3 },
    };
  },

  logos(ctx) {
    const names = ctx.intent.websiteType === 'event'
      ? ['Indie Lab', 'Yaba Cream', 'Radio Alté', 'Culture Bureau', 'The Yard']
      : ['TechCabal', 'Techpoint', 'BellaNaija', 'Pulse', 'Guardian Weekender'];
    return {
      content: { heading: `${ctx.intent.brand} in the press`, items: names.map((name) => ({ name })) },
      settings: { padding: 'sm', layout: 'strip', muted: true },
    };
  },

  stats(ctx) {
    return {
      content: {
        heading: 'The numbers so far',
        items: [
          { value: `${ctx.ctx.count}`, label: 'people already in' },
          { value: `${ctx.ctx.points}%`, label: 'who came back' },
          { value: `${ctx.ctx.hours}h`, label: 'average reply' },
          { value: ctx.ctx.prices[0], label: 'starting price, unchanged' },
        ],
      },
      settings: { padding: 'md', layout: 'row', band: true },
    };
  },

  eventDetails(ctx) {
    return {
      content: {
        heading: 'Everything you need',
        items: [
          { label: 'Date', value: ctx.ctx.date },
          { label: 'Doors', value: ctx.ctx.time },
          { label: 'Where', value: `${ctx.ctx.venue}, ${ctx.ctx.city}` },
          { label: 'Dress', value: ctx.intent.websiteType === 'event' ? 'Whatever you can dance in' : 'Come as you are' },
          { label: 'Age', value: '18+' },
          { label: 'Accessibility', value: 'Step-free throughout, BSL on request' },
        ],
        note: 'Re-entry allowed until 22:00. No glass, no outside drinks.',
      },
      settings: { padding: 'lg', layout: 'definition-list' },
    };
  },

  speakers(ctx) {
    const named = ctx.intent.speakers.length ? ctx.intent.speakers : ['Ada Okonkwo', 'Bisi Adeniran', 'Kwame Mensah', 'Zainab Bello'];
    const photos = ctx.assets.forCategory('speakers');
    return {
      content: {
        heading: 'On the stage',
        sub: ctx.intent.websiteType === 'event' ? 'Four rooms, no overlaps longer than ten minutes.' : '',
        items: named.slice(0, 4).map((name, i) => ({
          name,
          role: ['Creative director', 'Head of product', 'Founder', 'Producer'][i % 4],
          topic: ['Designing for the next 100 million', 'Small teams, outsized shipping', 'What the data actually said', 'Making it feel expensive on a budget'][i % 4],
          imageAssetId: photos[i] ? photos[i].id : null,
        })),
      },
      settings: { padding: 'lg', columns: 4, photos: photos.length > 0 },
    };
  },

  schedule(ctx) {
    const slots = [
      ['17:00', 'Doors + record fair', 'Foyer'],
      ['18:15', 'Set one', 'Main stage'],
      ['19:30', 'Panel: the next 100 million', 'Stage two'],
      ['21:00', 'Headline', 'Main stage'],
      ['23:00', 'After hours', 'Warehouse'],
    ];
    return {
      content: {
        heading: 'The running order',
        sub: 'Times are kept. The last set always slips by ten, and we apologise.',
        days: [{ label: ctx.ctx.date, slots: slots.map(([time, title, who]) => ({ time, title, who })) }],
      },
      settings: { padding: 'lg', layout: 'rows' },
    };
  },

  tickets(ctx) {
    return {
      content: {
        heading: 'Tickets',
        tiers: [
          { name: 'Early', price: ctx.ctx.prices[0], unit: 'one ticket', perks: ['Entry all night', 'Fast lane at the door', 'Re-entry until 22:00'], status: 'sold out', cta: 'Join the release list' },
          { name: 'Standard', price: money(Number(String(ctx.ctx.prices[0]).replace(/[^0-9]/g, '') || 12000) + 8000), unit: 'one ticket', perks: ['Entry all night', 'Record fair access', 'Free transfer to a friend'], status: `${ctx.ctx.count} left`, cta: 'Get standard' },
          { name: 'Table of 6', price: money(Number(String(ctx.ctx.prices[0]).replace(/[^0-9]/g, '') || 12000) * 5), unit: 'six seats', perks: ['Reserved table', 'Bottle service', 'Cloakroom included'], status: '2 left', cta: 'Book a table' },
        ],
        note: 'All tiers include the after-hours room. No hidden booking fees.',
      },
      settings: { padding: 'lg', emphasiseMiddle: true },
    };
  },

  menu(ctx) {
    return {
      content: {
        heading: 'The menu',
        groups: [
          {
            title: 'To start',
            items: [
              { name: 'Peppered snail, agbada butter', desc: 'scotch bonnet, lime, hot bread', price: money(6500) },
              { name: 'Yam and egg, smoked pepper', desc: 'aged ogi, spring onion', price: money(4800) },
              { name: 'Charred okra, locust bean', desc: 'vegan, gluten free', price: money(4200) },
            ],
          },
          {
            title: 'Mains',
            items: [
              { name: 'Whole grilled sea bass', desc: 'ata din din, burnt lemon', price: money(14500) },
              { name: 'Goat Jollof, 48-hour short rib', desc: 'for two, order ahead', price: money(26000) },
              { name: 'Suya-spiced lamb, onion rejare', desc: 'coal-fired, medium', price: money(15800) },
            ],
          },
        ],
        note: 'Menu changes when the market changes. Kitchen open until 22:30.',
      },
      settings: { padding: 'lg', leaders: true },
    };
  },

  team(ctx) {
    const photos = ctx.assets.forCategory('team');
    const names = ['Ada Okonkwo', 'Bisi Adeniran', 'Kwame Mensah'];
    return {
      content: {
        heading: `${ctx.intent.brand}, out loud`,
        sub: 'Small on purpose. You deal with the people who make the thing.',
        items: names.map((name, i) => ({
          name,
          role: ['Founder, creative', 'Head of product', 'Studio manager'][i],
          bio: ['Started this in a spare room and never moved out.', 'Ships the boring parts properly, which is most of them.', 'Keeps the calendar, the suppliers and your sanity.'][i],
          imageAssetId: photos[i] ? photos[i].id : null,
        })),
      },
      settings: { padding: 'lg', columns: 3 },
    };
  },

  problem(ctx) {
    return {
      content: {
        heading: `The part nobody owns`,
        body: `Teams like yours run ${ctx.ctx.noun} on a spreadsheet held together by one person who remembers the formulas. When they go on leave, everything stalls.`,
        points: [
          'Status lives in a group chat, so it is never one place',
          'Half the tools exist to fix the other half',
          'Nobody can answer "what is the actual number?" without a meeting',
        ],
      },
      settings: { padding: 'lg', variant: 'statement' },
    };
  },

  solution(ctx) {
    return {
      content: {
        heading: `${ctx.intent.brand} is the one place`,
        body: `One surface for ${ctx.ctx.noun}, with the audit trail, the number, and the reminder — so nobody has to be the person who remembers.`,
        points: [
          'Import from a CSV in under a day',
          'Digests instead of notifications',
          `Priced per ${ctx.ctx.unit}, not per seat`,
        ],
        imageAssetId: (ctx.assets.screens && ctx.assets.screens[0] ? ctx.assets.screens[0].id : null),
      },
      settings: { padding: 'lg', variant: 'split' },
    };
  },

  album(ctx) {
    return {
      content: {
        heading: ctx.intent.tagline || `${ctx.intent.brand}: the record`,
        blurb: `Recorded over ${ctx.ctx.years} weeks in ${ctx.ctx.city}. Mixed in the same room, mastered elsewhere.`,
        artworkAssetId: ctx.assets.artwork ? ctx.assets.artwork.id : null,
        meta: [
          { label: 'Release', value: ctx.ctx.dateShort },
          { label: 'Length', value: `${9 + (hashString(ctx.intent.brand) % 6)} min` },
          { label: 'Label', value: 'Self-released' },
          { label: 'Formats', value: 'Digital, 180g vinyl' },
        ],
        formats: ['Digital', 'Vinyl — 300 copies', 'Cassette, limited'],
      },
      settings: { padding: 'lg', layout: 'artwork-left' },
    };
  },

  tracklist(ctx) {
    const titles = ctx.intent.tracks.length
      ? ctx.intent.tracks
      : ['Intro (Doors Closed)', 'Nova', 'Long Night Home', 'Interlude 3AM', 'Afterglow', 'Last Call', 'Outro (You Left The Light)'];
    return {
      content: {
        heading: 'Track list',
        items: titles.slice(0, 9).map((title, i) => ({
          n: String(i + 1).padStart(2, '0'),
          title,
          duration: `${2 + (i % 3)}:${String((i * 17) % 60).padStart(2, '0')}`,
          note: i === 1 ? 'single, out now' : i === 4 ? 'feat. Zainab Bello' : '',
        })),
        note: 'Full record lands on your library automatically if you pre-save.',
      },
      settings: { padding: 'md', layout: 'rows', hoverScrub: true },
    };
  },

  artistStory(ctx) {
    return {
      content: {
        heading: 'How it came about',
        paragraphs: [
          `${ctx.intent.brand} started making ${ctx.ctx.noun}s in ${ctx.ctx.city} with a borrowed interface and a microphone held to a door. ${ctx.ctx.value}.`,
          `The record was cut over ${ctx.ctx.years} weeks with the doors shut. No grid, no correction — what you hear is the room and the takes that worked.`,
          `It is out ${ctx.ctx.date}. The film follows the same day, in one take.`,
        ],
        imageAssetId: ctx.assets.artist ? ctx.assets.artist.id : ctx.assets.any ? ctx.assets.any.id : null,
        quote: 'If it sounds a little dangerous, that is because it was.',
      },
      settings: { padding: 'lg', layout: 'editorial' },
    };
  },

  preSave(ctx) {
    return {
      content: {
        heading: 'One tap now, in your library on day one',
        body: `Pre-saving ${ctx.intent.brand} means the record drops straight into Spotify, Apple Music and Tidal at 00:00 on ${ctx.ctx.date}. No follow-up, no algorithm lottery.`,
        platforms: [
          { name: 'Spotify', label: 'Pre-save', url: `https://spotify.link/${ctx.slug}` },
          { name: 'Apple Music', label: 'Pre-add', url: `https://music.apple.com/${ctx.slug}` },
          { name: 'Tidal', label: 'Pre-save', url: `https://tidal.com/${ctx.slug}` },
          { name: 'Bandcamp', label: 'Wishlist', url: `https://${ctx.slug}.bandcamp.com` },
        ],
        dateLabel: ctx.ctx.dateShort,
        ctaLabel: 'Pre-save now',
      },
      settings: { padding: 'md', layout: 'buttons' },
    };
  },
};

const ICONS = ['Sparkles', 'ShieldCheck', 'Gauge', 'Layers', 'Repeat2', 'Lock', 'Zap', 'Compass'];

function labelForSection(sections, type) {
  const found = (sections || []).find((s) => s.type === type);
  return found ? { label: found.label, action: `#${found.type}` } : null;
}

function labelForCount(type) {
  return {
    product: 'units per run',
    startup: 'teams onboarded',
    business: 'jobs a month',
    event: 'people expected',
    app: 'installs in week one',
    music: 'copies pressed',
    'personal-brand': 'projects a year',
    community: 'members, capped',
    campaign: 'signatures a day',
    portfolio: 'clients, all told',
    restaurant: 'covers a night',
    other: 'people involved',
  }[type] || 'people involved';
}

function firstSentence(text, fallback) {
  const m = String(text || '').match(/(?:i want|i'?d like|make me|create a?)\s+(?:me\s+)?(?:a|an)?\s*([^.\n"]{18,90})/i);
  if (!m) return fallback;
  const fragment = m[1].replace(/\b(website|site|landing page|webpage|page)\b.*/i, '').replace(/\s+(and|with|that|which|for)\s*$/i, '').trim();
  const words = fragment.split(/\s+/).filter(Boolean);
  // Only honour it when it reads like a promise, not a colour or mood note.
  if (words.length < 4 || words.length > 11 || fragment.length < 24) return fallback;
  if (/[-–]$/.test(fragment)) return fallback;
  if (/^(black|white|dark|light|minimal|bold|futuristic|clean|premium|luxury)\b/i.test(fragment) && words.length < 6) return fallback;
  return titleish(fragment);
}

const titleish = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function primaryAction(intent) {
  if (intent.websiteType === 'event') return '#tickets';
  if (intent.websiteType === 'music') return '#pre-save';
  if (intent.websiteType === 'restaurant') return '#contact';
  if (intent.websiteType === 'business' || intent.websiteType === 'personal-brand') return '#contact';
  if (intent.websiteType === 'startup' || intent.websiteType === 'app') return '#pricing';
  return '#waitlist';
}

function secondaryLabel(intent) {
  return {
    product: 'See the collection',
    startup: 'How it works',
    business: 'What we do',
    event: 'See the line-up',
    app: 'See it in action',
    music: 'Read the story',
    'personal-brand': 'Selected work',
    community: 'What happens weekly',
    campaign: 'Why it matters',
    portfolio: 'Recent work',
    restaurant: 'Read the menu',
    other: 'Read more',
  }[intent.websiteType];
}

function secondaryTarget(intent) {
  return {
    product: '#gallery',
    startup: '#features',
    business: '#features',
    event: '#speakers',
    app: '#features',
    music: '#artist-story',
    'personal-brand': '#gallery',
    community: '#features',
    campaign: '#about',
    portfolio: '#gallery',
    restaurant: '#menu',
    other: '#about',
  }[intent.websiteType];
}

function badgesFor(ctx) {
  const { intent } = ctx;
  if (intent.websiteType === 'startup' || intent.websiteType === 'app') {
    return ['No card to start', 'Cancel any time', 'SOC2 in progress'];
  }
  if (intent.websiteType === 'product') return [`Run of ${ctx.ctx.count}`, 'Ships worldwide', 'Free returns'];
  if (intent.websiteType === 'event') return ['18+', 'Step-free venue', 'Re-entry allowed'];
  if (intent.websiteType === 'music') return ['Self-released', 'Out on vinyl', `Pre-save open`];
  if (intent.websiteType === 'restaurant') return ['Dinner Tue–Sun', 'Walk-ins at the bar', 'Vegan menu'];
  return ['Independent', 'Made with care', 'Since ' + ctx.ctx.year];
}

function customFeatures(ctx) {
  const list = ctx.intent.features;
  if (!list.length) return null;
  return list.slice(0, 6).map((raw, i) => {
    const [title, rest] = String(raw).split(/[-–:|]/).map((s) => s.trim());
    return {
      title: titleish(title),
      body: rest || ['It is faster than the alternative and it never asks you to log anything.', `Built for ${ctx.ctx.audience}, which is why the defaults are already right.`, 'Nothing to configure. Nothing to remember.'][i % 3],
      icon: ICONS[i % ICONS.length],
    };
  });
}

function productsFor(ctx) {
  const { intent } = ctx;
  const images = ctx.assets.forCategory('product');
  const named = intent.products.length
    ? intent.products
    : intent.websiteType === 'startup'
      ? ['Starter', 'Team', 'Company']
      : ['Drop 01 — Shell Jacket', 'Drop 01 — Cargo Trouser', 'Drop 01 — Heavy Tee'];
  const base = Number(String(ctx.ctx.prices[0]).replace(/[^0-9]/g, '')) || 45000;
  return named.slice(0, 3).map((name, i) => ({
    name: titleish(name),
    price: intent.websiteType === 'startup' ? ['₦0', money(base), 'Let’s talk'][i] : money(base + i * 12000),
    unit: intent.websiteType === 'startup' ? (i === 0 ? 'for one seat' : i === 1 ? 'per seat / month' : 'custom') : 'incl. tax',
    blurb:
      intent.websiteType === 'startup'
        ? ['Everything you need to prove it works.', 'Sharing, audit trail, digest and SSO.', 'Procurement forms, security review, a Slack channel.'][i]
        : ['Water-repelled cotton twill, taped seams, cut long.', 'Two-way zip cargo, ripstop, six pockets.', `240gsm organic jersey, boxy through the shoulder, made in ${ctx.ctx.city}.`][i],
    imageAssetId: images[i] ? images[i].id : null,
    tag: i === 0 ? 'Most wanted' : i === 1 ? 'Restocking' : '',
    cta: intent.websiteType === 'startup' ? (i === 0 ? 'Start free' : i === 1 ? 'Choose Team' : 'Talk to us') : 'Reserve on the list',
    features:
      intent.websiteType === 'startup'
        ? [['Up to 3 seats', 'CSV import', 'Email support'], ['Unlimited seats', 'SSO + audit log', 'Priority support'], ['Everything in Team', 'Custom contract', 'Named engineer']] :
        [['Water-repelled, taped seams'], ['Ripstop, six pockets'], ['240gsm organic jersey']],
  }));
}

function plansFor(ctx) {
  const { intent } = ctx;
  if (intent.websiteType === 'event' || intent.websiteType === 'music' || intent.websiteType === 'campaign') return [];
  const base = Number(String(ctx.ctx.prices[0]).replace(/[^0-9]/g, '')) || 18000;
  return [
    { name: 'Starter', price: '₦0', unit: 'while in early access', blurb: 'For one person with one problem to fix.', features: ['Up to 3 seats', 'CSV import', 'Community support'], featured: false, cta: 'Start free' },
    { name: 'Pro', price: money(base), unit: `per ${ctx.ctx.unit} / month`, blurb: `The plan ${ctx.ctx.audience} actually pick.`, features: ['Unlimited seats', 'Digest + audit trail', 'SSO', 'Priority reply in under ' + ctx.ctx.hours + 'h'], featured: true, cta: 'Start with Pro' },
    { name: 'Company', price: 'Let’s talk', unit: 'annual', blurb: 'When procurement enters the room.', features: ['Everything in Pro', 'Custom contract + DPA', 'Named engineer', 'Security review pack'], featured: false, cta: 'Talk to us' },
  ];
}

/* ------------------------------------------------------------------- engine */

function planSections(intent) {
  const typeDef = typeById(intent.websiteType);
  const defaults = typeDef.sections.slice();
  const wanted = new Set([...(intent.requestedSections || [])]);
  const desired = new Set(intent.details.desiredSections || []);
  const excluded = new Set(intent.details.excludedSections || []);

  const chosen = defaults.filter((s) => !excluded.has(s));
  const addables = [...wanted, ...desired].filter((s) => !chosen.includes(s) && !excluded.has(s) && BUILDERS[s]);

  // Insert additions at a position that keeps the page rhythm sensible.
  addables.forEach((section) => {
    const anchor = preferredIndex(section, chosen);
    chosen.splice(anchor, 0, section);
  });
  if (wanted.has('tickets') && !excluded.has('tickets')) {
    const i = chosen.indexOf('tickets');
    if (i === -1) chosen.splice(chosen.length - 1, 0, 'tickets');
  }
  // Music releases always want pre-save when a countdown is present.
  if (intent.websiteType === 'music' && chosen.includes('countdown') && !chosen.includes('preSave')) {
    chosen.splice(chosen.indexOf('countdown') + 1, 0, 'preSave');
  }
  // A ticketing tier list already covers price for events and releases.
  if ((intent.websiteType === 'event' || intent.websiteType === 'music') && chosen.includes('tickets')) {
    const dup = chosen.indexOf('pricing');
    if (dup !== -1) chosen.splice(dup, 1);
  }
  if (!chosen.includes('footer')) chosen.push('footer');
  return [...new Set(chosen)].filter((s) => BUILDERS[s]);
}

function compileSpec(input = {}) {
  const intent = input.intent || analyze(input);
  const theme = buildTheme(intent);
  const platform = buildPlatformConfig(intent);
  const slug = slugify(intent.brand);
  const copy = createCopy(intent.seed, {
    ...buildContext(intent),
    websiteType: intent.websiteType,
    brand: intent.brand,
    slug,
  });
  const ctx = {
    intent,
    theme,
    platform,
    copy,
    slug,
    assets: createAssetView(input.assets, intent),
    sections: [],
    ctx: null,
  };
  ctx.ctx = buildContext(intent);

  const plan = planSections(intent);
  const sections = plan.map((type, index) => {
    const built = BUILDERS[type] ? BUILDERS[type](ctx) : { content: {}, settings: {} };
    const content = built.content || {};
    return {
      id: uid(type, index),
      type,
      label: SECTION_LABELS[type] || titleish(type),
      order: index,
      content: hydrate(content, ctx),
      settings: { padding: paddingFor(type, platform, theme), ...built.settings },
      assets: [],
      hidden: false,
    };
  });

  const spec = {
    version: 1,
    websiteType: intent.websiteType,
    typeLabel: typeById(intent.websiteType).label,
    name: intent.brand,
    tagline: intent.tagline || `${intent.brand} — ${ctx.ctx.noun} for ${intent.audience}`,
    headline: sections[0] && sections[0].content.headline,
    subheadline: sections[0] && sections[0].content.subheadline,
    theme,
    platform,
    sections,
    nav: {
      links: sections.filter((s) => !['hero', 'footer', 'cta'].includes(s.type)).slice(0, platform.mode === 'mobile' ? 3 : 5)
        .map((s) => ({ label: NAV_LABELS[s.type] || s.label, action: `#${s.type}` })),
      cta: { label: intent.cta || copy.ctaLabel(), action: primaryAction(intent) },
      style: theme.effects.includes('rules') ? 'bordered' : 'blur',
      showLaunchpadBadge: true,
    },
    copy: { tone: intent.moods.slice(0, 3).join(', ') || intent.typeDef.tone, context: ctx.ctx },
    meta: {
      generatedBy: input.generatedBy || 'launchpad-compiler',
      designId: intent.design ? intent.design.id : 'ai-chosen',
      designName: intent.design ? intent.design.name : 'AI-chosen direction',
      description: intent.description,
      audience: intent.audience,
      goal: intent.goal,
      visualDirection: intent.visualDirection,
      extraNotes: intent.extraNotes,
      keywords: [...intent.keywords].slice(0, 40),
      intent: {
        colors: intent.colors.names,
        moods: intent.moods,
        requestedSections: intent.requestedSections,
        launchDate: ctx.ctx.iso,
      },
    },
  };

  spec.assets = ctx.assets.all || [];
  if (spec.assets.length) assignAssets(spec, spec.assets);
  else {
    spec.assetMap = [];
    spec.stats = { assets: 0, used: 0, unused: 0 };
  }
  return spec;
}

function hydrate(content, ctx) {
  // Second pass: resolve {placeholders} embedded in literals and make sure
  // interpolated fragments never leave a sentence starting in lowercase.
  return JSON.parse(JSON.stringify(content), (key, value) => {
    if (typeof value !== 'string') return value;
    const filled = value.includes('{') ? fill(value, ctx.ctx) : value;
    return sentenceCase(filled);
  });
}

function sentenceCase(value) {
  if (!value || value.length < 12) return value;
  if (!/^[a-z]/.test(value)) return value;
  if (/^(http|#|@|\d|₦|\$)/.test(value)) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const SECTION_LABELS = {
  hero: 'Hero', about: 'About', features: 'Features', productShowcase: 'Product showcase', gallery: 'Gallery',
  video: 'Video', pricing: 'Pricing', testimonials: 'Testimonials', countdown: 'Countdown', waitlist: 'Waitlist',
  contact: 'Contact', faq: 'FAQ', social: 'Social links', cta: 'Call to action', newsletter: 'Newsletter',
  footer: 'Footer', logos: 'Logo strip', stats: 'Stats', eventDetails: 'Event details', speakers: 'Line-up',
  schedule: 'Schedule', tickets: 'Tickets', menu: 'Menu', team: 'Team', problem: 'Problem', solution: 'Solution',
  album: 'Release', tracklist: 'Track list', artistStory: 'Artist story', preSave: 'Pre-save',
};

const NAV_LABELS = {
  about: 'About', features: 'What you get', productShowcase: 'The drop', gallery: 'Gallery', pricing: 'Pricing',
  tracklist: 'Tracks', schedule: 'Schedule', speakers: 'Line-up', tickets: 'Tickets', menu: 'Menu', faq: 'FAQ',
  eventDetails: 'Details', artistStory: 'Story', team: 'Team', countdown: 'Countdown', preSave: 'Pre-save',
};

const ANCHOR_AFTER = { countdown: 'hero', stats: 'countdown', eventDetails: 'countdown', tickets: 'schedule', tracklist: 'album', preSave: 'countdown', newsletter: 'testimonials', faq: 'testimonials', social: 'cta', video: 'gallery', team: 'about', problem: 'hero', solution: 'problem', speakers: 'eventDetails', schedule: 'speakers', logos: 'hero' };
const ANCHOR_BEFORE = { waitlist: 'cta', contact: 'footer', cta: 'footer', footer: null };

function preferredIndex(section, chosen) {
  const after = ANCHOR_AFTER[section];
  if (after) {
    const i = chosen.indexOf(after);
    if (i !== -1) return i + 1;
  }
  if (section === 'gallery' && chosen.includes('features')) return chosen.indexOf('features') + 1;
  if (section === 'pricing' && chosen.includes('cta')) return chosen.indexOf('cta');
  const before = ANCHOR_BEFORE[section];
  if (before && chosen.includes(before)) return chosen.indexOf(before);
  const cta = chosen.indexOf('cta');
  const footer = chosen.indexOf('footer');
  return cta > 0 ? cta : Math.max(1, footer > 0 ? footer : chosen.length);
}

function paddingFor(type, platform, theme) {
  const base = platform.sectionPadding;
  const roomy = theme.spacing === 'roomy' ? 1.14 : theme.spacing === 'tight' ? 0.86 : 1;
  const map = { hero: 1, cta: 0.8, countdown: 0.55, newsletter: 0.55, social: 0.5, footer: 0.45, logos: 0.35 };
  const multiplier = map[type] != null ? map[type] : 0.75;
  return { top: Math.round(base * multiplier * roomy), bottom: Math.round(base * multiplier * roomy) };
}

function slugify(name) {
  return String(name || 'launch')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32) || 'launch';
}

module.exports = { compileSpec, planSections, buildContext, slugify, SECTION_LABELS, BUILDERS, formatDate };
