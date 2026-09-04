const { SetMetadata, UnauthorizedException } = require('@nestjs/common');
const { verify } = require('./auth.service');
const { getStore } = require('../../db');
const { IS_PUBLIC } = require('../../common/tokens');

/** Marks a route as reachable without a session (catalog, published sites). */
const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * App-wide guard bound through APP_GUARD: every route is authenticated unless
 * the handler carries `@Public()`. Reads its own metadata directly instead of
 * injecting Reflector, which keeps the guard dependency-free in plain JS.
 */
class AuthGuard {
  async canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const isPublic =
      Boolean(Reflect.getMetadata(IS_PUBLIC, context.getHandler())) ||
      Boolean(Reflect.getMetadata(IS_PUBLIC, context.getClass()));
    const token = readToken(request);

    if (isPublic) {
      // A published site still resolves a session when one is sent, so the
      // owner sees a discreet "open in builder" affordance. Nobody else does.
      if (token) request.user = await this.resolve(token);
      return true;
    }
    if (!token) throw new UnauthorizedException('Sign in to continue.');
    const user = await this.resolve(token);
    if (!user) throw new UnauthorizedException('Your session expired — sign in again.');
    request.user = user;
    request.token = token;
    return true;
  }

  readToken(request) {
    return readToken(request);
  }

  async resolve(token) {
    const payload = verify(token);
    if (!payload || !payload.sub) return null;
    const store = await getStore();
    const user = await store.findUserById(payload.sub);
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }
}

function readToken(request) {
  const header = (request.headers && (request.headers.authorization || request.headers.Authorization)) || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return (request.query && request.query.token) || null;
}

module.exports = { AuthGuard, Public, IS_PUBLIC };
