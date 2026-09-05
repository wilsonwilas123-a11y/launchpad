import { Reveal, RevealGroup, RevealItem } from '../motion/Motion';

const STEPS = [
  {
    key: 'describe',
    title: 'Describe',
    body: 'A few sentences about what you are launching. Plain language, no brief template, no jargon.',
    detail: '“A premium Nigerian streetwear brand. Futuristic black-and-white, big product photography, countdown, waitlist.”',
  },
  { key: 'choose', title: 'Choose', body: 'Mobile, laptop, or both. The layout is composed for the screens you pick — not squeezed into them.' },
  { key: 'design', title: 'Design', body: 'Pick a direction from the gallery: palette, type, spacing, rhythm. Every direction is one we built and tested.' },
  { key: 'upload', title: 'Upload', body: 'Your images and clips. Launchpad reads what each one is and puts it where it belongs.' },
  { key: 'generate', title: 'Generate', body: 'The AI writes a structured spec — sections, copy, order, colours — then the renderer paints your site from it.' },
  { key: 'customize', title: 'Customize', body: 'Everything is editable: panels, colours, type, spacing, or tell the command box what to change.' },
  { key: 'publish', title: 'Publish', body: 'One click and it is live at launchpad.app/your-name. Share it, edit it, re-publish the same address.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="relative py-24 sm:py-32 lg:py-36">
      <div className="shell">
        <Reveal className="max-w-[46ch]">
          <p className="micro mb-3">How Launchpad works</p>
          <h2 className="font-display text-[clamp(2.05rem,4.4vw,3.15rem)] font-medium leading-[1.04] tracking-[-0.035em]">
            Seven steps, and none of them are design decisions.
          </h2>
        </Reveal>

        <RevealGroup step={0.055} className="relative mt-14 grid gap-x-8 gap-y-12 sm:mt-16 lg:gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[13px] hidden h-px bg-line lg:block" />
          {STEPS.map((step, index) => (
            <RevealItem key={step.key} className="relative">
              <article className="group flex flex-col">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-ink-900 font-mono text-[13.5px] text-ink-100 transition group-hover:border-white/40 group-hover:text-white">
                    {index + 1}
                  </span>
                  <h3 className="font-display text-[22.5px] leading-none tracking-[-0.02em] text-white">{step.title}</h3>
                </div>
                <p className="text-[15.5px] leading-relaxed text-ink-200">{step.body}</p>
                {step.detail ? (
                  <p className="mt-3 border-l border-line pl-3 text-[14.5px] italic leading-relaxed text-ink-400">{step.detail}</p>
                ) : null}
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
