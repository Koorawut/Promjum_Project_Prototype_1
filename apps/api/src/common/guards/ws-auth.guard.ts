import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  data: Socket['data'] & { userId: string; username: string };
}

export function authenticateSocket(jwtService: JwtService, socket: Socket): { userId: string; username: string } | null {
  const token =
    (socket.handshake.auth?.token as string | undefined) ??
    (socket.handshake.headers.authorization?.replace(/^Bearer /, '') as string | undefined);

  if (!token) {
    return null;
  }

  try {
    const payload = jwtService.verify<{ sub: string; username: string }>(token, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
    return { userId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
