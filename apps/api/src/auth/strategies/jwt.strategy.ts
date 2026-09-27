import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface AccessTokenClaims {
  sub: string;
  username: string;
  role?: 'user' | 'admin';
}

export interface JwtUser {
  userId: string;
  username: string;
  role: 'user' | 'admin';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  validate(payload: AccessTokenClaims): JwtUser {
    // `role` is embedded in the signed access token (see
    // signAccessToken) — verify() already proved the token wasn't
    // tampered with, so trusting the payload here is safe. Old tokens
    // issued before the admin update carry no role and default to
    // 'user' until they naturally expire (15 min TTL).
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role ?? 'user',
    };
  }
}
