import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Images, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Primitives';
import { cx, relativeTime } from '../../lib/format';

/**
 * The examples row under your own launches.
 *
 * Three sources, one strip, in the order they earn trust:
 *   · sites this API generated (they open inside the app, and exist with the
 *     network off),
 *   · the curated gallery file the operator keeps (somebody else's live site,
 *     linked to, never copied),
 *   · Behance, only when a key exists — see apps/api/src/modules/inspiration.
 *
 * It renders even when there is nothing to show, because the empty dashboard's
 * "See an example first" points here: an absent section would make that link a
 * no-op again, which is the bug this strip exists to close.
 */

const GROUPS = [
  { key: 'launchpad', label: 'Made here', heading: 'Published by this API' },
  { key: 'link', label: 'Curated', heading: 'Worth looking at' },
  { key: 'behance', label: 'Behance', heading: 'From Behance' },
];

const tagFor = (source) => GROUPS.find((group) => group.key === source)?.label || 'Example';

export default function InspirationStrip() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [notice, setNotice] = useState('');
  const [category, setCategory] = useState('all');

  const load = (refresh) => {
    setState(refresh ? 'refreshing' : 'loading');
    return api
      .inspiration({ refresh })
      .then((payload) => {
        setData(payload);
        setState('ready');
        setNotice('');
      })
      .catch((error) => {
        // A failed examples row must not look like a failed account.
        setState('failed');
        setNotice(error.message || 'The examples could not be loaded.');
      });
  };

  useEffect(() => {
    let alive = true;
    setState('loading');
    api
      .inspiration({})
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setState('ready');
      })
      .catch((error) => {
        if (!alive) return;
        setState('failed');
        setNotice(error.message || 'The examples could not be loaded.');
      });
    return () => {
      alive = false;
    };
  }, []);

  const items = data?.items || [];
  const browse = data?.browse || [];
  const examples = data?.sources?.examples;
  const behance = data?.sources?.behance;
  const outside = items.filter((item) => item.source !== 'launchpad');
  const retryable = state === 'failed' || behance?.stale;

  // Category pills come from the curated group's own first tag — no separate
  // taxonomy to keep in sync, so a new examples.json entry with a new tag
  // just shows up as a new pill on its own.
  const curated = items.filter((item) => item.source === 'link');
  const categories = Array.from(new Set(curated.map((item) => item.tags?.[0]).filter(Boolean)));

  return (
    <section id="inspiration" aria-labelledby="inspiration-heading" className="mt-14 scroll-mt-24 border-t border-line pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="micro mb-2 flex items-center gap-2">
            <Images className="h-3.5 w-3.5" aria-hidden="true" />
            Examples
          </p>
          <h2 id="inspiration-heading" className="font-display text-[22px] font-medium leading-tight tracking-[-0.02em]">
            What this produces, and what it looks like done well
          </h2>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {browse.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="link-quiet inline-flex min-h-[40px] min-w-0 items-center gap-1.5 px-2 text-[13.5px]"
            >
              <span className="min-w-0 truncate">{link.label}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
          ))}
          {retryable ? (
            <Button size="sm" variant="secondary" onClick={() => load(true)} loading={state === 'refreshing'}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </Button>
          ) : null}
        </div>
      </div>

      {state === 'loading' && !items.length ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[420px] min-w-0 rounded-card" />
          ))}
        </div>
      ) : null}

      {state === 'ready' && !items.length ? (
        <div className="mt-6 rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-display text-lg">No examples on this API yet.</p>
          <p className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-300">
            Nothing has been published, and there is no curated list to show.{' '}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[14px]">npm run seed</code> loads four real generated launches, and
            <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[14px]">apps/api/examples.json</code> holds the list below.
          </p>
        </div>
      ) : null}

      {GROUPS.map((group) => {
        const groupCards = items.filter((item) => item.source === group.key);
        if (!groupCards.length) return null;
        const isCurated = group.key === 'link';
        const cards = isCurated && category !== 'all' ? groupCards.filter((item) => item.tags?.[0] === category) : groupCards;
        return (
          <div key={group.key}>
            <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] uppercase tracking-[0.08em] text-ink-400">{group.heading}</p>
              {isCurated && categories.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCategory('all')}
                    className={cx(
                      'rounded-pill border px-2.5 py-1 text-[12.5px] transition',
                      category === 'all' ? 'border-white/30 bg-white/10 text-white' : 'border-line text-ink-400 hover:text-white'
                    )}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cx(
                        'rounded-pill border px-2.5 py-1 text-[12.5px] transition',
                        category === cat ? 'border-white/30 bg-white/10 text-white' : 'border-line text-ink-400 hover:text-white'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {isCurated && !cards.length ? (
              <p className="text-[13.5px] text-ink-400">Nothing curated under "{category}" yet.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((item) => (
                  <Card key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {outside.length ? (
        <p className="mt-3 max-w-[78ch] text-[12.5px] leading-relaxed text-ink-400">
          The sites below belong to the people who made them. This row links to them and credits who they are by; nothing here is downloaded,
          re-hosted, or copied into your project — it is here to show what good looks like, not to be your site.
        </p>
      ) : null}

      {state === 'ready' && examples && !examples.configured ? (
        <p className="mt-4 text-[13px] text-ink-400">
          No curated list on this API — add entries to <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[12.5px]">{examples.file || 'examples.json'}</code>
          {examples.skipped ? ` (${examples.skipped} skipped: ${examples.skippedWhy?.join('; ')})` : ''}
          {examples.reason ? ` — ${examples.reason}` : ''}.
        </p>
      ) : null}

      {state === 'ready' && behance && !behance.configured ? (
        <p className="mt-2 text-[13px] text-ink-400">
          Behance is not set up on this API — put <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[12.5px]">BEHANCE_API_KEY</code> in
          <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[12.5px]">.env</code>
          {behance.reason ? ` (${behance.reason})` : ''}. The cards above are still real: they were generated here or chosen by hand.
        </p>
      ) : null}

      {notice ? <p className="mt-4 text-[13px] text-ink-400">{notice}</p> : null}
    </section>
  );
}

/** One card. Its footer says which of the three sources it came from. */
function Card({ item }) {
  const internal = item.source === 'launchpad';
  const body = (
    <>
      <Cover item={item} />
      <div className="min-w-0 flex-1 px-5 pt-4 pb-5">
        <p className="flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-[18px] leading-snug">{item.title}</span>
          {internal ? null : <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-white" aria-hidden="true" />}
        </p>
        <p className="mt-2 line-clamp-3 text-[14.5px] leading-relaxed text-ink-300">{item.blurb || (internal ? 'A site generated from a description.' : '')}</p>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        <span className="min-w-0 truncate text-[13px] text-ink-400">
          {internal
            ? item.publishedAt
              ? relativeTime(item.publishedAt)
              : 'live'
            : item.author}
          {!internal && item.stats?.appreciations ? ` · ${item.stats.appreciations.toLocaleString('en-US')}` : ''}
        </span>
        <Tag>{tagFor(item.source)}</Tag>
      </div>
    </>
  );

  const shell = 'group flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-ink-850/70 transition duration-300 hover:-translate-y-0.5 hover:border-white/25';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 0.8, 0.24, 1] }}
      className="min-w-0"
    >
      {internal ? (
        <Link to={item.url} className={shell}>
          {body}
        </Link>
      ) : (
        <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className={shell}>
          {body}
        </a>
      )}
    </motion.div>
  );
}

/**
 * A hot-linked image is allowed to fail — a host can refuse a referrer, or an
 * entry in the curated file can point at a dead URL — so the fallback is a plain
 * coloured block rather than a broken-image icon.
 */
function Cover({ item }) {
  const [broken, setBroken] = useState(false);
  const show = item.cover && !broken;
  return (
    <div className={cx('relative aspect-[3/4] w-full overflow-hidden bg-ink-900', show ? '' : 'grid place-items-center')}>
      {show ? (
        <img
          src={item.cover}
          alt={item.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center font-display text-[32px] text-white/80"
          style={item.accent ? { background: `linear-gradient(140deg, ${item.accent}, rgba(10,11,16,0.9))` } : undefined}
          aria-hidden="true"
        >
          {String(item.title || '?').trim().charAt(0).toUpperCase() || '·'}
        </span>
      )}
    </div>
  );
}