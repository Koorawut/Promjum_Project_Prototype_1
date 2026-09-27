import {
  Injectable,
  SetMetadata,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

// Role data flows through the verified JWT payload (see JwtStrategy) —
// never from a client-supplied field, so a user can't elevate themselves
// by tampering with request bodies.

export interface AuthedRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role: 'user' | 'admin';
  };
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class AdminGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Run the JWT verification first (super.canActivate handles 401 on
    // missing/invalid tokens), then check the role on the request.
    return super.canActivate(context);
  }

  handleRequest(_err: unknown, user: any, _info: unknown) {
    if (!user) {
      throw new ForbiddenException();
    }
    if (user.role !== 'admin') {
      // 403, not 401: the token is valid, the account just isn't an admin.
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบเท่านั้น');
    }
    return user;
  }
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
