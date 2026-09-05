import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Contracts for "Continue with Google", asserted on the shipped source because
 * this suite has no browser. Each one is a decision that must not quietly
 * reverse itself: the button must not appear before the API says Google exists,
 * the row must stay as easy to hit as the rest of the app, and nothing may
 * depend on google.com being reachable.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.resolve(here, '..', 'src', rel), 'utf8');

const button = src('components/auth/GoogleSignIn.jsx');
const loader = src('lib/googleAuth.js');
const session = src('context/Session.jsx');
const client = src('lib/api.js');
const authPage = src('pages/AuthPage.jsx');
const account = src('pages/AccountPage.jsx');

test('the Google row asks the API before it offers anything', () => {
  assert.match(loader, /api\.auth\s*\.googleStatus\(\)/, 'the status call is the gate');
  assert.match(loader, /state: data\?\.enabled \? 'available' : 'unconfigured'/, 'a false status means the button is not offered');
  assert.match(button, /if \(state === 'unreachable'\) return null/, 'a dead API must not show a Google row either');
  assert.match(button, /if \(state === 'checking'\)/, 'and the loading row is a placeholder, so the form does not jump');
});

test('unconfigured Google explains itself instead of failing', () => {
  const off = button.slice(button.indexOf("state === 'unconfigured'"), button.indexOf("return (\n    <div ref={wrapRef}"));
  assert.ok(off.length > 40, 'the unconfigured branch must exist');
  assert.match(off, /aria-disabled="true"/, 'it is not a real control when it cannot work');
  assert.match(off, /GOOGLE_CLIENT_ID/, 'it names the variable to set');
  assert.match(off, /apps\/api\/\.env/, 'and where to set it');
  assert.equal(/onClick/.test(off), false, 'a disabled row must not be clickable');
});

test('every Google state keeps the hit-size floor and can shrink', () => {
  assert.match(button, /h-11 w-full animate-pulse/, 'the placeholder is as tall as the real row');
  assert.match(button, /flex h-11 w-full items-center/, 'the disabled row too');
  assert.match(button, /className="mt-6 flex min-w-0 flex-col gap-2"/, 'the host row needs min-w-0 so Google’s fixed-width button cannot widen the column');
  assert.match(button, /Math\.max\(220, Math\.min\(400, Math\.round\(box\.width\)\)\)/, 'Google’s button is told the real column width, clamped');
});

test('nothing hangs when google.com is not reachable', () => {
  assert.match(loader, /script\.onerror = \(\) => \{/, 'a failed script load is handled');
  assert.match(loader, /finish\(null\)/, 'and resolves to null rather than rejecting');
  assert.match(loader, /GIS_TIMEOUT_MS = 12000/, 'a hung request cannot hold the row open forever');
  assert.match(button, /if \(!gis \|\| state !== 'available' \|\| !hostRef\.current\) return;/, 'no Google object means no attempt to initialise it');
  assert.match(button, /goRedirectFlow/, 'in that case the fallback is the server-side flow');
  assert.match(button, /Google could not be reached from here — sign in with email below/, 'and the email form is still pointed at');
});

test('the session token from the redirect lands in storage and leaves the URL', () => {
  assert.match(session, /\[#&\]lp_token=/, 'the fragment is parsed for the token');
  assert.match(session, /tokenStore\.set\(decodeURIComponent\(match\[1\]\)\)/, 'the token is stored like any other');
  assert.match(session, /window\.history\.replaceState\(null, '', url\)/, 'then scrubbed from the address bar');
  assert.match(session, /adoptTokenFromHash\(\);/, 'before the first /auth/me is tried');
  assert.match(session, /async signInWithGoogle\(credential\) \{\s*return adopt\(await api\.auth\.googleSignIn\(credential\)\);/, 'the credential path reuses the same adopt() as email sign-in');
});

test('the Google endpoints are public and go through one client', () => {
  assert.match(client, /googleStatus: \(\) => get\('\/auth\/google\/status', \{ auth: false \}\)/);
  assert.match(client, /googleSignIn: \(credential\) => post\('\/auth\/google', \{ credential \}, \{ auth: false \}\)/);
  assert.match(client, /googleStartUrl/, 'the redirect href is built in one place too');
  assert.match(client, /return_to=\$\{encodeURIComponent\(returnTo\)\}/, 'and the return path is encoded');
});

test('the sign-up and sign-in screens offer Google; the password reset does not', () => {
  const at = authPage.indexOf('<GoogleSignIn');
  assert.ok(at > -1, 'AuthPage must render the row');
  const guard = authPage.slice(Math.max(0, at - 120), at);
  assert.match(guard, /mode !== 'forgot'/, 'a reset page with a Google button would be a lie about what resets');
  assert.match(authPage, /intent=\{mode\}/, 'Google is told which action the person came for');
  assert.match(authPage, /or use email/, 'the divider admits there is another way in');
});

test('a Google account with no password is offered to choose one', () => {
  assert.match(account, /user\?\.hasPassword === false \? 'Choose a password' : 'Password'/, 'the panel title changes, so nobody hunts for the current password');
  assert.match(account, /This account was created with Google, so it has no password yet/, 'and says why');
  assert.equal(
    /Field label="Current password"[\s\S]{0,80}hasPassword === false/.test(account),
    false,
    'the current-password field is not shown in that state',
  );
});

test('the account screen says which door you came in through', () => {
  assert.match(account, /user\?\.provider === 'google'/, 'the sign-in method is shown, so a Google account is visibly a Google account');
  assert.match(account, /<GoogleMark className="mr-1 inline-block align-\[-2px\]" \/>/, 'with Google’s own mark, not a word only');
  assert.match(account, /'password'/, 'and an email account says so too');
});
