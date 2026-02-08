/**
 * Utility functions used throughout the server.
 * Contains helpers for validation, parsing, and general utilities.
 */

const {
    ALLOWED_TOLERANCE_COLOR_IDS,
    DEFAULT_ACCENT_COLOR_ID,
    PRESET_PANEL_PROFILE_NAMES,
} = require('../config/constants');

const {
    sanitizeUrl,
    sanitizeRtspUrl,
    sanitizeHostname,
    sanitizeNumericId,
    sanitizeString,
    sanitizeToken,
} = require('./sanitize');

// --- Boolean Helpers ---
const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
const falsy = (v) => ['0', 'false', 'no', 'off'].includes(String(v || '').trim().toLowerCase());

// --- String/Number Helpers ---
function parseCommaList(raw) {
    return String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}

function clampInt(n, min, max, fallback) {
    const num = (typeof n === 'number') ? n : Number(n);
    if (!Number.isFinite(num)) return fallback;
    const rounded = Math.round(num);
    return Math.max(min, Math.min(max, rounded));
}

// --- Color/UI Helpers ---
function isAllowedAccentColorId(raw) {
    const v = String(raw ?? '').trim();
    if (!v) return false;
    if (v === 'none') return false;
    return ALLOWED_TOLERANCE_COLOR_IDS.has(v);
}

function normalizeAccentColorId(raw) {
    const v = String(raw ?? '').trim();
    if (!v) return DEFAULT_ACCENT_COLOR_ID;

    if (isAllowedAccentColorId(v)) return v;

    return DEFAULT_ACCENT_COLOR_ID;
}

// --- Panel Profile Helpers ---
function normalizePanelName(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    // Allow user-friendly names, but keep them safe/stable as object keys.
    // Permit letters/numbers/space/_/- and limit length.
    if (s.length > 48) return null;
    if (!/^[a-zA-Z0-9 _-]+$/.test(s)) return null;
    return s;
}

function isPresetPanelProfile(panelName) {
    const name = normalizePanelName(panelName);
    if (!name) return false;
    return PRESET_PANEL_PROFILE_NAMES.has(name);
}

function rejectIfPresetPanelProfile(panelName, res) {
    if (!panelName) return false;
    if (!isPresetPanelProfile(panelName)) return false;
    res.status(409).json({
        error: 'Preset template is read-only',
        message: 'This panel profile is a shipped preset and cannot be overridden. Create a new panel profile to customize it.',
    });
    return true;
}

// --- DMS (Degrees, Minutes, Seconds) Parsing ---
// Parses either decimal or DMS-formatted coordinates.
// Examples:
// - "35.123" -> 35.123
// - "35°29'44.9\"N" -> 35.495... (positive for N/E, negative for S/W)
function parseDmsOrDecimal(raw) {
    const str = String(raw ?? '').trim();
    if (!str) return NaN;

    // Try decimal first
    const numericVal = Number(str);
    if (Number.isFinite(numericVal)) return numericVal;

    // Try DMS pattern: 35°29'44.9"N
    const dmsPattern = /^(-?)(\d+)[°](\d+)[']([0-9.]+)["]?\s*([NSEW]?)$/i;
    const m = str.match(dmsPattern);
    if (!m) return NaN;

    const sign = m[1] === '-' ? -1 : 1;
    const deg = Number(m[2]);
    const min = Number(m[3]);
    const sec = Number(m[4]);
    const dir = (m[5] || '').toUpperCase();

    if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return NaN;

    let decimal = deg + (min / 60) + (sec / 3600);
    decimal *= sign;

    // Apply direction (S/W are negative)
    if (dir === 'S' || dir === 'W') {
        decimal = -Math.abs(decimal);
    } else if (dir === 'N' || dir === 'E') {
        decimal = Math.abs(decimal);
    }

    return decimal;
}

// --- Fetch Error Helpers ---
function describeFetchError(err) {
    const message = err?.message || String(err);
    const cause = err?.cause;
    if (!cause || typeof cause !== 'object') return message;

    const extra = [];
    const code = cause.code || cause.name;
    if (code) extra.push(String(code));
    if (cause.errno) extra.push(`errno=${cause.errno}`);
    if (cause.syscall) extra.push(`syscall=${cause.syscall}`);
    if (cause.address) extra.push(`addr=${cause.address}`);
    if (cause.port) extra.push(`port=${cause.port}`);
    if (cause.message && cause.message !== message) extra.push(String(cause.message));

    return extra.length ? `${message} (${extra.join(', ')})` : message;
}

function redactAccessToken(url) {
    try {
        const u = new URL(String(url));
        if (u.searchParams.has('access_token')) {
            u.searchParams.set('access_token', 'REDACTED');
        }
        return u.toString();
    } catch {
        return String(url);
    }
}

// --- JSON Parsing Helpers ---
function tryParseJsonFromText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return null;

    // First try: direct JSON
    try {
        return JSON.parse(text);
    } catch {
        // continue
    }

    // Second try: extract the JSON object/array from a log-like prefix
    // Example: "debugdevice event: { ... }" or "device event: {...}"
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(candidate);
        } catch {
            // continue
        }
    }

    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const candidate = text.slice(firstBracket, lastBracket + 1);
        try {
            return JSON.parse(candidate);
        } catch {
            // continue
        }
    }

    return null;
}

module.exports = {
    // Boolean helpers
    truthy,
    falsy,
    
    // String/Number helpers
    parseCommaList,
    stableStringify,
    clampInt,
    
    // Color/UI helpers
    isAllowedAccentColorId,
    normalizeAccentColorId,
    
    // Panel profile helpers
    normalizePanelName,
    isPresetPanelProfile,
    rejectIfPresetPanelProfile,
    
    // DMS parsing
    parseDmsOrDecimal,
    
    // Fetch error helpers
    describeFetchError,
    redactAccessToken,
    
    // JSON parsing
    tryParseJsonFromText,

    // Input sanitization
    sanitizeUrl,
    sanitizeRtspUrl,
    sanitizeHostname,
    sanitizeNumericId,
    sanitizeString,
    sanitizeToken,
};
