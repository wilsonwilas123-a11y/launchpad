const { wireController, get, post, patch, del, body, bodyAt, reqArg, resArg, queryArg } = require('../../common/js-decorators');
const { UnauthorizedException } = require('@nestjs/common');

const { AUTH_SERVICE } = require('../../common/tokens');

/** Where to hand the browser back to after Google has signed it in. */
function webOrigin(req) {
  const configured = process.env.LAUNCHPAD_WEB_ORIGIN || '';
  if (configured) return configured.replace(/\/$/, '');
  const referer = req && req.headers ? req.headers.referer : '';
  if (typeof referer === 'string' && /^https?:\/\//i.test(referer)) {
    try {
      return new URL(referer).origin;
    } catch {
      /* fall through to a same-origin redirect */
    }
  }
  return '';
}

/** Local MVP auth — enough to gate the dashboard and make "my launches" real. */
class AuthController {
  constructor(auth) {
    this.auth = auth;
  }

  signup(payload) {
    return this.auth.signup(payload || {});
  }

  login(payload) {
    return this.auth.login(payload || {});
  }

  /** The offline door: a real account, no password to type, no Google needed. */
  demo() {
    return this.auth.loginDemo();
  }

  me(req) {
    return { user: req.user };
  }

  /** Is Google wired up? The sign-in screen will not offer it until it is. */
  googleStatus() {
    return this.auth.googleStatus();
  }

  /** Google Identity Services: the browser's ID token comes here to be checked. */
  googleSignIn(payload) {
    const credential = (payload || {}).credential;
    if (!credential) throw new UnauthorizedException('No Google credential was posted.');
    return this.auth.loginWithGoogle(credential);
  }

  /** Authorization-code flow, step 1. A plain 302, so it works without JS. */
  googleStart(query, res) {
    res.redirect(302, this.auth.googleAuthUrl(query));
  }

  /**
   * Authorization-code flow, step 2. The session token travels in the URL
   * fragment, which browsers never send to a server and never log — the web app
   * lifts it out of the hash and drops it from the address bar (see Session.jsx).
   */
  async googleCallback(query, req, res) {
    const session = await this.auth.googleComplete(query || {});
    const target = `${webOrigin(req)}${session.returnTo || '/dashboard'}#lp_token=${encodeURIComponent(session.token)}`;
    res.redirect(302, target);
  }

  /** Same exchange for a caller that would rather post than be redirected. */
  googleCode(payload) {
    return this.auth.googleComplete(payload || {});
  }

  updateProfile(payload, req) {
    return this.auth.updateProfile(req.user.id, payload || {});
  }

  changePassword(payload, req) {
    return this.auth.changePassword(req.user.id, payload || {});
  }

  forgot(payload) {
    return this.auth.forgotPassword((payload || {}).email);
  }

  removeAccount(req) {
    return this.auth.deleteAccount(req.user.id);
  }
}

wireController(
  AuthController,
  'auth',
  {
    signup: post('signup', [body], [], { public: true }),
    login: post('login', [body], [], { public: true }),
    demo: post('demo', [], [], { public: true }),
    googleStatus: get('google/status', [], [], { public: true }),
    googleSignIn: post('google', [body], [], { public: true }),
    googleStart: get('google/start', [queryArg(0, 'return_to'), resArg(1)], [], { public: true }),
    googleCallback: get('google/callback', [queryArg(0), reqArg(1), resArg(2)], [], { public: true }),
    googleCode: post('google/code', [body], [], { public: true }),
    me: get('me', [reqArg(0)]),
    updateProfile: patch('me', [body, reqArg(1)]),
    changePassword: post('password', [bodyAt(0), reqArg(1)]),
    forgot: post('password/forgot', [body], [], { public: true }),
    removeAccount: del('account', [reqArg(0)]),
  },
  { inject: [AUTH_SERVICE] },
);

module.exports = { AuthController, AUTH_SERVICE };
