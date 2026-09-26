"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { API_URL } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

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

// STUN alone works only when both peers' NATs allow direct hole-punching
// (same network is fine; many mobile/carrier NATs are not). TURN credentials
// come from our backend (/turn/credentials), which proxies Metered.ca so the
// apiKey never reaches the browser.
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

let iceServersPromise: Promise<RTCIceServer[]> | null = null;

async function getIceServers(): Promise<RTCIceServer[]> {
  if (!iceServersPromise) {
    iceServersPromise = fetch(`${API_URL}/turn/credentials`, {
      credentials: "include",
      headers: {
        Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) return FALLBACK_ICE_SERVERS;
        const data = (await res.json()) as { iceServers?: RTCIceServer[] };
        return data.iceServers?.length ? data.iceServers : FALLBACK_ICE_SERVERS;
      })
      .catch(() => FALLBACK_ICE_SERVERS);
  }
  return iceServersPromise;
}

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

    let pc: RTCPeerConnection | null = null;
    let cancelled = false;

    getIceServers()
      .then((iceServers) => {
        if (cancelled) return;
        pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        localStream.getTracks().forEach((track) => pc!.addTrack(track, localStream));

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
              await pc!.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              if (signal.sdp.type === "offer") {
                const answer = await pc!.createAnswer();
                await pc!.setLocalDescription(answer);
                if (pc!.localDescription) {
                  socket.emit("webrtc_signal", {
                    signal: { sdp: pc!.localDescription },
                  });
                }
              }
            } else if (signal.candidate) {
              await pc!.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
          } catch {
            // ignore malformed/late signals (e.g. candidates arriving before remote description)
          }
        };
        socket.on("webrtc_signal", onSignal);

        if (isInitiator) {
          pc.createOffer()
            .then(async (offer) => {
              await pc!.setLocalDescription(offer);
              if (pc!.localDescription) {
                socket.emit("webrtc_signal", { signal: { sdp: pc!.localDescription } });
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      socket.off("webrtc_signal");
      pc?.close();
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
