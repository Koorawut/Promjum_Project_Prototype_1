import { randomBytes } from 'crypto';
import type { Request } from 'express';
import type {
  Metadata,
  StateStoreStoreCallback,
  StateStoreVerifyCallback,
} from 'passport-oauth2';

/**
 * Custom passport-oauth2 state store using a short-lived HttpOnly cookie
 * instead of express-session (which this app never wires up — no session
 * middleware exists anywhere else in main.ts). Without `state: true` at
 * all, GoogleStrategy had no CSRF protection on the OAuth callback: an
 * attacker can complete their *own* valid Google login, capture the
 * resulting `/auth/google/callback?code=...` URL, and lure a victim's
 * browser into loading it — completing a login-CSRF that links the
 * victim's browser session to the attacker's chosen account. Binding a
 * random nonce to a cookie set at `/auth/google` and checked at
 * `/auth/google/callback` closes that: the callback only proceeds if the
 * same browser that started the flow is the one completing it.
 *
 * passport-oauth2 dispatches on Function.length: it calls `store(req, cb)`
 * / `verify(req, state, cb)` when the method has 2/3 parameters (our case)
 * and only passes the extra `meta` argument to 3/4-parameter methods. The
 * overloads below mirror @types/passport-oauth2's `StateStore` interface
 * (which declares both shapes); the implementation keeps a parameter count
 * of 2/3 so the runtime always takes the non-meta path.
 */
export class CookieStateStore {
  private readonly cookieName = 'g_oauth_state';

  store(req: Request, callback: StateStoreStoreCallback): void;
  store(req: Request, meta: Metadata, callback: StateStoreStoreCallback): void;
  store(
    req: Request,
    metaOrCallback: Metadata | StateStoreStoreCallback,
    callback?: StateStoreStoreCallback,
  ): void {
    const cb = typeof metaOrCallback === 'function' ? metaOrCallback : callback;
    if (!cb) {
      return;
    }
    const state = randomBytes(24).toString('hex');
    req.res?.cookie(this.cookieName, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 5 * 60 * 1000,
      path: '/auth/google',
    });
    cb(null, state);
  }

  verify(
    req: Request,
    providedState: string,
    callback: StateStoreVerifyCallback,
  ): void;
  verify(
    req: Request,
    providedState: string,
    meta: Metadata,
    callback: StateStoreVerifyCallback,
  ): void;
  verify(
    req: Request,
    providedState: string,
    metaOrCallback: Metadata | StateStoreVerifyCallback,
    callback?: StateStoreVerifyCallback,
  ): void {
    const cb = typeof metaOrCallback === 'function' ? metaOrCallback : callback;
    if (!cb) {
      return;
    }
    const cookieState = (req.cookies as Record<string, string> | undefined)?.[
      this.cookieName
    ];
    req.res?.clearCookie(this.cookieName, { path: '/auth/google' });

    if (!cookieState || cookieState !== providedState) {
      cb(null, false, { message: 'Invalid or missing OAuth state.' });
      return;
    }
    cb(null, true, undefined);
  }
}
