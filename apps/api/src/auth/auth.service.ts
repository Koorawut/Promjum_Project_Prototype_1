import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EMAIL_SERVICE } from './email/email.service.interface';
import type { EmailService } from './email/email.service.interface';
import { GoogleProfile } from './strategies/google.strategy';
import { PresenceService } from '../realtime/presence.service';

const DUPLICATE_LOGIN_MESSAGE =
  'บัญชีนี้ถูกเข้าสู่ระบบจากอุปกรณ์อื่น คุณจึงถูกออกจากระบบที่นี่';

const ACCESS_TOKEN_TTL = '15m';
const EMAIL_VERIFY_TTL = '1d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: PublicUser;
  /** True if this login kicked out another device that was already logged in as this user. */
  duplicateLogin: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly presence: PresenceService,
  ) {}

  private toPublicUser(user: {
    id: string;
    username: string;
    email: string;
    emailVerified: boolean;
  }): PublicUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
    };
  }

  private signAccessToken(userId: string, username: string): string {
    return this.jwtService.sign(
      { sub: userId, username },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: ACCESS_TOKEN_TTL,
      },
    );
  }

  private hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Enforces exactly one active session per account. `UserSession.userId`
   * carries a DB-level unique constraint, so this upsert is atomic even
   * when two logins race a few milliseconds apart — Postgres serializes the
   * two INSERT ... ON CONFLICT attempts, and only one of them ends up
   * creating vs. updating. (An earlier version did a plain `deleteMany`
   * then `create` with no transaction: two near-simultaneous logins could
   * both observe zero prior sessions and both insert, leaving two valid
   * sessions live for the same account at once — silently violating the
   * "one session per account" invariant this method's whole existence is
   * about. See README_ปัญหาและวิธีแก้.md.)
   *
   * The pre-upsert `findUnique` below is only for the `duplicateLogin`
   * notice/kick — a benign, informational race (worst case: a duplicate
   * login notice doesn't fire for one of two near-simultaneous logins,
   * which is a UX nicety, not a security or correctness invariant).
   */
  private async issueSession(
    userId: string,
    username: string,
    enforceSingleSession = true,
  ): Promise<AuthResult> {
    let duplicateLogin = false;
    if (enforceSingleSession) {
      const existing = await this.prisma.userSession.findUnique({
        where: { userId },
      });
      duplicateLogin = !!existing;
    }

    const rawRefreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

    await this.prisma.userSession.upsert({
      where: { userId },
      create: { userId, refreshTokenHash, expiresAt },
      update: { refreshTokenHash, expiresAt },
    });

    if (duplicateLogin) {
      this.presence.forceLogout(userId, DUPLICATE_LOGIN_MESSAGE);
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return {
      accessToken: this.signAccessToken(userId, username),
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: this.toPublicUser(user),
      duplicateLogin,
    };
  }

  async register(dto: RegisterDto): Promise<{ userId: string }> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) {
      throw new BadRequestException('Username or email already in use');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        emailVerified: false,
      },
    });

    const verifyToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: process.env.EMAIL_VERIFY_SECRET,
        expiresIn: EMAIL_VERIFY_TTL,
      },
    );
    const link = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
    await this.emailService.sendVerificationEmail(user.email, link);

    return { userId: user.id };
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.EMAIL_VERIFY_SECRET,
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerified: true },
    });
    return { verified: true };
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) {
      // Uniformly silent for unknown *and* already-verified emails. The old
      // code returned 400 'Email already verified' only for verified
      // accounts — combined with register()'s 'email already in use' leak
      // this let an attacker probe whether a specific address belonged to a
      // registered, verified account (email enumeration). The response is
      // now identical whether the address exists, is verified, or not, and
      // no email is sent unless there is actually something to verify.
      return;
    }
    const verifyToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: process.env.EMAIL_VERIFY_SECRET,
        expiresIn: EMAIL_VERIFY_TTL,
      },
    );
    const link = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
    await this.emailService.sendVerificationEmail(user.email, link);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.issueSession(user.id, user.username);
  }

  async loginOrRegisterWithGoogle(profile: GoogleProfile): Promise<AuthResult> {
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (!user) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (byEmail) {
        // Only silently adopt a pre-existing account by matching email when
        // that account was already verified through a legitimate channel
        // (password register + email verify link, or a prior Google login).
        // Otherwise this is exactly the account-takeover shape: attacker
        // registers with the *victim's* real email + attacker's own
        // password (register() never required proving email ownership
        // first), then when the real owner later signs in with Google using
        // that same email, the old code linked the victim's Google identity
        // onto the attacker's pre-existing, attacker-controlled account —
        // both parties would then be able to log into the same account.
        // Refusing to link here forces the real owner through the email
        // verification link instead (only they can receive it), which is
        // the one channel that actually proves ownership.
        if (!byEmail.emailVerified) {
          throw new BadRequestException(
            'อีเมลนี้มีบัญชีที่ยังไม่ได้ยืนยันอยู่แล้ว กรุณายืนยันอีเมลก่อน หรือติดต่อฝ่ายสนับสนุน',
          );
        }
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId: profile.googleId },
        });
      }
    }

    if (!user) {
      const baseUsername =
        profile.email
          .split('@')[0]
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .slice(0, 24) || 'user';
      let username = baseUsername;
      let suffix = 0;

      while (await this.prisma.user.findUnique({ where: { username } })) {
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }
      user = await this.prisma.user.create({
        data: {
          username,
          email: profile.email,
          googleId: profile.googleId,
          emailVerified: true,
        },
      });
    }

    return this.issueSession(user.id, user.username);
  }

  async refresh(rawRefreshToken: string | undefined): Promise<AuthResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const session = await this.prisma.userSession.findFirst({
      where: { refreshTokenHash: tokenHash },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: delete the old session row, issue a brand new one. This is
    // the *same* device continuing its session, not a new login, so don't
    // run single-session enforcement here (that's for `login`/Google only).
    //
    // Two /auth/refresh calls racing on the same still-valid cookie (e.g.
    // two tabs, or apiFetch's own retry firing alongside a manual refresh)
    // can both pass the findFirst check above before either deletes —
    // whichever loses now finds the row already gone. That's just the
    // caller reusing an already-rotated-out refresh token, which is exactly
    // what should produce a clean 401, not an unhandled Prisma "record not
    // found" surfacing as a 500.
    try {
      await this.prisma.userSession.delete({ where: { id: session.id } });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    return this.issueSession(user.id, user.username, false);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    await this.prisma.userSession.deleteMany({
      where: { refreshTokenHash: tokenHash },
    });
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return this.toPublicUser(user);
  }
}
