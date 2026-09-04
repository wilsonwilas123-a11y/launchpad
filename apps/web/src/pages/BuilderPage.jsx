import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ImageIcon, LayoutList, RotateCcw } from 'lucide-react';
import { api, fileToUpload } from '../lib/api';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';
import { clearDraft } from '../lib/wizard';
import { copyText, cx, isVideo } from '../lib/format';
import BuilderTopBar from '../components/builder/BuilderTopBar';
import CommandBar from '../components/builder/CommandBar';
import LeftPane from '../components/builder/LeftPane';
import PreviewPane from '../components/builder/PreviewPane';
import EditorPane from '../components/builder/EditorPane';
import GenerationOverlay from '../components/wizard/GenerationOverlay';
import { Button } from '../components/ui/Button';
import { Modal, Tag } from '../components/ui/Primitives';
import { Segmented } from '../components/ui/Segmented';

/**
 * The builder. Local state mirrors the server spec and every control writes
 * through the same PATCH, debounced by ~600ms, so the preview reacts instantly
 * while the record stays the single source of truth.
 */
export default function BuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ready, isAuthed } = useSession();
  const toast = useToast();

  const [project, setProject] = useState(null);
  const [spec, setSpec] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [vocabulary, setVocabulary] = useState([]);
  const [device, setDevice] = useState('desktop');
  const [selected, setSelected] = useState(null);
  const [leftTab, setLeftTab] = useState('sections');
  const [panel, setPanel] = useState(null);
  const [state, setState] = useState('saved');
  const [busy, setBusy] = useState('');
  const [changes, setChanges] = useState(null);
  const [picking, setPicking] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [draggingAsset, setDraggingAsset] = useState(null);
  const [generation, setGeneration] = useState({ open: false, finished: false, result: null });

  const pending = useRef(null);
  /** Specs as they were before each AI command, so Undo means Undo. */
  const history = useRef([]);
  const timer = useRef(null);
  const uploadRef = useRef(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!ready) return undefined;
    if (!isAuthed) {
      navigate('/sign-in', { replace: true, state: { from: `/builder/${id}` } });
      return undefined;
    }
    if (loaded.current) return undefined;
    loaded.current = true;
    api
      .projects
      .get(id)
      .then((found) => {
        apply(found);
        setBaseline(found.spec ? JSON.parse(JSON.stringify(found.spec)) : null);
        const platforms = found.selectedPlatforms || ['both'];
        setDevice(platforms.length === 1 && platforms[0] === 'mobile' ? 'mobile' : 'desktop');
      })
      .catch((error) => {
        toast.error(error.message);
        navigate('/dashboard', { replace: true });
      });
    api.catalog().then((data) => setVocabulary(data.sections || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isAuthed, id]);

  function apply(next) {
    if (!next) return;
    setProject(next);
    if (next.spec) setSpec(next.spec);
  }

  /* ── the debounce that keeps the server honest ──────────────────────────── */
  const flush = useCallback(async () => {
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    try {
      const saved = await api.projects.update(id, patch);
      apply(saved);
      setState(saved.status === 'live' ? 'published' : 'saved');
    } catch (error) {
      setState('dirty');
      toast.error(error.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, toast]);

  const queue = useCallback(
    (patch) => {
      const current = pending.current || {};
      for (const key of ['theme', 'nav', 'platform']) {
        if (patch[key]) current[key] = { ...(current[key] || {}), ...patch[key] };
      }
      if (patch.sections) current.sections = patch.sections;
      if (patch.name !== undefined) current.name = patch.name;
      pending.current = current;
      setState('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
    [flush],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (state !== 'saving') return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state]);

  /* ── spec mutations ─────────────────────────────────────────────────────── */
  const sections = spec?.sections || [];
  const section = useMemo(() => sections.find((entry) => entry.id === selected) || null, [sections, selected]);

  const patchTheme = (patch) => {
    const theme = { ...(spec?.theme || {}), ...patch };
    if (patch.colors) theme.colors = { ...(spec?.theme?.colors || {}), ...patch.colors };
    if (patch.typography) theme.typography = { ...(spec?.theme?.typography || {}), ...patch.typography };
    if (patch.imagery) theme.imagery = { ...(spec?.theme?.imagery || {}), ...patch.imagery };
    setSpec((current) => ({ ...current, theme }));
    queue({ theme });
  };

  const patchSections = (next) => {
    setSpec((current) => ({ ...current, sections: next }));
    queue({ sections: next });
  };

  const patchSection = (sectionId, patch) => {
    const next = sections.map((entry) => {
      if (entry.id !== sectionId) return entry;
      const merged = { ...entry, ...patch };
      if (patch.content) merged.content = { ...(entry.content || {}), ...patch.content };
      if (patch.settings) merged.settings = { ...(entry.settings || {}), ...patch.settings };
      return merged;
    });
    patchSections(next);
  };

  const move = (from, to) => {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [taken] = next.splice(from, 1);
    next.splice(to, 0, taken);
    patchSections(next);
  };

  const addSection = (entry) => {
    const newSection = {
      id: `${entry.type}-${Math.random().toString(36).slice(2, 7)}`,
      type: entry.type,
      label: entry.label,
      hidden: false,
      content: seedFor(entry.type),
      assets: [],
    };
    patchSections([...sections, newSection]);
    setSelected(newSection.id);
    api.projects.remapAssets(id).then(apply).catch(() => {});
    toast.success(`${entry.label} added.`, { detail: 'Placeholders until you drop images on it — the section is already live-editable.' });
  };

  const placeAsset = async (assetId, sectionId) => {
    const target = sections.find((entry) => entry.id === (sectionId || selected));
    if (!target) {
      toast.error('Select the section that should hold the image first.');
      return;
    }
    const asset = (project?.assets || []).find((entry) => entry.id === assetId);
    const placed = { assetId, filename: asset?.filename, url: asset?.url, alt: asset?.alt || asset?.description || asset?.filename, placement: 'fill' };
    const next = sections.map((entry) => {
      const without = (entry.assets || []).filter((item) => item.assetId !== assetId);
      if (entry.id !== target.id) return without === entry.assets ? entry : { ...entry, assets: without };
      return { ...entry, assets: [...without, placed] };
    });
    patchSections(next);
    await api.projects.updateAsset(id, assetId, { selectedSection: target.type }).catch(() => {});
    toast.success(`Placed in ${target.label || target.type}.`);
  };

  /* ── server actions ─────────────────────────────────────────────────────── */
  const run = useCallback(
    async (command) => {
      setBusy('refine');
      setChanges(null);
      const before = spec ? JSON.parse(JSON.stringify(spec)) : null;
      try {
        const result = await api.projects.refine(id, command);
        const next = result.project || { ...project, spec: result.spec || project?.spec };
        apply(next);
        if (result.spec && !result.project) setSpec(result.spec);
        setChanges({ summary: result.summary, changes: result.changes || [], rejected: result.rejected || [], readAs: result.readAs, changed: result.changed });
        if (result.changed && before) history.current.push(before);
        const changed = (result.changes || []).length;
        toast.success(result.changed ? `${changed} change${changed === 1 ? '' : 's'} applied.` : 'Nothing to change — the page already reads that way.', { detail: result.summary });
      } catch (error) {
        if (error.status === 409) toast.error('Ask again in a moment — a change is still being applied.');
        else toast.error(error.message);
      } finally {
        setBusy('');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, project, baseline, queue],
  );

  const publish = async () => {
    setBusy('publish');
    clearTimeout(timer.current);
    if (pending.current) await flush();
    try {
      const result = await api.projects.publish(id);
      const next = result.project || result;
      apply(next);
      setState(next.status === 'live' ? 'published' : 'saved');
      const url = next.liveUrl || result.url;
      toast.success('Your site is live.', {
        detail: url,
        duration: 7000,
        action: { label: 'Copy link', onClick: () => copyText(url).then((ok) => toast[ok ? 'success' : 'error'](ok ? 'Link copied.' : 'Could not copy that.')) },
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const unpublish = async () => {
    setBusy('unpublish');
    try {
      const next = await api.projects.unpublish(id);
      apply(next);
      setState('saved');
      toast.info('Taken offline. The address is reserved for you.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const upload = async (files, meta = {}) => {
    if (!files?.length) return;
    setBusy('upload');
    try {
      const payload = [];
      for (const file of files) payload.push(await fileToUpload(file, meta));
      const result = await api.projects.addAssets(id, payload);
      apply(result.project || (await api.projects.get(id)));
      toast.success(`${files.length} file${files.length === 1 ? '' : 's'} added.`, { detail: describePlacements(result.assets) });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const removeAsset = async (assetId) => {
    try {
      const next = await api.projects.removeAsset(id, assetId);
      apply(next);
      if (sections.some((entry) => (entry.assets || []).some((item) => item.assetId === assetId))) {
        patchSections(sections.map((entry) => ({ ...entry, assets: (entry.assets || []).filter((item) => item.assetId !== assetId) })));
      }
      toast.info('Asset removed from this launch.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const generate = useCallback(
    async (platforms) => {
      setGeneration({ open: true, finished: false, result: null });
      setBusy('generate');
      try {
        if (platforms) await api.projects.update(id, { selectedPlatforms: platforms });
        const result = await api.projects.generate(id, platforms ? { selectedPlatforms: platforms } : {});
        apply(result);
        setBaseline(result.spec ? JSON.parse(JSON.stringify(result.spec)) : null);
        clearDraft();
        setGeneration({ open: true, finished: true, result });
      } catch (error) {
        setGeneration({ open: false, finished: false, result: null });
        toast.error(error.message);
      } finally {
        setBusy('');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, toast],
  );

  const copyLink = async () => {
    const url = project?.liveUrl;
    if (!url) return toast.error('Publish it first and the address appears here.');
    const ok = await copyText(url);
    toast[ok ? 'success' : 'error'](ok ? 'Live link copied.' : 'Your browser blocked the clipboard — copy it from the share panel.');
  };

  const previewPlatform = (platforms) => {
    setDevice(platforms.length === 1 && platforms[0] === 'mobile' ? 'mobile' : 'desktop');
    setPanel(null);
    const same = JSON.stringify([...(project?.selectedPlatforms || [])].sort()) === JSON.stringify([...platforms].sort());
    if (same) return;
    if (!spec) return;
    setPendingPlatforms(platforms);
  };

  const [pendingPlatforms, setPendingPlatforms] = useState(null);

  const shortcuts = useCallback(
    (event) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
        if (event.key === 'Escape') event.target.blur();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        clearTimeout(timer.current);
        flush().then(() => toast.success('Saved.'));
        return;
      }
      if (event.key === 'Escape') setSelected(null);
      if (event.key === 'm') setDevice((value) => (value === 'mobile' ? 'desktop' : 'mobile'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flush],
  );

  useEffect(() => {
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [shortcuts]);

  if (!project) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border border-line border-t-white" />
          <p className="text-[13px] text-ink-300">Opening your launch…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-ink-900">
      <BuilderTopBar
        project={project}
        saveState={state}
        busy={busy}
        onRename={(name) => {
          setProject((current) => ({ ...current, name }));
          queue({ name });
        }}
        onPublish={publish}
        onUnpublish={unpublish}
        onCopyLink={copyLink}
        onShare={(method) => toast.success(method === 'clipboard' ? 'Link copied — go and paste it somewhere.' : 'Shared.')}
        onPreview={() => window.open(`/preview/${project.id}`, '_blank', 'noopener')}
      />

      <CommandBar
        onRun={run}
        busy={busy === 'refine' ? 'refine' : ''}
        lastChanges={changes}
        onDismissChanges={() => setChanges(null)}
        onUndo={
          history.current.length
            ? () => {
                const previous = history.current.pop();
                if (!previous) return;
                setSpec(previous);
                setChanges(null);
                queue({ theme: previous.theme, sections: previous.sections, nav: previous.nav, platform: previous.platform });
                toast.info('That change is undone.');
              }
            : null
        }
      />

      <div className="grid min-h-0 flex-1 lg:grid-cols-[250px_minmax(0,1fr)_306px]">
        <div className={cx('min-h-0', panel === 'left' ? 'fixed inset-x-0 bottom-0 top-[112px] z-40 block' : 'hidden lg:block')}>
          <LeftPane
            spec={spec}
            tab={leftTab}
            setTab={setLeftTab}
            assets={project.assets || []}
            vocabulary={vocabulary}
            selected={selected}
            onSelect={(sectionId) => {
              setSelected(sectionId);
              setPanel(null);
            }}
            onReorder={move}
            onToggleHidden={(sectionId) => {
              const entry = sections.find((item) => item.id === sectionId);
              if (entry) patchSection(sectionId, { hidden: !entry.hidden });
            }}
            onDeleteSection={(sectionId) => patchSections(sections.filter((entry) => entry.id !== sectionId))}
            onAddSection={addSection}
            onPickUpAsset={setDraggingAsset}
            onDropOnSection={placeAsset}
            onRemoveAsset={removeAsset}
            onUpload={() => uploadRef.current?.click()}
            onRemap={() => {
              api.projects.remapAssets(id).then((next) => { apply(next); toast.success('Images re-matched to sections.'); }).catch((error) => toast.error(error.message));
            }}
            busy={busy}
            liveUrl={project.liveUrl}
            displayUrl={project.displayUrl}
          />
        </div>

        <PreviewPane
          spec={spec}
          device={device}
          setDevice={setDevice}
          selected={selected}
          onSelect={setSelected}
          onDropAsset={placeAsset}
          draggingAsset={draggingAsset}
          onGenerate={() => generate()}
          busy={busy}
          live={project.status === 'live'}
          liveUrl={project.liveUrl}
          previewUrl={`/preview/${project.id}`}
          sectionLabel={section?.label || section?.type}
          onAskAbout={(label) => {
            setPanel('right');
            toast.info(`Describe what should change in ${label} — the box at the top is for exactly that.`);
          }}
        />

        <div className={cx('min-h-0', panel === 'right' ? 'fixed inset-x-0 bottom-0 top-[112px] z-40 block' : 'hidden lg:block')}>
          <EditorPane
            spec={spec}
            section={section}
            vocabulary={vocabulary}
            busy={busy}
            onTheme={patchTheme}
            onSection={patchSection}
            onNav={(patch) => {
              setSpec((current) => ({ ...current, nav: { ...(current?.nav || {}), ...patch } }));
              queue({ nav: patch });
            }}
            onPlatform={(patch) => {
              setSpec((current) => ({ ...current, platform: { ...(current?.platform || {}), ...patch } }));
              queue({ platform: patch });
            }}
            onPlatformTarget={previewPlatform}
            onMove={(entry, delta) => {
              const index = sections.findIndex((item) => item.id === entry.id);
              move(index, index + delta);
            }}
            onRevealAssets={() => {
              setLeftTab('assets');
              setPanel('left');
            }}
            onPickAsset={(sectionId) => setPicking(sectionId)}
            onRemap={() => api.projects.remapAssets(id).then(apply).catch((error) => toast.error(error.message))}
          />
        </div>
      </div>

      {/* mobile affordances: the two panels live behind these */}
      <div className="flex items-center gap-2 border-t border-line px-3 py-2 lg:hidden">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setPanel(panel === 'left' ? null : 'left')}>
          <LayoutList className="h-3.5 w-3.5" />
          {leftTab === 'assets' ? 'Assets' : 'Sections'}
        </Button>
        <Segmented
          size="sm"
          className="flex-1 justify-center"
          layoutId="builder-mobile-device"
          value={device}
          onChange={setDevice}
          options={[
            { value: 'mobile', label: 'Phone' },
            { value: 'desktop', label: 'Desktop' },
          ]}
        />
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setPanel(panel === 'right' ? null : 'right')}>
          <ImageIcon className="h-3.5 w-3.5" />
          Editor
        </Button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => {
          upload(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />

      <Modal
        open={Boolean(picking)}
        onClose={() => setPicking(null)}
        title="Choose an image"
        subtitle="Only what you have uploaded — Launchpad never fills the page with stock."
        width="max-w-xl"
      >
        {(project.assets || []).length ? (
          <ul className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {(project.assets || []).map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => {
                    placeAsset(asset.id, picking);
                    setPicking(null);
                  }}
                  className="group w-full overflow-hidden rounded-tile border border-line text-left transition hover:border-white/40"
                >
                  <span className="block aspect-[4/3] bg-black/40">
                    {isVideo(asset.filename) ? (
                      <span className="grid h-full place-items-center text-[10px] uppercase tracking-[0.14em] text-ink-300">video</span>
                    ) : (
                      <img src={asset.url} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                    )}
                  </span>
                  <span className="block px-2 py-1.5">
                    <span className="block truncate text-[12px] text-ink-100">{asset.filename}</span>
                    <span className="block truncate text-[10.5px] text-ink-500">{asset.selectedSection ? `in ${asset.selectedSection}` : 'in library'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] leading-relaxed text-ink-300">Nothing uploaded for this launch yet.</p>
            <Button
              onClick={() => {
                setPicking(null);
                uploadRef.current?.click();
              }}
            >
              Upload now
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(pendingPlatforms)}
        onClose={() => setPendingPlatforms(null)}
        title="Re-compose for this platform?"
        subtitle="Launchpad rebuilds the page around the screens you pick, so copy and layout change with it."
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingPlatforms(null)}>
              Keep current
            </Button>
            <Button
              onClick={() => {
                const platforms = pendingPlatforms;
                setPendingPlatforms(null);
                generate(platforms);
              }}
            >
              Re-compose
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-ink-200">
            Target: <Tag mono>{(pendingPlatforms || []).join(' + ')}</Tag>
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-400">
            Your images and description are reused as they are. Anything you hand-edited since the last generation will be written fresh.
          </p>
        </div>
      </Modal>

      <Modal
        open={showReset}
        onClose={() => setShowReset(false)}
        title="Back to the generated version"
        subtitle="Discards every manual edit made since this page was generated."
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReset(false)}>
              Keep my edits
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!baseline) {
                  setShowReset(false);
                  return;
                }
                setSpec(baseline);
                queue({ theme: baseline.theme, sections: baseline.sections, nav: baseline.nav, platform: baseline.platform });
                setShowReset(false);
                setSelected(null);
                toast.info('Reverted to the generated version.');
              }}
            >
              Discard them
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-300">
          The version kept here is the one this builder opened with — {baseline?.sections?.length || 0} sections, {project.assets?.length || 0} assets. Publishing is unaffected.
        </p>
      </Modal>

      <button
        type="button"
        onClick={() => setShowReset(true)}
        disabled={!baseline}
        title="Discard manual edits"
        className="fixed bottom-4 right-4 z-40 hidden items-center gap-2 rounded-pill border border-line bg-ink-900/80 px-3 py-2 text-[12px] text-ink-300 backdrop-blur transition hover:border-white/30 hover:text-white disabled:opacity-40 lg:inline-flex"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </button>

      <AnimatePresence>
        {generation.open ? (
          <GenerationOverlay
            steps={project.pacing?.steps || []}
            finished={generation.finished}
            result={generation.result?.spec ? { ...generation.result.spec, generation: generation.result.generation, assets: generation.result.assets } : null}
            onEnter={() => {
              setGeneration({ open: false, finished: false, result: null });
              setPanel(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function seedFor(type) {
  const blank = { eyebrow: '', heading: 'A new section', subheadline: '' };
  if (type === 'gallery') return { ...blank, items: [{ caption: 'First image', assetId: '' }] };
  if (type === 'features') return { ...blank, items: [{ title: 'Feature', body: 'Why it matters.' }] };
  if (type === 'faq') return { ...blank, items: [{ question: 'A question', answer: 'An honest answer.' }] };
  if (type === 'testimonials') return { ...blank, items: [{ quote: 'What someone said.', name: 'Who said it', role: '' }] };
  if (type === 'pricing') return { ...blank, items: [{ name: 'Plan', price: '₦0', body: 'What is included.', items: ['One thing', 'Another'] }] };
  if (type === 'cta' || type === 'waitlist') return { ...blank, label: 'Join the list' };
  if (type === 'contact') return { ...blank, label: 'Send message', email: '' };
  if (type === 'countdown') return { ...blank, targetDate: new Date(Date.now() + 6048e5).toISOString().slice(0, 10), label: 'Until we open' };
  if (type === 'footer') return { heading: '', note: 'Built with Launchpad' };
  return blank;
}

function describePlacements(assets = []) {
  const placed = assets.filter((asset) => asset.selectedSection || asset.suggestedSection);
  if (!placed.length) return null;
  return placed.map((asset) => `${asset.filename} → ${asset.selectedSection || asset.suggestedSection}`).join(' · ');
}
