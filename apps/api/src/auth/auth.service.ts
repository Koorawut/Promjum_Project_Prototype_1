import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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

  private toPublicUser(user: { id: string; username: string; email: string; emailVerified: boolean }): PublicUser {
    return { id: user.id, username: user.username, email: user.email, emailVerified: user.emailVerified };
  }

  private signAccessToken(userId: string, username: string): string {
    return this.jwtService.sign({ sub: userId, username }, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  private hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Enforces exactly one active session per account: any prior session rows
   * (from other devices/tabs) are deleted, and if any existed, that other
   * device's live socket (if connected) is force-disconnected with a
   * notice so both sides know a duplicate login happened. This device's
   * own new session always proceeds regardless.
   */
  private async issueSession(userId: string, username: string, enforceSingleSession = true): Promise<AuthResult> {
    let duplicateLogin = false;
    if (enforceSingleSession) {
      const { count } = await this.prisma.userSession.deleteMany({ where: { userId } });
      duplicateLogin = count > 0;
      if (duplicateLogin) {
        this.presence.forceLogout(userId, DUPLICATE_LOGIN_MESSAGE);
      }
    }

    const rawRefreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash: this.hashRefreshToken(rawRefreshToken),
        expiresAt,
      },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

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

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: { username: dto.username, email: dto.email, passwordHash, emailVerified: false },
    });

    const verifyToken = this.jwtService.sign({ sub: user.id }, {
      secret: process.env.EMAIL_VERIFY_SECRET,
      expiresIn: EMAIL_VERIFY_TTL,
    });
    const link = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
    await this.emailService.sendVerificationEmail(user.email, link);

    return { userId: user.id };
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token, { secret: process.env.EMAIL_VERIFY_SECRET });
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await this.prisma.user.update({ where: { id: payload.sub }, data: { emailVerified: true } });
    return { verified: true };
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return; // don't reveal account existence
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }
    const verifyToken = this.jwtService.sign({ sub: user.id }, {
      secret: process.env.EMAIL_VERIFY_SECRET,
      expiresIn: EMAIL_VERIFY_TTL,
    });
    const link = `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`;
    await this.emailService.sendVerificationEmail(user.email, link);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
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
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      user = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (user) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: { googleId: profile.googleId, emailVerified: true } });
      }
    }

    if (!user) {
      const baseUsername = profile.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24) || 'user';
      let username = baseUsername;
      let suffix = 0;
      // eslint-disable-next-line no-await-in-loop
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
    const session = await this.prisma.userSession.findFirst({ where: { refreshTokenHash: tokenHash } });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: delete the old session row, issue a brand new one. This is
    // the *same* device continuing its session, not a new login, so don't
    // run single-session enforcement here (that's for `login`/Google only).
    await this.prisma.userSession.delete({ where: { id: session.id } });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    return this.issueSession(user.id, user.username, false);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    await this.prisma.userSession.deleteMany({ where: { refreshTokenHash: tokenHash } });
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toPublicUser(user);
  }
}
