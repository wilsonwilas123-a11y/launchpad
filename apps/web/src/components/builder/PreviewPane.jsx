import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Monitor, Smartphone, Wand2 } from 'lucide-react';
import { SiteRenderer } from '../site/SiteRenderer';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { cx } from '../../lib/format';

/**
 * The centre stage. It renders the same SiteRenderer the published page uses,
 * scaled to fit — the preview is not a redraw of the site, it is the site.
 *
 * Selecting a section focuses the editor; dropping an asset from the left rail
 * places it in whichever section is focused.
 */
export default function PreviewPane({
  spec,
  device,
  setDevice,
  selected,
  onSelect,
  onDropAsset,
  draggingAsset,
  onAskAbout,
  onGenerate,
  busy,
  live,
  liveUrl,
  previewUrl,
  sectionLabel,
}) {
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const designWidth = device === 'mobile' ? 420 : 1440;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => {
      const available = el.clientWidth - 8;
      if (available <= 0) return;
      setScale(Math.min(1, Math.max(0.4, available / designWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [designWidth]);

  useEffect(() => {
    if (!selected) return;
    const node = stageRef.current?.querySelector(`[data-section-id="${selected}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selected]);

  const sections = useMemo(() => (spec?.sections || []).filter((section) => !section.hidden), [spec?.sections]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.04),transparent_70%)]">
      {/* Wraps rather than pushes: at 320px the device switch and the "Full
          preview" group together are wider than the screen. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <Segmented
          size="sm"
          value={device}
          onChange={setDevice}
          layoutId="builder-device"
          options={[
            { value: 'mobile', label: 'Mobile', icon: Smartphone, hint: 'Phone composition' },
            { value: 'desktop', label: 'Desktop', icon: Monitor, hint: 'Widescreen composition' },
          ]}
        />
        <span className="hidden text-[12.5px] text-ink-500 md:inline">
          {device === 'mobile' ? '420px · single column, thumb-reachable' : `${designWidth}px · multi-column`} · preview at {Math.round(scale * 100)}%
        </span>
        <span className="ml-auto flex items-center gap-2">
          {selected ? (
            <button
              type="button"
              onClick={() => onAskAbout?.(sectionLabel || 'this section')}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-[12.5px] text-ink-200 transition hover:border-white/30 hover:text-white"
              title="Ask the AI about the selected section"
            >
              <Wand2 className="h-3 w-3" />
              Ask about {sectionLabel ? `“${sectionLabel}”` : 'selection'}
            </button>
          ) : null}
          <a
            href={live ? liveUrl : previewUrl}
            target="_blank"
            rel="noreferrer"
            className={cx('inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[12.5px] transition', live ? 'border-line text-ink-200 hover:text-white' : 'border-line text-ink-400')}
          >
            <ExternalLink className="h-3 w-3" />
            {live ? 'Open live URL' : 'Full preview'}
          </a>
        </span>
      </div>

      <div
        ref={stageRef}
        onDragOver={(event) => draggingAsset && event.preventDefault()}
        onDrop={(event) => {
          if (!draggingAsset) return;
          event.preventDefault();
          onDropAsset?.(draggingAsset, selected);
        }}
        className={cx('relative min-h-0 flex-1 overflow-auto px-1 py-5 transition', draggingAsset && 'ring-1 ring-inset ring-white/25')}
      >
        {spec ? (
          <div className="mx-auto origin-top overflow-hidden rounded-[18px] border border-line bg-black/40 shadow-glow" style={{ width: designWidth * scale }}>
            <div style={{ zoom: scale }}>
              <div className={cx('relative', device === 'mobile' ? 'mx-auto' : '')} style={{ width: designWidth }}>
                <SiteRenderer spec={spec} device={device} editable selected={selected} onSelect={onSelect} compact />
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 rounded-card border border-dashed border-line-strong bg-white/[0.02] px-8 py-14 text-center">
            <motion.span animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-ink-850">
              <Wand2 className="h-4.5 w-4.5 text-ink-100" strokeWidth={1.8} />
            </motion.span>
            <p className="font-display text-[22px] leading-snug">Nothing generated yet</p>
            <p className="text-[14.5px] leading-relaxed text-ink-300">
              The preview stays empty until Launchpad has built the first version. Everything you change after that is editable here.
            </p>
            <Button onClick={onGenerate} loading={busy === 'generate'}>
              Generate the website
            </Button>
          </div>
        )}

        <AnimatePresence>
          {draggingAsset ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <p className="rounded-pill border border-white/30 bg-ink-900/85 px-4 py-2 text-[13.5px] text-white backdrop-blur">
                {selected ? `Drop to place in “${sectionLabel}”` : 'Select a section first, then drop'}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {spec && !sections.length ? (
          <p className="mt-4 text-center text-[13.5px] text-amber-100/80">Every section is hidden — this page would render empty.</p>
        ) : null}
      </div>
    </div>
  );
}
