"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/store/auth";
import { disconnectSocket } from "@/lib/socket-client";

const NOTICE_KEY = "speakup_login_notice";

// Listens for the server pushing a forced-logout (another device logged in
// as this same account, so single-active-session is enforced by kicking
// this one). Shows the reason on the next /login screen via sessionStorage,
// since by the time it renders this session's state is already cleared.
export default function ForceLogoutListener() {
  const socket = useSocket();
  const router = useRouter();
  const clearSession = useAuthStore((s) => s.clearSession);

  useEffect(() => {
    if (!socket) return;
    function onForceLogout(payload: { message: string }) {
      try {
        sessionStorage.setItem(NOTICE_KEY, payload.message);
      } catch {
        // ignore (private mode / storage disabled)
      }
      disconnectSocket();
      clearSession();
      router.push("/login");
    }
    socket.on("force_logout", onForceLogout);
    return () => {
      socket.off("force_logout", onForceLogout);
    };
  }, [socket, router, clearSession]);

  return null;
}

export { NOTICE_KEY };
