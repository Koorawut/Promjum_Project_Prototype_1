import { Injectable } from '@nestjs/common';

export interface RuntimeGameImage {
  id: string;
  imageUrl: string;
  label: string;
  isCorrect: boolean;
}

export interface RuntimeParticipant {
  userId: string;
  username: string;
  socketId: string;
}

export interface RoundState {
  roundNumber: number;
  describerUserId: string;
  guesserUserId: string;
  imageSetId: string;
  images: RuntimeGameImage[];
  correctImageId: string;
  startedAtMs: number;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
}

export interface MatchRuntimeState {
  matchSessionId: string;
  participants: [RuntimeParticipant, RuntimeParticipant];
  currentRound: RoundState | null;
  totalScores: Record<string, number>;
  /** userIds that have reported their WebRTC audio as connected. */
  voiceReady: Set<string>;
  /** userIds whose game/[matchId] page has actually mounted and is listening for round_start. */
  gameReady: Set<string>;
  /** Guards against starting round 1 twice (once from readiness, once from the fallback timer). */
  firstRoundStarted: boolean;
  /** Fallback so a stuck/failed voice connection can't block the game forever. */
  voiceReadyTimeout: ReturnType<typeof setTimeout> | null;
  /** True once round 4 has resolved — state now only exists to let the voice call survive into the summary screen. */
  matchCompleted: boolean;
  /** Ends the post-match call automatically if neither player clicks "finish" first. */
  postMatchTimeout: ReturnType<typeof setTimeout> | null;
}

const TOTAL_ROUNDS = 4;

@Injectable()
export class MatchRuntimeService {
  private matchesById = new Map<string, MatchRuntimeState>();
  private matchIdBySocketId = new Map<string, string>();

  readonly totalRounds = TOTAL_ROUNDS;

  create(state: MatchRuntimeState): void {
    this.matchesById.set(state.matchSessionId, state);
    for (const p of state.participants) {
      this.matchIdBySocketId.set(p.socketId, state.matchSessionId);
    }
  }

  get(matchSessionId: string): MatchRuntimeState | undefined {
    return this.matchesById.get(matchSessionId);
  }

  getBySocketId(socketId: string): MatchRuntimeState | undefined {
    const matchId = this.matchIdBySocketId.get(socketId);
    return matchId ? this.matchesById.get(matchId) : undefined;
  }

  /** Every live (or post-match) runtime state the given user participates in. */
  getAllByUserId(userId: string): MatchRuntimeState[] {
    const states: MatchRuntimeState[] = [];
    for (const state of this.matchesById.values()) {
      if (state.participants.some((p) => p.userId === userId)) {
        states.push(state);
      }
    }
    return states;
  }

  remove(matchSessionId: string): void {
    const state = this.matchesById.get(matchSessionId);
    if (state?.currentRound?.timeoutHandle) {
      clearTimeout(state.currentRound.timeoutHandle);
    }
    if (state?.voiceReadyTimeout) {
      clearTimeout(state.voiceReadyTimeout);
    }
    if (state?.postMatchTimeout) {
      clearTimeout(state.postMatchTimeout);
    }
    if (state) {
      for (const p of state.participants) {
        // A socketId can already have been reassigned to a *newer* match
        // (e.g. the same two players rematch before this match's belated
        // postMatchTimeout fires) — only clear the mapping if it still
        // points at *this* match, otherwise we'd corrupt the new match's
        // socketId -> matchId lookup.
        if (this.matchIdBySocketId.get(p.socketId) === matchSessionId) {
          this.matchIdBySocketId.delete(p.socketId);
        }
      }
    }
    this.matchesById.delete(matchSessionId);
  }

  getOpponent(state: MatchRuntimeState, userId: string): RuntimeParticipant {
    return state.participants.find((p) => p.userId !== userId) as RuntimeParticipant;
  }

  /**
   * Re-point a reconnected user's participant record (and the socketId
   * index) at their new socket.id. Without this, a user whose socket
   * reconnects mid-match (or during the post-match call) becomes
   * unreachable by matchId lookups — e.g. `finish_match`/`call_end` never
   * reaching them because `state.participants[i].socketId` still holds a
   * dead connection id from match start.
   */
  reconnectUser(userId: string, newSocketId: string): void {
    for (const state of this.matchesById.values()) {
      const participant = state.participants.find((p) => p.userId === userId);
      if (!participant) continue;
      if (this.matchIdBySocketId.get(participant.socketId) === state.matchSessionId) {
        this.matchIdBySocketId.delete(participant.socketId);
      }
      participant.socketId = newSocketId;
      this.matchIdBySocketId.set(newSocketId, state.matchSessionId);
    }
  }
}
