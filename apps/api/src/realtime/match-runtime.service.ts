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

  remove(matchSessionId: string): void {
    const state = this.matchesById.get(matchSessionId);
    if (state?.currentRound?.timeoutHandle) {
      clearTimeout(state.currentRound.timeoutHandle);
    }
    if (state) {
      for (const p of state.participants) {
        this.matchIdBySocketId.delete(p.socketId);
      }
    }
    this.matchesById.delete(matchSessionId);
  }

  getOpponent(state: MatchRuntimeState, userId: string): RuntimeParticipant {
    return state.participants.find((p) => p.userId !== userId) as RuntimeParticipant;
  }
}
