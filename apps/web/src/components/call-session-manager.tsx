"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useGameStore } from "@/store/game";

// Owns the RTCPeerConnection for the lifetime of a match, independent of
// which page is currently mounted. Living here (mounted once, at the root
// layout) instead of inside game/[matchId]/page.tsx is what lets the voice
// call survive the match -> summary route change: that page unmounting no
// longer tears down the connection, since this component never unmounts.
export default function CallSessionManager() {
  const router = useRouter();
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

  // Server-authoritative end of the post-match call: fired when either
  // player clicks "finish" on the summary page, or the 30s fallback
  // timeout elapses server-side — whichever happens first. Both players
  // get this event and are sent home together.
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
