import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Laptop, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { SiteRenderer } from '../components/site/SiteRenderer';
import { Segmented } from '../components/ui/Segmented';

/**
 * Full-screen preview of the *draft* (not the published snapshot) so the owner
 * can check a change before re-publishing. Escape or the pill returns to the
 * builder.
 */
export default function PreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState('desktop');
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .projects.get(id)
      .then(setProject)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') navigate(`/builder/${id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, navigate]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-900 px-6 text-center">
        <div>
          <p className="font-display text-2xl">Nothing to preview yet</p>
          <p className="mt-2 text-sm text-ink-300">{error}</p>
          <Link to={`/builder/${id}`} className="mt-6 inline-flex rounded-pill bg-white px-4 py-2 text-sm font-medium text-ink-900">
            Back to the builder
          </Link>
        </div>
      </div>
    );
  }

  const spec = project?.spec;

  return (
    <div className="min-h-screen" style={{ background: spec?.theme?.colors?.background || '#07070a' }}>
      <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-pill border border-line bg-black/60 px-2 py-1.5 text-white shadow-lift backdrop-blur">
        <Link to={`/builder/${id}`} className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] transition hover:bg-white/10">
          <ArrowLeft className="h-3.5 w-3.5" />
          Builder
        </Link>
        <span className="h-4 w-px bg-white/15" />
        <Segmented
          size="sm"
          value={device}
          onChange={setDevice}
          options={[
            { value: 'mobile', label: '', icon: Smartphone },
            { value: 'desktop', label: '', icon: Laptop },
          ]}
          className="!border-transparent !bg-transparent !p-0"
        />
        <span className="px-2 text-[11px] uppercase tracking-[0.16em] text-ink-300">Draft preview</span>
      </div>
      <div className={device === 'mobile' ? 'mx-auto max-w-[430px] pt-16' : 'pt-14'}>
        {spec ? <SiteRenderer spec={spec} device={device} slug={project.slug} live={false} /> : null}
      </div>
    </div>
  );
}
