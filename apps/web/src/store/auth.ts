import { create } from "zustand";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
};

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  status: AuthStatus;
  setSession: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string | null) => void;
  setStatus: (status: AuthStatus) => void;
  clearSession: () => void;
};

// Deliberately NOT using zustand's `persist` middleware: the access token
// must never touch localStorage (XSS token-theft mitigation). Session
// continuity across page loads instead comes from the httpOnly refresh
// cookie via POST /auth/refresh (see lib/api-client.ts + AuthInitializer).
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: "idle",
  setSession: (user, accessToken) =>
    set({ user, accessToken, status: "authenticated" }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setStatus: (status) => set({ status }),
  clearSession: () =>
    set({ user: null, accessToken: null, status: "unauthenticated" }),
}));
