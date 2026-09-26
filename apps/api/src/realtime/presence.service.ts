import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

// Tracks which live sockets belong to which userId so that non-realtime
// parts of the app (e.g. AuthService on a duplicate login) can push an
// event to a user's currently-connected device(s) without depending on the
// gateway directly. A user can have more than one socket briefly (e.g. two
// tabs), so we kick all of them on a forced logout.
@Injectable()
export class PresenceService {
  private server: Server | null = null;
  private socketIdsByUserId = new Map<string, Set<string>>();

  setServer(server: Server): void {
    this.server = server;
  }

  addSocket(userId: string, socketId: string): void {
    const set = this.socketIdsByUserId.get(userId) ?? new Set<string>();
    set.add(socketId);
    this.socketIdsByUserId.set(userId, set);
  }

  removeSocket(userId: string, socketId: string): void {
    const set = this.socketIdsByUserId.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) {
      this.socketIdsByUserId.delete(userId);
    }
  }

  /** Push a forced-logout notice to every currently-connected socket for this user, then disconnect them. */
  forceLogout(userId: string, message: string): void {
    if (!this.server) return;
    const socketIds = this.socketIdsByUserId.get(userId);
    if (!socketIds || socketIds.size === 0) return;
    for (const socketId of socketIds) {
      this.server.to(socketId).emit('force_logout', { message });
      this.server.sockets.sockets.get(socketId)?.disconnect(true);
    }
    this.socketIdsByUserId.delete(userId);
  }
}
