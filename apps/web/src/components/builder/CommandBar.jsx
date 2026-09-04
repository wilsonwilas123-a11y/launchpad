import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Loader2, Sparkles } from 'lucide-react';
import { cx } from '../../lib/format';

const TEMPLATES = [
  { group: 'Copy', runs: [{ label: 'Make the headline shorter', command: 'make the headline shorter and punchier' }, { label: 'Punchier, less corporate', command: 'rewrite the copy to sound direct and human, not corporate' }] },
  { group: 'Look', runs: [{ label: 'Warmer colour', command: 'use a warmer accent colour' }, { label: 'Pure monochrome', command: 'make it pure monochrome black and white' }, { label: 'More spacious', command: 'add more space between sections' }, { label: 'Smaller headings', command: 'reduce the heading scale a little' }] },
  { group: 'Sections', runs: [{ label: 'Add testimonials', command: 'add testimonials' }, { label: 'Add pricing', command: 'add a pricing section' }, { label: 'Add a countdown', command: 'add a countdown to the launch date' }, { label: 'Remove the FAQ', command: 'remove the faq section' }] },
  { group: 'Platform', runs: [{ label: 'Make mobile simpler', command: 'make mobile simpler' }, { label: 'Design for desktop', command: 'optimise the layout for desktop' }] },
];

const FLAVOURS = ['hero, not hero-center', 'one accent, not five', 'real photography, no stock', 'tighter line-height', 'prices in naira'];

/**
 * The AI command box. It is the loudest control in the builder and it is honest
 * about what it does: each run returns the section-level edits it applied, and
 * anything it could not do with the material it has is shown as a question.
 */
export default function CommandBar({ onRun, busy, lastChanges, onDismissChanges, onUndo }) {
  const [value, setValue] = useState('');
  const [focus, setFocus] = useState(false);
  const inputRef = useRef(null);

  const typed = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    const flat = TEMPLATES.flatMap((group) => group.runs.map((run) => ({ ...run, group: group.group })));
    if (!typed) return flat.slice(0, 4);
    const scored = flat
      .map((run) => ({ run, score: score(run, typed) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.run);
    return scored.length ? scored : [
      { label: `“${value.trim().slice(0, 42)}”`, command: value.trim(), group: 'Run it', flavour: true },
      ...FLAVOURS.filter((line) => line.includes(typed.split(' ')[0])).slice(0, 2).map((line) => ({ label: line, command: line, group: 'Maybe you meant', flavour: true })),
    ];
  }, [typed, value]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') inputRef.current?.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (command) => {
    const text = String(command || value).trim();
    if (!text || busy) return;
    setValue('');
    onRun(text);
  };

  return (
    <div className="relative z-30 border-b border-line bg-ink-900/70 px-4 py-3 backdrop-blur-xl">
      <div className="relative mx-auto max-w-[820px]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className={cx('flex items-center gap-3 rounded-card border bg-white/[0.03] px-4 py-3 transition', focus ? 'border-white/35 shadow-glow' : 'border-line hover:border-white/20')}
        >
          <Sparkles className={cx('h-4 w-4 shrink-0 transition', busy ? 'animate-pulse-soft text-white' : 'text-ink-300')} strokeWidth={2} />
          <input
            ref={inputRef}
            value={value}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 140)}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ask for anything — “add pricing”, “make it warmer”, “hero image should be the studio shot”"
            aria-label="Tell Launchpad what to change"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-ink-400"
          />
          <kbd className="hidden shrink-0 rounded-pill border border-line px-2 py-0.5 font-mono text-[10.5px] text-ink-400 sm:block">⌘K</kbd>
          <button
            type="submit"
            disabled={!value.trim() || Boolean(busy)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-white px-3 py-1.5 text-[13px] font-medium text-ink-900 transition disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CornerDownLeft className="h-3.5 w-3.5" />}
            {busy ? 'Working' : 'Run'}
          </button>
        </form>

        <AnimatePresence>
          {focus && !busy ? (
            <motion.ul
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-x-0 top-[calc(100%+8px)] overflow-hidden rounded-card border border-line bg-ink-800/95 shadow-lift backdrop-blur-xl"
            >
              {suggestions.map((run) => (
                <li key={`${run.group}-${run.command}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submit(run.command)}
                    className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.06]"
                  >
                    <span className="w-[74px] shrink-0 text-[10px] uppercase tracking-[0.16em] text-ink-500">{run.group}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink-50">{run.label}</span>
                    {run.flavour ? <span className="shrink-0 text-[11px] text-ink-400">sent as written</span> : null}
                  </button>
                </li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {lastChanges ? (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-col gap-2 rounded-tile border border-line bg-white/[0.03] px-3.5 py-2.5">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <p className="text-[13px] text-white">{lastChanges.summary || 'Done.'}</p>
                  {lastChanges.readAs ? (
                    <p className="text-[12px] text-ink-300">
                      Read as <span className="font-mono text-[11px] text-ink-100">{lastChanges.readAs}</span>
                    </p>
                  ) : null}
                  <div className="ml-auto flex items-center gap-2">
                    {onUndo ? (
                      <button type="button" onClick={onUndo} className="rounded-pill border border-line px-2.5 py-1 text-[11.5px] text-ink-100 transition hover:border-white/35 hover:text-white">
                        Undo
                      </button>
                    ) : null}
                    <button type="button" onClick={onDismissChanges} className="text-[11px] uppercase tracking-[0.14em] text-ink-400 transition hover:text-white">
                      close
                    </button>
                  </div>
                </div>
                {(lastChanges.changes || []).length ? (
                  <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {lastChanges.changes.slice(0, 6).map((change, index) => (
                      <li key={index} className="flex items-baseline gap-1.5 text-[12px] text-ink-200">
                        <span aria-hidden className="h-1 w-1 shrink-0 translate-y-[-1px] rounded-full bg-white/60" />
                        {change}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(lastChanges.rejected || []).length ? (
                  <p className="text-[12px] leading-relaxed text-amber-100/90">
                    Not done: {lastChanges.rejected.map((item) => (typeof item === 'string' ? item : item?.text || item?.command)).filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function score(run, typed) {
  const haystack = `${run.label} ${run.command}`.toLowerCase();
  const words = typed.split(/[\s,]+/).filter((word) => word.length > 2);
  if (!words.length) return 0;
  return words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0) / words.length;
}

function lastQuestions(result) {
  const questions = result?.questions || result?.generation?.questions || [];
  return questions.map((question) => (typeof question === 'string' ? question : question.text || question.question)).filter(Boolean);
}
