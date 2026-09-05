import { useEffect, useState } from 'react';
import { Play, Quote } from 'lucide-react';
import { useSite } from './SiteContext';
import { ActionButton, Bullets, Card, Eyebrow, Grid, Heading, Lead, Media, Price, SectionShell } from './primitives';
import { countdownParts, cx, pad2 } from '../../lib/format';

/**
 * One renderer per section type the compiler can emit. They are intentionally
 * dumb: content in, markup out, all look-and-feel coming from the theme
 * variables. That is what lets a colour change land instantly.
 */

const pick = (...values) => values.find((v) => v !== undefined && v !== null && v !== '');

/**
 * The generator may hand us a string where a list belongs (`legal`, `meta`,
 * `channels`) or an object where an item belongs. Rendering must never be the
 * thing that discovers that, so every list-shaped content field comes through
 * here first.
 */
export function listOf(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined);
  if (typeof value === 'string') {
    const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return lines.length ? lines : [value];
  }
  if (value && typeof value === 'object') return Object.values(value).filter((item) => item && typeof item === 'object');
  return [];
}


function useAsset() {
  const { assets } = useSite();
  return (id) => (id && assets[id] ? assets[id] : null);
}

/* ── opening blocks ───────────────────────────────────────────────────────── */

function Hero({ content, section }) {
  const asset = useAsset();
  const image = asset(content.imageAssetId) || asset(content.portraitAssetId);
  const layout = content.layout || 'centered';
  const split = layout === 'split';
  const full = layout === 'fullbleed';
  return (
    <SectionShell section={section} wide={split} tight={false}>
      <div
        className={cx('relative flex flex-col', split && 'items-center gap-8 lg:flex-row lg:gap-14')}
        style={{ minHeight: content.minHeight || undefined }}
      >
        {full && image ? (
          <>
            <img src={image.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ filter: 'contrast(1.05) brightness(0.62)' }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to top, var(--s-bg), rgba(0,0,0,${0.25 + Number(content.overlay || 0.5)}))` }} />
          </>
        ) : null}
        <div className={cx('relative', full ? 'py-14' : '')} style={split ? { flex: '1 1 48%' } : undefined}>
          <Eyebrow>{content.eyebrow}</Eyebrow>
          <Heading as="h1" size={1.16}>
            {content.headline}
          </Heading>
          <Lead size={1.08}>{content.subheadline}</Lead>
          {content.badges?.length ? (
            <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 justify-[inherit]" style={{ justifyContent: 'inherit' }}>
              {content.badges.map((badge, i) => (
                <li key={i} className="s-label inline-flex items-center gap-2 opacity-75" style={{ fontFamily: 'var(--s-label)' }}>
                  <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: 'var(--s-accent)' }} />
                  {badge}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-3" style={{ justifyContent: 'inherit' }}>
            {content.primary ? <ActionButton action={content.primary.action}>{content.primary.label}</ActionButton> : null}
            {content.secondary ? (
              <ActionButton action={content.secondary.action} variant="ghostish">
                <span style={{ border: '1px solid var(--s-line)', borderRadius: 'calc(var(--s-radius)*0.6)', padding: '10px 20px', display: 'inline-flex' }}>{content.secondary.label}</span>
              </ActionButton>
            ) : null}
          </div>
          {listOf(content.meta).length ? (
            <p className="s-muted mt-6 text-[13px]" style={{ fontFamily: 'var(--s-label)' }}>
              {content.meta.join('  ·  ')}
            </p>
          ) : null}
        </div>
        {split ? (
          <div className="relative" style={{ flex: '1 1 52%' }}>
            <Media src={image?.url} alt={image?.alt || content.headline} ratio="4 / 5" treatment="contrast" />
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}

function Countdown({ content, section }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const every = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(every);
  }, []);
  const parts = countdownParts(content.targetIso, now);
  const units = [
    ['Days', parts.days],
    ['Hours', parts.hours],
    ['Minutes', parts.minutes],
    ['Seconds', parts.seconds],
  ];
  const labels = content.labels?.length === 4 ? content.labels : units.map(([label]) => label);
  const display = content.display || 'slabs';
  return (
    <SectionShell section={section} tight>
      <Eyebrow>{parts.past ? 'Now open' : 'Time left'}</Eyebrow>
      <Heading size={0.72}>{content.heading}</Heading>
      <Lead>{content.note}</Lead>
      {/* Four slabs at their 72px floor plus three gaps do not fit a 320px phone,
          so below sm they wrap onto two rows instead of hanging off the edge. */}
      <div
        className={cx(
          'mt-7 flex max-sm:flex-wrap max-sm:justify-center gap-3',
          display === 'stack' && 'flex-col items-center',
          display === 'inline' && 'flex-row flex-wrap justify-center gap-6',
        )}
      >
        {display === 'inline'
          ? units.map(([label], index) => (
              <span key={label} className="tabular-nums" style={{ fontFamily: 'var(--s-heading)', fontSize: 'calc(var(--s-body)*1.5)' }}>
                {pad2(units[index][1])}
                <span className="s-muted ml-1.5 text-[13px]">{labels[index]}</span>
              </span>
            ))
          : units.map(([label], index) => (
              <div
                key={label}
                className={cx('flex flex-col items-center justify-center tabular-nums', display === 'stack' && 'w-full max-w-[240px] flex-row justify-between px-4')}
                style={{
                  minWidth: display === 'stack' ? undefined : 'clamp(72px, 18vw, 128px)',
                  padding: display === 'stack' ? undefined : '18px 10px',
                  background: display === 'stack' ? 'transparent' : 'var(--s-surface)',
                  border: display === 'stack' ? '1px solid var(--s-line)' : '1px solid var(--s-line)',
                  borderRadius: 'var(--s-radius)',
                }}
              >
                <span style={{ fontFamily: 'var(--s-heading)', fontSize: 'calc(var(--s-body)*2.2)', lineHeight: 1 }}>{pad2(units[index][1])}</span>
                <span className="s-label s-muted mt-1.5">{labels[index]}</span>
              </div>
            ))}
      </div>
      {content.cta?.label ? (
        <div className="mt-7 flex justify-[inherit]" style={{ justifyContent: 'inherit' }}>
          <ActionButton action={content.cta.action}>{content.cta.label}</ActionButton>
        </div>
      ) : null}
    </SectionShell>
  );
}

/* ── proof and product ────────────────────────────────────────────────────── */

function About({ content, section }) {
  const asset = useAsset();
  const image = asset(content.imageAssetId);
  return (
    <SectionShell section={section}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-14">
        <div className="lg:flex-1">
          <Heading size={0.86}>{content.heading}</Heading>
          <p className="mt-4 text-[17px] leading-[1.7]" style={{ opacity: 0.86 }}>
            {content.body}
          </p>
          <Bullets items={content.bullets} />
        </div>
        {image ? (
          <div className="lg:w-[42%]">
            <Media src={image.url} alt={image.alt || ''} ratio="4 / 3" />
            {image.caption ? <p className="s-muted mt-2 text-[12px]">{image.caption}</p> : null}
          </div>
        ) : null}
        {content.stats?.length ? (
          <div className="grid grid-cols-2 gap-4 lg:w-[26%]">
            {content.stats.map((stat, i) => (
              <div key={i}>
                <p style={{ fontFamily: 'var(--s-heading)', fontSize: 'calc(var(--s-body)*1.7)' }}>{stat.value}</p>
                <p className="s-muted text-[13px]">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </SectionShell>
  );
}

function Features({ content, section }) {
  return (
    <SectionShell section={section}>
      <Eyebrow>What you get</Eyebrow>
      <Heading size={0.86}>{content.heading}</Heading>
      <Lead>{content.sub}</Lead>
      <div className="mt-8">
        <Grid columns={content.columns || section.settings?.columns || 3}>
          {listOf(content.items).map((item, index) => (
            <Card key={index} hover className="h-full" style={{ transform: 'translateZ(0)' }}>
              <span className="s-label s-muted" style={{ fontFamily: 'var(--s-label)' }}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-[19px] leading-snug" style={{ fontFamily: 'var(--s-heading)' }}>
                {item.title}
              </h3>
              <p className="s-muted mt-2 text-[14.5px] leading-relaxed">{item.body}</p>
            </Card>
          ))}
        </Grid>
      </div>
    </SectionShell>
  );
}

function ProductShowcase({ content, section }) {
  const asset = useAsset();
  const layout = content.layout || section.settings?.layout || 'grid';
  const rows = layout === 'rows';
  return (
    <SectionShell section={section} wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{content.eyebrow || 'The line-up'}</Eyebrow>
          <Heading size={0.86}>{content.heading}</Heading>
          <Lead className="!mx-0">{content.sub}</Lead>
        </div>
        {content.note ? <p className="s-muted max-w-[26ch] text-[13px]">{content.note}</p> : null}
      </div>
      <div className={cx('mt-8', rows ? 'flex flex-col divide-y' : '')} style={rows ? { borderColor: 'var(--s-line)' } : undefined}>
        <Grid columns={rows ? 1 : section.settings?.columns || 3} gap={rows ? 0 : 'clamp(14px, 2.2vw, 24px)'}>
          {listOf(content.products).map((product, index) => {
            const image = asset(product.imageAssetId);
            return (
              <article
                key={index}
                className={cx('group relative', rows && 'flex items-center gap-6 py-5')}
                style={!rows ? { background: 'var(--s-surface)', border: '1px solid var(--s-line)', borderRadius: 'var(--s-radius)', overflow: 'hidden' } : undefined}
              >
                <div className={cx(rows && 'w-28 shrink-0')} style={!rows ? { aspectRatio: rows ? '1 / 1' : '4 / 3' } : undefined}>
                  <Media src={image?.url} alt={image?.alt || product.name} ratio={rows ? '1 / 1' : '4 / 3'} className="h-full" />
                </div>
                <div className={cx(!rows && 'p-5')}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[17px] leading-snug" style={{ fontFamily: 'var(--s-heading)' }}>
                      {product.name}
                    </h3>
                    {product.tag ? (
                      <span className="s-label shrink-0 rounded-pill px-2 py-1" style={{ border: '1px solid var(--s-line)', fontFamily: 'var(--s-label)' }}>
                        {product.tag}
                      </span>
                    ) : null}
                  </div>
                  {product.blurb ? <p className="s-muted mt-1.5 text-[14px] leading-relaxed">{product.blurb}</p> : null}
                  <Price value={product.price} unit={product.unit} />
                  {product.features?.length ? (
                    <ul className="s-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                      {listOf(product.features).map((feature, i) => (
                        <li key={i}>{Array.isArray(feature) ? feature.join(' ') : String(feature)}</li>
                      ))}
                    </ul>
                  ) : null}
                  {product.cta ? (
                    <p className="mt-3">
                      <ActionButton action={product.action || '#waitlist'} variant="ghostish">
                        <span style={{ borderBottom: '1px solid var(--s-line)', paddingBottom: 2 }}>{product.cta}</span>
                      </ActionButton>
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </Grid>
      </div>
    </SectionShell>
  );
}

function Gallery({ content, section }) {
  const { assets } = useSite();
  const ids = content.assetIds?.length ? content.assetIds : Object.keys(assets);
  const layout = content.layout || 'masonry';
  return (
    <SectionShell section={section} wide>
      <Eyebrow>Gallery</Eyebrow>
      <Heading size={0.82}>{content.heading}</Heading>
      <Lead>{content.sub}</Lead>
      <div
        className="mt-7 grid gap-3"
        style={{
          gridTemplateColumns: layout === 'strip' ? `repeat(${Math.max(1, ids.length)}, minmax(220px, 1fr))` : 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          gridAutoRows: layout === 'masonry' ? '10px' : undefined,
          overflowX: layout === 'strip' ? 'auto' : undefined,
        }}
      >
        {ids.map((id, index) => {
          const asset = assets[id];
          if (!asset) return null;
          const tall = layout === 'masonry' && index % 3 === 1;
          return (
            <figure
              key={id + index}
              className="group relative overflow-hidden"
              style={{ borderRadius: 'var(--s-radius)', gridRowEnd: layout === 'masonry' ? `span ${tall ? 34 : 26}` : undefined }}
            >
              <img
                src={asset.url}
                alt={asset.alt || asset.filename}
                loading="lazy"
                className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
                style={{ minHeight: 160 }}
              />
              {asset.caption || content.captions?.[index] ? (
                <figcaption
                  className="s-label absolute inset-x-0 bottom-0 translate-y-full p-3 text-[11px] opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                  style={{ background: 'var(--s-overlay)', fontFamily: 'var(--s-label)' }}
                >
                  {content.captions?.[index] || asset.caption}
                </figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>
    </SectionShell>
  );
}

function Video({ content, section }) {
  const asset = useAsset();
  const poster = asset(content.posterAssetId);
  const [playing, setPlaying] = useState(false);
  return (
    <SectionShell section={section} wide>
      <div className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Eyebrow>Film</Eyebrow>
          <Heading size={0.82}>{content.heading}</Heading>
          <Lead className="!mx-0">{content.body}</Lead>
        </div>
        <div className="relative overflow-hidden" style={{ borderRadius: 'var(--s-radius)', aspectRatio: content.ratio || '16 / 9', background: 'var(--s-surface)' }}>
          {playing && content.url?.includes('.mp4') ? (
            <video src={content.url} controls autoPlay poster={poster?.url} className="h-full w-full object-cover" />
          ) : (
            <>
              {poster?.url ? <img src={poster.url} alt="" className="h-full w-full object-cover opacity-80" /> : null}
              <button
                type="button"
                onClick={() => (content.url ? setPlaying(true) : undefined)}
                className="absolute inset-0 grid place-items-center"
                aria-label="Play film"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: 'var(--s-accent)', color: 'var(--s-accent-ink)' }}>
                  <Play className="h-5 w-5 translate-x-[1px]" fill="currentColor" strokeWidth={0} />
                </span>
              </button>
            </>
          )}
          {content.caption ? (
            <p className="s-label absolute bottom-0 left-0 right-0 p-3 text-[11px]" style={{ background: 'var(--s-overlay)', fontFamily: 'var(--s-label)' }}>
              {content.caption}
            </p>
          ) : null}
        </div>
      </div>
    </SectionShell>
  );
}

/* ── persuasion ───────────────────────────────────────────────────────────── */

function Pricing({ content, section }) {
  return (
    <SectionShell section={section}>
      <Eyebrow>Pricing</Eyebrow>
      <Heading size={0.86}>{content.heading}</Heading>
      <Lead>{content.sub}</Lead>
      <div className="mt-8">
        <Grid columns={3}>
          {listOf(content.plans).map((plan, index) => (
            <Card
              key={index}
              className={cx('flex h-full flex-col', plan.featured && 'relative')}
              style={plan.featured ? { background: 'var(--s-surface-alt)', borderColor: 'var(--s-accent)' } : undefined}
            >
              {plan.featured ? (
                <span className="s-label absolute right-4 top-4" style={{ fontFamily: 'var(--s-label)' }}>
                  Most chosen
                </span>
              ) : null}
              <h3 className="text-[15px] opacity-80" style={{ fontFamily: 'var(--s-label)' }}>
                {plan.name}
              </h3>
              <Price value={plan.price} unit={plan.unit} />
              <p className="s-muted mt-2 text-[14px]">{plan.blurb}</p>
              <Bullets items={plan.features} />
              <div className="mt-auto pt-5">
                <ActionButton action={plan.action || '#waitlist'} variant={plan.featured ? 'solid' : 'ghostish'}>
                  {plan.featured || !plan.cta ? plan.cta || 'Choose' : <span style={{ borderBottom: '1px solid var(--s-line)', paddingBottom: 2 }}>{plan.cta}</span>}
                </ActionButton>
              </div>
            </Card>
          ))}
        </Grid>
      </div>
      {content.note ? <p className="s-muted mt-6 text-center text-[13px]">{content.note}</p> : null}
    </SectionShell>
  );
}

function Testimonials({ content, section }) {
  const items = listOf(content.items);
  const middle = content.layout === 'featured' && items.length > 2 ? Math.floor(items.length / 2) : -1;
  return (
    <SectionShell section={section}>
      <Eyebrow>Word of mouth</Eyebrow>
      <Heading size={0.82}>{content.heading}</Heading>
      <div className="mt-8">
        <Grid columns={items.length > 2 ? 3 : 2}>
          {items.map((item, index) => (
            <figure
              key={index}
              className={cx('flex h-full flex-col justify-between p-5', index === middle && 's-invert')}
              style={{
                background: index === middle ? 'var(--s-accent)' : 'var(--s-surface)',
                color: index === middle ? 'var(--s-accent-ink)' : undefined,
                border: '1px solid var(--s-line)',
                borderRadius: 'var(--s-radius)',
              }}
            >
              <Quote className="h-5 w-5 opacity-40" strokeWidth={1.6} />
              <blockquote className="mt-3 text-[16px] leading-[1.55]" style={{ fontFamily: 'var(--s-heading)', fontWeight: 500 }}>
                {item.quote}
              </blockquote>
              <figcaption className="s-label mt-4 text-[11px] opacity-70" style={{ fontFamily: 'var(--s-label)' }}>
                {[item.name, item.role].filter(Boolean).join(' · ')}
              </figcaption>
            </figure>
          ))}
        </Grid>
      </div>
    </SectionShell>
  );
}

function Faq({ content, section }) {
  const [open, setOpen] = useState(0);
  const items = listOf(content.items);
  if (content.layout === 'grid') {
    return (
      <SectionShell section={section}>
        <Heading size={0.82}>{content.heading}</Heading>
        <div className="mt-7">
          <Grid columns={2}>
            {items.map((item, index) => (
              <Card key={index}>
                <h3 className="text-[16px]" style={{ fontFamily: 'var(--s-heading)' }}>
                  {item.question}
                </h3>
                <p className="s-muted mt-2 text-[14.5px] leading-relaxed">{item.answer}</p>
              </Card>
            ))}
          </Grid>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell section={section}>
      <Eyebrow>FAQ</Eyebrow>
      <Heading size={0.82}>{content.heading}</Heading>
      <div className="mx-auto mt-6 max-w-[720px]">
        {items.map((item, index) => {
          const expanded = open === index;
          return (
            <div key={index} style={{ borderBottom: '1px solid var(--s-line)' }}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? -1 : index)}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-6 py-4 text-left"
              >
                <span className="text-[16.5px]" style={{ fontFamily: 'var(--s-heading)' }}>
                  {item.question}
                </span>
                <span aria-hidden className="shrink-0 text-xl leading-none opacity-60 transition" style={{ transform: expanded ? 'rotate(45deg)' : 'none' }}>
                  +
                </span>
              </button>
              <div className="grid transition-all duration-300" style={{ gridTemplateRows: expanded ? '1fr' : '0fr', opacity: expanded ? 1 : 0 }}>
                <p className="s-muted overflow-hidden pb-4 pr-10 text-left text-[15px] leading-relaxed">{item.answer}</p>
              </div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}

function Logos({ content, section }) {
  const items = listOf(content.items);
  return (
    <SectionShell section={section} tight wide>
      {content.heading ? <p className="s-label s-muted mb-5 text-center">{content.heading}</p> : null}
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 opacity-75">
        {items.map((item, index) => (
          <span key={index} className="text-[15px] tracking-wide" style={{ fontFamily: 'var(--s-heading)', fontWeight: 600 }}>
            {typeof item === 'string' ? item : item.name}
          </span>
        ))}
      </div>
    </SectionShell>
  );
}

function Stats({ content, section }) {
  return (
    <SectionShell section={section} tight>
      <Eyebrow>{content.heading}</Eyebrow>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {listOf(content.items).map((stat, index) => (
          <div key={index} className="text-center">
            <p style={{ fontFamily: 'var(--s-heading)', fontSize: 'calc(var(--s-body)*2.4)', lineHeight: 1 }}>{stat.value}</p>
            <p className="s-muted mt-2 text-[13px]">{stat.label}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function Problem({ content, section }) {
  return (
    <SectionShell section={section}>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <Eyebrow>The problem</Eyebrow>
          <Heading size={0.82}>{content.heading}</Heading>
        </div>
        <div>
          <p className="text-[17px] leading-[1.7]" style={{ opacity: 0.86 }}>
            {content.body}
          </p>
          <Bullets items={content.points} check={false} />
        </div>
      </div>
    </SectionShell>
  );
}

function Solution({ content, section }) {
  const asset = useAsset();
  const image = asset(content.imageAssetId);
  return (
    <SectionShell section={section}>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <Eyebrow>The answer</Eyebrow>
          <Heading size={0.82}>{content.heading}</Heading>
          <p className="mt-4 text-[17px] leading-[1.7]" style={{ opacity: 0.86 }}>
            {content.body}
          </p>
          <Bullets items={content.points} />
        </div>
        {image ? <Media src={image.url} alt={image.alt || ''} ratio="4 / 3" /> : null}
      </div>
    </SectionShell>
  );
}

function Team({ content, section }) {
  const { assets } = useSite();
  return (
    <SectionShell section={section}>
      <Eyebrow>Who is behind it</Eyebrow>
      <Heading size={0.82}>{content.heading}</Heading>
      <Lead>{content.sub}</Lead>
      <div className="mt-8">
        <Grid columns={4}>
          {listOf(content.items).map((member, index) => {
            const image = assets[member.imageAssetId];
            return (
              <div key={index}>
                <Media src={image?.url} alt={member.name} ratio="1 / 1" />
                <p className="mt-3 text-[15.5px]" style={{ fontFamily: 'var(--s-heading)' }}>
                  {member.name}
                </p>
                <p className="s-label s-muted text-[11px]" style={{ fontFamily: 'var(--s-label)' }}>
                  {member.role}
                </p>
                {member.bio ? <p className="s-muted mt-1.5 text-[13px] leading-relaxed">{member.bio}</p> : null}
              </div>
            );
          })}
        </Grid>
      </div>
    </SectionShell>
  );
}

/* ── event & music vocabulary ─────────────────────────────────────────────── */

function EventDetails({ content, section }) {
  return (
    <SectionShell section={section} tight>
      <Eyebrow>Details</Eyebrow>
      <Heading size={0.8}>{content.heading}</Heading>
      <dl className="mx-auto mt-6 grid max-w-[760px] gap-x-10 gap-y-4 sm:grid-cols-2">
        {listOf(content.items).map((item, index) => (
          <div key={index} style={{ borderTop: '1px solid var(--s-line)', paddingTop: 12 }}>
            <dt className="s-label s-muted" style={{ fontFamily: 'var(--s-label)' }}>
              {item.label}
            </dt>
            <dd className="mt-1 text-[16px]" style={{ fontFamily: 'var(--s-heading)' }}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {content.note ? <p className="s-muted mt-6 text-center text-[13px]">{content.note}</p> : null}
    </SectionShell>
  );
}

function Speakers({ content, section }) {
  const { assets } = useSite();
  return (
    <SectionShell section={section}>
      <Eyebrow>Line-up</Eyebrow>
      <Heading size={0.84}>{content.heading}</Heading>
      <Lead>{content.sub}</Lead>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {listOf(content.items).map((speaker, index) => (
          <div key={index} className="flex items-start gap-4">
            <Media src={assets[speaker.imageAssetId]?.url} alt={speaker.name} ratio="1 / 1" className="w-20 shrink-0" />
            <div>
              <p className="text-[16.5px]" style={{ fontFamily: 'var(--s-heading)' }}>
                {speaker.name}
              </p>
              <p className="s-label s-muted text-[11px]" style={{ fontFamily: 'var(--s-label)' }}>
                {speaker.role}
              </p>
              {speaker.topic ? <p className="s-muted mt-1.5 text-[13.5px]">{speaker.topic}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function Schedule({ content, section }) {
  return (
    <SectionShell section={section}>
      <Eyebrow>Schedule</Eyebrow>
      <Heading size={0.84}>{content.heading}</Heading>
      <Lead>{content.sub}</Lead>
      <div className="mt-7 flex flex-col gap-8">
        {listOf(content.days).map((day, index) => (
          <div key={index}>
            <p className="s-label mb-3" style={{ fontFamily: 'var(--s-label)', borderBottom: '1px solid var(--s-line)', paddingBottom: 8 }}>
              {day.label}
            </p>
            <ul className="flex flex-col">
              {listOf(day.slots).map((slot, i) => (
                <li key={i} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6" style={{ borderBottom: '1px solid var(--s-line)' }}>
                  <span className="s-label s-muted w-16 shrink-0" style={{ fontFamily: 'var(--s-label)' }}>
                    {slot.time}
                  </span>
                  <span className="text-[16px]" style={{ fontFamily: 'var(--s-heading)' }}>
                    {slot.title}
                  </span>
                  {slot.who ? <span className="s-muted text-[14px]">{slot.who}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function Tickets({ content, section }) {
  return (
    <SectionShell section={section}>
      <Eyebrow>Tickets</Eyebrow>
      <Heading size={0.84}>{content.heading}</Heading>
      <div className="mt-8">
        <Grid columns={3}>
          {listOf(content.tiers).map((tier, index) => (
            <Card key={index} className="flex h-full flex-col" style={tier.soldOut ? { opacity: 0.55 } : undefined}>
              <h3 className="text-[15px]" style={{ fontFamily: 'var(--s-label)' }}>
                {tier.name}
              </h3>
              <Price value={tier.price} unit={tier.unit} />
              <p className="s-muted mt-2 text-[14px]">{tier.blurb}</p>
              <Bullets items={tier.features} />
              <div className="mt-auto pt-4">
                <ActionButton action={tier.action || '#contact'} variant={tier.featured ? 'solid' : 'ghostish'}>
                  {tier.cta || (tier.soldOut ? 'Sold out' : 'Get tickets')}
                </ActionButton>
              </div>
            </Card>
          ))}
        </Grid>
      </div>
      {content.note ? <p className="s-muted mt-5 text-center text-[13px]">{content.note}</p> : null}
    </SectionShell>
  );
}

function Menu({ content, section }) {
  return (
    <SectionShell section={section}>
      <Eyebrow>Menu</Eyebrow>
      <Heading size={0.84}>{content.heading}</Heading>
      <div className="mx-auto mt-7 flex max-w-[760px] flex-col gap-9">
        {listOf(content.groups).map((group, index) => (
          <div key={index}>
            <p className="s-label mb-3" style={{ fontFamily: 'var(--s-label)', borderBottom: '1px solid var(--s-line)', paddingBottom: 8 }}>
              {group.title}
            </p>
            <ul>
              {listOf(group.items).map((item, i) => (
                <li key={i} className="flex items-baseline gap-4 py-2.5">
                  <span className="text-[16px]" style={{ fontFamily: 'var(--s-heading)' }}>
                    {item.name}
                  </span>
                  <span aria-hidden className="h-px flex-1 opacity-40" style={{ background: 'var(--s-line)' }} />
                  {item.price ? <span className="tabular-nums text-[15px]">{item.price}</span> : null}
                  {item.desc ? <span className="s-muted w-full text-[13.5px] sm:w-auto sm:max-w-[38ch]">{item.desc}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {content.note ? <p className="s-muted mt-6 text-center text-[13px]">{content.note}</p> : null}
    </SectionShell>
  );
}

function Album({ content, section }) {
  const asset = useAsset();
  const artwork = asset(content.artworkAssetId);
  return (
    <SectionShell section={section}>
      <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <Media src={artwork?.url} alt={artwork?.alt || content.heading} ratio="1 / 1" />
        <div>
          <Eyebrow>New release</Eyebrow>
          <Heading size={0.95}>{content.heading}</Heading>
          <Lead className="!mx-0">{content.blurb}</Lead>
          {listOf(content.meta).length ? (
            <dl className="mt-6 flex flex-wrap gap-x-9 gap-y-3">
              {listOf(content.meta).map((row, index) => (
                <div key={index}>
                  <dt className="s-label s-muted" style={{ fontFamily: 'var(--s-label)' }}>
                    {row.label}
                  </dt>
                  <dd className="text-[15.5px]" style={{ fontFamily: 'var(--s-heading)' }}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {content.formats?.length ? <p className="s-muted mt-5 text-[13.5px]">Formats: {content.formats.join(' · ')}</p> : null}
        </div>
      </div>
    </SectionShell>
  );
}

function Tracklist({ content, section }) {
  return (
    <SectionShell section={section}>
      <Eyebrow>Tracks</Eyebrow>
      <Heading size={0.84}>{content.heading}</Heading>
      <ol className="mx-auto mt-6 max-w-[680px]">
        {listOf(content.items).map((track, index) => (
          <li key={index} className="flex items-baseline gap-4 py-2.5" style={{ borderBottom: '1px solid var(--s-line)' }}>
            <span className="s-label s-muted w-8 shrink-0" style={{ fontFamily: 'var(--s-label)' }}>
              {track.n}
            </span>
            <span className="flex-1 text-[16px]" style={{ fontFamily: 'var(--s-heading)' }}>
              {track.title}
            </span>
            {track.note ? <span className="s-muted text-[12.5px]">{track.note}</span> : null}
            {track.duration ? <span className="s-muted tabular-nums text-[13px]">{track.duration}</span> : null}
          </li>
        ))}
      </ol>
      {content.note ? <p className="s-muted mt-5 text-center text-[13px]">{content.note}</p> : null}
    </SectionShell>
  );
}

function ArtistStory({ content, section }) {
  const asset = useAsset();
  const image = asset(content.imageAssetId);
  return (
    <SectionShell section={section}>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        {image ? <Media src={image.url} alt={image.alt || ''} ratio="3 / 4" /> : null}
        <div>
          <Eyebrow>The story</Eyebrow>
          <Heading size={0.84}>{content.heading}</Heading>
          {content.quote ? (
            <blockquote className="mt-5 text-[19px] italic leading-snug" style={{ fontFamily: 'var(--s-heading)', opacity: 0.9 }}>
              “{content.quote}”
            </blockquote>
          ) : null}
          {listOf(content.paragraphs).map((paragraph, index) => (
            <p key={index} className="s-muted mt-4 text-[15.5px] leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function PreSave({ content, section }) {
  const { FormSlot } = useSite();
  return (
    <SectionShell section={section} tight>
      <Eyebrow>{content.dateLabel || 'Out now'}</Eyebrow>
      <Heading size={0.84}>{content.heading}</Heading>
      <Lead>{content.body}</Lead>
      <div className="mx-auto mt-6 flex max-w-[560px] flex-wrap items-center justify-center gap-2.5">
        {listOf(content.platforms).map((platform, index) => (
          <ActionButton key={index} action={platform.url || '#'} variant="ghostish">
            <span style={{ border: '1px solid var(--s-line)', borderRadius: 'calc(var(--s-radius)*0.6)', padding: '9px 16px', display: 'inline-flex' }}>
              {platform.label || platform.name}
            </span>
          </ActionButton>
        ))}
      </div>
      {FormSlot ? <FormSlot kind="preSave" label={content.ctaLabel || 'Pre-save'} /> : null}
    </SectionShell>
  );
}

/* ── capture & closing ────────────────────────────────────────────────────── */

function Waitlist({ content, section }) {
  const { FormSlot } = useSite();
  return (
    <SectionShell section={section} tight>
      <div
        className="mx-auto max-w-[860px] px-5 py-10 sm:px-10"
        style={{ background: 'var(--s-surface)', border: '1px solid var(--s-line)', borderRadius: `calc(var(--s-radius) * 1.6)` }}
      >
        <Eyebrow>Waitlist</Eyebrow>
        <Heading size={0.84}>{content.heading}</Heading>
        <Lead>{content.body}</Lead>
        {content.incentives?.length ? (
          <ul className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2">
            {content.incentives.map((incentive, index) => (
              <li key={index} className="s-muted text-[13.5px]">
                {incentive}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6">
          {FormSlot ? (
            <FormSlot kind="waitlist" placeholder={content.placeholder} label={content.ctaLabel} successCopy={content.successCopy} privacy={content.privacy} />
          ) : null}
        </div>
      </div>
    </SectionShell>
  );
}

function Newsletter({ content, section }) {
  const { FormSlot } = useSite();
  return (
    <SectionShell section={section} tight>
      <Eyebrow>Newsletter</Eyebrow>
      <Heading size={0.78}>{content.heading}</Heading>
      <Lead>{content.body}</Lead>
      <div className="mx-auto mt-6 max-w-[520px]">
        {FormSlot ? <FormSlot kind="newsletter" placeholder={content.placeholder} label={content.ctaLabel} /> : null}
      </div>
      {content.cadence ? <p className="s-label s-muted mt-4" style={{ fontFamily: 'var(--s-label)' }}>{content.cadence}</p> : null}
    </SectionShell>
  );
}

function Contact({ content, section }) {
  const { FormSlot } = useSite();
  return (
    <SectionShell section={section}>
      <div className="grid gap-9 lg:grid-cols-2">
        <div>
          <Eyebrow>Contact</Eyebrow>
          <Heading size={0.82} className="!mx-0">{content.heading}</Heading>
          <Lead className="!mx-0">{content.body}</Lead>
          {(content.channels || []).length ? (
            <dl className="mt-6 flex flex-col gap-3">
              {listOf(content.channels).map((channel, index) => (
                <div key={index} className="flex items-baseline gap-3">
                  <dt className="s-label s-muted w-24 shrink-0" style={{ fontFamily: 'var(--s-label)' }}>
                    {channel.label}
                  </dt>
                  <dd className="text-[15px]">{channel.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {content.note ? <p className="s-muted mt-5 text-[13px]">{content.note}</p> : null}
        </div>
        {FormSlot ? <FormSlot kind="contact" fields={content.fields} label="Send" /> : null}
      </div>
    </SectionShell>
  );
}

function Cta({ content, section }) {
  return (
    <SectionShell section={section} tight>
      <div className="mx-auto flex max-w-[820px] flex-col items-center gap-5 text-center">
        <Heading size={0.98}>{content.heading}</Heading>
        <Lead>{content.body}</Lead>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {content.primary ? <ActionButton action={content.primary.action}>{content.primary.label}</ActionButton> : null}
          {content.secondary ? (
            <ActionButton action={content.secondary.action} variant="ghostish">
              <span style={{ borderBottom: '1px solid var(--s-line)', paddingBottom: 2 }}>{content.secondary.label}</span>
            </ActionButton>
          ) : null}
        </div>
        {content.note ? <p className="s-label s-muted" style={{ fontFamily: 'var(--s-label)' }}>{content.note}</p> : null}
      </div>
    </SectionShell>
  );
}

function Social({ content, section }) {
  return (
    <SectionShell section={section} tight>
      {content.heading ? <Heading size={0.7}>{content.heading}</Heading> : null}
      <div className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-3">
        {listOf(content.links).map((link, index) => (
          <a
            key={index}
            href={link.url || '#'}
            target="_blank"
            rel="noreferrer"
            className="s-label text-[13px] transition hover:opacity-70"
            style={{ fontFamily: 'var(--s-label)' }}
          >
            {link.platform}
            {link.handle ? <span className="s-muted"> {link.handle}</span> : null}
          </a>
        ))}
      </div>
    </SectionShell>
  );
}

function Footer({ content, section, spec }) {
  const { slug, live } = useSite();
  return (
    <SectionShell section={section} tight wide>
      <div className="flex flex-col gap-6 border-t pt-8 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: 'var(--s-line)' }}>
        <div>
          <p className="text-[18px]" style={{ fontFamily: 'var(--s-heading)' }}>
            {spec?.name}
          </p>
          {content.tagline ? <p className="s-muted mt-1 text-[14px]">{content.tagline}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {listOf(content.legal).map((item, index) => (
            <span key={index} className="s-muted text-[13px]">
              {typeof item === 'string' ? item : item.label}
            </span>
          ))}
          {listOf(content.social).map((item, index) => (
            <a key={index} href={item.url || '#'} className="text-[13px] underline decoration-transparent transition hover:decoration-current" style={{ color: 'inherit' }}>
              {item.platform || item.label}
            </a>
          ))}
        </div>
      </div>
      <p className="s-label s-muted mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ fontFamily: 'var(--s-label)' }}>
        <span>{content.credits || `© ${new Date().getFullYear()} ${spec?.name}`}</span>
        {live && slug ? (
          <a
            href="/"
            className="opacity-70 transition hover:opacity-100"
            style={{ marginLeft: 'auto', border: '1px solid var(--s-line)', borderRadius: 999, padding: '4px 10px' }}
          >
            Built with Launchpad
          </a>
        ) : null}
      </p>
    </SectionShell>
  );
}

/* ── registry ─────────────────────────────────────────────────────────────── */

export const SECTIONS = {
  hero: Hero,
  countdown: Countdown,
  about: About,
  features: Features,
  productShowcase: ProductShowcase,
  gallery: Gallery,
  video: Video,
  pricing: Pricing,
  testimonials: Testimonials,
  faq: Faq,
  logos: Logos,
  stats: Stats,
  problem: Problem,
  solution: Solution,
  team: Team,
  eventDetails: EventDetails,
  speakers: Speakers,
  schedule: Schedule,
  tickets: Tickets,
  menu: Menu,
  album: Album,
  tracklist: Tracklist,
  artistStory: ArtistStory,
  preSave: PreSave,
  waitlist: Waitlist,
  newsletter: Newsletter,
  contact: Contact,
  cta: Cta,
  social: Social,
  footer: Footer,
};

export function renderSection(section, index, spec) {
  const Renderer = SECTIONS[section.type] || null;
  if (!Renderer) return null;
  return <Renderer section={section} content={section.content || {}} index={index} spec={spec} />;
}

export const SUPPORTED_TYPES = Object.keys(SECTIONS);
