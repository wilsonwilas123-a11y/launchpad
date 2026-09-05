import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { cx } from '../../lib/format';

/**
 * Step 4 — the follow-up details form. Entirely skippable: everything here
 * improves the master prompt, and the master prompt is shown before anything is
 * generated so there are no hidden inputs.
 */
export default function StepDetails({ draft, set, onNext, onBack }) {
  const [vocabulary, setVocabulary] = useState([]);
  const details = draft.designDetails || {};

  useEffect(() => {
    api
      .catalog()
      .then((data) => {
        const type = (data.websiteTypes || []).find((entry) => entry.id === draft.type);
        const wanted = type?.defaultSections || [];
        setVocabulary((data.sections || []).map((section) => ({ ...section, suggested: wanted.includes(section.type) })));
        if (!details.desiredSections?.length && wanted.length) {
          set({ designDetails: { ...details, desiredSections: wanted } });
        }
      })
      .catch(() => setVocabulary([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.type]);

  const patch = (key) => (event) => set({ designDetails: { ...details, [key]: event.target.value } });

  const toggle = (type) => {
    const included = (details.desiredSections || []).includes(type);
    set({
      designDetails: {
        ...details,
        desiredSections: included ? (details.desiredSections || []).filter((item) => item !== type) : [...(details.desiredSections || []), type],
        excludedSections: included ? details.excludedSections : (details.excludedSections || []).filter((item) => item !== type),
      },
    });
  };

  const exclude = (type) => {
    set({
      designDetails: {
        ...details,
        desiredSections: (details.desiredSections || []).filter((item) => item !== type),
        excludedSections: [...(details.excludedSections || []), type],
      },
    });
  };

  const included = new Set(details.desiredSections || []);
  const excluded = new Set(details.excludedSections || []);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        <Field label="Business or project name" htmlFor="biz" hint="Leaving it blank means Launchpad writes one from your description.">
          <Input id="biz" value={details.businessName || ''} onChange={patch('businessName')} placeholder="NOVA" />
        </Field>
        <Field label="Tagline" htmlFor="tag" hint="One line under the headline.">
          <Input id="tag" value={details.tagline || ''} onChange={patch('tagline')} placeholder="Lagos-made, in runs of 180" />
        </Field>
        <Field label="Who is it for" htmlFor="aud">
          <Input id="aud" value={details.audience || ''} onChange={patch('audience')} placeholder="People who notice details" />
        </Field>
        <Field label="What must the site do" htmlFor="goal">
          <Input id="goal" value={details.goal || ''} onChange={patch('goal')} placeholder="Collect waitlist signups before the drop" />
        </Field>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="micro">Sections</p>
          <span className="text-[14px] text-ink-400">{included.size} in · {excluded.size} out</span>
        </div>
        <p className="mb-3 text-[15px] leading-relaxed text-ink-300">
          Start from what we suggested for {draft.type || 'this'} and adjust. Right-click (or “exclude”) means never generate it at all.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
          {(vocabulary.length ? vocabulary : FALLBACK_SECTIONS).map((section) => {
            const isIn = included.has(section.type);
            const isOut = excluded.has(section.type);
            return (
              <div
                key={section.type}
                className={cx(
                  'group flex items-start gap-3 rounded-tile border px-3.5 py-3 transition',
                  isIn ? 'border-white/35 bg-white/[0.06]' : isOut ? 'border-line bg-transparent opacity-55' : 'border-line bg-ink-850/50 hover:border-white/20',
                )}
              >
                <button type="button" onClick={() => toggle(section.type)} className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition" aria-pressed={isIn} style={{ borderColor: isIn ? '#fff' : 'rgba(255,255,255,0.25)', background: isIn ? '#fff' : 'transparent' }}>
                  {isIn ? <span className="block h-2 w-2 rounded-[2px] bg-ink-900" /> : null}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] text-white">{section.label}</span>
                    {section.suggested && !isIn && !isOut ? <span className="rounded-pill border border-line px-1.5 py-px text-[11.5px] text-ink-300">suggested</span> : null}
                    {isOut ? <span className="rounded-pill border border-line px-1.5 py-px text-[11.5px] text-ink-400">excluded</span> : null}
                  </span>
                  {section.blurb ? <span className="mt-0.5 block text-[14px] leading-snug text-ink-300">{section.blurb}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => (isOut ? toggle(section.type) : exclude(section.type))}
                  className="shrink-0 text-[13.5px] uppercase tracking-[0.12em] text-ink-400 opacity-0 transition group-hover:opacity-100 hover:text-white"
                >
                  {isOut ? 'undo' : 'exclude'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Anything else we should know" htmlFor="notes" hint="Constraints, must-haves, things to avoid. This goes straight into the prompt.">
        <Input id="notes" multiline rows={4} value={details.extraNotes || ''} onChange={patch('extraNotes')} placeholder="No stock photography. Prices in naira. The countdown must be the second thing you see." />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              set({ designDetails: { ...details, skipped: true } });
              onNext();
            }}
          >
            Skip for now
          </Button>
          <Button size="lg" onClick={onNext}>
            Add your assets
          </Button>
        </div>
      </div>
    </div>
  );
}

const FALLBACK_SECTIONS = [
  { type: 'hero', label: 'Hero', blurb: 'The first screen: promise, image, primary action.' },
  { type: 'about', label: 'About', blurb: 'Who you are, in a paragraph.' },
  { type: 'features', label: 'Features', blurb: 'What people get, as short blocks.' },
  { type: 'productShowcase', label: 'Product showcase', blurb: 'Named items with price and image.' },
  { type: 'gallery', label: 'Gallery', blurb: 'Your photographs, laid out.' },
  { type: 'countdown', label: 'Countdown', blurb: 'Ticks to a date you set.' },
  { type: 'waitlist', label: 'Waitlist', blurb: 'Collects emails on the live site.' },
  { type: 'pricing', label: 'Pricing', blurb: 'Tiers with what is included.' },
  { type: 'testimonials', label: 'Testimonials', blurb: 'Quotes from real people.' },
  { type: 'faq', label: 'FAQ', blurb: 'Answers to the usual questions.' },
  { type: 'contact', label: 'Contact', blurb: 'A form and your channels.' },
  { type: 'footer', label: 'Footer', blurb: 'Legal, socials, credits.' },
];
