/**
 * Copy engine. The generator never emits random HTML: it fills a structured
 * specification with language that is derived from what the user actually said
 * (brand, audience, product nouns, prices, dates) and shaped by the tone of
 * the chosen design direction. Same input → same copy, different input →
 * visibly different copy.
 */

function hashString(input) {
  let h = 2166136261;
  const str = String(input || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRandom(seed) {
  let t = seed >>> 0 || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];
const pickMany = (rand, arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};
const titleCase = (s) =>
  String(s || '')
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(' ');

const BANKS = {
  heroEyebrow: {
    product: ['Now taking early orders', 'Drop 01', 'Made in limited runs', 'Pre-order open'],
    startup: ['Backed by people who get it', 'Now in private beta', 'Series A ready', 'Built for teams like yours'],
    business: ['Serving since day one', 'Family-run, client-obsessed', 'Now booking for the season', 'Licensed, insured, on time'],
    event: ['One night only', 'Tickets moving fast', 'Doors at 7pm', 'Sell-out expected'],
    app: ['Free for the first 1,000', 'Out of beta', 'Works on the go', 'Set up in 2 minutes'],
    music: ['New single out soon', 'Pre-save now', 'From the upcoming project', 'Recorded live in Lagos'],
    'personal-brand': ['Available for select projects', 'Writing, speaking, building', 'Portfolio 2026', 'Open for collaboration'],
    community: ['Weekly, free, real humans', 'Now onboarding members', 'A room, not a feed', 'Run by people who show up'],
    campaign: ['Deadline approaching', 'Every signature counts', 'We are halfway there', 'Act before Friday'],
    portfolio: ['Selected works', 'Studio of one, standards of many', '2019 — now', 'Available from October'],
    restaurant: ['Dinner, Tuesday to Sunday', 'Seasonal menu, open fire', 'Now taking bookings', 'Natural wine, real food'],
    other: ['New here', 'Built with intention', 'Say hello', 'Just launched'],
  },
  heroHeadline: {
    product: ['{brand}, built to be noticed', 'The {noun} you will actually use', '{brand}: made in small numbers', 'Everything about {brand} is deliberate'],
    startup: ['{brand} does the boring part', 'Ship {noun} without the 3am email', '{brand}: the ops layer you stopped dreading', 'Your team, unblocked by {brand}'],
    business: ['{brand}. Done properly.', 'The {noun} people recommend to friends', '{brand} — quiet competence, loud results', 'Book {brand}, forget the worry'],
    event: ['{brand}, one night', 'The city shows up for {brand}', '{brand}: be there or read about it', 'One stage. One night. {brand}.'],
    app: ['{brand} fits in your pocket', 'Do {noun} in three taps', 'The app that keeps up with you', '{brand}: your day, organised'],
    music: ['{brand} — after the lights go down', 'New from {brand}', '{brand}: loud, unhurried, yours', 'Press play on {brand}'],
    'personal-brand': ['I am {brand}. This is the work.', 'Design, writing and the occasional fire', '{brand} — for teams who care about detail', 'I make {noun} that behave'],
    community: ['A community that actually meets', '{brand}: people who build things', 'Join {brand}. Stay for the people.', 'The group chat, in real life'],
    campaign: ['{brand} needs you by Friday', 'This is the moment for {brand}', 'Small action, outsized result: {brand}', 'Sign. Share. Then {brand} moves.'],
    portfolio: ['{brand} — selected work', 'Projects, in {brand}’s own words', 'Careful work by {brand}', '{brand}: brief to shipped'],
    restaurant: ['{brand}. Sit anywhere.', 'Cooking worth the queue at {brand}', '{brand}: the menu changes, the standard does not', 'Fire, salt, patience — {brand}'],
    other: ['{brand}, explained', 'Here is what {brand} is for', 'Welcome to {brand}', '{brand} — the short version'],
  },
  heroSub: {
    product: ['{audience} get first access to {noun} designed around one idea: {value}.', 'Shot in-house, made in runs of {count}. When it is gone, it is gone.'],
    startup: ['{brand} replaces the spreadsheet, the group chat and the "any update?" email with one place your team actually opens.', 'Live in a day, no migration project, no sales call required.'],
    business: ['{years} years, one standard. {brand} handles {noun} so you can stop thinking about it.', 'Transparent pricing, real people, and a phone that gets answered.'],
    event: ['{date} at {venue}. {count} people, {act} acts, one playlist worth the trip.', 'Tickets are tiered and the early ones always go first.'],
    app: ['{brand} handles {noun} on your terms — offline first, private by default, nothing to configure.', 'Download, sign in with email, done. Your data leaves when you do.'],
    music: ['{brand} recorded {noun} over {count} nights with the doors shut. It sounds like that.', 'Out {date}. Pre-save now and it lands in your library automatically.'],
    'personal-brand': ['I work with {audience} on {noun}. Few projects, close collaboration, no handover gap.', 'Currently taking {count} engagements for the next quarter.'],
    community: ['{count} members, weekly sessions, zero growth hacks. {brand} exists because {value}.', 'Membership is free and deliberately small — we cap it so conversations stay real.'],
    campaign: ['We need {count} signatures by {date} to force {noun} onto the agenda.', 'Two minutes now. Everyone gets the update, nobody gets spammed.'],
    portfolio: ['I design and build {noun} for {audience}. This page is the short version of the last {years} years.', 'Full case studies on request — the NDA-free ones, at least.'],
    restaurant: ['{brand} cooks {noun} over fire, keeps the wine list short and the tables for twenty minutes longer than you planned.', 'Book ahead. Walk-ins get the bar, and the bar is good.'],
    other: ['{brand} is a project about {noun}, made for {audience}. This site explains it in one scroll.', 'If you want the long version, the contact form works.'],
  },
  ctaLabels: {
    product: ['Join the waitlist', 'Pre-order now', 'See the drop', 'Reserve yours'],
    startup: ['Start free', 'Book a demo', 'Get early access', 'Create your workspace'],
    business: ['Get a quote', 'Book a call', 'Check availability', 'Talk to us'],
    event: ['Get tickets', 'Reserve your spot', 'See the line-up', 'Join the guest list'],
    app: ['Download the app', 'Try it free', 'Get the beta link', 'Install in 2 minutes'],
    music: ['Pre-save now', 'Listen first', 'Add to library', 'Get early access'],
    'personal-brand': ['Start a project', 'Say hello', 'See the work', 'Book a call'],
    community: ['Join the community', 'Get the invite', 'Come to the next one', 'Join free'],
    campaign: ['Sign now', 'Add your name', 'Join the campaign', 'Take action'],
    portfolio: ['Start a project', 'See case studies', 'Say hello', 'Enquire'],
    restaurant: ['Book a table', 'See the menu', 'Reserve tonight', 'Find us'],
    other: ['Get in touch', 'Learn more', 'Follow along', 'Say hello'],
  },
  features: {
    product: [
      ['Materials first', '{material} sourced from people we can name. It ages well and it repairs cheaply.'],
      ['Made in small runs', 'Every drop is capped at {count} units, so nothing gets discounted to death.'],
      ['Built to be seen', 'Cut for {audience} who notice stitching, weight and the way light hits a surface.'],
      ['Ships worldwide', 'Tracked, duties handled, returns accepted for {days} days without a conversation.'],
      ['One price, no games', 'What you see is what you pay. No fake scarcity timers, no "was ₦{price}" theatre.'],
    ],
    startup: [
      ['Set up in a day', 'Import {noun} from a CSV or a link and {brand} is live before the meeting ends.'],
      ['It stays out of the way', 'Notifications only when something needs you. Everything else waits in a digest.'],
      ['Priced per outcome', 'You pay for {unit}, not for seats you forgot to remove in March.'],
      ['Auditable by default', 'Every change is logged with a name and a timestamp. Export it whenever you want.'],
      ['No lock-in', 'Full API, full export, no "enterprise tier" hold-ups on your own data.'],
    ],
    business: [
      ['Fixed, transparent pricing', 'You get the number before we start. Nothing appears on the invoice that was not quoted.'],
      ['Real people, fast', 'Call {phone} and a human picks up. Average reply time is {hours} hours.'],
      ['Guaranteed window', 'We arrive in the slot we promised, or the callout is on us.'],
      ['Documented work', 'Photos, notes and a signed job sheet for every visit. Useful when something goes wrong later.'],
      ['Local and accountable', 'Based in {city}, working within {radius}km, and our reputation depends on you telling friends.'],
    ],
    event: [
      ['One ticket, everything', 'Entry, the {format} session and the after-hours room are all on the same wristband.'],
      ['Timed, not vague', 'Every act has a start time on the schedule page, and we keep them.'],
      ['Accessible by design', 'Step-free routes, BSL on request, quiet room open all night.'],
      ['Safe space policy', 'Zero tolerance policy briefed to all staff. Report to any steward, no questions first.'],
      ['Re-entry allowed', 'Come and go as you please until {time}.'],
    ],
    app: [
      ['Offline first', '{noun} works on the motorway, in a basement, on a plane. Syncs when it can.'],
      ['Private by design', 'No ad SDKs, no third-party trackers, no "anonymised" everything.'],
      ['Two minutes to value', 'Open it, do the thing, close it. No onboarding carousel.'],
      ['Syncs where you are', 'Phone, laptop, web — the same {count} states, everywhere, in under {seconds} seconds.'],
      ['Keyboard-friendly', 'Everything reachable without hunting through menus. Long-press for the rest.'],
    ],
    music: [
      ['Recorded live to tape', '{count} takes, no grid, no pitch correction. What you hear is the room.'],
      ['Mastered for small speakers', 'Tested on phone speakers, car doors and a {years}-year-old hi-fi.'],
      ['Visual companion', 'The {noun} film premieres the same day, in one continuous take.'],
      ['Independent, still', 'Released on {brand}’s own label. No 360 deal, no committee.'],
    ],
    'personal-brand': [
      ['Senior from day one', 'You work with me, not with the person I assigned after signing.'],
      ['Fixed scope, weekly demos', 'Every Friday you see something moving. Nothing is "in progress" for a month.'],
      ['I write as well as build', 'Strategy, copy and interface arrive together, so nothing has to be rewritten later.'],
      ['Handover you can keep', 'Documented, typed, and reviewed with your team for two weeks after launch.'],
    ],
    community: [
      ['Small on purpose', 'Capped at {count} members so the room stays a conversation, not a broadcast.'],
      ['Something to do', 'Weekly {format} sessions, monthly meetups, a shared {noun} project.'],
      ['Moderated by humans', 'Three moderators, published rules, no engagement-bait algorithm.'],
      ['Free unless you want in', 'Public channel costs nothing. Paid tier exists to keep the lights on.'],
    ],
    campaign: [
      ['Two minutes, real effect', 'Sign, then the letter goes to {target} on {date}. We do the rest.'],
      ['Every update is public', 'What we sent, who replied, what changed. No vague "we made progress" emails.'],
      ['Built with the people affected', 'The ask was written by {audience}, not by a comms agency.'],
      ['No data hoarding', 'We keep your email to run this campaign. Delete it any time, one click.'],
    ],
    portfolio: [
      ['End to end', 'Research, interface, front-end and the launch plan — one person, no seams.'],
      ['Shipped, not shot', 'Everything here is live and running for real clients with real numbers.'],
      ['Fast, measurable work', 'Typical engagement is {weeks} weeks. Average Core Web Vitals improvement: {points} points.'],
    ],
    restaurant: [
      ['Fire and season', 'The menu changes when the market changes. {noun} is on every day, though.'],
      ['Short list, chosen properly', '{count} wines by the glass, all under {price}, all chosen by a person who likes cooking.'],
      ['Room that hums', 'Seats {count}, low light, and acoustics tuned so you can talk.'],
      ['Dietaries are not an afterthought', 'Veg and gluten-free options are real dishes, not substitutions.'],
    ],
    other: [
      ['Why it exists', '{brand} started because {value} kept getting ignored.'],
      ['What you get', 'A clear explanation, {noun}, and a way to say hello.'],
      ['How it works', 'Nothing hidden: {count} steps, published process, honest pricing.'],
    ],
  },
  about: [
    '{brand} began in {city} in {year}, which is the boring way to say: we kept running into the same problem with {noun} and got tired of complaining about it. So we made the thing we wanted — for {audience}, in the way we think it should be done.',
    'We are {brand}. We make {noun} for {audience} who would rather have one good option than twelve mediocre ones. Everything here is written by the people who build it, which is why it reads like a person and not a brochure.',
    '{brand} is small on purpose: {count} people, one product, no roadmap full of things we would rather be doing. That means we say no often, and it means the thing we do say yes to gets finished properly.',
  ],
  testimonials: [
    ['It arrived when they said it would, and it works the way they described it. That is the whole review.', 'Amaka O.', '{role}, first order on day one'],
    ['I have never had to explain {brand} to a colleague twice. It is that obvious to use.', 'Tomi A.', '{role}'],
    ['Ordered Thursday, wearing it Saturday, still new-looking three months later.', 'Chidi N.', 'customer since {year}'],
    ['We switched from a tool three times the price and nothing got worse. Half the complaints stopped.', 'Grace E.', '{role} at a 40-person team'],
    ['The countdown page made our whole team commit to the date. Scary, effective.', 'Ife K.', '{role}'],
    ['They answered my 11pm message. I do not know how, but they did.', 'Daniel B.', '{role}'],
  ],
  faq: {
    product: [
      ['When does it ship?', 'Orders go out within {days} days of the drop. You will get a tracking number the moment the label prints.'],
      ['Is it true to size?', 'True to size, with a slightly wider toe box than the usual. If you are between sizes, take the larger one.'],
      ['What is the returns policy?', '{days} days, unworn, tags on, free return label for local orders. Refund lands within 3 working days.'],
      ['Why only {count} units?', 'Because we make them by hand in runs we can actually finish. Restocks are announced on the waitlist first.'],
    ],
    startup: [
      ['How long does setup take?', 'A day for most teams. Bring a CSV or a Slack workspace and you will have something real before standup ends.'],
      ['Is our data safe?', 'Encrypted at rest and in transit, SSO on the Pro plan, and you can export or delete everything without asking us.'],
      ['Do you do contracts?', 'Month-to-month by default. Annual gets a discount, not a hostage situation.'],
      ['What does it replace?', 'Usually: one spreadsheet, one group chat and one status meeting a week.'],
    ],
    event: [
      ['Can I get a refund?', 'Yes, up to {days} days before the doors. After that, transfer the ticket to a friend free of charge.'],
      ['Is there re-entry?', 'Yes, until {time}. Wristbands are your ticket, keep them dry.'],
      ['Is the venue accessible?', 'Step-free throughout, accessible toilets on the ground floor, BSL interpretation on request at booking.'],
      ['What can I bring?', 'A phone, keys and ID. No professional cameras, no outside drinks, no glass.'],
    ],
    music: [
      ['When does it come out?', '{date}. Pre-save adds it to your library automatically the second it goes live.'],
      ['Is it on vinyl?', 'A run of {count} is planned for later in the year. Waitlist members get the first window.'],
      ['Who mixed it?', 'Recorded and mixed by {brand} in {city}, mastered elsewhere so nobody says it only sounds good in one room.'],
      ['Can I use a track?', 'For a short clip, yes, with a credit and a link. For anything paid, use the contact form.'],
    ],
    business: [
      ['How soon can you come?', 'Usually within {days} working days. Urgent jobs get slotted in where possible — ask, worst case is no.'],
      ['Do you quote by phone?', 'Same day for standard work, 48 hours for anything that needs a visit.'],
      ['Are you insured?', 'Yes, and we will send the certificate before you pay a naira.'],
      ['What if something goes wrong?', 'Call the number on your job sheet. We come back and fix it, then explain what happened in writing.'],
    ],
    other: [
      ['What is this, exactly?', '{brand} is {noun}, for {audience}. The long version is in the About section.'],
      ['How do I get involved?', 'Use the form below, or reply to any email we send. A real person reads all of them.'],
      ['Is there a cost?', 'Nothing to join. If you want the deeper work, pricing is published here, not hidden behind a call.'],
    ],
  },
  closers: {
    product: ['Do not read about it later', 'The waitlist is how you get the first run. Everything after that is resale.'],
    startup: ['Try it on your own data', 'Import a CSV, click around for ten minutes, decide after that.'],
    business: ['One call sorts it', 'Tell us the problem in ninety seconds. We will tell you the price and the date.'],
    event: ['Do not decide from a recap', 'Tickets are tiered. The last tier is always more expensive and always sells out.'],
    app: ['Install it, then judge it', 'Free while in early access, and the account takes ten seconds.'],
    music: ['Get it in your library on day one', 'Pre-save takes one tap and it lands the moment release day hits.'],
    'personal-brand': ['Tell me what you are building', 'I reply to everything within a day. If it is not a fit, I will say so and point you somewhere better.'],
    community: ['Come to the next one first', 'No paywall, no funnel, no drip sequence. Just the invite.'],
    campaign: ['Two minutes is the whole ask', 'Sign now, and we will tell you exactly what happened next.'],
    portfolio: ['Send the brief', 'Even a rough one. I will tell you what I would do and what it would cost.'],
    restaurant: ['Book the table', 'Twelve seats a night go to walk-ins. The rest are spoken for — say when you want to come.'],
    other: ['Say hello', 'The form goes straight to a real inbox, and someone who works on this answers it.'],
  },
};

const ROLES = ['operations lead', 'founder', 'head of product', 'buyer', 'creative director', 'project manager', 'chef', 'fan since the first EP'];
const CITIES = ['Lagos', 'Ibadan', 'Abuja', 'Accra', 'London', 'Berlin'];
const MATERIALS = ['full-grain leather', 'Japanese cotton twill', 'recycled ripstop', 'waxed canvas', 'heavyweight organic jersey'];

/** Fills {brand}, {noun}, {audience} etc. from an intent object. */
function fill(template, ctx) {
  return String(template).replace(/\{(\w+)\}/g, (whole, key) => {
    const value = ctx[key];
    if (value === undefined || value === null || value === '') return whole;
    return String(value);
  });
}

function createCopy(seed, ctx = {}) {
  const rand = makeRandom(hashString(seed));
  const bank = (list) => fill(pick(rand, list), ctx);
  const many = (list, n) => pickMany(rand, list, n).map((t) => fill(t, ctx));
  const type = ctx.websiteType && BANKS.heroEyebrow[ctx.websiteType] ? ctx.websiteType : 'other';
  const withCtx = (list) => pick(rand, list);

  return {
    rand,
    ctx,
    heroEyebrow: () => bank(BANKS.heroEyebrow[type]),
    heroHeadline: () => bank(BANKS.heroHeadline[type]),
    heroSub: () => bank(BANKS.heroSub[type]),
    ctaLabel: () => bank(BANKS.ctaLabels[type]),
    about: () => bank(BANKS.about),
    closerPair: () => {
      const list = BANKS.closers[type];
      const pair = list.length > 1 ? [list[0], list[1]] : [list[0], list[0]];
      return { headline: fill(pair[0], ctx), body: fill(pair[1], ctx) };
    },
    features: (n = 4) =>
      many(BANKS.features[type], n).map((text, index) => {
        const [title, body] = text.split('|');
        const source = BANKS.features[type][(index + Math.floor(rand() * 3)) % BANKS.features[type].length];
        const [t2, b2] = source[0] ? [source[0], fill(source[1], ctx)] : [title, body];
        return { title: (title && title !== text ? title : t2) || t2, body: b2 || body || '' };
      }),
    featureList: (n = 4) => {
      const items = pickMany(rand, BANKS.features[type], Math.min(n, BANKS.features[type].length));
      return items.map(([title, body]) => ({ title: fill(title, ctx), body: fill(body, ctx) }));
    },
    testimonials: (n = 3) => {
      const chosen = pickMany(rand, BANKS.testimonials, Math.min(n, BANKS.testimonials.length));
      return chosen.map(([quote, name, role]) => ({
        quote: fill(quote, ctx),
        name,
        role: fill(String(role).replace('{role}', pick(rand, ROLES)), ctx),
      }));
    },
    faq: (n = 4) => {
      const list = BANKS.faq[type] || BANKS.faq.other;
      return pickMany(rand, list, Math.min(n, list.length)).map(([q, a]) => ({ question: fill(q, ctx), answer: fill(a, ctx) }));
    },
    sentence: bank,
    fill,
    titleCase,
  };
}

module.exports = { createCopy, hashString, makeRandom, pick, pickMany, fill, titleCase, CITIES, MATERIALS, ROLES, BANKS };
