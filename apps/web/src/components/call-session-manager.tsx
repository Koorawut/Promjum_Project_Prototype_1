"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useGameStore } from "@/store/game";

// Routes where a live call is legitimate: the match page itself and the
// post-match summary page (the call intentionally survives between them).
const CALL_ROUTE = /^\/game\/[^/]+(\/summary)?$/;

// Mirrors POST_MATCH_CALL_TIMEOUT_MS on the server — after this long past
// matchEndedAt, no live call can still legitimately exist.
const POST_MATCH_CALL_TIMEOUT_MS = 30_000;

// Owns the RTCPeerConnection for the lifetime of a match, independent of
// which page is currently mounted. Living here (mounted once, at the root
// layout) instead of inside game/[matchId]/page.tsx is what lets the voice
// call survive the match -> summary route change: that page unmounting no
// longer tears down the connection, since this component never unmounts.
export default function CallSessionManager() {
  const router = useRouter();
  const pathname = usePathname();
  const socket = useSocket();
  const localStream = useGameStore((s) => s.localStream);
  const isInitiator = useGameStore((s) => s.isInitiator);
  const voiceEnabled = useGameStore((s) => s.voiceEnabled);
  const setRemoteStream = useGameStore((s) => s.setRemoteStream);
  const setVoiceConnected = useGameStore((s) => s.setVoiceConnected);
  const reset = useGameStore((s) => s.reset);

  const { remoteStream, voiceConnected } = useWebRTC({
    socket,
    localStream,
    isInitiator,
    enabled: voiceEnabled,
  });

  // A suspended mobile tab can miss both the opponent's exit AND the
  // server's 30s timeout — on resume its socket reconnects into a runtime
  // that no longer exists, and nothing ever tells this client the call is
  // over. Local deadline to the rescue: if we're still voiceEnabled and
  // past the post-match window, the call is definitively dead — tear it
  // down locally (no server emit needed; the server side is long gone).
  useEffect(() => {
    if (!voiceEnabled) return;
    const { matchEndedAt } = useGameStore.getState();
    if (!matchEndedAt) return;
    const deadline =
      POST_MATCH_CALL_TIMEOUT_MS - (Date.now() - matchEndedAt);
    if (deadline <= 0) {
      reset();
      return;
    }
    const t = setTimeout(() => reset(), deadline);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled]);

  // Catch-all safety net for every exit path that doesn't go through a
  // wired-up button: browser back button / swipe-back gesture (the main way
  // mobile users navigate — why the PC-PC tests passed but PC-mobile
  // "stayed stuck"), or any future page linking away without
  // useLeaveCall(). Fires only on a TRANSITION *away from* a call route —
  // not merely "off a call route" — because voiceEnabled flips true on
  // "matched" while the lobby countdown is still running, and firing then
  // would kill the match at spawn.
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if (!socket || !pathname || prev === pathname) return;
    const wasInCall = prev !== null && CALL_ROUTE.test(prev);
    const stillInCall = CALL_ROUTE.test(pathname);
    // summary -> match of a NEW match ("เล่นอีกรอบ" through the lobby) also
    // matches CALL_ROUTE on both sides, so it never trips this — good.
    if (wasInCall && !stillInCall) {
      const { voiceEnabled: live, matchEndedAt } = useGameStore.getState();
      if (!live) return;
      // Post-match (summary → elsewhere): end the surviving call for the
      // opponent. Mid-match (match page → elsewhere via browser back):
      // finish_match would be a no-op server-side (match not completed), so
      // abandon the match properly instead, exactly like the in-game X.
      socket.emit(matchEndedAt ? "finish_match" : "leave_match");
      reset();
    }
  }, [socket, pathname, reset]);

  // Server-authoritative end of the post-match call: fired when the OPPONENT
  // clicks any exit (we now emit call_end only to the other side), or the
  // 30s fallback timeout elapses server-side.
  useEffect(() => {
    if (!socket) return;
    function onCallEnd() {
      reset();
      router.push("/home");
    }
    socket.on("call_end", onCallEnd);
    return () => {
      socket.off("call_end", onCallEnd);
    };
  }, [socket, router, reset]);

  useEffect(() => {
    setRemoteStream(remoteStream);
  }, [remoteStream, setRemoteStream]);

  useEffect(() => {
    setVoiceConnected(voiceConnected);
  }, [voiceConnected, setVoiceConnected]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  return <audio ref={audioRef} autoPlay style={{ display: "none" }} />;
}
