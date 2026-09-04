/**
 * A hand-written example spec, used by the landing page when the API is not
 * reachable. It is the same shape the compiler emits, so the preview is a real
 * render of the real renderer rather than a picture of one.
 */
export const sampleSpec = {
  name: 'NOVA',
  type: 'product',
  tagline: 'Lagos-made technical clothing, in runs of 180',
  websiteType: 'product',
  theme: {
    mode: 'dark',
    colors: {
      background: '#0a0a0c',
      surface: '#131318',
      surfaceAlt: '#1b1b21',
      text: '#f6f6f7',
      textMuted: '#9b9ba6',
      accent: '#ffffff',
      accentText: '#0a0a0c',
      border: 'rgba(255,255,255,0.10)',
      overlay: 'rgba(3,3,5,0.72)',
    },
    typography: { headingFont: 'grotesk', bodyFont: 'sans', labelFont: 'mono', scale: 1.24, headingWeight: 700, headingTracking: '-0.035em', bodySize: 16 },
    radius: 14,
    spacing: 'airy',
    visualStyle: 'dark, cinematic, monochrome',
    effects: ['glow', 'rules'],
    imagery: { treatment: 'contrast', radius: 14, fit: 'cover' },
  },
  platform: { mode: 'both', label: 'Mobile + Laptop', maxWidth: 1180, sectionPadding: 72, gridColumns: 3 },
  nav: {
    style: 'blur',
    links: [
      { label: 'The drop', action: '#productShowcase' },
      { label: 'Details', action: '#features' },
      { label: 'Gallery', action: '#gallery' },
    ],
    cta: { label: 'Join the list', action: '#waitlist' },
  },
  assets: [],
  sections: [
    {
      id: 'hero',
      type: 'hero',
      label: 'Hero',
      order: 0,
      hidden: false,
      settings: { align: 'center', padding: 'xl' },
      assets: [],
      content: {
        eyebrow: 'Drop 01 — 12 December',
        headline: 'Everything about NOVA is deliberate',
        subheadline: 'Shot in-house, made in runs of 180. When it is gone, it is gone.',
        primary: { label: 'Join the waitlist', action: '#waitlist' },
        secondary: { label: 'See the collection', action: '#productShowcase' },
        layout: 'centered',
        badges: ['Run of 180', 'Ships worldwide', 'No restock'],
        meta: ['Lagos', 'Est. 2026'],
      },
    },
    {
      id: 'countdown',
      type: 'countdown',
      label: 'Countdown',
      order: 1,
      hidden: false,
      settings: { align: 'center', padding: 'md' },
      assets: [],
      content: { heading: 'Doors open in', note: 'One drop. No restock.', display: 'slabs', targetIso: nextFriday() },
    },
    {
      id: 'features',
      type: 'features',
      label: 'Features',
      order: 2,
      hidden: false,
      settings: { padding: 'lg' },
      assets: [],
      content: {
        heading: 'What you get',
        sub: 'Three things we refuse to compromise on.',
        columns: 3,
        items: [
          { title: 'Cut in Lagos', body: 'Patterned and sewn 40 minutes from the studio, by the same four people every run.' },
          { title: 'Fabric first', body: '240gsm organic jersey, water-repelled twill, taped seams. Nothing that pills in a month.' },
          { title: 'One run only', body: 'Each piece is made once, in a numbered run. The archive is the archive.' },
        ],
      },
    },
    {
      id: 'waitlist',
      type: 'waitlist',
      label: 'Waitlist',
      order: 3,
      hidden: false,
      settings: { align: 'center', padding: 'lg' },
      assets: [],
      content: {
        heading: 'Get 24 hours ahead of everyone',
        body: 'The list opens access on the 12th. No spam, one email, unsubscribe in a click.',
        placeholder: 'you@email.com',
        ctaLabel: 'Join the list',
        incentives: ['Early access', 'Members-only colourway', 'Free exchanges'],
        privacy: 'We never sell your address.',
      },
    },
    {
      id: 'footer',
      type: 'footer',
      label: 'Footer',
      order: 4,
      hidden: false,
      settings: { padding: 'sm' },
      assets: [],
      content: { tagline: 'Lagos-made technical clothing', legal: ['Terms', 'Privacy'], social: [{ platform: 'Instagram', url: '#' }], credits: '© 2026 NOVA' },
    },
  ],
};

function nextFriday() {
  const date = new Date();
  date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7 || 7));
  date.setHours(20, 0, 0, 0);
  return date.toISOString();
}
