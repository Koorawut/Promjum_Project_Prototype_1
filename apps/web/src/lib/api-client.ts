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

export { API_URL };
