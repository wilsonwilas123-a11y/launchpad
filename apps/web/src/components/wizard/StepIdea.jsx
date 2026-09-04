import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';
import { Chip } from '../ui/Primitives';
import { Field, Input } from '../ui/Field';
import { Button } from '../ui/Button';
import { COLOUR_HINTS, DESCRIPTION_PLACEHOLDERS, LAUNCH_TYPES, MOOD_OPTIONS, STYLE_OPTIONS, TYPOGRAPHY_OPTIONS } from '../../lib/wizard';
import { cx } from '../../lib/format';

/**
 * Step 1 — "What are you launching?". The type cards set the structure the
 * generator will use; the description is the brief. Everything below the
 * textarea is optional on purpose: it sharpens the prompt, it never blocks it.
 */
export default function StepIdea({ draft, set, onSubmit }) {
  const [showControls, setShowControls] = useState(Boolean(draft.visualDirection || (draft.style && draft.style !== 'any')));
  const placeholder = DESCRIPTION_PLACEHOLDERS[draft.type] || DESCRIPTION_PLACEHOLDERS.product;
  const words = draft.description.trim().split(/\s+/).filter(Boolean).length;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-9"
    >
      <div>
        <p className="micro mb-4">Pick the closest fit — it changes the sections we build, not just the copy</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {LAUNCH_TYPES.map((type, index) => {
            const active = draft.type === type.id;
            return (
              <motion.button
                key={type.id}
                type="button"
                onClick={() => set({ type: type.id })}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(0.18, index * 0.018), duration: 0.35 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.985 }}
                className={cx(
                  'group flex flex-col items-start gap-1.5 rounded-card border p-3.5 text-left transition-colors duration-200',
                  active ? 'border-white/70 bg-white/[0.08] shadow-glow' : 'border-line bg-ink-850/60 hover:border-white/25 hover:bg-white/[0.045]',
                )}
                aria-pressed={active}
              >
                <span className="text-[17px] leading-none" aria-hidden>
                  {type.emoji}
                </span>
                <span className="text-[14.5px] font-medium leading-tight text-white">{type.label}</span>
                <span className="text-[12px] leading-snug text-ink-300">{type.blurb}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <Field
        label="Describe it in your own words"
        required
        htmlFor="description"
        hint="What it is, who it is for, what the site must do. Three or four sentences is plenty."
        action={<span className="font-mono text-[11px] text-ink-400">{words} words</span>}
      >
        <Input
          id="description"
          multiline
          rows={7}
          value={draft.description}
          onChange={(event) => set({ description: event.target.value })}
          placeholder={placeholder}
          className="text-[15.5px] leading-relaxed"
        />
      </Field>

      <div className="rounded-card border border-line bg-white/[0.02]">
        <button type="button" onClick={() => setShowControls((value) => !value)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left" aria-expanded={showControls}>
          <Sparkles className="h-4 w-4 text-ink-200" strokeWidth={2} />
          <span className="text-[14px] text-ink-100">Optional: steer the look</span>
          <span className="ml-auto text-[12px] text-ink-400">{showControls ? 'Hide' : 'Show'}</span>
          <ChevronDown className={cx('h-4 w-4 text-ink-400 transition-transform', showControls && 'rotate-180')} />
        </button>
        {showControls ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
              <Field label="Visual direction" htmlFor="direction" hint="Plain words. “Cinematic, black, lots of negative space, one accent.”">
                <Input id="direction" value={draft.visualDirection} onChange={(event) => set({ visualDirection: event.target.value })} placeholder="Cinematic and monochrome, big photography, quiet UI" />
              </Field>
              <ControlRow label="Style" options={STYLE_OPTIONS} value={draft.style} onPick={(style) => set({ style })} />
              <ControlRow label="Mood" options={MOOD_OPTIONS} value={draft.mood} onPick={(mood) => set({ mood })} />
              <ControlRow label="Type" options={TYPOGRAPHY_OPTIONS} value={draft.typography} onPick={(typography) => set({ typography })} />
              <ControlRow label="Colours" options={['', ...COLOUR_HINTS]} value={draft.colours} onPick={(colours) => set({ colours })} render={(option) => option || 'Not sure'} />
            </div>
          </motion.div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="max-w-[42ch] text-[12.5px] leading-relaxed text-ink-400">Nothing here is locked in — the builder can change any of it after generation.</p>
        <Button type="submit" size="lg" disabled={words < 4}>
          Continue
        </Button>
      </div>
    </form>
  );
}

function ControlRow({ label, options, value, onPick, render = (option) => option || 'Not sure' }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[74px] shrink-0 text-[12.5px] text-ink-300">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Chip key={option || 'none'} active={value === option} onClick={() => onPick(option)}>
            {render(option)}
          </Chip>
        ))}
      </div>
    </div>
  );
}
