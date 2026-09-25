"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

// Fires one silent POST /auth/refresh on first mount so useAuthStore.status
// is resolved app-wide (from the httpOnly refresh cookie) without every
// page/layout re-triggering its own refresh call.
export default function AuthInitializer() {
  const { refresh } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
