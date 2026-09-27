import { useAuthStore } from "@/store/auth";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://promjumprojectprototype1-production.up.railway.app"
).replace(/^﻿/, "");

export class ApiError extends Error {
  status: number;
  payload?: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Media uploaded through the admin panel is stored with a relative
 * `/media/...` path; on the Vercel domain that resolves to a 404. Turn
 * those into absolute API URLs (seeded content already has full URLs).
 */
export function mediaSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("/media/") ? `${API_URL}${url}` : url;
}

type RequestOpts = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip attaching the Authorization header and skip the 401-refresh-retry. */
  skipAuth?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        useAuthStore.getState().setSession(data.user, data.accessToken);
        return data.accessToken as string;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Same refresh-cookie exchange as the 401-retry path above, exposed for
 * callers outside apiFetch (e.g. the socket client's connect_error handler,
 * which needs a way to rotate a stale access token that HTTP traffic alone
 * would never trigger — see socket-client.ts).
 */
export const refreshAccessToken = doRefresh;

export async function apiFetch<T>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const { method = "GET", body, headers, skipAuth } = opts;

  const doCall = async (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doCall(useAuthStore.getState().accessToken);

  if (res.status === 401 && !skipAuth) {
    const newToken = await doRefresh();
    if (newToken) {
      res = await doCall(newToken);
    }
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message =
      (payload && (payload.message as string)) || res.statusText;
    throw new ApiError(res.status, message, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Multipart variant of apiFetch for FormData bodies (admin image/audio
 * uploads). Never sets Content-Type — the browser must generate the
 * multipart boundary itself; apiFetch's JSON Content-Type would corrupt
 * the upload.
 */
export async function apiUpload<T>(
  path: string,
  body: FormData,
  opts: { method?: string } = {},
): Promise<T> {
  const doCall = async (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      method: opts.method ?? "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });

  let res = await doCall(useAuthStore.getState().accessToken);

  if (res.status === 401) {
    const newToken = await doRefresh();
    if (newToken) {
      res = await doCall(newToken);
    }
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message =
      (payload && (payload.message as string)) || res.statusText;
    throw new ApiError(res.status, message, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { API_URL };
