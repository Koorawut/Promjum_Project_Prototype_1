import { Injectable } from '@nestjs/common';

export interface QueuedPlayer {
  userId: string;
  username: string;
  socketId: string;
}

/**
 * In-memory FIFO matchmaking queue. Swappable for a Redis/Upstash-backed
 * implementation later without changing callers (RealtimeGateway only
 * depends on this public shape).
 */
@Injectable()
export class MatchmakingQueueService {
  private queue: QueuedPlayer[] = [];

  enqueue(player: QueuedPlayer): void {
    if (this.queue.some((p) => p.userId === player.userId)) {
      return;
    }
    this.queue.push(player);
  }

  removeByUserId(userId: string): void {
    this.queue = this.queue.filter((p) => p.userId !== userId);
  }

  removeBySocketId(socketId: string): QueuedPlayer | undefined {
    const player = this.queue.find((p) => p.socketId === socketId);
    this.queue = this.queue.filter((p) => p.socketId !== socketId);
    return player;
  }

  /** Pops two players to be matched together, if available. */
  tryDequeuePair(): [QueuedPlayer, QueuedPlayer] | null {
    if (this.queue.length < 2) {
      return null;
    }
    const first = this.queue.shift() as QueuedPlayer;
    const second = this.queue.shift() as QueuedPlayer;
    return [first, second];
  }
}
