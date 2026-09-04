import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { Logo, RocketMark } from '../components/brand/RocketMark';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';

const COPY = {
  signin: { title: 'Welcome back.', body: 'Your launches are where you left them.' },
  signup: { title: 'Create your Launchpad account.', body: 'One account, every launch, one address each.' },
  forgot: { title: 'Reset your password.', body: 'We will email a link to the address on your account.' },
};

/**
 * The auth trio on one screen component: sign in, sign up, forgot password.
 * The demo account is one click away because investors should not have to type
 * a password to see the product.
 */
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

  useEffect(() => {
    setError(null);
    setSent(false);
  }, [mode]);

  useEffect(() => {
    if (session.isAuthed) navigate(next, { replace: true });
  }, [session.isAuthed, navigate, next]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (mode === 'signup' && form.password.length < 8) return setError('Use at least 8 characters.');
    if (mode === 'signup' && form.password !== form.confirm) return setError('Those passwords do not match.');
    setBusy(mode);
    try {
      if (mode === 'signin') {
        await session.signIn(form.email, form.password);
        navigate(next, { replace: true });
      } else if (mode === 'signup') {
        await session.signUp({ name: form.name, email: form.email, password: form.password });
        toast.success('Account created.');
        navigate(next, { replace: true });
      } else {
        await api.auth.forgot(form.email);
        setSent(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const demo = async () => {
    setBusy('demo');
    try {
      await session.signInDemo();
      toast.push('Signed in as the demo account.', { tone: 'success' });
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const copy = COPY[mode];

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <AmbientBackdrop variant="quiet" />

      {/* Marketing side: one claim, one proof. */}
      <aside className="relative hidden flex-col justify-between border-r border-line p-10 lg:flex">
        <Logo href="/" />
        <div className="relative max-w-[34ch]">
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="mb-7 text-white">
            <RocketMark size={42} />
          </motion.div>
          <h2 className="font-display text-[clamp(1.8rem,2.6vw,2.5rem)] font-medium leading-[1.06] tracking-[-0.035em]">
            Launch anything.
            <br />
            <span style={{ fontStyle: 'italic' }}>Launch it beautifully.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Describe your idea, add your assets, and Launchpad creates a website built around your vision — then gives it an address.
          </p>
          <ul className="mt-8 flex flex-col gap-2.5">
            {['Design directions built in-house', 'Your images, understood and placed', 'A live URL, editable in plain English'].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[13.5px] text-ink-200">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2.4} />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] text-ink-400">
          Live examples:{' '}
          <Link to="/nova" className="link-quiet">
            launchpad.app/nova
          </Link>{' '}
          ·{' '}
          <Link to="/afterglow" className="link-quiet">
            launchpad.app/afterglow
          </Link>
        </p>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-14 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 0.8, 0.24, 1] }}
          className="w-full max-w-[404px]"
        >
          <div className="mb-8 lg:hidden">
            <Logo href="/" />
          </div>
          <h1 className="font-display text-[30px] font-medium leading-tight tracking-[-0.03em]">{copy.title}</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-300">{copy.body}</p>

          {mode === 'forgot' && sent ? (
            <div className="panel mt-8 flex items-start gap-3 p-5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-ink-900">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <div>
                <p className="text-[15px] text-white">Check your inbox ✓</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-300">
                  If {form.email} is on an account, a reset link is on its way. It expires in 30 minutes.
                </p>
                <Link to="/sign-in" className="link-quiet mt-3 inline-block text-[13px]">
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
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
                      <Link to="/forgot" className="text-[12.5px] text-ink-300 transition hover:text-white">
                        Forgot?
                      </Link>
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
                <p role="alert" className="rounded-tile border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-100">
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
              <p className="mt-3 text-center text-[12.5px] leading-relaxed text-ink-400">
                Four launches, two of them live. Demo account: <span className="font-mono text-ink-200">demo@launchpad.app</span> ·{' '}
                <span className="font-mono text-ink-200">launchpad</span>
              </p>
              <p className="mt-7 text-center text-[13.5px] text-ink-300">
                {mode === 'signin' ? (
                  <>
                    New here?{' '}
                    <Link to="/sign-up" className="link-quiet">
                      Create an account
                    </Link>
                  </>
                ) : (
                  <>
                    Already have one?{' '}
                    <Link to="/sign-in" className="link-quiet">
                      Sign in
                    </Link>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="mt-6 text-center text-[13.5px] text-ink-300">
              Remembered it?{' '}
              <Link to="/sign-in" className="link-quiet">
                Sign in instead
              </Link>
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
