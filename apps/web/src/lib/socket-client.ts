import { io, Socket } from "socket.io-client";

const WS_URL = (
  process.env.NEXT_PUBLIC_WS_URL ||
  "https://promjumprojectprototype1-production.up.railway.app"
).replace(/^﻿/, "");

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(token: string): Socket {
  if (socket && socket.connected && socketToken === token) return socket;
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
