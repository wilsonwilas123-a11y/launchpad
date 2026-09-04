import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';
import { Logo } from '../components/brand/RocketMark';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Reveal } from '../components/motion/Motion';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';
import { api } from '../lib/api';
import { cx } from '../lib/format';

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, annual: 0 },
    blurb: 'Everything you need to get one thing live.',
    features: [
      { label: '1 published launch', on: true },
      { label: 'Unlimited drafts', on: true },
      { label: 'All 18 design directions', on: true },
      { label: 'launchpad.app/your-name', on: true },
      { label: 'Waitlist and contact capture', on: true },
      { label: 'Custom domain', on: false },
      { label: 'Remove the Launchpad mark', on: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 19, annual: 15 },
    blurb: 'For the launch you are actually serious about.',
    featured: true,
    features: [
      { label: '10 published launches', on: true },
      { label: 'Unlimited generations and edits', on: true },
      { label: 'Command box edits', on: true },
      { label: 'Custom domain + redirects', on: true },
      { label: 'Remove the Launchpad mark', on: true },
      { label: 'Form exports (CSV)', on: true },
      { label: 'Team seats', on: false },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: { monthly: 49, annual: 39 },
    blurb: 'A studio, a label, a small company with several things out at once.',
    features: [
      { label: 'Everything in Pro', on: true },
      { label: '5 seats, shared library of assets', on: true },
      { label: 'Roles: editor, viewer', on: true },
      { label: 'Per-project publish approval', on: true },
      { label: 'Priority generation queue', on: true },
      { label: 'Onboarding call', on: true },
      { label: 'SSO', on: false },
    ],
  },
];

const FAQS = [
  { q: 'What counts as a published launch?', a: 'One project pointing at one live address. Drafts and unpublished projects are unlimited on every plan.' },
  { q: 'If I downgrade, do I lose my site?', a: 'No. Anything over the free limit is taken offline and kept for 30 days, so switching back puts it at the same address.' },
  { q: 'Who runs the AI?', a: 'A local model on our own hardware. Nothing you write goes to a hosted provider, which is also why generation takes a few seconds rather than a call-out.' },
  { q: 'Can I bring my own images?', a: 'You should. Upload as many as you like — Launchpad reads what each one is and puts it where it belongs.' },
];

export default function PricingPage() {
  const [cycle, setCycle] = useState('monthly');
  const { isAuthed, user, refresh } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const current = user?.plan || 'free';

  const choose = async (tier) => {
    if (!isAuthed) return navigate('/sign-up?next=/pricing');
    if (tier === current) return navigate('/account');
    try {
      await api.auth.updateProfile({ plan: tier });
      await refresh();
      toast.success(`You are on ${TIERS.find((t) => t.id === tier).name}.`, { detail: 'Billing starts today, cancel any time.' });
      navigate('/account');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="relative min-h-screen">
      <AmbientBackdrop variant="quiet" />
      <div className="relative">
        <header className="shell flex h-20 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" to="/">
              Home
            </Button>
            <Button size="sm" to={isAuthed ? '/build' : '/start'}>
              Start Building
            </Button>
          </nav>
        </header>

        <section className="shell pb-10 pt-8 text-center sm:pt-16">
          <Reveal>
            <p className="micro mb-4">Pricing</p>
            <h1 className="mx-auto max-w-[16ch] font-display text-[clamp(2.1rem,5.4vw,3.4rem)] font-medium leading-[1.03] tracking-[-0.04em]">
              Priced per launch, not per word.
            </h1>
            <p className="mx-auto mt-4 max-w-[54ch] text-[16px] leading-relaxed text-ink-300">
              Generation, editing and republishing are not metered. Pick the plan by how many things you keep live at once.
            </p>
            <div className="mt-8 flex justify-center">
              <Segmented
                value={cycle}
                onChange={setCycle}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'annual', label: 'Annual · 2 months free' },
                ]}
              />
            </div>
          </Reveal>
        </section>

        <section className="shell grid gap-4 pb-8 lg:grid-cols-3">
          {TIERS.map((tier, index) => {
            const price = tier.price[cycle];
            const isCurrent = current === tier.id;
            return (
              <motion.article
                key={tier.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * index, duration: 0.6, ease: [0.22, 0.8, 0.24, 1] }}
                className={cx(
                  'relative flex flex-col rounded-card border p-6',
                  tier.featured ? 'border-white/35 bg-white/[0.05] shadow-lift' : 'border-line bg-ink-850/60',
                )}
              >
                {tier.featured ? (
                  <span className="absolute -top-2.5 left-6 rounded-pill bg-white px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-900">
                    Most launches
                  </span>
                ) : null}
                <h2 className="font-display text-[22px] tracking-[-0.02em]">{tier.name}</h2>
                <p className="mt-1 min-h-[42px] text-[13.5px] leading-relaxed text-ink-300">{tier.blurb}</p>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-display text-[44px] leading-none tracking-[-0.04em]">${price}</span>
                  <span className="text-[13px] text-ink-400">{price ? `/mo${cycle === 'annual' ? ', billed yearly' : ''}` : 'forever'}</span>
                </p>
                <ul className="mt-6 flex flex-col gap-2.5">
                  {tier.features.map((feature) => (
                    <li key={feature.label} className={cx('flex items-start gap-2.5 text-[13.5px]', !feature.on && 'text-ink-500')}>
                      {feature.on ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.6} />
                      ) : (
                        <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-40" strokeWidth={2.4} />
                      )}
                      {feature.label}
                    </li>
                  ))}
                </ul>
                <div className="mt-7">
                  <Button variant={tier.featured ? 'primary' : 'secondary'} size="lg" className="w-full" onClick={() => choose(tier.id)} disabled={isCurrent}>
                    {isCurrent ? 'Current plan' : tier.id === 'free' ? 'Stay on Free' : `Move to ${tier.name}`}
                  </Button>
                </div>
              </motion.article>
            );
          })}
        </section>

        <section className="shell grid max-w-[860px] gap-3 pb-16 pt-6 sm:grid-cols-2">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-card border border-line bg-ink-850/40 p-5">
              <p className="text-[14.5px] text-white">{faq.q}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-300">{faq.a}</p>
            </div>
          ))}
        </section>

        <footer className="shell flex flex-wrap items-center justify-between gap-3 border-t border-line py-8 text-[12.5px] text-ink-400">
          <span>All plans include the full renderer, the builder and the command box.</span>
          <span>
            <Link to="/terms" className="link-quiet">
              Terms
            </Link>{' '}
            ·{' '}
            <Link to="/privacy" className="link-quiet">
              Privacy
            </Link>
          </span>
        </footer>
      </div>
    </div>
  );
}
