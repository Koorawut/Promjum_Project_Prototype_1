import { io, Socket } from "socket.io-client";
import { refreshAccessToken } from "@/lib/api-client";

const WS_URL = (
  process.env.NEXT_PUBLIC_WS_URL ||
  "https://promjumprojectprototype1-production.up.railway.app"
).replace(/^﻿/, "");

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(token: string): Socket {
  // Only recreate when the token itself changes (real re-login/refresh
  // rotation) or after an explicit disconnectSocket(). Do NOT gate on
  // socket.connected: several sibling components (ForceLogoutListener,
  // CallSessionManager, the active page) each call this independently from
  // their own effect the instant accessToken resolves, all in the same
  // render. socket.io connects asynchronously, so the first caller's socket
  // is still mid-handshake when the second caller runs — checking
  // `.connected` here used to tear down that in-flight socket and mint a
  // fresh one, over and over, once per consumer. Whichever component ran
  // its effect earliest was left holding a reference to a socket that was
  // disconnected before it ever finished connecting, so its listeners
  // (force_logout, webrtc_signal, ...) never fire — while the *last*
  // consumer's socket is the only one the server ever sees via
  // handleConnection. That produced exactly the reported bugs: duplicate-
  // login kicks not reaching the client, and voice/webrtc signaling
  // silently going nowhere. socket.io reconnects on its own if the
  // connection actually drops later, so there's no need to force a new
  // instance just because it hasn't finished connecting yet.
  if (socket && socketToken === token) return socket;
  if (socket) socket.disconnect();

  socketToken = token;
  socket = io(WS_URL, {
    path: "/socket.io/",
    // A function, not a static object: socket.io calls this fresh on every
    // (re)connect attempt, including automatic reconnects after a dropped
    // transport. Without this, a socket created with `auth: { token }`
    // keeps retrying with whatever token was current at construction time
    // forever — if the access token expires while the tab is idle (e.g. a
    // long voice call with no HTTP traffic to trigger apiFetch's 401-retry
    // refresh) and the transport later blips, every reconnect attempt gets
    // rejected by ws-auth.guard.ts with the same stale token and the socket
    // never recovers. Reading `socketToken` here (updated by getSocket on
    // every call, including from useSocket's effect on accessToken changes)
    // means a reconnect naturally picks up whatever token is current.
    auth: (cb) => cb({ token: socketToken }),
    transports: ["websocket", "polling"],
  });

  // A callback `auth` alone still isn't enough: if the token actually
  // expired, the *stored* accessToken never changes just because time
  // passed — nothing else in the app calls refresh() off the back of a
  // socket failure (only apiFetch's 401 path does, and idle voice calls
  // generate no HTTP traffic). Without this, socket.io would retry forever
  // with the same expired token, since `auth` re-reads socketToken but
  // socketToken never gets updated. On a rejected handshake, proactively
  // refresh via the same refresh-cookie exchange apiFetch uses, and update
  // socketToken so the next automatic reconnect attempt picks it up.
  let refreshingAuth = false;
  socket.on("connect_error", () => {
    if (refreshingAuth) return;
    refreshingAuth = true;
    refreshAccessToken()
      .then((newToken) => {
        if (newToken) socketToken = newToken;
      })
      .finally(() => {
        refreshingAuth = false;
      });
  });

  return socket;
}

/** The live socket, if any, without creating or reconnecting one. */
export function getCurrentSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
