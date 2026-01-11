/**
 * RTSP/HLS streaming configuration constants.
 * These define settings for camera stream transcoding and health monitoring.
 */

const path = require('path');
const { DATA_DIR } = require('./constants');

// --- HLS Directory ---
const RTSP_HLS_DIR = (() => {
    const raw = String(process.env.RTSP_HLS_DIR || '').trim();
    return raw || path.join(DATA_DIR, 'hls');
})();

// --- Stream Configuration ---
const RTSP_HLS_SEGMENT_SECONDS = (() => {
    const raw = String(process.env.RTSP_HLS_SEGMENT_SECONDS || '').trim();
    const parsed = raw ? Number(raw) : 2;
    if (!Number.isFinite(parsed)) return 2;
    return Math.max(1, Math.min(6, Math.round(parsed)));
})();

const RTSP_HLS_LIST_SIZE = (() => {
    const raw = String(process.env.RTSP_HLS_LIST_SIZE || '').trim();
    const parsed = raw ? Number(raw) : 6;
    if (!Number.isFinite(parsed)) return 6;
    return Math.max(3, Math.min(20, Math.round(parsed)));
})();

const RTSP_HLS_OUTPUT_FPS = (() => {
    // Some RTSP sources provide broken/non-advancing timestamps (PTS), which can prevent
    // the HLS muxer from ever cutting segments. For those, forcing CFR makes time advance.
    const raw = String(process.env.RTSP_HLS_OUTPUT_FPS || process.env.RTSP_HLS_FPS || '').trim();
    const parsed = raw ? Number(raw) : 15;
    if (!Number.isFinite(parsed)) return 15;
    return Math.max(1, Math.min(60, Math.round(parsed)));
})();

const RTSP_HLS_PROBESIZE = (() => {
    // Increase if ffmpeg can't determine codec parameters (e.g., MJPEG size) during startup.
    const raw = String(process.env.RTSP_HLS_PROBESIZE || '').trim();
    if (!raw) return '10M';
    return raw;
})();

const RTSP_HLS_ANALYZEDURATION = (() => {
    // Increase if ffmpeg needs more time to detect stream parameters.
    const raw = String(process.env.RTSP_HLS_ANALYZEDURATION || '').trim();
    if (!raw) return '10M';
    return raw;
})();

const RTSP_HLS_RTSP_TRANSPORT = (() => {
    const raw = String(process.env.RTSP_HLS_RTSP_TRANSPORT || '').trim().toLowerCase();
    // Keep TCP as the safe default (NAT/Wi-Fi/firewalls). Allow UDP for low-latency setups.
    if (raw === 'udp') return 'udp';
    return 'tcp';
})();

const RTSP_HLS_STARTUP_TIMEOUT_MS = (() => {
    const raw = String(process.env.RTSP_HLS_STARTUP_TIMEOUT_MS || '').trim();
    const parsed = raw ? Number(raw) : 15000;
    if (!Number.isFinite(parsed)) return 15000;
    return Math.max(2000, Math.min(60000, Math.floor(parsed)));
})();

const RTSP_HLS_DEBUG = (() => {
    const raw = String(process.env.RTSP_HLS_DEBUG || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();

// --- ffmpeg Error Detection ---
const FFMPEG_ERROR_KEYWORDS = ['error', 'failed', 'invalid', 'unable', 'cannot', 'refused', 'timeout'];

// ffmpeg progress line pattern
// - First alternative: matches progress indicators typically at start of line
// - Second alternative: matches fps/speed/bitrate which can appear mid-line (preceded by space)
const FFMPEG_PROGRESS_LINE_REGEX = /^(frame=|fps=|speed=|size=|time=|bitrate=|dup=|drop=)|\s(fps=|speed=|bitrate=)/;

// Maximum stderr lines to show in diagnostic logs
const MAX_STDERR_LINES_TO_LOG = 10;

// --- Health Monitoring Configuration ---
const RTSP_HLS_HEALTH_CHECK_INTERVAL_MS = (() => {
    const raw = String(process.env.RTSP_HLS_HEALTH_CHECK_INTERVAL_MS || '').trim();
    const parsed = raw ? Number(raw) : 10000;
    if (!Number.isFinite(parsed)) return 10000;
    return Math.max(5000, Math.min(60000, Math.floor(parsed)));
})();

const RTSP_HLS_MAX_SEGMENT_AGE_SECONDS = (() => {
    const raw = String(process.env.RTSP_HLS_MAX_SEGMENT_AGE_SECONDS || '').trim();
    const parsed = raw ? Number(raw) : 30;
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(10, Math.min(300, Math.floor(parsed)));
})();

const RTSP_HLS_STALE_THRESHOLD_SECONDS = (() => {
    const raw = String(process.env.RTSP_HLS_STALE_THRESHOLD_SECONDS || '').trim();
    const parsed = raw ? Number(raw) : 15;
    if (!Number.isFinite(parsed)) return 15;
    return Math.max(5, Math.min(60, Math.floor(parsed)));
})();

const RTSP_HLS_MAX_RESTART_ATTEMPTS = (() => {
    const raw = String(process.env.RTSP_HLS_MAX_RESTART_ATTEMPTS || '').trim();
    const parsed = raw ? Number(raw) : 5;
    if (!Number.isFinite(parsed)) return 5;
    return Math.max(1, Math.min(20, Math.floor(parsed)));
})();

const RTSP_HLS_RESTART_BACKOFF_MS = (() => {
    const raw = String(process.env.RTSP_HLS_RESTART_BACKOFF_MS || '').trim();
    const parsed = raw ? Number(raw) : 2000;
    if (!Number.isFinite(parsed)) return 2000;
    return Math.max(1000, Math.min(30000, Math.floor(parsed)));
})();

const RTSP_HLS_CLEANUP_ON_SHUTDOWN = (() => {
    const raw = String(process.env.RTSP_HLS_CLEANUP_ON_SHUTDOWN || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();

// --- RTSP URL Redaction ---
const RTSP_REDACTED_PLACEHOLDER = '***';
const RTSP_REDACTED_PATTERN = new RegExp(`:\\/\\/[^/]*${RTSP_REDACTED_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@`, 'i');

module.exports = {
    // HLS Directory
    RTSP_HLS_DIR,
    
    // Stream Configuration
    RTSP_HLS_SEGMENT_SECONDS,
    RTSP_HLS_LIST_SIZE,
    RTSP_HLS_OUTPUT_FPS,
    RTSP_HLS_PROBESIZE,
    RTSP_HLS_ANALYZEDURATION,
    RTSP_HLS_RTSP_TRANSPORT,
    RTSP_HLS_STARTUP_TIMEOUT_MS,
    RTSP_HLS_DEBUG,
    
    // ffmpeg Error Detection
    FFMPEG_ERROR_KEYWORDS,
    FFMPEG_PROGRESS_LINE_REGEX,
    MAX_STDERR_LINES_TO_LOG,
    
    // Health Monitoring
    RTSP_HLS_HEALTH_CHECK_INTERVAL_MS,
    RTSP_HLS_MAX_SEGMENT_AGE_SECONDS,
    RTSP_HLS_STALE_THRESHOLD_SECONDS,
    RTSP_HLS_MAX_RESTART_ATTEMPTS,
    RTSP_HLS_RESTART_BACKOFF_MS,
    RTSP_HLS_CLEANUP_ON_SHUTDOWN,
    
    // RTSP URL Redaction
    RTSP_REDACTED_PLACEHOLDER,
    RTSP_REDACTED_PATTERN,
};
