import { io, Socket } from "socket.io-client";

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
    auth: { token },
    transports: ["websocket", "polling"],
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
