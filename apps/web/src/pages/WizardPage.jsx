import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, fileToUpload } from '../lib/api';
import { clearDraft, composeVisualDirection, draftToProjectInput, emptyDraft, loadDraft, saveDraft, STEPS } from '../lib/wizard';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';
import { Logo } from '../components/brand/RocketMark';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import StepRail from '../components/wizard/StepRail';
import StepIdea from '../components/wizard/StepIdea';
import StepPlatform from '../components/wizard/StepPlatform';
import StepDesign from '../components/wizard/StepDesign';
import StepDetails from '../components/wizard/StepDetails';
import StepAssets from '../components/wizard/StepAssets';
import GenerationOverlay from '../components/wizard/GenerationOverlay';
import { cx } from '../lib/format';
import { BackLink } from '../components/ui/BackLink';

/**
 * The five-step wizard. The project is created as soon as there is something
 * worth creating, so uploads and generation hit the same record the builder will
 * later open — no draft state that cannot survive a refresh.
 */
export default function WizardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthed, ready } = useSession();
  const toast = useToast();

  const [draft, setDraft] = useState(() => {
    const stored = loadDraft();
    const type = new URLSearchParams(location.search).get('type');
    if (stored) return type && !stored.type ? { ...stored, type } : stored;
    return emptyDraft({ type: type || '' });
  });
  const [step, setStep] = useState(() => (loadDraft()?.projectId ? 1 : 0));
  const [furthest, setFurthest] = useState(() => (loadDraft()?.projectId ? 1 : 0));
  const [project, setProject] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState('');
  const [generation, setGeneration] = useState({ open: false, finished: false, result: null });
  const errors = useRef(0);

  useEffect(() => {
    if (ready && !isAuthed) navigate('/sign-in', { replace: true, state: { from: '/build' } });
  }, [ready, isAuthed, navigate]);

  useEffect(() => saveDraft(draft), [draft]);

  useEffect(() => {
    api.catalog().then(setCatalog).catch(() => {});
  }, []);

  useEffect(() => {
    if (!draft.type) return;
    api.assetPlan(draft.type).then(setPlan).catch(() => setPlan(null));
  }, [draft.type]);

  const set = useCallback((patch) => setDraft((current) => ({ ...current, ...patch })), []);

  const sectionNames = useMemo(() => {
    const type = (catalog?.websiteTypes || []).find((entry) => entry.id === draft.type);
    const list = type?.defaultSections || ['hero', 'about', 'features', 'gallery', 'cta', 'footer'];
    return [...new Set([...list, 'nav', 'footer'])];
  }, [catalog, draft.type]);

  /** Creates the project once, then keeps it in sync as steps are completed. */
  const sync = useCallback(
    async (patch = {}) => {
      const payload = { ...draftToProjectInput({ ...draft, ...patch }), visualDirection: composeVisualDirection({ ...draft, ...patch }) || undefined };
      if (!draft.projectId) {
        const created = await api.projects.create(payload);
        setDraft((current) => ({ ...current, ...patch, projectId: created.id, name: created.name }));
        setProject(created);
        return created;
      }
      const updated = await api.projects.update(draft.projectId, patch);
      setProject(updated);
      setDraft((current) => ({ ...current, ...patch }));
      return updated;
    },
    [draft],
  );

  const advance = useCallback(
    async (patch = {}) => {
      setBusy('sync');
      try {
        const saved = await sync(patch);
        setProject(saved);
        setStep((value) => {
          const next = Math.min(STEPS.length - 1, value + 1);
          setFurthest((best) => Math.max(best, next));
          return next;
        });
      } catch (error) {
        errors.current += 1;
        toast.error(error.message);
      } finally {
        setBusy('');
      }
    },
    [sync, toast],
  );

  const back = () => setStep((value) => Math.max(0, value - 1));

  /* ── asset handlers (they talk to the project, not to local state) ───────── */
  const upload = useCallback(
    async (files, meta = {}) => {
      if (!draft.projectId) {
        const created = await sync({});
        setProject(created);
      }
      const id = draft.projectId || project?.id;
      if (!id) return toast.error('Finish the first step before uploading.');
      setBusy('upload');
      try {
        const payload = [];
        for (const file of files) {
          payload.push(await fileToUpload(file, { slot: meta.slot, description: meta.description, caption: meta.caption }));
        }
        const result = await api.projects.addAssets(id, payload);
        const next = result.project || (await api.projects.get(id));
        setProject(next);
        setDraft((current) => ({ ...current, assets: next.assets || [] }));
        if (meta.replaceId) await api.projects.removeAsset(id, meta.replaceId).catch(() => {});
        toast.success(`${files.length} image${files.length === 1 ? '' : 's'} added.`, { detail: describePlacements(result.assets) });
      } catch (error) {
        toast.error(error.message);
      } finally {
        setBusy('');
      }
    },
    [draft.projectId, project?.id, sync, toast],
  );

  const patchAsset = useCallback(
    async (assetId, patch) => {
      try {
        const next = await api.projects.updateAsset(draft.projectId, assetId, patch);
        setProject(next);
        setDraft((current) => ({ ...current, assets: next.assets || [] }));
      } catch (error) {
        toast.error(error.message);
      }
    },
    [draft.projectId, toast],
  );

  const removeAsset = useCallback(
    async (assetId) => {
      try {
        const next = await api.projects.removeAsset(draft.projectId, assetId);
        setProject(next);
        setDraft((current) => ({ ...current, assets: next.assets || [] }));
      } catch (error) {
        toast.error(error.message);
      }
    },
    [draft.projectId, toast],
  );

  const generate = useCallback(async () => {
    if (!draft.projectId) return;
    setGeneration({ open: true, finished: false, result: null });
    try {
      await api.projects.update(draft.projectId, { designDetails: draft.designDetails, selectedPlatforms: draft.selectedPlatforms });
      const result = await api.projects.generate(draft.projectId, {});
      setGeneration({ open: true, finished: true, result });
      setProject(result);
      clearDraft();
    } catch (error) {
      setGeneration({ open: false, finished: false, result: null });
      toast.error(error.message);
    }
  }, [draft.projectId, draft.designDetails, draft.selectedPlatforms, toast]);

  useEffect(() => {
    if (draft.projectId && !project) api.projects.get(draft.projectId).then(setProject).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = STEPS[step];
  const assets = project?.assets || draft.assets || [];
  const heading =
    step === 0
      ? { title: 'What are you launching?', hint: 'A few honest sentences beat a brief.' }
      : step === 1
        ? { title: 'Where should it work?', hint: 'We compose the layout for the screens you pick.' }
        : step === 2
          ? { title: 'Pick a design direction', hint: 'Palette, type and rhythm — not a template.' }
          : step === 3
            ? { title: 'A few details', hint: 'Skippable. We already have enough to start.' }
            : { title: 'Add your assets', hint: 'Anything you have. We will work out where it goes.' };

  return (
    <div className="relative min-h-screen pb-24">
      <AmbientBackdrop variant="quiet" />
      <div className="relative">
        <header className="shell sticky top-0 z-40 flex h-16 items-center gap-3 bg-ink-900/85 backdrop-blur-xl sm:h-20 sm:bg-transparent sm:backdrop-blur-none">
          <BackLink
            to={draft.projectId ? '/dashboard' : '/'}
            srLabel={draft.projectId ? 'Save this draft and go back to the dashboard' : 'Back to the Launchpad site'}
            label={
              <>
                <span className="sm:hidden">{draft.projectId ? 'Exit' : 'Cancel'}</span>
                <span className="hidden sm:inline">{draft.projectId ? 'Save & exit to Dashboard' : 'Back to the site'}</span>
              </>
            }
          />
          <span aria-hidden className="hidden h-5 w-px bg-white/10 sm:block" />
          <Logo href={draft.projectId ? '/dashboard' : '/'} />
          <div className="ml-auto hidden lg:block">
            <StepRail current={step} furthest={furthest} onJump={setStep} />
          </div>
        </header>

        <main className="shell pt-5 lg:pt-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="micro mb-2">
                Step {step + 1} of {STEPS.length} · {current.label}
              </p>
              <h1 className="font-display text-[clamp(1.8rem,4.4vw,2.7rem)] font-medium leading-[1.05] tracking-[-0.035em]">{heading.title}</h1>
              <p className="mt-1.5 max-w-[56ch] text-[15px] leading-relaxed text-ink-300">{heading.hint}</p>
            </div>
            {draft.projectId ? (
              <span className="rounded-pill border border-line bg-white/[0.03] px-3 py-1.5 font-mono text-[13.5px] text-ink-300">saved as {project?.name || draft.name || 'draft'}</span>
            ) : null}
          </div>

          <div className="mb-8 lg:hidden">
            <StepRail current={step} furthest={furthest} onJump={setStep} />
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.32, ease: [0.22, 0.8, 0.24, 1] }}>
              {step === 0 ? <StepIdea draft={draft} set={set} onSubmit={() => advance({})} /> : null}
              {step === 1 ? <StepPlatform draft={draft} set={set} setBusy={setBusy} onNext={() => advance({})} onBack={back} /> : null}
              {step === 2 ? <StepDesign draft={draft} set={set} onNext={() => advance({})} onBack={back} /> : null}
              {step === 3 ? <StepDetails draft={draft} set={set} onNext={() => advance({})} onBack={back} /> : null}
              {step === 4 ? (
                <StepAssets
                  plan={plan}
                  assets={assets}
                  sections={sectionNames}
                  upload={upload}
                  patchAsset={patchAsset}
                  removeAsset={removeAsset}
                  busy={busy}
                  onBack={back}
                  onNext={generate}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {generation.open ? (
          <GenerationOverlay
            steps={project?.pacing?.steps || []}
            finished={generation.finished}
            result={generation.result?.spec ? { ...generation.result.spec, generation: generation.result.generation, assets: generation.result.assets } : null}
            onEnter={() => navigate(`/builder/${draft.projectId}`, { replace: true })}
          />
        ) : null}
      </AnimatePresence>

      {busy === 'sync' ? <div className={cx('fixed inset-x-0 bottom-0 h-[2px] bg-white/40 transition-opacity', 'opacity-70')} /> : null}
    </div>
  );
}

function describePlacements(assets = []) {
  const placed = assets.filter((asset) => asset.selectedSection || asset.suggestedSection);
  if (!placed.length) return null;
  return placed.map((asset) => `${asset.filename} → ${asset.selectedSection || asset.suggestedSection}`).join(' · ');
}
