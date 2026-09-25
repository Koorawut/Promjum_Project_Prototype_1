"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket-client";
import { useAuthStore } from "@/store/auth";

export function useSocket(): Socket | null {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setSocket(null);
      return;
    }
    const s = getSocket(accessToken);
    setSocket(s);
  }, [accessToken]);

  return socket;
}
