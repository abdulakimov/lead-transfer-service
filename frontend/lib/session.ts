"use client";

const ACCESS_KEY = "leadflow_access_token";
const REFRESH_KEY = "leadflow_refresh_token";
const USER_KEY = "leadflow_user";

export interface SessionUser {
  id?: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function setSession(accessToken: string, refreshToken: string, user?: SessionUser) {
  if (!hasStorage()) return;
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  if (!hasStorage()) return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken() {
  if (!hasStorage()) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (!hasStorage()) return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
