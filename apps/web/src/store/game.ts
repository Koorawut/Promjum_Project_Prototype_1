import { create } from "zustand";

type GameState = {
  localStream: MediaStream | null;
  matchId: string | null;
  opponentUsername: string | null;
  /** Who sends the WebRTC offer — assigned by the server on match, independent of round role. */
  isInitiator: boolean;
  totalScores: Record<string, number> | null;
  endReason: "completed" | "opponent_disconnected" | "opponent_left" | "voice_failed" | null;

  // Call lifecycle — owned by the globally-mounted CallSessionManager so the
  // RTCPeerConnection survives the match -> summary route change instead of
  // being torn down when [matchId]/page.tsx unmounts.
  /** Whether CallSessionManager should keep a live RTCPeerConnection. */
  voiceEnabled: boolean;
  remoteStream: MediaStream | null;
  voiceConnected: boolean;
  muted: boolean;
  /** Date.now() when match_end(reason:"completed") arrived — drives the summary page's 30s countdown. */
  matchEndedAt: number | null;

  setLocalStream: (stream: MediaStream | null) => void;
  setMatch: (matchId: string, opponentUsername: string, isInitiator: boolean) => void;
  setMatchEnd: (
    totalScores: Record<string, number>,
    reason: "completed" | "opponent_disconnected" | "opponent_left" | "voice_failed",
  ) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setVoiceConnected: (connected: boolean) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
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
  voiceEnabled: false,
  remoteStream: null,
  voiceConnected: false,
  muted: false,
  matchEndedAt: null,
  setLocalStream: (stream) => set({ localStream: stream }),
  setMatch: (matchId, opponentUsername, isInitiator) => {
    // Mute immediately so nothing leaks out during the "matched, connecting
    // voice, 3-2-1 countdown" phase — [matchId]/page.tsx unmutes once it has
    // finished loading. Also clear any leftover state from a *previous*
    // match (score/end-reason/countdown/remote-stream) so requeuing (e.g.
    // "เล่นอีกรอบ" without ever hitting "finish") can't leak stale state
    // into this new match.
    const { localStream } = get();
    localStream?.getAudioTracks().forEach((t) => (t.enabled = false));
    set({
      matchId,
      opponentUsername,
      isInitiator,
      voiceEnabled: true,
      muted: true,
      totalScores: null,
      endReason: null,
      matchEndedAt: null,
      remoteStream: null,
      voiceConnected: false,
    });
  },
  setMatchEnd: (totalScores, reason) =>
    set({
      totalScores,
      endReason: reason,
      matchEndedAt: reason === "completed" ? Date.now() : null,
      // A completed match keeps the call alive into the summary page; an
      // abandoned one (disconnect/voluntary leave) ends it right away.
      voiceEnabled: reason === "completed",
    }),
  setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setVoiceConnected: (connected) => set({ voiceConnected: connected }),
  setMuted: (muted) => {
    const { localStream } = get();
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    set({ muted });
  },
  toggleMute: () => {
    const { localStream, muted } = get();
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    set({ muted: next });
  },
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
      voiceEnabled: false,
      remoteStream: null,
      voiceConnected: false,
      muted: false,
      matchEndedAt: null,
    });
  },
}));
