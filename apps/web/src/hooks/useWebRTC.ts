"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

type SignalPayload = {
  signal: {
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
};

type UseWebRTCArgs = {
  socket: Socket | null;
  localStream: MediaStream | null;
  /** Whether this peer should initiate the offer (deterministic per-round role). */
  isInitiator: boolean;
  /** Only start connecting once this is true (e.g. first round_start received). */
  enabled: boolean;
};

// STUN-only (no TURN) — fine for most direct/home connections, but peers
// behind restrictive/symmetric NATs may fail to connect. Adding a TURN
// server is a follow-up for production robustness, out of scope here.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export function useWebRTC({
  socket,
  localStream,
  isInitiator,
  enabled,
}: UseWebRTCArgs) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!socket || !localStream || !enabled) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0] ?? null);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("webrtc_signal", { signal: { candidate: e.candidate.toJSON() } });
      }
    };

    const onSignal = async ({ signal }: SignalPayload) => {
      try {
        if (signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) {
              socket.emit("webrtc_signal", {
                signal: { sdp: pc.localDescription },
              });
            }
          }
        } else if (signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch {
        // ignore malformed/late signals (e.g. candidates arriving before remote description)
      }
    };
    socket.on("webrtc_signal", onSignal);

    if (isInitiator) {
      pc.createOffer()
        .then(async (offer) => {
          await pc.setLocalDescription(offer);
          if (pc.localDescription) {
            socket.emit("webrtc_signal", { signal: { sdp: pc.localDescription } });
          }
        })
        .catch(() => {});
    }

    return () => {
      socket.off("webrtc_signal", onSignal);
      pc.close();
      pcRef.current = null;
      setRemoteStream(null);
    };
    // isInitiator/enabled are set once per match and shouldn't retrigger reconnection on their own changes mid-flight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, localStream, enabled]);

  const toggleMute = () => {
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  return { remoteStream, muted, toggleMute };
}
