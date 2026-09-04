const crypto = require('crypto');
const { config } = require('../../config');
const { UnauthorizedException, BadRequestException, ConflictException } = require('@nestjs/common');

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
    return rest;
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
    if (!user || !this.check(password, user.passwordHash)) throw new UnauthorizedException('Email or password is not right.');
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
    if (!this.check(current, user && user.passwordHash)) throw new UnauthorizedException('Current password is not right.');
    if (String(next || '').length < 8) throw new BadRequestException('New password needs at least 8 characters.');
    await database.updateUser(userId, { passwordHash: this.hash(next) });
    return { ok: true };
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

module.exports = { AuthService, sign, verify };
