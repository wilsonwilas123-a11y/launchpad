import { Link } from 'react-router-dom';
import { Logo } from '../components/brand/RocketMark';
import { FadeIn } from '../components/motion/Motion';
import { BackLink } from '../components/ui/BackLink';

const CONTENT = {
  terms: {
    updated: '4 September 2026',
    intro: 'Launchpad turns a description into a website you own. These terms keep that arrangement simple and legible.',
    sections: [
      {
        title: 'Your launch is yours',
        body: 'Everything you publish — copy, images, layout, the address — belongs to you. We claim no rights in it, and we do not license your work to anyone else.',
      },
      {
        title: 'The address you are given',
        body: 'Each published project gets one address (launchpad.app/your-name). Re-publishing updates that same address; it never mints a new one behind your back. Free plans keep the address while the project is live; if you take it offline we hold it for 30 days so you can put it back.',
      },
      {
        title: 'What we may remove',
        body: 'Sites that are illegal, that impersonate someone, or that put our infrastructure at risk come down, usually within a day, always with a note explaining why. Everything else stays up.',
      },
      {
        title: 'Generation',
        body: 'Website specifications are produced by a local model running on our own hardware. Nothing you write is sent to a third-party AI provider, and no human reads it unless you ask us for help.',
      },
      {
        title: 'Plans and billing',
        body: 'Paid plans renew monthly until cancelled. Cancelling leaves your published sites live on the free plan rather than switching them off mid-launch.',
      },
      {
        title: 'No warranty, in plain words',
        body: 'The product is provided as it is. We test it hard, but you should look at your site before you send the link to 400 people.',
      },
    ],
  },
  privacy: {
    updated: '4 September 2026',
    intro: 'Short version: we store what you launch, we do not sell it, and the AI never sees the internet.',
    sections: [
      {
        title: 'What we keep',
        body: 'Your email, name, plan, and every project: description, design choice, uploaded assets, the generated specification, publish history and any form responses your own visitors send you.',
      },
      {
        title: 'What we do not keep',
        body: 'No advertising identifiers, no third-party analytics scripts, no session recording. The only cookie-like value is the session token in your browser storage, which is how you stay signed in.',
      },
      {
        title: 'Visitor data on your sites',
        body: 'When someone joins a waitlist or sends you a message through a published site, that entry is stored on your project and shown to you. You are the controller of it; delete the project and the entries go with it.',
      },
      {
        title: 'Where generation happens',
        body: 'The model that writes your site runs locally. Your description, notes and asset captions are not forwarded to Anthropic, OpenAI, Google or any other hosted provider.',
      },
      {
        title: 'Deletion',
        body: 'Account settings → Delete account removes your projects, assets and captured responses immediately. Backups roll off within 14 days.',
      },
    ],
  },
};

export default function LegalPage({ kind = 'terms' }) {
  const content = CONTENT[kind] || CONTENT.terms;
  return (
    <div className="relative min-h-screen">
      <div className="shell max-w-[720px] py-14">
        <div className="mb-6 flex flex-wrap items-center gap-2 sm:mb-10">
          <BackLink to="/" label={<><span className="sm:hidden">Back</span><span className="hidden sm:inline">Back to Launchpad</span></>} />
          <span aria-hidden className="hidden h-5 w-px bg-white/10 sm:block" />
          <Logo href="/" className="mr-auto" />
          <Link to="/dashboard" className="rounded-pill px-2 py-1 text-[15px] text-ink-200 underline decoration-white/20 underline-offset-4 transition hover:text-white">
            Go to my dashboard
          </Link>
        </div>
        <FadeIn>
          <p className="micro mb-3">Legal</p>
          <h1 className="font-display text-[clamp(2rem,5vw,2.8rem)] font-medium leading-[1.05] tracking-[-0.035em]">
            {kind === 'terms' ? 'Terms of service' : 'Privacy policy'}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-300">{content.intro}</p>
          <p className="mt-2 font-mono text-[12.5px] text-ink-400">Updated {content.updated}</p>
          <div className="mt-12 flex flex-col gap-10">
            {content.sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-display text-[20px] leading-snug tracking-[-0.02em]">{section.title}</h2>
                <p className="mt-2.5 text-[15px] leading-[1.7] text-ink-200">{section.body}</p>
              </section>
            ))}
          </div>
          <div className="mt-14 rounded-card border border-line bg-ink-850/60 p-5 text-[14.5px] leading-relaxed text-ink-300">
            Questions, or something we should change? Write to{' '}
            <a href="mailto:hello@launchpad.app" className="link-quiet">
              hello@launchpad.app
            </a>
            . A person reads it.
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
