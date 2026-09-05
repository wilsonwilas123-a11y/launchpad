import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Reveal, RevealGroup, RevealItem } from '../motion/Motion';
import { Tag } from '../ui/Primitives';
import { cx, relativeTime } from '../../lib/format';

/**
 * Real generated sites, straight from /api/public. No screenshots, so the page
 * cannot drift from the product.
 */
export default function Examples({ items = [], loading }) {
  const cards = items.slice(0, 4);
  return (
    <section id="examples" className="relative py-24 sm:py-32 lg:py-36">
      <div className="shell">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="micro mb-3">Examples</p>
            <h2 className="max-w-[20ch] font-display text-[clamp(2.05rem,4.4vw,3.15rem)] font-medium leading-[1.04] tracking-[-0.035em]">
              Launched with Launchpad.
            </h2>
          </div>
          <p className="max-w-[38ch] text-[15.5px] leading-relaxed text-ink-300">
            Every site below was generated from a description, a design direction and a folder of images. Click through — they are live.
          </p>
        </Reveal>

        {loading && !cards.length ? (
          <div className="mt-12 grid gap-5 sm:gap-6 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-72 rounded-card" />
            ))}
          </div>
        ) : null}

        {!loading && !cards.length ? (
          <Reveal className="mt-12">
            <div className="rounded-card border border-dashed border-line-strong px-6 py-14 text-center">
              <p className="font-display text-xl">No live sites yet.</p>
              <p className="mx-auto mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-300">
                The API is reachable but nothing has been published. Run <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[14px]">npm run seed</code> to
                load the four demo launches.
              </p>
            </div>
          </Reveal>
        ) : null}

        <RevealGroup step={0.08} className="mt-12 grid gap-5 sm:gap-6 lg:grid-cols-3">
          {cards.map((item, index) => (
            <RevealItem key={item.slug} className={cx(index === 0 && 'lg:col-span-2')}>
              <Link
                to={`/${item.slug}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-ink-850/70 transition duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lift"
              >
                <div className={cx('relative overflow-hidden', index === 0 ? 'aspect-[16/9]' : 'aspect-[4/3]')}>
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={`${item.name} preview`}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-[900ms] group-hover:scale-[1.04]"
                      style={{ filter: 'contrast(1.04) saturate(0.95)' }}
                    />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(150deg, ${item.palette?.[0] || '#0a0a0c'} 0%, ${item.palette?.[1] || '#16141a'} 55%, ${item.palette?.[2] || '#fff'} 140%)`,
                      }}
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(7,7,10,0.92) 4%, rgba(7,7,10,0.15) 46%, transparent 70%)' }} />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    <p className="font-display text-[24px] leading-tight tracking-[-0.02em] text-white sm:text-[27px]">{item.name}</p>
                    <p className="mt-1 line-clamp-2 max-w-[52ch] text-[15px] leading-snug text-ink-200">{item.headline || item.tagline}</p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2.5 px-5 py-4 sm:px-6">
                  <Tag mono>{item.type}</Tag>
                  <Tag>{item.sections} sections</Tag>
                  {item.publishedAt ? <Tag>{relativeTime(item.publishedAt)}</Tag> : null}
                  <span className="ml-auto flex items-center gap-1 font-mono text-[13.5px] text-ink-300 transition group-hover:text-white">
                    {item.displayUrl}
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2} />
                  </span>
                </div>
              </Link>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
