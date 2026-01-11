/**
 * Hubitat Maker API configuration.
 * Handles Hubitat connection settings and API URL construction.
 */

// Helper to get and trim env var values
const envTrim = (name) => String(process.env[name] || '').trim();

// Normalize Hubitat host URL
const normalizeHubitatHost = (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const noTrailingSlash = trimmed.replace(/\/$/, '');
    // If the user provides just an IP/hostname, default to HTTPS.
    // Use http:// explicitly if your Hubitat is only available over HTTP.
    if (!/^https?:\/\//i.test(noTrailingSlash)) return `https://${noTrailingSlash}`;
    return noTrailingSlash;
};

// --- Hubitat Configuration ---
// Public-repo posture: no built-in defaults or legacy env var fallbacks.
// If Hubitat isn't configured, the server still runs but Hubitat polling/commands are disabled.
const HUBITAT_HOST = normalizeHubitatHost(envTrim('HUBITAT_HOST'));
const HUBITAT_APP_ID = envTrim('HUBITAT_APP_ID');
const HUBITAT_ACCESS_TOKEN = envTrim('HUBITAT_ACCESS_TOKEN');
const HUBITAT_CONFIGURED = Boolean(HUBITAT_HOST && HUBITAT_APP_ID && HUBITAT_ACCESS_TOKEN);

const HUBITAT_POLL_INTERVAL_MS = (() => {
    const raw = String(process.env.HUBITAT_POLL_INTERVAL_MS || '').trim();
    if (!raw) return 2000;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 2000;
    // Keep it sane: too-fast polling can overload Hubitat; too-slow can feel stale.
    const clamped = Math.max(1000, Math.min(60 * 60 * 1000, Math.floor(parsed)));
    return clamped;
})();

const HUBITAT_TLS_INSECURE = (() => {
    const raw = String(process.env.HUBITAT_TLS_INSECURE || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();

// --- API URLs ---
const HUBITAT_API_BASE = HUBITAT_CONFIGURED ? `${HUBITAT_HOST}/apps/api/${HUBITAT_APP_ID}` : '';
const HUBITAT_API_URL = HUBITAT_CONFIGURED
    ? `${HUBITAT_API_BASE}/devices/all?access_token=${encodeURIComponent(HUBITAT_ACCESS_TOKEN)}`
    : '';
const HUBITAT_MODES_URL = HUBITAT_CONFIGURED
    ? `${HUBITAT_API_BASE}/modes?access_token=${encodeURIComponent(HUBITAT_ACCESS_TOKEN)}`
    : '';

module.exports = {
    envTrim,
    normalizeHubitatHost,
    HUBITAT_HOST,
    HUBITAT_APP_ID,
    HUBITAT_ACCESS_TOKEN,
    HUBITAT_CONFIGURED,
    HUBITAT_POLL_INTERVAL_MS,
    HUBITAT_TLS_INSECURE,
    HUBITAT_API_BASE,
    HUBITAT_API_URL,
    HUBITAT_MODES_URL,
};
