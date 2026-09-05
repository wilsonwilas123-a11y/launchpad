const crypto = require('crypto');
const { config } = require('../../config');

/**
 * Google sign-in, with no client library.
 *
 * Two ways in, both ending at the same verified profile:
 *   • Google Identity Services — the browser gets an ID token and we verify its
 *     signature against Google's JWKS. Nothing to configure beyond the client id.
 *   • Authorization-code redirect — /auth/google/start then /auth/google/callback.
 *     This one also needs the client secret and a registered redirect URI.
 *
 * Every network call goes through `fetchImpl`, so the tests can hand in a fake
 * key set and stay offline. If GOOGLE_CLIENT_ID is not set, `enabled` is false and
 * the rest of the product behaves exactly as before — the sign-in screen shows the
 * Google row as "not configured yet" instead of pretending it works.
 */

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_KEYS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const SCOPES = 'openid email profile';
const STATE_TTL_MS = 10 * 60 * 1000;

const b64urlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const fromB64url = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

function signState(payload, secret = config.authSecret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function readState(token, secret = config.authSecret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Read at call time rather than snapshotted, so a test (or `npm run seed`
 * turning Google on for one command) can flip the credentials without
 * restarting anything. `config.google` holds the values the .env loader found.
 */
function googleConfig() {
  const g = config.google || {};
  const clientId = process.env.GOOGLE_CLIENT_ID ?? g.clientId ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? g.clientSecret ?? '';
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || g.redirectUri || `http://127.0.0.1:${config.port}/api/auth/google/callback`;
  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: SCOPES,
    /** The browser (Google Identity Services) flow needs only the client id. */
    popupEnabled: Boolean(clientId),
    /** The authorization-code flow needs the secret as well. */
    redirectEnabled: Boolean(clientId && clientSecret),
    enabled: Boolean(clientId),
  };
}

function buildAuthUrl(overrides = {}) {
  const cfg = googleConfig();
  const params = new URLSearchParams({
    client_id: overrides.clientId || cfg.clientId,
    redirect_uri: overrides.redirectUri || cfg.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state: overrides.state || '',
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });
  if (overrides.nonce) params.set('nonce', overrides.nonce);
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/* ── ID-token verification ─────────────────────────────────────────────────── */

let keysCache = { at: 0, keys: null };

async function fetchSigningKeys(fetchImpl) {
  const fresh = keysCache.keys && Date.now() - keysCache.at < 10 * 60 * 1000;
  if (fresh) return keysCache.keys;
  const response = await fetchImpl(GOOGLE_KEYS_ENDPOINT);
  if (!response.ok) throw new Error(`Google's key set is unavailable (HTTP ${response.status}).`);
  const body = await response.json();
  const keys = new Map();
  for (const key of body.keys || []) {
    if (key.kty !== 'RSA' || (key.alg && key.alg !== 'RS256')) continue;
    keys.set(key.kid, crypto.createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256', use: 'sig', ext: true }, format: 'jwk' }));
  }
  keysCache = { at: Date.now(), keys };
  return keys;
}

/**
 * Verifies a Google-issued ID token and returns the profile we can trust.
 * Rejects anything not signed by Google, not meant for this client, expired,
 * or whose email Google has not confirmed (that last one is what makes it safe
 * to sign someone into an account that was created with a password).
 */
async function verifyIdToken(credential, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const cfg = googleConfig();
  if (!cfg.clientId) throw new Error('Google sign-in is not configured (set GOOGLE_CLIENT_ID).');
  if (typeof credential !== 'string' || credential.split('.').length !== 3) throw new Error('That is not a Google ID token.');

  const [headerPart, payloadPart, signaturePart] = credential.split('.');
  const header = fromB64urlSafe(headerPart);
  const payload = fromB64urlSafe(payloadPart);
  if (!header || !payload) throw new Error('That is not a Google ID token.');
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token signing method.');

  const keys = await fetchSigningKeys(fetchImpl);
  const key = keys.get(header.kid);
  if (!key) throw new Error('Unknown Google signing key.');

  const signed = Buffer.from(`${headerPart}.${payloadPart}`);
  const signature = Buffer.from(signaturePart, 'base64url');
  if (!crypto.verify('RSA-SHA256', signed, key, signature)) throw new Error('Google did not sign this token.');

  if (!GOOGLE_ISSUERS.has(payload.iss)) throw new Error('This token did not come from Google.');
  if (payload.aud !== cfg.clientId) throw new Error('This token was issued for a different application.');
  const seconds = 1000;
  if (payload.exp && payload.exp * seconds < now) throw new Error('That Google token has expired — try again.');
  if (payload.email_verified !== true) throw new Error('Google has not verified that email address.');
  if (!payload.email || !payload.sub) throw new Error('Google did not send an email address.');

  return {
    provider: 'google',
    externalId: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: payload.name || payload.given_name || '',
    picture: payload.picture || null,
    emailVerified: true,
  };
}

function fromB64urlSafe(part) {
  try {
    return fromB64url(part);
  } catch {
    return null;
  }
}

/** Authorization-code exchange, used by the redirect flow only. */
async function exchangeCode(code, { fetchImpl = globalThis.fetch, redirectUri } = {}) {
  const cfg = googleConfig();
  if (!cfg.redirectEnabled) throw new Error('The redirect flow needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri || cfg.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Google refused the authorisation code (HTTP ${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }
  const body = await response.json();
  if (!body.id_token) throw new Error('Google returned no ID token.');
  return body.id_token;
}

module.exports = {
  googleConfig,
  buildAuthUrl,
  signState,
  readState,
  verifyIdToken,
  exchangeCode,
  STATE_TTL_MS,
  GOOGLE_KEYS_ENDPOINT,
  __clearKeyCache: () => {
    keysCache = { at: 0, keys: null };
  },
};
