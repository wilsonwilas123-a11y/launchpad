import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Globe2, Layers, Plus, Search, Share2, Sparkles, Trash2, Rocket } from 'lucide-react';
import { api } from '../lib/api';
import { Logo } from '../components/brand/RocketMark';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import { Button, IconButton } from '../components/ui/Button';
import { StatusPill } from '../components/ui/StatusPill';
import { EmptyState, Modal, Tag } from '../components/ui/Primitives';
import { Segmented } from '../components/ui/Segmented';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';
import { copyText, cx, relativeTime, shareLink } from '../lib/format';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'ready', label: 'Ready' },
  { value: 'live', label: 'Live' },
];

export default function DashboardPage() {
  const { user, health } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.projects.list();
      setProjects(data.items || []);
    } catch (error) {
      setProjects([]);
      toast.error(error.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const list = (projects || []).filter((project) => {
      if (filter !== 'all' && project.status !== filter) return false;
      if (query && !`${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    return list;
  }, [projects, filter, query]);

  const counts = useMemo(() => {
    const list = projects || [];
    return {
      all: list.length,
      live: list.filter((p) => p.status === 'live').length,
      ready: list.filter((p) => p.status === 'ready').length,
      captures: list.reduce((sum, p) => sum + (p.signupCount || 0), 0),
    };
  }, [projects]);

  const publishNow = async (project) => {
    setBusy(project.id);
    try {
      const result = await api.projects.publish(project.id, {});
      toast.success('Published.', { detail: result.publish.displayUrl });
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(confirm.id);
    try {
      await api.projects.remove(confirm.id);
      toast.push(`${confirm.name} deleted.`);
      setConfirm(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const share = async (project) => {
    const url = project.liveUrl || `https://launchpad.app/${project.slug}`;
    const result = await shareLink({ url, title: project.name, text: project.previewText });
    if (result.method === 'clipboard') toast.push('Link copied ✓', { tone: 'copy' });
    else if (result.method === 'none') toast.error('Could not reach the clipboard.');
  };

  return (
    <div className="relative min-h-screen pb-24">
      <AmbientBackdrop variant="quiet" />
      <div className="relative">
        <header className="shell flex h-20 items-center gap-3">
          <Logo />
          <nav className="ml-auto flex items-center gap-2">
            {health && health.ai?.reachable === false ? (
              <span className="hidden items-center gap-2 rounded-pill border border-line px-3 py-1.5 text-[11.5px] text-ink-300 md:inline-flex" title={health.ai.reason || ''}>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-200/80" />
                Local model · generation runs on this machine
              </span>
            ) : null}
            <Button variant="ghost" size="sm" to="/pricing">
              Pricing
            </Button>
            <Button variant="ghost" size="sm" to="/account">
              {user?.name?.split(' ')[0] || 'Account'}
            </Button>
            <Button size="sm" onClick={() => navigate('/build')}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
              New launch
            </Button>
          </nav>
        </header>

        <main className="shell pt-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-medium leading-tight tracking-[-0.035em]">Your launches</h1>
              <p className="mt-1.5 text-[14px] text-ink-300">
                {projects === null ? 'Loading…' : `${counts.all} project${counts.all === 1 ? '' : 's'} · ${counts.live} live · ${counts.ready} waiting to publish`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ink-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search launches"
                  className="field h-9 w-[190px] pl-9 text-[13.5px]"
                  aria-label="Search launches"
                />
              </label>
              <Segmented size="sm" value={filter} onChange={setFilter} options={FILTERS} />
            </div>
          </div>

          {projects === null ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[286px] rounded-card" />
              ))}
            </div>
          ) : !projects.length ? (
            <EmptyDashboard onNew={() => navigate('/build')} />
          ) : (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {shown.map((project, index) => (
                    <motion.div
                      key={project.id}
                      layout
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.4, delay: Math.min(0.12, index * 0.03), ease: [0.22, 0.8, 0.24, 1] }}
                    >
                      <ProjectCard
                        project={project}
                        busy={busy === project.id}
                        onOpen={() => navigate(`/builder/${project.id}`)}
                        onPublish={() => publishNow(project)}
                        onShare={() => share(project)}
                        onDelete={() => setConfirm(project)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {!shown.length ? <p className="mt-10 text-center text-[14px] text-ink-400">Nothing matches that filter.</p> : null}
            </>
          )}
        </main>
      </div>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={`Delete ${confirm?.name || 'this launch'}?`}
        subtitle="The site stops serving immediately and its address is released. There is no undo."
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={busy === confirm?.id}>
              Delete launch
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-300">
          {confirm?.sectionCount ? `${confirm.sectionCount} sections and ${confirm.assetCount || 0} assets go with it.` : 'This draft has nothing generated yet.'}
        </p>
      </Modal>
    </div>
  );
}

function ProjectCard({ project, onOpen, onPublish, onShare, onDelete, busy }) {
  const navigate = useNavigate();
  const toast = useToast();
  const live = project.status === 'live';
  const complete = (project.completion || []).filter((step) => step.done).length;
  const total = (project.completion || []).length || 7;

  const copy = async () => {
    if (await copyText(project.liveUrl)) toast.push('Link copied ✓', { tone: 'copy' });
  };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-ink-850/70 transition duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lift">
      <button type="button" onClick={onOpen} className="relative block aspect-[16/10] w-full overflow-hidden border-b border-line text-left" style={{ background: '#0a0a0c' }}>
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={`${project.name} preview`} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-end justify-between p-4">
            <span className="font-display text-[22px] leading-none tracking-[-0.02em] text-ink-100">{project.name}</span>
            <span className="micro">{project.type}</span>
          </span>
        )}
        <span className="absolute right-3 top-3">
          <StatusPill status={project.status} size="sm" />
        </span>
        {project.hasUnpublishedChanges ? (
          <span className="absolute bottom-3 left-3 rounded-pill border border-white/15 bg-black/55 px-2 py-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-100 backdrop-blur">
            Unpublished changes
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 truncate font-display text-[19px] leading-tight tracking-[-0.02em]">{project.name}</h2>
            <Tag mono className="shrink-0">
              {project.type}
            </Tag>
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-300">{project.previewText || project.description || 'No description yet.'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 opacity-70" />
            {project.sectionCount || 0} sections
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe2 className="h-3.5 w-3.5 opacity-70" />
            {project.platformLabel || 'Mobile + Laptop'}
          </span>
          <span className="ml-auto">{relativeTime(project.updatedAt)}</span>
        </div>

        {!live ? (
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
            <motion.span className="block h-full rounded-full bg-white/70" initial={{ width: 0 }} animate={{ width: `${Math.round((complete / total) * 100)}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
          </div>
        ) : (
          <button type="button" onClick={copy} className="-mx-1 truncate rounded-tile px-1 py-0.5 text-left font-mono text-[11.5px] text-ink-300 transition hover:text-white" title="Copy the live link">
            {project.displayUrl}
          </button>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button size="sm" variant={live ? 'secondary' : 'primary'} onClick={onOpen} className="flex-1">
            {live ? 'Open builder' : project.status === 'ready' ? 'Review & publish' : 'Continue'}
          </Button>
          {project.status === 'ready' ? (
            <Button size="sm" onClick={onPublish} loading={busy}>
              <Rocket className="h-3.5 w-3.5" strokeWidth={2.2} />
              Publish
            </Button>
          ) : null}
          {live ? (
            <IconButton label="Share" onClick={onShare}>
              <Share2 className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          <IconButton label="Delete launch" onClick={onDelete} className="hover:border-red-400/40 hover:text-red-100">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

function EmptyDashboard({ onNew }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 0.8, 0.24, 1] }} className="mt-10">
      <EmptyState
        icon={Sparkles}
        title="Nothing launched yet."
        body="Your first idea is one description away."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="lg" onClick={onNew}>
              + Start Building
            </Button>
            <a href="/" className="link-quiet px-2 text-[13.5px]">
              See an example first
            </a>
          </div>
        }
      />
    </motion.div>
  );
}
