import { Controller, Get, HttpCode, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    const categoryCount = await this.prisma.category.count();
    return { ok: true, categoryCount };
  }

  // Proxies Metered TURN credentials so the apiKey never reaches the browser.
  // Falls back to STUN-only when no Metered domain/key is configured.
  @Get('turn/credentials')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async turnCredentials() {
    const domain = process.env.METERED_DOMAIN;
    const apiKey = process.env.METERED_API_KEY;
    if (!domain || !apiKey) {
      return {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      };
    }
    const url = `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      return {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      };
    }
    const data = (await res.json()) as {
      username: string;
      password: string;
      uris: string[];
    };
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: data.uris, username: data.username, credential: data.password },
      ],
    };
  }
}
