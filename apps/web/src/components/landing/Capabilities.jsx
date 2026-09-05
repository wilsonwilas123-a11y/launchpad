import { useNavigate } from 'react-router-dom';
import { Aperture, Building2, CalendarDays, Disc3, Megaphone, Package, Plus, Rocket, Smartphone, UserRound, Users } from 'lucide-react';
import { Reveal, RevealGroup, RevealItem } from '../motion/Motion';
import { cx } from '../../lib/format';

const ICONS = { Package, Building2, Rocket, CalendarDays, Smartphone, Disc3, UserRound, Users, Megaphone, Aperture };

/** "What can you launch" — the nine shapes of thing people actually arrive with. */
export default function Capabilities({ types = [] }) {
  const navigate = useNavigate();
  const shown = (types.length ? types : DEFAULT_TYPES).slice(0, 9);

  return (
    <section id="launch" className="relative py-24 sm:py-32 lg:py-36">
      <div className="shell">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="micro mb-3">What can you launch</p>
            <h2 className="max-w-[18ch] font-display text-[clamp(2.05rem,4.4vw,3.15rem)] font-medium leading-[1.04] tracking-[-0.035em]">
              Nine kinds of beginning, one studio.
            </h2>
          </div>
          <p className="max-w-[36ch] text-[15.5px] leading-relaxed text-ink-300">
            Launchpad reads what you are making and changes the structure, the sections and the questions it asks you — not just the colours.
          </p>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-5 sm:gap-6 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((type, index) => {
            const Icon = ICONS[type.icon] || Package;
            return (
              <RevealItem key={type.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/start?type=${type.id}`)}
                  className={cx(
                    'group relative flex h-full w-full flex-col items-start gap-3 overflow-hidden rounded-card border border-line bg-ink-850/60 p-5 text-left lg:p-6 transition duration-300',
                    'hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.05] hover:shadow-lift',
                  )}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition duration-500 group-hover:opacity-100"
                    style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.16), transparent 70%)' }}
                  />
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white/[0.04] text-ink-100 transition group-hover:border-white/30 group-hover:text-white">
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <span className="block font-display text-[20.5px] leading-tight tracking-[-0.02em] text-white">{type.label}</span>
                  <span className="block text-[15px] leading-relaxed text-ink-300">{type.blurb}</span>
                  <span className="mt-auto flex items-center gap-1.5 pt-3 text-[13.5px] uppercase tracking-[0.14em] text-ink-400 transition group-hover:text-white">
                    Start one
                    <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
                  </span>
                </button>
              </RevealItem>
            );
          })}
          <RevealItem>
            <button
              type="button"
              onClick={() => navigate('/start?type=other')}
              className="flex h-full w-full flex-col items-start justify-center gap-3 rounded-card border border-dashed border-line-strong bg-transparent p-5 text-left lg:p-6 transition hover:border-white/35 hover:bg-white/[0.03]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink-100">
                <Plus className="h-4 w-4" />
              </span>
              <span className="font-display text-[20.5px] tracking-[-0.02em] text-white">Something else</span>
              <span className="text-[15px] leading-relaxed text-ink-300">Tell it in your own words and Launchpad will figure out the shape of it.</span>
            </button>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}

const DEFAULT_TYPES = [
  { id: 'product', label: 'Product', icon: 'Package', blurb: 'Something you make, sell or ship — with a story worth telling.' },
  { id: 'business', label: 'Business', icon: 'Building2', blurb: 'A service, studio or local business that needs to be trusted fast.' },
  { id: 'startup', label: 'Startup', icon: 'Rocket', blurb: 'A company raising, launching or entering a market.' },
  { id: 'event', label: 'Event', icon: 'CalendarDays', blurb: 'A conference, party, wedding, screening or meetup with a date.' },
  { id: 'app', label: 'App', icon: 'Smartphone', blurb: 'A mobile or web app you want people to install or try.' },
  { id: 'music', label: 'Music', icon: 'Disc3', blurb: 'A release, EP, album or artist page.' },
  { id: 'personal-brand', label: 'Personal Brand', icon: 'UserRound', blurb: 'You — the offer, the point of view, the inbox.' },
  { id: 'community', label: 'Community', icon: 'Users', blurb: 'A group, movement or membership people join.' },
  { id: 'campaign', label: 'Campaign', icon: 'Megaphone', blurb: 'A cause, drive or launch push with a clear ask.' },
];
