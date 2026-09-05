const crypto = require('crypto');
const { config } = require('../../config');
const { UnauthorizedException, BadRequestException, ConflictException, InternalServerErrorException } = require('@nestjs/common');
const { googleConfig, buildAuthUrl, signState, readState, verifyIdToken, exchangeCode, STATE_TTL_MS } = require('./google');

const scrypt = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret = config.authSecret) {
  const body = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verify(token, secret = config.authSecret) {
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

class AuthService {
  constructor(store) {
    this.storePromise = store;
  }

  async db() {
    if (!this.database) this.database = await this.storePromise;
    return this.database;
  }

  hash(password) {
    const salt = crypto.randomBytes(8).toString('hex');
    return `s2:${salt}:${scrypt(password, salt)}`;
  }

  check(password, stored) {
    if (!stored) return false;
    const [scheme, salt, digest] = String(stored).split(':');
    if (scheme !== 's2' || !salt) return false;
    const candidate = Buffer.from(scrypt(password, salt), 'hex');
    const expected = Buffer.from(digest, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }

  publicUser(user) {
    if (!user) return null;
    const { passwordHash, ...rest } = user;
    // An account created by Google has no password *yet*; the account screen
    // needs to know that so it can offer to choose one instead of asking for a
    // current password nobody ever typed.
    return { ...rest, hasPassword: Boolean(passwordHash) };
  }

  async signup({ email, password, name, plan = 'free' }) {
    const database = await this.db();
    const normalized = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new BadRequestException('That email address does not look right.');
    if (String(password || '').length < 8) throw new BadRequestException('Use at least 8 characters for your password.');
    const existing = await database.findUserByEmail(normalized);
    if (existing) throw new ConflictException('An account already uses that email.');
    const user = await database.insertUser({
      id: crypto.randomUUID(),
      email: normalized,
      name: (name && String(name).trim()) || normalized.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      passwordHash: this.hash(password),
      plan,
      avatarSeed: normalized,
    });
    return { token: this.issueToken(user), user: this.publicUser(user) };
  }

  async login({ email, password }) {
    const database = await this.db();
    const user = await database.findUserByEmail(String(email || '').trim().toLowerCase());
    if (!user || !this.check(password, user.passwordHash)) {
      // Saying "this account has no password" only when that is actually the
      // case; a wrong password on a normal account stays deliberately vague.
      if (user && !user.passwordHash) {
        throw new UnauthorizedException('This account was created with Google and has no password yet — sign in with Google, then choose one on your account page.');
      }
      throw new UnauthorizedException('Email or password is not right.');
    }
    return { token: this.issueToken(user), user: this.publicUser(user) };
  }

  /** Demo shortcut behind "Continue with Google" — no real OAuth in the MVP. */
  async loginDemo() {
    const database = await this.db();
    let user = await database.findUserByEmail('demo@launchpad.app');
    if (!user) {
      user = await database.insertUser({
        id: crypto.randomUUID(),
        email: 'demo@launchpad.app',
        name: 'Demo Founder',
        passwordHash: this.hash('launchpad'),
        plan: 'pro',
        avatarSeed: 'demo@launchpad.app',
      });
    }
    return { token: this.issueToken(user), user: this.publicUser(user) };
  }

  /* ── Google ───────────────────────────────────────────────────────────────
   * Both paths land in `signInWithProfile`, which is the only place that
   * decides who gets into the account. Nothing reaches it without Google's
   * own signature on the token having been checked first.
   */

  /** What the sign-in screen asks before it draws a Google button. */
  googleStatus() {
    const cfg = googleConfig();
    return {
      enabled: cfg.enabled,
      // The browser button works with a client id alone; the redirect flow
      // needs the secret too, so the web app can say which one it has.
      redirect: cfg.redirectEnabled,
      clientId: cfg.clientId || null,
      // Never the secret: this response is public.
      authUrl: cfg.enabled ? '/api/auth/google/start' : null,
    };
  }

  /** Sign in an identity Google vouched for, creating the account on the fly. */
  async signInWithProfile(profile) {
    const database = await this.db();
    const email = String(profile.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Google did not send an email address.');
    if (profile.emailVerified !== true) throw new UnauthorizedException('Google has not verified that email address.');

    const provider = profile.provider || 'google';
    let user = profile.externalId ? await database.findUserByExternalId(profile.externalId) : null;
    if (!user) user = await database.findUserByEmail(email);

    if (user) {
      // Linking by email is deliberate: Google only returns verified addresses,
      // so a password account and its Google account are the same person. The
      // password keeps working and `provider` stays what the account started as —
      // it records where the account came from, not the only way back in.
      const patch = {};
      if (profile.externalId && user.externalId !== profile.externalId) patch.externalId = profile.externalId;
      if (!user.name || user.name === user.email) patch.name = profile.name || user.email.split('@')[0];
      if (profile.picture && !user.avatarSeed) patch.avatarSeed = email;
      if (Object.keys(patch).length) user = (await database.updateUser(user.id, patch)) || user;
    } else {
      user = await database.insertUser({
        id: crypto.randomUUID(),
        email,
        name: profile.name || email.split('@')[0],
        // Empty means "no password was ever chosen". The column is NOT NULL in
        // Postgres, but an empty string never matches, so sign-in by password
        // stays impossible until the person picks one on the account screen.
        passwordHash: '',
        plan: 'free',
        avatarSeed: email,
        provider,
        externalId: profile.externalId || null,
      });
    }

    return { token: this.issueToken(user), user: this.publicUser(user) };
  }

  /** Google Identity Services hands the browser an ID token; we verify it here. */
  async loginWithGoogle(credential, options = {}) {
    let profile;
    try {
      profile = await verifyIdToken(credential, options);
    } catch (error) {
      // Anything Google rejected is an unauthenticated request, not a 500.
      throw new UnauthorizedException(error.message || 'Google sign-in did not complete.');
    }
    return this.signInWithProfile(profile);
  }

  /** Step one of the redirect flow. `returnTo` is validated so we cannot be
   *  used to bounce someone onto another site. */
  googleAuthUrl(returnTo) {
    const cfg = googleConfig();
    if (!cfg.redirectEnabled) {
      throw new BadRequestException('The redirect flow needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env.');
    }
    const state = signState({ ret: safeReturnPath(returnTo), exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomUUID() });
    return buildAuthUrl({ state });
  }

  /** Step two: code for token, token for a user, then back to the web app. */
  async googleComplete({ code, state }, options = {}) {
    if (!code) throw new BadRequestException('Google did not return an authorisation code.');
    const payload = readState(state);
    if (!payload) throw new UnauthorizedException('That sign-in attempt expired or was not started here. Try again.');
    let session;
    try {
      const idToken = await exchangeCode(code, options);
      session = await this.loginWithGoogle(idToken, options);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error.message || 'Google sign-in failed.');
    }
    return { ...session, returnTo: safeReturnPath(payload.ret) };
  }

  issueToken(user) {
    return sign({ sub: user.id, email: user.email, name: user.name, iat: Date.now(), exp: Date.now() + config.tokenTtlMs });
  }

  /** Session token → user. Throws, so no caller can mistake a bad token for a guest. */
  async userFromToken(token) {
    const payload = verify(token);
    const database = await this.db();
    const user = payload && payload.sub ? await database.findUserById(payload.sub) : null;
    if (!user) throw new UnauthorizedException('Your session expired — sign in again.');
    return this.publicUser(user);
  }

  async updateProfile(userId, patch) {
    const database = await this.db();
    const allowed = {};
    if (patch.name) allowed.name = String(patch.name).slice(0, 80);
    if (patch.plan && ['free', 'pro', 'team'].includes(patch.plan)) allowed.plan = patch.plan;
    if (!Object.keys(allowed).length) return this.publicUser(await database.findUserById(userId));
    return this.publicUser(await database.updateUser(userId, allowed));
  }

  async changePassword(userId, { current, next }) {
    const database = await this.db();
    const user = await database.findUserById(userId);
    if (!user) throw new UnauthorizedException('No such account.');
    // The Google path is already proven (a verified ID token), and it leaves no
    // password behind — so on that account this form *sets* the first one
    // instead of checking an old one. Any account with a password still has to
    // know it.
    if (user.passwordHash && !this.check(current, user.passwordHash)) {
      throw new UnauthorizedException('Current password is not right.');
    }
    if (String(next || '').length < 8) throw new BadRequestException('New password needs at least 8 characters.');
    await database.updateUser(userId, { passwordHash: this.hash(next) });
    return { ok: true, user: this.publicUser(await database.findUserById(userId)) };
  }

  async forgotPassword(email) {
    // MVP: no mailer. The token is generated and returned only in dev so the
    // flow can be demoed end to end without pretending email was sent.
    const database = await this.db();
    const user = await database.findUserByEmail(String(email || '').trim().toLowerCase());
    const resetToken = user ? sign({ sub: user.id, intent: 'reset', exp: Date.now() + 3600_000 }) : null;
    return {
      sent: true,
      email: String(email || '').trim(),
      exists: Boolean(user),
      devResetToken: config.env === 'production' ? undefined : resetToken || undefined,
    };
  }

  async deleteAccount(userId) {
    const database = await this.db();
    await database.deleteUser(userId);
    return { ok: true };
  }
}

/** Only paths inside the app, so a crafted `?return_to=` cannot bounce a
 *  visitor somewhere else. Falls back to the dashboard. */
function safeReturnPath(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\s\u0000-\u001f]/.test(raw)) return '/dashboard';
  return raw.slice(0, 200);
}

module.exports = { AuthService, sign, verify, safeReturnPath };
