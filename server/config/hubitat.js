/**
 * Hubitat Maker API configuration.
 * Defaults only — runtime values come from config.json (applied at startup).
 */

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

// All values are initial defaults; config.json is the single source of truth.
const HUBITAT_HOST = '';
const HUBITAT_APP_ID = '';
const HUBITAT_ACCESS_TOKEN = '';
const HUBITAT_CONFIGURED = false;
const HUBITAT_POLL_INTERVAL_MS = 2000;
const HUBITAT_TLS_INSECURE = false;
const HUBITAT_API_BASE = '';
const HUBITAT_API_URL = '';
const HUBITAT_MODES_URL = '';

module.exports = {
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
