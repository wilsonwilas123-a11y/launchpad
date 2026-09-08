import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserRound, CreditCard, Trash2, Camera, LogOut, 
  Globe, Clock, Phone, ChevronRight, ChevronDown, Lock
} from 'lucide-react';

import { api } from '../lib/api';
import { Logo } from '../components/brand/RocketMark';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Primitives';
import { useSession } from '../context/Session';
import { useToast } from '../context/Toast';
import { cx, initials } from '../lib/format';
import { BackLink } from '../components/ui/BackLink';
import { GoogleMark } from '../components/auth/GoogleSignIn';

/**
 * @typedef {Object} UserProfile
 * @property {string} id
 * @property {string} email
 * @property {string} [name]
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [phone]
 * @property {string} [language]
 * @property {string} [timezone]
 * @property {string} [avatarUrl]
 * @property {'google' | 'password'} [provider]
 * @property {boolean} [hasPassword]
 * @property {'free' | 'pro' | 'team'} [plan]
 */

/**
 * @typedef {Object} UpdateProfilePayload
 * @property {string} [name]
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [phone]
 * @property {string} [language]
 * @property {string} [timezone]
 * @property {string} [avatarUrl]
 * @property {string} [plan]
 */

const TABS = [
  { value: 'profile', label: 'Personal Information', icon: UserRound },
  { value: 'billing', label: 'Billing & Plan', icon: CreditCard },
  { value: 'danger', label: 'Account Settings', icon: Trash2 },
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
  const fileInputRef = useRef(null);

  // Layout Tab State
  const [tab, setTab] = useState('profile');

  // Form States (Mapped from user session)
  const nameParts = (user?.name || '').split(' ');
  const [firstName, setFirstName] = useState(user?.firstName || nameParts[0] || '');
  const [lastName, setLastName] = useState(user?.lastName || nameParts.slice(1).join(' ') || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [language, setLanguage] = useState(user?.language || 'English');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC +00:00 - UTC');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');

  // Password & Security State
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  // Avatar Upload Handler
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarUrl(url);
      toast.success('Avatar preview updated.');
    }
  };

  const removeAvatar = () => {
    setAvatarUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Save Personal Info
  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy('profile');
    try {
      /** @type {UpdateProfilePayload} */
      const payload = {
        name: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        phone,
        language,
        timezone,
        avatarUrl,
      };

      await api.auth.updateProfile(payload);
      await refresh();
      toast.success('Account settings saved.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  // Change Password
  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.next !== passwords.confirm) return toast.error('Those passwords do not match.');
    setBusy('password');
    try {
      await api.auth.changePassword(passwords.current, passwords.next);
      setPasswords({ current: '', next: '', confirm: '' });
      await refresh();
      toast.success(user?.hasPassword === false ? 'Password set. You can now sign in with email.' : 'Password updated.');
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
    <div className="relative min-h-screen bg-black text-white">
      <AmbientBackdrop variant="quiet" />

      <div className="relative flex min-h-screen">
        {/* Left Vertical Rail Nav */}
        <aside className="hidden w-20 flex-col items-center border-r border-white/10 py-6 sm:flex">
          <Logo size="sm" className="mb-8" />
          <nav className="flex flex-col gap-3">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => setTab(item.value)}
                  title={item.label}
                  className={cx(
                    'grid h-11 w-11 place-items-center rounded-xl transition-all',
                    active
                      ? 'bg-white text-black shadow-lg'
                      : 'text-ink-300 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </nav>
          <button
            onClick={() => { signOut(); navigate('/'); }}
            title="Sign out"
            className="mt-auto grid h-11 w-11 place-items-center rounded-xl text-red-400 transition-all hover:bg-red-500/10"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 px-4 py-8 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-4xl">
            
            {/* Header & Breadcrumb */}
            <header className="mb-8">
              <div className="flex items-center gap-2 text-xs text-ink-300">
                <BackLink to="/dashboard" label="Dashboard" />
                <ChevronRight className="h-3 w-3" />
                <span className="text-white">Settings</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <h1 className="font-display text-3xl font-medium tracking-tight">Account Settings</h1>
                  <p className="mt-1 text-sm text-ink-300">
                    Manage your preferences, security, and profile information in one place.
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => { signOut(); navigate('/'); }}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </header>

            {/* Content Tabs */}
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-8"
              >
                {tab === 'profile' && (
                  <>
                    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
                      <div className="mb-6">
                        <h2 className="font-display text-lg font-medium">Personal Information</h2>
                        <p className="text-xs text-ink-300">Edit your personal information and public profile.</p>
                      </div>

                      {/* Avatar Upload Row */}
                      <div className="mb-8 flex items-center gap-5">
                        <div className="relative">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt="Avatar"
                              className="h-20 w-20 rounded-full border border-white/20 object-cover"
                            />
                          ) : (
                            <span className="grid h-20 w-20 place-items-center rounded-full border border-white/15 bg-white/5 font-display text-xl">
                              {initials(user?.name || user?.email)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleAvatarChange}
                            accept="image/*"
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            Upload An Image
                          </Button>
                          {avatarUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-red-400 hover:bg-red-500/10"
                              onClick={removeAvatar}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* 2-Column Inputs Grid */}
                      <form onSubmit={saveProfile} className="flex flex-col gap-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                          <Field label="First name *" htmlFor="firstName">
                            <Input
                              id="firstName"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              placeholder="First Name"
                            />
                          </Field>
                          <Field label="Last name *" htmlFor="lastName">
                            <Input
                              id="lastName"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              placeholder="Last Name"
                            />
                          </Field>
                        </div>

                        <div className="grid gap-6 sm:grid-cols-2">
                          <Field label="Email *" htmlFor="email" hint="Linked sign-in email address.">
                            <Input
                              id="email"
                              value={user?.email || ''}
                              readOnly
                              className="cursor-not-allowed opacity-50"
                            />
                          </Field>
                          <Field label="Phone number *" htmlFor="phone">
                            <Input
                              id="phone"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="+1 (555) 000-0000"
                            />
                          </Field>
                        </div>

                        <div className="grid gap-6 sm:grid-cols-2">
                          <Field label="Language *" htmlFor="language">
                            <div className="relative">
                              <Input
                                id="language"
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                placeholder="English"
                              />
                              <Globe className="absolute right-3 top-3 h-4 w-4 text-ink-300 pointer-events-none" />
                            </div>
                          </Field>
                          <Field label="Time zone *" htmlFor="timezone">
                            <div className="relative">
                              <Input
                                id="timezone"
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                placeholder="UTC +00:00"
                              />
                              <Clock className="absolute right-3 top-3 h-4 w-4 text-ink-300 pointer-events-none" />
                            </div>
                          </Field>
                        </div>

                        <div className="flex justify-end pt-4">
                          <Button type="submit" loading={busy === 'profile'}>
                            Save Changes
                          </Button>
                        </div>
                      </form>
                    </section>

                    {/* Password Section */}
                    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
                      <div className="mb-6 flex items-center justify-between">
                        <div>
                          <h2 className="font-display text-lg font-medium">
                            {user?.hasPassword === false ? 'Set Password' : 'Password & Security'}
                          </h2>
                          <p className="text-xs text-ink-300">
                            {user?.hasPassword === false 
                              ? 'This account was created via Google. Set a password to log in either way.' 
                              : 'Update your current login password.'}
                          </p>
                        </div>
                        {user?.provider === 'google' && (
                          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-ink-300">
                            <GoogleMark className="h-3.5 w-3.5" /> Google Auth
                          </span>
                        )}
                      </div>

                      <form onSubmit={changePassword} className="flex flex-col gap-6">
                        {user?.hasPassword !== false && (
                          <Field label="Current Password" htmlFor="current">
                            <Input
                              id="current"
                              type="password"
                              autoComplete="current-password"
                              value={passwords.current}
                              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                            />
                          </Field>
                        )}
                        <div className="grid gap-6 sm:grid-cols-2">
                          <Field label="New Password" htmlFor="next" hint="Min. 8 characters">
                            <Input
                              id="next"
                              type="password"
                              autoComplete="new-password"
                              value={passwords.next}
                              onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                            />
                          </Field>
                          <Field label="Confirm Password" htmlFor="confirm">
                            <Input
                              id="confirm"
                              type="password"
                              autoComplete="new-password"
                              value={passwords.confirm}
                              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                            />
                          </Field>
                        </div>
                        <div className="flex justify-end pt-2">
                          <Button
                            type="submit"
                            variant="secondary"
                            loading={busy === 'password'}
                            disabled={passwords.next.length < 8}
                          >
                            {user?.hasPassword === false ? 'Set Password' : 'Change Password'}
                          </Button>
                        </div>
                      </form>
                    </section>
                  </>
                )}

                {tab === 'billing' && (
                  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
                    <h2 className="font-display text-lg font-medium">Subscription & Billing</h2>
                    <p className="mb-6 text-xs text-ink-300">Manage your active subscription plan.</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {PLANS.map((item) => {
                        const active = item.id === plan.id;
                        return (
                          <div
                            key={item.id}
                            className={cx(
                              'flex flex-col justify-between rounded-xl border p-5 transition-all',
                              active ? 'border-white bg-white/10' : 'border-white/10 bg-white/[0.02]'
                            )}
                          >
                            <div>
                              <span className="block text-sm font-semibold">{item.name}</span>
                              <span className="mt-1 block text-xs text-ink-300">{item.detail}</span>
                            </div>
                            <div className="mt-6">
                              {active ? (
                                <span className="inline-block rounded-full border border-white/20 px-3 py-1 text-xs text-ink-300">
                                  Current Plan
                                </span>
                              ) : (
                                <Button size="sm" variant="secondary" onClick={() => setPlan(item.id)} loading={busy === 'plan'}>
                                  {item.id === 'free' ? 'Downgrade' : 'Upgrade'}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {tab === 'danger' && (
                  <section className="rounded-2xl border border-red-500/30 bg-red-500/[0.02] p-6 sm:p-8">
                    <h2 className="font-display text-lg font-medium text-red-200">Danger Zone</h2>
                    <p className="mt-1 text-xs text-ink-300">
                      Deleting your account removes all projects, assets, and custom settings immediately.
                    </p>
                    <div className="mt-6">
                      <Button variant="danger" onClick={() => setShowDelete(true)}>
                        <Trash2 className="h-4 w-4" />
                        Delete Account
                      </Button>
                    </div>
                  </section>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete your account?"
        subtitle="Type DELETE to confirm. Every launch, asset, and response will be removed."
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDelete(false)}>
              Keep Account
            </Button>
            <Button
              variant="danger"
              onClick={destroy}
              loading={busy === 'delete'}
              disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
            >
              Delete Forever
            </Button>
          </>
        }
      >
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          aria-label="Type DELETE to confirm"
        />
      </Modal>
    </div>
  );
}