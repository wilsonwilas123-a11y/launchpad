import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Wand2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Primitives';
import { cx } from '../../lib/format';

/**
 * Step 3 — the design gallery. Directions are the ones Launchpad ships and has
 * tested in the renderer; nothing is scraped from a third-party showcase, so
 * every thumbnail is a real render of what the site will look like.
 */
export default function StepDesign({ draft, set, onNext, onBack }) {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyMatching, setOnlyMatching] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .designs(onlyMatching ? draft.type : 'all')
      .then((data) => alive && setDesigns(data.items || []))
      .catch(() => alive && setDesigns([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [draft.type, onlyMatching]);

  const selected = draft.selectedDesign?.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[58ch] text-[14.5px] leading-relaxed text-ink-300">
          A direction sets the palette, type scale, spacing and effects. You can change every one of those afterwards in the builder.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-300">
          <input type="checkbox" checked={onlyMatching} onChange={(event) => setOnlyMatching(event.target.checked)} className="h-3.5 w-3.5 accent-white" />
          Only what suits {draft.type || 'this'}
        </label>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton aspect-[16/11] rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((design, index) => {
            const active = selected === design.id;
            return (
              <motion.button
                key={design.id}
                type="button"
                onClick={() => set({ selectedDesign: { id: design.id, name: design.name, styleTags: design.styleTags, colorPalette: design.colorPalette, layoutHints: design.layoutHints } })}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(0.3, index * 0.03), duration: 0.42, ease: [0.22, 0.8, 0.24, 1] }}
                whileHover={{ y: -3 }}
                className={cx(
                  'group relative overflow-hidden rounded-card border text-left transition-colors',
                  active ? 'border-white/70 shadow-glow' : 'border-line hover:border-white/25',
                )}
                aria-pressed={active}
              >
                <span className="relative block aspect-[16/10] overflow-hidden bg-ink-800">
                  {design.thumbnailUrl ? (
                    <img src={design.thumbnailUrl} alt={`${design.name} sample`} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                  ) : (
                    <span className="absolute inset-0" style={{ background: `linear-gradient(140deg, ${design.colorPalette?.[0] || '#0a0a0c'}, ${design.colorPalette?.[1] || '#fff'})` }} />
                  )}
                  {active ? (
                    <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-white text-ink-900">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-col gap-2 p-3.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-medium text-white">{design.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {(design.colorPalette || []).slice(0, 3).map((color) => (
                        <span key={color} className="h-2.5 w-2.5 rounded-full border border-white/15" style={{ background: color }} />
                      ))}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {(design.styleTags || []).slice(0, 4).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              set({ selectedDesign: null });
              onNext();
            }}
          >
            <Wand2 className="h-4 w-4" strokeWidth={2} />
            Let Launchpad choose
          </Button>
          <Button size="lg" onClick={onNext} disabled={!selected}>
            Use this direction
          </Button>
        </div>
      </div>
    </div>
  );
}
