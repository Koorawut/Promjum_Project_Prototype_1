import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

// Mirrors ACCESS_TOKEN_TTL in AuthService: a kicked device's old access
// token can still authenticate a (re)connecting socket for this long, so
// keep re-delivering the kick to zombie reconnects until the token itself
// expires and the whole question becomes moot.
const FORCE_KICK_TTL_SEC = 15 * 60;

// Emit the force_logout packet, then close the socket a beat later. Closing
// in the same tick as the emit can drop the packet entirely (the close frame
// overtakes the data frame on some transports) — which is how a kicked
// device ended up staying on the game page with a dead socket, never
// learning why.
export const FORCE_KICK_DISCONNECT_DELAY_MS = 150;

interface ForcedLogoutInfo {
  /** Whole-second timestamp of the kick — directly comparable with JWT `iat`. */
  kickedAtSec: number;
  message: string;
}

// Tracks which live sockets belong to which userId so that non-realtime
// parts of the app (e.g. AuthService on a duplicate login) can push an
// event to a user's currently-connected device(s) without depending on the
// gateway directly. A user can have more than one socket briefly (e.g. two
// tabs), so we kick all of them on a forced logout.
@Injectable()
export class PresenceService {
  private server: Server | null = null;
  private socketIdsByUserId = new Map<string, Set<string>>();
  private forcedLogouts = new Map<string, ForcedLogoutInfo>();
  private forceLogoutHandler: ((userId: string) => void) | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Registered by RealtimeGateway.afterInit so a forced logout can also
   * deterministically tear down everything the user is currently in — live
   * match, post-match call, matchmaking queue — at kick time. Kept as a
   * callback (rather than PresenceService injecting the runtime directly)
   * so the module dependency stays one-way: RealtimeModule -> PresenceModule.
   */
  setForceLogoutHandler(handler: (userId: string) => void): void {
    this.forceLogoutHandler = handler;
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

  /**
   * The still-active forced logout for a socket whose access token predates
   * the kick — i.e. the kicked device's socket.io auto-reconnect (the token
   * itself remains valid for a few more minutes, e.g. a suspended mobile tab
   * waking back up). Returns null for the *replacement* device (its token
   * was issued after the kick) and once the kick has aged out.
   */
  getForcedLogout(userId: string, tokenIssuedAtSec: number | undefined): ForcedLogoutInfo | null {
    const info = this.forcedLogouts.get(userId);
    if (!info) {
      return null;
    }
    if (Date.now() / 1000 - info.kickedAtSec > FORCE_KICK_TTL_SEC) {
      this.forcedLogouts.delete(userId);
      return null;
    }
    if (tokenIssuedAtSec === undefined || tokenIssuedAtSec >= info.kickedAtSec) {
      return null;
    }
    return info;
  }

  /** Push a forced-logout notice to every currently-connected socket for this user, then disconnect them. */
  forceLogout(userId: string, message: string): void {
    this.forcedLogouts.set(userId, {
      kickedAtSec: Math.floor(Date.now() / 1000),
      message,
    });

    // End whatever this user is in right now, synchronously at kick time.
    // Relying on the kicked sockets' own disconnect handlers to do it races
    // against the replacement device's fresh socket connecting (whose
    // handleConnection -> reconnectUser repoints the match participant
    // record before the old socket's disconnect fires) — which orphaned the
    // opponent in a match that never ends and entangled the new session
    // with the abandoned one.
    this.forceLogoutHandler?.(userId);

    const socketIds = this.socketIdsByUserId.get(userId);
    if (!socketIds || socketIds.size === 0) {
      return;
    }
    for (const socketId of socketIds) {
      const socket = this.server?.sockets.sockets.get(socketId);
      if (!socket) {
        continue;
      }
      socket.emit('force_logout', { message });
      // Delayed close so the emit above actually reaches the client first.
      setTimeout(() => socket.disconnect(true), FORCE_KICK_DISCONNECT_DELAY_MS);
    }
    this.socketIdsByUserId.delete(userId);
  }
}
