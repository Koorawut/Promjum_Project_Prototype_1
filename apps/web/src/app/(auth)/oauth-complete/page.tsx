"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

// Backend redirects here after a successful Google OAuth callback, having
// already set the httpOnly refresh cookie. We just need to exchange that
// cookie for an access token via the normal refresh endpoint.
//
// Not end-to-end testable until real Google OAuth credentials replace the
// "not-configured" placeholders in apps/api/.env, but the logic here is
// exercised by any POST /auth/refresh call (e.g. after a normal login).
export default function OAuthCompletePage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    refresh().then((data) => {
      router.replace(data ? "/home" : "/login?error=oauth_failed");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
