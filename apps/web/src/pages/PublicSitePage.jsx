import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { SiteRenderer } from '../components/site/SiteRenderer';
import { useSession } from '../context/Session';
import NotFoundPage from './NotFoundPage';
import { ArrowLeft } from 'lucide-react';

/**
 * A published site at /:slug. Zero product chrome — the owner's branding, their
 * palette, their URL. The only concession is a discreet builder link, and only
 * when the visitor is actually the owner.
 */
export default function PublicSitePage() {
  const { slug } = useParams();
  const { isAuthed } = useSession();
  const [state, setState] = useState({ loading: true, site: null, error: null });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, site: null, error: null });
    const previous = document.title;
    api
      .publicSite(slug)
      .then((site) => {
        if (!alive) return;
        setState({ loading: false, site, error: null });
        document.title = `${site.name} — ${site.tagline || 'launchpad.app/' + slug}`;
      })
      .catch((error) => alive && setState({ loading: false, site: null, error }));
    return () => {
      alive = false;
      document.title = previous;
    };
  }, [slug]);

  if (state.loading) return <SiteLoading />;
  if (state.error) return state.error.status === 404 ? <NotFoundPage slug={slug} /> : <SiteError message={state.error.message} />;

  const site = state.site;
  const owner = site.ownerView;

  return (
    <div className="relative min-h-full" style={{ background: site.theme?.colors?.background }}>
      {/* `lp-live` marks a page a real visitor is reading at their own screen
          width — the builder's scaled preview must not borrow its type rules. */}
      <SiteRenderer spec={site} slug={slug} live device="desktop" className="lp-live" />
      {/* Every published page is reached from somewhere, and a page with no way
          out is how people get stuck. Same chrome as the owner's pill, opposite
          corner, so neither fights the site's own header. */}
      <Link
        to="/"
        data-back="/"
        aria-label="Back to the Launchpad home page"
        className="fixed bottom-4 left-4 z-40 inline-flex min-h-[40px] items-center gap-2 rounded-pill border border-white/15 bg-black/60 px-3.5 text-[14.5px] text-white/90 shadow-lift backdrop-blur transition hover:bg-black/80 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Launchpad
      </Link>
      {isAuthed && owner?.projectId ? (
        <Link
          to={owner.builderPath || `/builder/${owner.projectId}`}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-pill border border-white/15 bg-black/60 px-3.5 py-2 text-[13.5px] text-white shadow-lift backdrop-blur transition hover:bg-black/80"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          Open in builder
          {owner.hasUnpublishedChanges ? <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-300" title="Unpublished changes" /> : null}
          <ArrowUpRight className="h-3.5 w-3.5 opacity-60" />
        </Link>
      ) : null}
    </div>
  );
}

function SiteLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-900">
      <div className="w-full max-w-md px-6">
        <div className="skeleton mb-4 h-8 w-2/3 rounded-lg" />
        <div className="skeleton mb-2 h-3 w-full rounded" />
        <div className="skeleton mb-6 h-3 w-4/5 rounded" />
        <div className="skeleton h-40 w-full rounded-card" />
      </div>
    </div>
  );
}

function SiteError({ message }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-900 px-6 text-center">
      <div>
        <p className="micro mb-3">Could not load this site</p>
        <p className="max-w-[42ch] text-[15px] leading-relaxed text-ink-300">{message}</p>
        <a href="/" className="mt-6 inline-flex rounded-pill border border-line px-4 py-2 text-sm text-ink-100 hover:border-white/30">
          Back to Launchpad
        </a>
      </div>
    </div>
  );
}
