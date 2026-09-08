import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles, Zap, Globe, Palette } from 'lucide-react';
import { api } from '../lib/api';
import { Logo, RocketMark } from '../components/brand/RocketMark';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';
import { BackLink } from '../components/ui/BackLink';
import GoogleSignIn from '../components/auth/GoogleSignIn';
import { GoogleMark } from '../components/auth/GoogleSignIn';

const COPY = {
  signin: { title: 'Welcome back.', body: 'Your launches are where you left them.' },
  signup: { title: 'Create your Launchpad account.', body: 'One account, every launch, one address each.' },
  forgot: { title: 'Reset your password.', body: 'We will email a link to the address on your account.' },
};

const STATS = [
  { value: '2 min', label: 'from idea to live page' },
  { value: '∞', label: 'edits, always free' },
  { value: '1 URL', label: 'per launch, yours to keep' },
];

const FEATURES = [
  {
    icon: Palette,
    title: 'Design directions built in-house',
    body: 'Every layout is hand-crafted — not a template marketplace. Your page looks considered, not generated.',
  },
  {
    icon: Zap,
    title: 'Your images, understood and placed',
    body: 'Drop in any asset. Launchpad reads the content and places it where it belongs on the page.',
  },
  {
    icon: Globe,
    title: 'A live URL, editable in plain English',
    body: 'Describe a change. See it live. No code, no export, no waiting on a developer.',
  },
];

export default function AuthPage({ mode = 'signin' }) {
  const session = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const next = location.state?.from || '/dashboard';

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  useEffect(() => { setError(null); setSent(false); }, [mode]);
  useEffect(() => { if (session.isAuthed) navigate(next, { replace: true }); }, [session.isAuthed, navigate, next]);

  const set = (key) => (event) => setForm((c) => ({ ...c, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (mode === 'signup' && form.password.length < 8) return setError('Use at least 8 characters.');
    if (mode === 'signup' && form.password !== form.confirm) return setError('Those passwords do not match.');
    setBusy(mode);
    try {
      if (mode === 'signin') { await session.signIn(form.email, form.password); navigate(next, { replace: true }); }
      else if (mode === 'signup') { await session.signUp({ name: form.name, email: form.email, password: form.password }); toast.success('Account created.'); navigate(next, { replace: true }); }
      else { await api.auth.forgot(form.email); setSent(true); }
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const demo = async () => {
    setBusy('demo');
    try {
      await session.signInDemo();
      toast.push('Signed in as the demo account.', { tone: 'success' });
      navigate('/dashboard', { replace: true });
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const copy = COPY[mode];

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <AmbientBackdrop variant="quiet" />

          {/* ── Left / marketing side ── */}
      <aside className="relative hidden flex-col border-r border-line px-16 py-14 lg:flex">
        {/* Top: logo */}
        <Logo href="/" />

        {/* Middle: all the content, vertically centred */}
        <div className="flex flex-1 flex-col justify-center gap-12">

          {/* Hero headline */}
          <div>
            <h2 className="font-display text-[clamp(2.6rem,3.4vw,3.8rem)] font-medium leading-[1.04] tracking-[-0.04em]">
              Launch anything.
              <br />
              <span style={{ fontStyle: 'italic' }}>Launch it beautifully.</span>
            </h2>
            <p className="mt-5 max-w-[38ch] text-[17px] leading-relaxed text-ink-300">
              Describe your idea, add your assets, and Launchpad creates a website
              built around your vision — then gives it an address.
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="rounded-2xl border border-dashed border-white/10 px-4 py-5">
                <p className="font-display text-[2rem] font-medium leading-none tracking-tight text-white">
                  {value}
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-ink-400">{label}</p>
              </div>
            ))}
          </div>

          {/* Feature list */}
          <ul className="flex flex-col gap-6">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-dashed border-white/10">
                  <Icon className="h-4 w-4 text-ink-300" strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-[15px] font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-ink-400">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Testimonial */}
          <figure className="rounded-2xl border border-dashed border-white/10 px-6 py-5">
            <blockquote className="text-[15.5px] leading-relaxed text-ink-200">
              "I described my product in two sentences and had a live page with my
              own URL in under three minutes. Nothing else does that."
            </blockquote>
            <figcaption className="mt-3 flex items-center gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-dashed border-white/10 text-[11px] font-semibold uppercase tracking-wide text-white">
                AO
              </span>
              <span className="text-[13.5px] text-ink-400">
                Ada Okonkwo · early access
              </span>
            </figcaption>
          </figure>
        </div>

        {/* Bottom: examples */}
        <p className="mt-10 text-[13.5px] text-ink-400">
          Live examples:{' '}
          <Link to="/nova" className="link-quiet">launchpad.app/nova</Link>{' '}
          ·{' '}
          <Link to="/afterglow" className="link-quiet break-all">launchpad.app/afterglow</Link>
        </p>
      </aside>
      {/* ── Right / form side ── */}
      <main className="relative flex min-w-0 items-center justify-center px-4 py-10 sm:px-10 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 0.8, 0.24, 1] }}
          className="w-full max-w-[440px] min-w-0"
        >
          <div className="mb-6 flex items-center gap-3 lg:mb-8">
            <BackLink to="/" label="Back to the site" hideLabelClass="hidden sm:inline" />
            <span aria-hidden className="h-5 w-px bg-white/10" />
            <Logo href="/" />
          </div>

          <h1 className="font-display text-[33px] font-medium leading-tight tracking-[-0.03em]">{copy.title}</h1>
          <p className="mt-2 text-[15.5px] leading-relaxed text-ink-300">{copy.body}</p>

          {mode !== 'forgot' ? (
            <>
              <GoogleSignIn intent={mode} next={next} />
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="micro">or use email</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          ) : null}

          {mode === 'forgot' && sent ? (
            <div className="panel mt-8 flex items-start gap-3 p-5 lg:p-6">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-ink-900">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <div>
                <p className="text-[16.5px] text-white">Check your inbox ✓</p>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-300">
                  If {form.email} is on an account, a reset link is on its way. It expires in 30 minutes.
                </p>
                <Link to="/sign-in" className="link-quiet mt-3 inline-block text-[14.5px]">Back to sign in</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className={`flex flex-col gap-5 ${mode === 'forgot' ? 'mt-8' : 'mt-6'}`}>
              {mode === 'signup' ? (
                <Field label="Your name" htmlFor="name">
                  <Input id="name" value={form.name} onChange={set('name')} placeholder="Ada Okonkwo" autoComplete="name" required />
                </Field>
              ) : null}

              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" value={form.email} onChange={set('email')} placeholder="you@email.com" autoComplete="email" required />
              </Field>

              {mode !== 'forgot' ? (
                <Field
                  label="Password"
                  htmlFor="password"
                  hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
                  action={
                    mode === 'signin' ? (
                      <Link to="/forgot" className="text-[14px] text-ink-300 transition hover:text-white">Forgot?</Link>
                    ) : null
                  }
                >
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                  />
                </Field>
              ) : null}

              {mode === 'signup' ? (
                <Field label="Confirm password" htmlFor="confirm">
                  <Input id="confirm" type="password" value={form.confirm} onChange={set('confirm')} placeholder="••••••••" autoComplete="new-password" required />
                </Field>
              ) : null}

              {error ? (
                <p role="alert" className="rounded-tile border border-red-400/25 bg-red-500/10 px-3 py-2 text-[14.5px] text-red-100">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" loading={busy === mode} className="mt-1 w-full">
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send the link'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          {mode !== 'forgot' ? (
            <>
              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="micro">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="secondary" size="lg" className="w-full" onClick={demo} loading={busy === 'demo'}>
                <Sparkles className="h-4 w-4" strokeWidth={2} />
                Explore the demo workspace
              </Button>
              <p className="mt-3 text-center text-[14px] leading-relaxed text-ink-400">
                Four launches, two of them live. Demo account:{' '}
                <span className="font-mono text-ink-200">demo@launchpad.app</span> ·{' '}
                <span className="font-mono text-ink-200">launchpad</span>
              </p>
              <p className="mt-7 text-center text-[15px] text-ink-300">
                {mode === 'signin' ? (
                  <>New here?{' '}<Link to="/sign-up" className="link-quiet">Create an account</Link></>
                ) : (
                  <>Already have one?{' '}<Link to="/sign-in" className="link-quiet">Sign in</Link></>
                )}
              </p>
            </>
          ) : (
            <p className="mt-6 text-center text-[15px] text-ink-300">
              Remembered it?{' '}
              <Link to="/sign-in" className="link-quiet">Sign in instead</Link>
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}