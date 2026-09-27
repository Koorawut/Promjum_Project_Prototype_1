import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { CookieStateStore } from './oauth-state.store';

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      // Fall back to placeholders so Nest can boot before the user supplies real
      // Google OAuth credentials; the /auth/google routes simply won't work until then.
      clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:4000/auth/google/callback',
      scope: ['profile', 'email'],
      // CSRF protection on the OAuth callback (see oauth-state.store.ts).
      // This app has no express-session middleware, so passport-oauth2's
      // built-in session-based state store can't be used — a cookie-backed
      // store does the same job without needing server-side session state.
      store: new CookieStateStore(),
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('Google account has no email'), undefined);
    }
    const user: GoogleProfile = {
      googleId: profile.id,
      email,
      displayName: profile.displayName,
    };
    done(null, user);
  }
}
