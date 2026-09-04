const { wireController, get, post, patch, del, body, bodyAt, reqArg } = require('../../common/js-decorators');

const { AUTH_SERVICE } = require('../../common/tokens');

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

  /** Stands in for "Continue with Google" until real OAuth exists. */
  demo() {
    return this.auth.loginDemo();
  }

  me(req) {
    return { user: req.user };
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
    me: get('me', [reqArg(0)]),
    updateProfile: patch('me', [body, reqArg(1)]),
    changePassword: post('password', [bodyAt(0), reqArg(1)]),
    forgot: post('password/forgot', [body], [], { public: true }),
    removeAccount: del('account', [reqArg(0)]),
  },
  { inject: [AUTH_SERVICE] },
);

module.exports = { AuthController, AUTH_SERVICE };
