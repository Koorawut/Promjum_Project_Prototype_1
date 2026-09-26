import { create } from "zustand";

type GameState = {
  localStream: MediaStream | null;
  matchId: string | null;
  opponentUsername: string | null;
  /** Who sends the WebRTC offer — assigned by the server on match, independent of round role. */
  isInitiator: boolean;
  totalScores: Record<string, number> | null;
  endReason: "completed" | "opponent_disconnected" | "opponent_left" | null;
  setLocalStream: (stream: MediaStream | null) => void;
  setMatch: (matchId: string, opponentUsername: string, isInitiator: boolean) => void;
  setMatchEnd: (
    totalScores: Record<string, number>,
    reason: "completed" | "opponent_disconnected" | "opponent_left",
  ) => void;
  reset: () => void;
};

// Not persisted: MediaStream isn't serializable anyway, and this is only
// meant to survive client-side navigation within the game flow (lobby ->
// match -> summary), replacing the old localStorage-based handoff.
export const useGameStore = create<GameState>((set, get) => ({
  localStream: null,
  matchId: null,
  opponentUsername: null,
  isInitiator: false,
  totalScores: null,
  endReason: null,
  setLocalStream: (stream) => set({ localStream: stream }),
  setMatch: (matchId, opponentUsername, isInitiator) =>
    set({ matchId, opponentUsername, isInitiator }),
  setMatchEnd: (totalScores, reason) =>
    set({ totalScores, endReason: reason }),
  reset: () => {
    const { localStream } = get();
    localStream?.getTracks().forEach((t) => t.stop());
    set({
      localStream: null,
      matchId: null,
      opponentUsername: null,
      isInitiator: false,
      totalScores: null,
      endReason: null,
    });
  },
}));
