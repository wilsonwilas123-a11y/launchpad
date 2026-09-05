const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const google = require('../src/modules/auth/google');
const { AuthService, safeReturnPath } = require('../src/modules/auth/auth.service');
const { JsonFileStore } = require('../src/db/stores');

/**
 * Google sign-in, tested with no network and no Google account.
 *
 * The whole point of these tests is the trust boundary: a token that Google did
 * not sign, that was meant for another client, that expired, or whose address
 * Google has not verified must never produce a session. A locally generated key
 * pair plays the part of Google, and `fetchImpl` plays the part of the internet.
 */

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', alg: 'RS256', use: 'sig' };

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function idToken(overrides = {}, { kid = JWK.kid, aud = 'test-client.apps.googleusercontent.com' } = {}) {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://accounts.google.com',
    aud,
    sub: '110492837465102938471',
    email: ' Ada@Example.com ',
    name: 'Ada Okonkwo',
    picture: 'https://example.test/a.png',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  if ('exp' in overrides && overrides.exp === null) delete payload.exp;
  const body = `${b64(header)}.${b64(payload)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
  return `${body}.${signature}`;
}

const offlineKeys = () => async () => ({ ok: true, json: async () => ({ keys: [JWK] }) });

function withEnv(t, values) {
  const saved = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  google.__clearKeyCache();
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    google.__clearKeyCache();
  });
}

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-google-'));
  const store = JsonFileStore.open(path.join(dir, 'db.json'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return new AuthService(Promise.resolve(store));
}

test('google: off until the keys are in the environment', (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_REDIRECT_URI: undefined });
  const cfg = google.googleConfig();
  assert.equal(cfg.enabled, false, 'no client id means no Google');
  assert.equal(cfg.popupEnabled, false);
  assert.equal(cfg.redirectEnabled, false);

  withEnv(t, { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com' });
  const browserOnly = google.googleConfig();
  assert.equal(browserOnly.enabled, true, 'the browser button needs only the id');
  assert.equal(browserOnly.popupEnabled, true);
  assert.equal(browserOnly.redirectEnabled, false, 'the redirect flow needs the secret');
  assert.match(browserOnly.redirectUri, /\/api\/auth\/google\/callback$/, 'the default callback is this API’s own route');
});

test('google: the consent URL carries the state and the scopes we asked for', (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'https://api.test/cb' });
  const url = new URL(google.buildAuthUrl({ state: 'abc.123', nonce: 'n-1' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://api.test/cb');
  assert.equal(url.searchParams.get('state'), 'abc.123');
  assert.equal(url.searchParams.get('nonce'), 'n-1');
  assert.equal(url.searchParams.get('prompt'), 'select_account', 'the chooser opens every time');
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['email', 'openid', 'profile']);
});

test('google: the state round-trips and refuses to be edited', (t) => {
  withEnv(t, {});
  const state = google.signState({ ret: '/builder/42', exp: Date.now() + 60_000, nonce: 'n' });
  const back = google.readState(state);
  assert.equal(back.ret, '/builder/42');
  assert.equal(back.nonce, 'n');

  assert.equal(google.readState(`${state.slice(0, -2)}aa`), null, 'a changed payload fails the signature');
  assert.equal(google.readState('nonsense'), null);
  assert.equal(google.readState(''), null);
  assert.equal(google.readState(google.signState({ ret: '/x', exp: Date.now() - 1 })), null, 'expired state is dead');
  assert.equal(google.readState(state, 'a-different-secret'), null, 'another installation cannot mint states');
});

test('google: only our own paths can be a return destination', () => {
  assert.equal(safeReturnPath('/builder/7?tab=assets'), '/builder/7?tab=assets');
  assert.equal(safeReturnPath('/dashboard'), '/dashboard');
  assert.equal(safeReturnPath('https://evil.test/'), '/dashboard', 'an absolute URL is refused');
  assert.equal(safeReturnPath('//evil.test'), '/dashboard', 'a protocol-relative URL is refused');
  assert.equal(safeReturnPath('/redirect\tto'), '/dashboard', 'control characters are refused');
  assert.equal(safeReturnPath(undefined), '/dashboard');
});

test('google: a token is only trusted when Google signed it for this app', async (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' });
  const fetchImpl = offlineKeys();

  const good = await google.verifyIdToken(idToken(), { fetchImpl });
  assert.equal(good.email, 'ada@example.com', 'the address is normalised before it can match a user');
  assert.equal(good.emailVerified, true);
  assert.equal(good.provider, 'google');
  assert.equal(good.externalId, '110492837465102938471');
  assert.equal(good.name, 'Ada Okonkwo');

  await assert.rejects(() => google.verifyIdToken(idToken({ aud: 'someone-else' }), { fetchImpl }), /different application/i);
  await assert.rejects(() => google.verifyIdToken(idToken({ exp: Math.floor(Date.now() / 1000) - 10 }), { fetchImpl }), /expired/i);
  await assert.rejects(() => google.verifyIdToken(idToken({ iss: 'https://not-google.test' }), { fetchImpl }), /did not come from Google/i);
  await assert.rejects(() => google.verifyIdToken(idToken({ email_verified: false }), { fetchImpl }), /not verified/i);
  await assert.rejects(() => google.verifyIdToken(idToken({ email_verified: null }), { fetchImpl }), /not verified/i);
  await assert.rejects(() => google.verifyIdToken(idToken({}, { kid: 'unknown-key' }), { fetchImpl }), /unknown google signing key/i);
  await assert.rejects(() => google.verifyIdToken(idToken({}, { aud: 'other' }), { fetchImpl }), /different application/i);

  // Same token, hand-edited: the signature has to catch it.
  const [header, payload, sig] = idToken().split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), email: 'victim@launchpad.app' })).toString('base64url');
  await assert.rejects(() => google.verifyIdToken(`${header}.${forged}.${sig}`, { fetchImpl }), /did not sign/i);
  await assert.rejects(() => google.verifyIdToken('not-a-jwt', { fetchImpl }), /not a Google ID token/i);

});

test('google: the key set is fetched once and reused', async (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' });
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ keys: [JWK] }) };
  };
  await google.verifyIdToken(idToken({ sub: 'a' }), { fetchImpl });
  await google.verifyIdToken(idToken({ sub: 'b' }), { fetchImpl });
  assert.equal(calls, 1, 'JWKS is cached for ten minutes, not fetched per sign-in');

  google.__clearKeyCache();
  await google.verifyIdToken(idToken({ sub: 'c' }), { fetchImpl });
  assert.equal(calls, 2, 'a rotated key set is picked up after the cache expires');

  await assert.rejects(
    () => {
      google.__clearKeyCache();
      return google.verifyIdToken(idToken(), { fetchImpl: async () => ({ ok: false, status: 503 }) });
    },
    /unavailable/i,
    'a Google outage is reported as such',
  );
});

test('google: first sign-in creates the account, and there is no password to steal', async (t) => {
  const auth = workspace(t);
  const session = await auth.signInWithProfile({
    provider: 'google',
    externalId: 'sub-1',
    email: 'grace@example.test',
    name: 'Grace',
    emailVerified: true,
  });
  assert.equal(session.user.email, 'grace@example.test');
  assert.equal(session.user.name, 'Grace');
  assert.equal(session.user.provider, 'google');
  assert.equal(session.user.plan, 'free');
  assert.ok(!('passwordHash' in session.user), 'the hash never leaves the server');
  assert.ok(session.token && session.token.length > 20);
  assert.equal((await auth.userFromToken(session.token)).email, 'grace@example.test', 'the session token resolves to that user');

  const again = await auth.signInWithProfile({ provider: 'google', externalId: 'sub-1', email: 'grace@example.test', name: 'Grace', emailVerified: true });
  assert.equal(again.user.id, session.user.id, 'the same Google account lands on the same user');

  const store = await auth.db();
  const row = await store.findUserByEmail('grace@example.test');
  assert.equal(row.provider, 'google');
  assert.equal(row.externalId, 'sub-1');
  assert.equal(row.passwordHash, '', 'nothing was chosen, so nothing is stored');
  assert.equal(session.user.hasPassword, false, 'and the client is told that, to offer the right form');
  await assert.rejects(
    () => auth.login({ email: 'grace@example.test', password: 'launchpad' }),
    /created with Google.*no password yet/i,
    'the reason is stated instead of “wrong password”',
  );

  // …and the person can pick a password on the account screen without knowing
  // an old one, because there is no old one.
  const set = await auth.changePassword(session.user.id, { current: '', next: 'a real password' });
  assert.equal(set.ok, true);
  assert.equal(set.user.hasPassword, true);
  const withPassword = await auth.login({ email: 'grace@example.test', password: 'a real password' });
  assert.ok(withPassword.token, 'email sign-in works from then on');
  const withGoogle = await auth.signInWithProfile({ provider: 'google', externalId: 'sub-1', email: 'grace@example.test', name: 'Grace', emailVerified: true });
  assert.equal(withGoogle.user.id, session.user.id, 'and so does Google — still one account');
});

test('google: a normal account still has to prove it knows its password', async (t) => {
  const auth = workspace(t);
  const created = await auth.signup({ email: 'linus@example.test', password: 'correct horse', name: 'Linus' });
  assert.equal(created.user.hasPassword, true);
  await assert.rejects(() => auth.changePassword(created.user.id, { current: 'wrong one', next: 'newer horse' }), /not right/i);
  await assert.rejects(() => auth.login({ email: 'linus@example.test', password: 'newer horse' }), /not right/i, 'the refused change really did not happen');
  const changed = await auth.changePassword(created.user.id, { current: 'correct horse', next: 'newer horse' });
  assert.equal(changed.user.hasPassword, true);
  assert.ok((await auth.login({ email: 'linus@example.test', password: 'newer horse' })).token);
});

test('google: an existing email/password account is linked, not duplicated', async (t) => {
  const auth = workspace(t);
  const created = await auth.signup({ email: 'hopper@example.test', password: 'correct horse', name: 'hopper@example.test' });

  const session = await auth.signInWithProfile({
    provider: 'google',
    externalId: 'sub-2',
    email: 'hopper@example.test',
    name: 'Grace Hopper',
    emailVerified: true,
  });
  assert.equal(session.user.id, created.user.id, 'one person, one account');
  assert.equal(session.user.name, 'Grace Hopper', 'the name Google sent fills the gap');

  const store = await auth.db();
  const linked = await store.findUserByExternalId('sub-2');
  assert.equal(linked.id, created.user.id, 'the Google subject is remembered for next time');
  assert.equal(linked.provider, 'password', 'the account was born as a password account');
  assert.equal((await store.findUserByEmail('hopper@example.test')).externalId, 'sub-2');
  const still = await auth.login({ email: 'hopper@example.test', password: 'correct horse' });
  assert.ok(still.token, 'the password they already had keeps working');
});

test('google: the credential endpoint only answers for a verified token', async (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com' });
  const auth = workspace(t);

  const session = await auth.loginWithGoogle(idToken(), { fetchImpl: offlineKeys() });
  assert.equal(session.user.email, 'ada@example.com', 'the padded address Google sent is trimmed');

  await assert.rejects(() => auth.loginWithGoogle(idToken({ email_verified: false }), { fetchImpl: offlineKeys() }), /not verified/i);
  await assert.rejects(() => auth.loginWithGoogle('', { fetchImpl: offlineKeys() }), /not a Google ID token/i);
});

test('google: the redirect flow refuses what it did not start', async (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_REDIRECT_URI: undefined });
  const auth = workspace(t);
  assert.throws(() => auth.googleAuthUrl('/dashboard'), /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/, 'unconfigured means a clear message, not a broken link');

  withEnv(t, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret' });
  const url = auth.googleAuthUrl('https://evil.test/steal');
  const state = new URL(url).searchParams.get('state');
  assert.deepEqual(google.readState(state).ret, '/dashboard', 'the return path is sanitised before it is even stored');

  await assert.rejects(() => auth.googleComplete({ code: 'c', state: 'made-up.0' }), /expired or was not started here/i);
  await assert.rejects(() => auth.googleComplete({ state }), /authorisation code/i);
  await assert.rejects(
    () => auth.googleComplete({ code: 'c', state }, { fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'invalid_grant' }) }),
    /refused the authorisation code/i,
  );
});

test('google: the status the sign-in screen reads never leaks the secret', (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'top-secret-value' });
  const status = workspace(t).googleStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.redirect, true);
  assert.equal(status.clientId, 'cid.apps.googleusercontent.com', 'the client id is public by design');
  assert.equal(JSON.stringify(status).includes('top-secret-value'), false, 'the secret is not in the response');
  assert.equal(status.authUrl, '/api/auth/google/start');
});

test('google: the exchange endpoint is only used by the redirect flow', async (t) => {
  withEnv(t, { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
  await assert.rejects(() => google.exchangeCode('code'), /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/);

  withEnv(t, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'https://api.test/cb' });
  let seen = null;
  const id = idToken();
  const token = await google.exchangeCode('the-code', {
    fetchImpl: async (url, init) => {
      seen = { url, body: new URLSearchParams(init.body) };
      return { ok: true, json: async () => ({ id_token: id }) };
    },
  });
  assert.equal(token, id);
  assert.equal(seen.url, 'https://oauth2.googleapis.com/token');
  assert.equal(seen.body.get('grant_type'), 'authorization_code');
  assert.equal(seen.body.get('code'), 'the-code');
  assert.equal(seen.body.get('client_id'), 'cid');
  assert.equal(seen.body.get('client_secret'), 'secret');
  assert.equal(seen.body.get('redirect_uri'), 'https://api.test/cb');
});
