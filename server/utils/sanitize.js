/**
 * Input sanitization utilities for JVSHomeControl.
 *
 * Provides reusable validators and sanitizers for all user-facing inputs.
 * Each function returns the sanitized value or null when the input is invalid.
 *
 * Principles
 * ----------
 * 1. Allowlist over blocklist — accept only known-good patterns.
 * 2. Reject control characters everywhere.
 * 3. Parse, don't regex — use URL() where possible for URLs.
 * 4. Return null for invalid input so callers can give a 400.
 */

'use strict';

// ──────────────────────────────── URL helpers ────────────────────────────────

/**
 * Validate and normalize a URL, restricting to allowed protocols.
 * Returns the cleaned URL string or null if invalid.
 *
 * @param {*}        raw               Raw input value
 * @param {string[]} [allowedProtocols] e.g. ['http:', 'https:']
 * @returns {string|null}
 */
function sanitizeUrl(raw, allowedProtocols = ['http:', 'https:']) {
    const s = String(raw || '').trim();
    if (!s) return null;
    let parsed;
    try { parsed = new URL(s); } catch { return null; }
    if (!allowedProtocols.includes(parsed.protocol)) return null;
    // Reject credentials embedded in the URL — they leak via Referer headers
    // and server logs.  Camera basicAuth has a dedicated field.
    if (parsed.username || parsed.password) return null;
    // Reject control characters
    if (/[\x00-\x1f\x7f]/.test(s)) return null;
    return s;
}

/**
 * Validate an RTSP URL (rtsp:// or rtsps:// only).
 *
 * The built-in URL() constructor does not support the rtsp scheme, so we
 * perform a manual structural check instead.
 *
 * @param {*} raw  Raw input value
 * @returns {string|null}
 */
function sanitizeRtspUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (!/^rtsps?:\/\/.+/i.test(s)) return null;
    // Reject control characters (newlines, null bytes, etc.)
    if (/[\x00-\x1f\x7f]/.test(s)) return null;
    // Reasonable length cap
    if (s.length > 2048) return null;
    return s;
}

// ──────────────────────────────── Host / network ─────────────────────────────

/**
 * Validate a hostname, IPv4, or bracket-wrapped IPv6 address.
 * Used for the certificate-generation hostname and similar fields.
 *
 * @param {*}      raw
 * @param {number} [maxLen=253]
 * @returns {string|null}
 */
function sanitizeHostname(raw, maxLen = 253) {
    const s = String(raw || '').trim();
    if (!s || s.length > maxLen) return null;
    // Reject control characters
    if (/[\x00-\x1f\x7f]/.test(s)) return null;
    // Allow: letters, digits, dots, hyphens, colons (IPv6), brackets (IPv6)
    if (!/^[a-zA-Z0-9.\-:\[\]]+$/.test(s)) return null;
    return s;
}

// ──────────────────────────────── Identifiers ────────────────────────────────

/**
 * Validate a numeric ID string (digits only, e.g. Hubitat App ID).
 *
 * @param {*} raw
 * @returns {string|null}
 */
function sanitizeNumericId(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (!/^\d+$/.test(s)) return null;
    return s;
}

// ──────────────────────────────── Strings / text ─────────────────────────────

/**
 * Trim and truncate a general-purpose text string.
 * Rejects control characters (except common whitespace: \t \n \r).
 *
 * @param {*}      raw
 * @param {number} [maxLength=256]
 * @returns {string|null}
 */
function sanitizeString(raw, maxLength = 256) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    // Reject ASCII control chars except tab, newline, carriage-return
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)) return null;
    return s.length > maxLength ? s.slice(0, maxLength) : s;
}

/**
 * Validate an opaque API / access-token string.
 * Allows alphanumeric characters plus common token separators (- _ .).
 *
 * @param {*}      raw
 * @param {number} [maxLength=256]
 * @returns {string|null}
 */
function sanitizeToken(raw, maxLength = 256) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (s.length > maxLength) return null;
    // Only safe token chars: alphanumeric, dash, underscore, dot
    if (!/^[a-zA-Z0-9\-_.]+$/.test(s)) return null;
    return s;
}

// ─────────────────────────────────── Export ───────────────────────────────────

module.exports = {
    sanitizeUrl,
    sanitizeRtspUrl,
    sanitizeHostname,
    sanitizeNumericId,
    sanitizeString,
    sanitizeToken,
};
