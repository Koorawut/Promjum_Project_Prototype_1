"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { disconnectSocket } from "@/lib/socket-client";
import { useAuthStore, type AuthUser } from "@/store/auth";

type LoginResponse = { accessToken: string; user: AuthUser };
type RegisterResponse = { userId: string };

export function useAuth() {
  const router = useRouter();
  const { user, status, setSession, setStatus, clearSession } =
    useAuthStore();

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: { username, password },
        skipAuth: true,
      });
      setSession(data.user, data.accessToken);
      return data;
    },
    [setSession],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      return apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        body: { username, email, password },
        skipAuth: true,
      });
    },
    [],
  );

  const resendVerification = useCallback(async (email: string) => {
    return apiFetch<{ ok: true }>("/auth/resend-verification", {
      method: "POST",
      body: { email },
      skipAuth: true,
    });
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    return apiFetch<{ verified: true }>(
      `/auth/verify-email?token=${encodeURIComponent(token)}`,
      { skipAuth: true },
    );
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await apiFetch<LoginResponse>("/auth/refresh", {
        method: "POST",
        skipAuth: true,
      });
      setSession(data.user, data.accessToken);
      return data;
    } catch {
      clearSession();
      return null;
    }
  }, [setSession, setStatus, clearSession]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST", skipAuth: true });
    } catch {
      // ignore — clear local state regardless
    }
    disconnectSocket();
    clearSession();
    router.push("/login");
  }, [clearSession, router]);

  return {
    user,
    status,
    login,
    register,
    resendVerification,
    verifyEmail,
    refresh,
    logout,
  };
}

export { ApiError };
