// Central API base URL.
// - In production (served by the backend), this resolves to the same origin (same host + port).
// - In dev (vite on :5173), this points at the backend on :80 (or VITE_API_PORT).

const stripTrailingSlash = (s) => String(s || '').replace(/\/+$/, '');

const envHost = stripTrailingSlash(import.meta.env.VITE_API_HOST);
const envPort = String(import.meta.env.VITE_API_PORT || '80').trim();

const origin = window.location.origin;

// In production, the UI is normally served by the same backend (same origin),
// so always prefer same-origin to avoid mixed-content or stale build-time overrides.
// In dev, allow VITE_API_HOST / VITE_API_PORT to point Vite to the backend.
const isDev = Boolean(import.meta.env.DEV);

export const API_HOST = envHost
  ? (isDev ? envHost : origin)
  : (isDev ? `${window.location.protocol}//${window.location.hostname}:${envPort}` : origin);
