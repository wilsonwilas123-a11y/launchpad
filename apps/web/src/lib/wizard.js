/**
 * Wizard state: the five steps, the draft shape, and sessionStorage persistence
 * so a refresh mid-flow never loses what somebody typed.
 */

export const STEPS = [
  { key: 'idea', label: 'Describe', title: 'What are you launching?', hint: 'A few honest sentences beat a brief.' },
  { key: 'platform', label: 'Platform', title: 'Where should it work?', hint: 'We compose the layout for the screens you pick.' },
  { key: 'design', label: 'Design', title: 'Pick a design direction', hint: 'Palette, type and rhythm — not a template.' },
  { key: 'details', label: 'Details', title: 'A few details', hint: 'Skippable. We already have enough to start.' },
  { key: 'assets', label: 'Assets', title: 'Add your assets', hint: 'Anything you have. We will work out where it goes.' },
];

const KEY = 'launchpad.wizard.v1';

export function emptyDraft(overrides = {}) {
  return {
    projectId: null,
    type: '',
    name: '',
    description: '',
    visualDirection: '',
    style: 'modern',
    colours: '',
    mood: '',
    typography: '',
    selectedPlatforms: ['mobile', 'desktop'],
    selectedDesign: null,
    designDetails: { businessName: '', tagline: '', desiredSections: [], excludedSections: [], extraNotes: '' },
    assets: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function loadDraft() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? emptyDraft(parsed) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage full or blocked — the flow still works in memory */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The payload the API expects for each wizard field group. */
export function draftToProjectInput(draft) {
  return {
    type: draft.type || 'other',
    name: draft.name || undefined,
    description: draft.description,
    visualDirection: draft.visualDirection || undefined,
    targetAudience: draft.designDetails.audience || undefined,
    goal: draft.designDetails.goal || undefined,
    selectedPlatforms: draft.selectedPlatforms,
    selectedDesign: draft.selectedDesign ? { id: draft.selectedDesign.id, name: draft.selectedDesign.name } : null,
    designDetails: draft.designDetails,
  };
}

/** Style/mood controls in step 1 become words the generator can use. */
export function composeVisualDirection(draft) {
  const parts = [draft.visualDirection];
  if (draft.style && draft.style !== 'any') parts.push(`${draft.style} layout`);
  if (draft.colours) parts.push(`${draft.colours} palette`);
  if (draft.mood) parts.push(`${draft.mood.replace(/-/g, ' ')} mood`);
  if (draft.typography) parts.push(`${draft.typography.replace(/-/g, ' ')} type`);
  return parts.filter(Boolean).join(', ');
}

export const LAUNCH_TYPES = [
  { id: 'product', label: 'A product', emoji: '📦', blurb: 'Something you make, sell or ship' },
  { id: 'business', label: 'A business', emoji: '🏢', blurb: 'A service people need to trust fast' },
  { id: 'startup', label: 'A startup', emoji: '🚀', blurb: 'Raising, launching or entering a market' },
  { id: 'event', label: 'An event', emoji: '🎟️', blurb: 'A date, a place, people to fill it' },
  { id: 'app', label: 'An app', emoji: '📱', blurb: 'Something to install or try' },
  { id: 'music', label: 'A release', emoji: '💿', blurb: 'A single, EP, album or artist page' },
  { id: 'personal-brand', label: 'Yourself', emoji: '🪪', blurb: 'The offer and the point of view' },
  { id: 'community', label: 'A community', emoji: '👥', blurb: 'A group people join' },
  { id: 'campaign', label: 'A campaign', emoji: '📣', blurb: 'A drive with a clear ask' },
  { id: 'portfolio', label: 'A portfolio', emoji: '🎞️', blurb: 'Work, shown the right way' },
  { id: 'restaurant', label: 'A restaurant', emoji: '🍽️', blurb: 'Food, drink and a room' },
  { id: 'other', label: 'Something else', emoji: '✨', blurb: 'We will figure out the shape' },
];

/**
 * The platform step's three choices. "both" is UI sugar for the pair — the
 * generator only ever reads the array, never the word.
 */
export const PLATFORM_OPTIONS = [
  {
    value: 'mobile',
    label: 'Mobile',
    body: 'One column, thumb-reachable navigation, type sized for a phone held at arm’s length.',
    points: ['Sticky sheet menu', 'Full-bleed imagery', 'Tight vertical rhythm'],
  },
  {
    value: 'desktop',
    label: 'Laptop / Desktop',
    body: 'Wide grids, side-by-side hero, generous margins — the layout breathes and holds more per screen.',
    points: ['Multi-column grids', 'Top bar navigation', 'Larger type scale'],
  },
  {
    value: 'both',
    label: 'Both',
    body: 'The usual answer. One composition per breakpoint, so the mobile site is designed, not shrunk.',
    points: ['Re-composed at 430 / 768 / 1024 / 1280', 'Adaptive navigation', 'Density tuned per screen'],
  },
];

export const platformsFor = (value) => (value === 'both' ? ['mobile', 'desktop'] : [value]);

export const DESCRIPTION_PLACEHOLDERS = {
  product: "I'm launching a premium Nigerian streetwear brand called NOVA. I want a futuristic black-and-white website with large product photography, a countdown to launch, and a waitlist.",
  music: 'Afterglow is a live EP recorded over three nights in Lagos. I want a moody, cinematic page with the artwork, a tracklist, tour dates and a pre-save button.',
  event: 'Lagos Night is a one-night showcase of fashion and sound at Freedom Park on 12 December. I want a poster-like page with the line-up, schedule, tickets and a countdown.',
  startup: 'SHIFT is a booking tool for barbershops. I want a clean, confident startup site: the problem, how it works, pricing, testimonials and a demo request form.',
  business: 'We run a 12-seat studio in Yaba doing tailoring and repairs. I want a warm, grown-up site with the services, prices, our work and a way to book a fitting.',
  app: 'Kerosene is an Android app that tracks generator fuel for small businesses in Lagos. I want a product page with screenshots, what it does, a pricing note and a download button.',
  'personal-brand': 'I am a product designer writing about interface craft in African markets. I want a quiet personal site with my best work, my writing, and a way to reach me.',
  community: 'Third Space is a monthly members gathering for founders and designers in Ikoyi. I want a page with what we do, past nights, the fee, and a join form.',
  campaign: 'We are collecting signatures to keep the Marine Beach market open through the rebuild. I want an urgent but factual page: the ask, the facts, a countdown and a signature form.',
  portfolio: 'I photograph people and buildings, mostly in West Africa. I want a gallery-first site with series, about, exhibitions and a contact page — no stock, no clutter.',
  restaurant: 'Máà is a 30-seat àṣẹbì kitchen in Surulere serving Yoruba dishes with a fixed menu. I want the menu, the room, opening hours, and reservations by phone or form.',
  other: 'I am launching a small batch of hand-bound notebooks, sold four times a year. I want a page that shows the work, says when the next batch opens, and collects emails.',
};

export const STYLE_OPTIONS = ['any', 'minimal', 'editorial', 'bold', 'cinematic', 'futuristic', 'warm', 'technical'];
export const MOOD_OPTIONS = ['any', 'quiet', 'confident', 'playful', 'moody', 'urgent', 'luxe'];
export const TYPOGRAPHY_OPTIONS = ['any', 'display-serif', 'grotesk', 'monospace', 'condensed'];
export const COLOUR_HINTS = ['black and white', 'cream and ink', 'charcoal and amber', 'midnight blue', 'sand and clay'];
