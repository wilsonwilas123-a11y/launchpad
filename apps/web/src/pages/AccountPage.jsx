import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard, LogOut, Trash2, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { Logo } from '../components/brand/RocketMark';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Primitives';
import { Segmented } from '../components/ui/Segmented';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';
import { cx, initials } from '../lib/format';
import { BackLink } from '../components/ui/BackLink';
import { GoogleMark } from '../components/auth/GoogleSignIn';

const TABS = [
  { value: 'profile', label: 'Profile', icon: UserRound },
  { value: 'billing', label: 'Billing', icon: CreditCard },
  { value: 'danger', label: 'Account', icon: Trash2 },
];

const PLANS = [
  { id: 'free', name: 'Free', detail: '1 published launch' },
  { id: 'pro', name: 'Pro', detail: '10 launches, custom domain' },
  { id: 'team', name: 'Team', detail: '5 seats, approvals' },
];

export default function AccountPage() {
  const { user, refresh, signOut } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [name, setName] = useState(user?.name || '');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setBusy('profile');
    try {
      await api.auth.updateProfile({ name });
      await refresh();
      toast.success('Profile saved.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.next !== passwords.confirm) return toast.error('Those passwords do not match.');
    setBusy('password');
    try {
      await api.auth.changePassword(passwords.current, passwords.next);
      setPasswords({ current: '', next: '', confirm: '' });
      // A Google account goes from "no password" to "has one" here, and the
      // form itself changes shape, so re-read who we are.
      await refresh();
      toast.success(user?.hasPassword === false ? 'Password set. You can sign in with Google or email now.' : 'Password changed.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const setPlan = async (plan) => {
    setBusy('plan');
    try {
      await api.auth.updateProfile({ plan });
      await refresh();
      toast.success(`Plan set to ${PLANS.find((p) => p.id === plan).name}.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const destroy = async () => {
    setBusy('delete');
    try {
      await api.auth.removeAccount();
      signOut();
      toast.push('Account deleted.', { tone: 'success' });
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error.message);
      setBusy('');
      setShowDelete(false);
    }
  };

  const plan = PLANS.find((item) => item.id === (user?.plan || 'free')) || PLANS[0];

  return (
    <div className="relative min-h-screen">
      <AmbientBackdrop variant="quiet" />
      <div className="relative">
        <header className="shell flex h-16 items-center gap-3 sm:h-20">
          <BackLink to="/dashboard" label={<><span className="sm:hidden">Back</span><span className="hidden sm:inline">Back to Dashboard</span></>} />
          <Logo className="ml-auto" size="sm" />
        </header>

        <main className="shell max-w-[760px] pb-24">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white/[0.05] font-display text-[17px]">
              {initials(user?.name || user?.email)}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-[26px] leading-tight tracking-[-0.02em]">{user?.name || user?.email}</h1>
              <p className="text-[14px] text-ink-300">
                {user?.email} · {plan.name} plan ·{' '}
                {user?.provider === 'google' ? (
                  <span className="text-ink-200">
                    <GoogleMark className="mr-1 inline-block align-[-2px]" />
                    Google
                  </span>
                ) : (
                  'password'
                )}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { signOut(); navigate('/'); }}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>

          <Segmented className="mt-8" value={tab} onChange={setTab} options={TABS.map(({ value, label, icon }) => ({ value, label, icon }))} />

          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mt-6 flex flex-col gap-4">
            {tab === 'profile' ? (
              <>
                <Panel title="Your details">
                  <form onSubmit={save} className="flex flex-col gap-4">
                    <Field label="Name" htmlFor="account-name">
                      <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
                    </Field>
                    <Field label="Email" htmlFor="account-email" hint="Your sign-in address. Changing it would orphan your launches, so it stays.">
                      <Input id="account-email" value={user?.email || ''} readOnly className="cursor-not-allowed opacity-60" />
                    </Field>
                    <div className="flex justify-end">
                      <Button type="submit" loading={busy === 'profile'} disabled={!name.trim() || name === user?.name}>
                        Save changes
                      </Button>
                    </div>
                  </form>
                </Panel>
                <Panel title={user?.hasPassword === false ? 'Choose a password' : 'Password'}>
                  <form onSubmit={changePassword} className="flex flex-col gap-4">
                    {user?.hasPassword === false ? (
                      <p className="text-[14.5px] leading-relaxed text-ink-300">
                        This account was created with Google, so it has no password yet. Pick one and you will be able to sign in either way.
                      </p>
                    ) : (
                      <Field label="Current password" htmlFor="current">
                        <Input id="current" type="password" autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
                      </Field>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="New password" htmlFor="next" hint="At least 8 characters.">
                        <Input id="next" type="password" autoComplete="new-password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} />
                      </Field>
                      <Field label="Confirm" htmlFor="confirm">
                        <Input id="confirm" type="password" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
                      </Field>
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" variant="secondary" loading={busy === 'password'} disabled={passwords.next.length < 8}>
                        {user?.hasPassword === false ? 'Set password' : 'Change password'}
                      </Button>
                    </div>
                  </form>
                </Panel>
              </>
            ) : null}

            {tab === 'billing' ? (
              <>
                <Panel title="Plan">
                  <div className="flex flex-col gap-3">
                    {PLANS.map((item) => {
                      const active = item.id === plan.id;
                      return (
                        <div
                          key={item.id}
                          className={cx('flex items-center gap-4 rounded-tile border px-4 py-3.5', active ? 'border-white/35 bg-white/[0.05]' : 'border-line')}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-white">{item.name}</span>
                            <span className="block text-[13.5px] text-ink-300">{item.detail}</span>
                          </span>
                          {active ? (
                            <span className="rounded-pill border border-line px-2.5 py-1 text-[12px] uppercase tracking-[0.14em] text-ink-300">Current</span>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => setPlan(item.id)} loading={busy === 'plan'}>
                              {item.id === 'free' ? 'Downgrade' : 'Upgrade'}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Panel>
                <Panel title="Payment method">
                  <div className="flex items-center gap-3 rounded-tile border border-line px-4 py-3.5">
                    <span className="grid h-8 w-11 place-items-center rounded border border-line bg-white/[0.05] text-[9px] font-semibold tracking-widest text-ink-200">VISA</span>
                    <span className="text-[14.5px]">ending 4242</span>
                    <span className="ml-auto text-[13px] text-ink-400">This build does not charge cards.</span>
                  </div>
                  <p className="mt-4 text-[13.5px] text-ink-400">Invoices appear here as they are issued. None yet.</p>
                </Panel>
              </>
            ) : null}

            {tab === 'danger' ? (
              <Panel
                title="Danger zone"
                danger
                body="Deleting your account removes every project, every asset and every form response captured by your published sites. It cannot be undone."
              >
                <ul className="mb-5 flex flex-col gap-2 text-[14.5px] text-ink-200">
                  <li className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                    <span>Live sites stop serving immediately; the addresses are released.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                    <span>Backups roll off within 14 days.</span>
                  </li>
                </ul>
                <Button variant="danger" onClick={() => setShowDelete(true)}>
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </Button>
              </Panel>
            ) : null}
          </motion.div>
        </main>
      </div>

      <Modal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete your account?"
        subtitle="Type DELETE to confirm. Every launch, asset and captured response goes with it."
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDelete(false)}>
              Keep my account
            </Button>
            <Button variant="danger" onClick={destroy} loading={busy === 'delete'} disabled={confirmText.trim().toUpperCase() !== 'DELETE'}>
              Delete forever
            </Button>
          </>
        }
      >
        <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
      </Modal>
    </div>
  );
}

function Panel({ title, body, children, danger }) {
  return (
    <section className={cx('panel p-6', danger && 'border-red-400/25')}>
      <h2 className="font-display text-[19px] tracking-[-0.02em]">{title}</h2>
      {body ? <p className="mt-1.5 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-300">{body}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
