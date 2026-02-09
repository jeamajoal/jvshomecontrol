/**
 * RTSP/HLS streaming configuration constants.
 * Defaults only — runtime values come from config.json (applied at startup).
 */

const path = require('path');
const { DATA_DIR } = require('./constants');

// --- HLS Directory ---
const RTSP_HLS_DIR = path.join(DATA_DIR, 'hls');

// --- Stream Configuration ---
const RTSP_HLS_SEGMENT_SECONDS = 2;
const RTSP_HLS_LIST_SIZE = 6;
const RTSP_HLS_OUTPUT_FPS = 15;
const RTSP_HLS_PROBESIZE = '10M';
const RTSP_HLS_ANALYZEDURATION = '10M';
const RTSP_HLS_RTSP_TRANSPORT = 'tcp';
const RTSP_HLS_STARTUP_TIMEOUT_MS = 15000;
const RTSP_HLS_DEBUG = false;
const RTSP_HLS_CRF = '20';

// --- ffmpeg Error Detection ---
const FFMPEG_ERROR_KEYWORDS = ['error', 'failed', 'invalid', 'unable', 'cannot', 'refused', 'timeout'];
const FFMPEG_PROGRESS_LINE_REGEX = /^(frame=|fps=|speed=|size=|time=|bitrate=|dup=|drop=)|\s(fps=|speed=|bitrate=)/;
const MAX_STDERR_LINES_TO_LOG = 10;

// --- Health Monitoring Configuration ---
const RTSP_HLS_HEALTH_CHECK_INTERVAL_MS = 10000;
const RTSP_HLS_MAX_SEGMENT_AGE_SECONDS = 30;
const RTSP_HLS_STALE_THRESHOLD_SECONDS = 15;
const RTSP_HLS_MAX_RESTART_ATTEMPTS = 5;
const RTSP_HLS_RESTART_BACKOFF_MS = 2000;
const RTSP_HLS_CLEANUP_ON_SHUTDOWN = false;

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
    RTSP_HLS_CRF,
    
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
