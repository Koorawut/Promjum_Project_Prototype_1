import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

// `Socket` is generic with `SocketData = any` as the default type parameter,
// so `Socket['data']` is `any`. This helper verifies the handshake token and
// returns the identity as a concrete shape; the gateway writes it onto
// socket.data (typed via TypedSocket — see realtime/socket-data.ts).

export function authenticateSocket(
  jwtService: JwtService,
  socket: Socket,
): { userId: string; username: string; iatSec: number } | null {
  const token =
    (socket.handshake.auth?.token as string | undefined) ??
    socket.handshake.headers.authorization?.replace(/^Bearer /, '');

  if (!token) {
    return null;
  }

  try {
    const payload = jwtService.verify<{
      sub: string;
      username: string;
      iat?: number;
    }>(token, {
      secret: process.env.JWT_ACCESS_SECRET,
    });
    return {
      userId: payload.sub,
      username: payload.username,
      iatSec: payload.iat ?? 0,
    };
  } catch {
    return null;
  }
}
