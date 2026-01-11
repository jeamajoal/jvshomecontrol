/**
 * HLS (HTTP Live Streaming) service for RTSP camera streaming.
 * Handles ffmpeg transcoding, health monitoring, and stream lifecycle.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const {
    RTSP_HLS_DIR,
    RTSP_HLS_SEGMENT_SECONDS,
    RTSP_HLS_LIST_SIZE,
    RTSP_HLS_OUTPUT_FPS,
    RTSP_HLS_PROBESIZE,
    RTSP_HLS_ANALYZEDURATION,
    RTSP_HLS_RTSP_TRANSPORT,
    RTSP_HLS_STARTUP_TIMEOUT_MS,
    RTSP_HLS_DEBUG,
    FFMPEG_ERROR_KEYWORDS,
    FFMPEG_PROGRESS_LINE_REGEX,
    MAX_STDERR_LINES_TO_LOG,
    RTSP_HLS_HEALTH_CHECK_INTERVAL_MS,
    RTSP_HLS_MAX_SEGMENT_AGE_SECONDS,
    RTSP_HLS_STALE_THRESHOLD_SECONDS,
    RTSP_HLS_MAX_RESTART_ATTEMPTS,
    RTSP_HLS_RESTART_BACKOFF_MS,
    RTSP_HLS_CLEANUP_ON_SHUTDOWN,
    RTSP_REDACTED_PLACEHOLDER,
} = require('../config/hls');

// Extended stream state tracking
// cameraId -> { 
//   dir, playlistPath, ffmpeg, lastError, stderrTail, startedAtMs, ffmpegArgs,
//   lastSegmentTimeMs, restartAttempts, currentBackoffMs, healthStatus, 
//   lastSuccessfulSegmentMs, totalRestarts, streamUrl, ffmpegPath
// }
const hlsStreams = new Map();

// Health check interval reference
let hlsHealthCheckInterval = null;

// --- Helper Functions ---

function redactRtspUrl(url) {
    try {
        const u = new URL(String(url));
        if (u.username || u.password) {
            u.username = u.username ? RTSP_REDACTED_PLACEHOLDER : '';
            u.password = u.password ? RTSP_REDACTED_PLACEHOLDER : '';
        }
        return u.toString();
    } catch {
        // Fallback: strip user:pass@ if present.
        return String(url || '').replace(/rtsp:\/\/[^@/]+@/i, `rtsp://${RTSP_REDACTED_PLACEHOLDER}@`);
    }
}

function safeCameraDirName(cameraId) {
    const id = String(cameraId || '').trim();
    const hash = crypto.createHash('sha1').update(id).digest('hex').slice(0, 10);
    const base = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'camera';
    return `${base}_${hash}`;
}

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function cleanupHlsDir(dir) {
    try {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
            if (!ent.isFile()) continue;
            const name = ent.name;
            if (name === 'playlist.m3u8') continue;
            // Keep only expected segment files.
            if (!/^seg_\d+\.ts$/i.test(name)) continue;
            try { fs.unlinkSync(path.join(dir, name)); } catch { /* ignore */ }
        }
        // Remove playlist file if present.
        const playlistCandidate = path.join(dir, 'playlist.m3u8');
        try { fs.unlinkSync(playlistCandidate); } catch { /* ignore */ }

        // If something created a directory/special node at playlist.m3u8, remove it.
        // (Some environments/filesystems may report EINVAL when ffmpeg tries to open it.)
        try {
            if (fs.existsSync(playlistCandidate)) {
                const st = fs.statSync(playlistCandidate);
                if (!st.isFile()) {
                    fs.rmSync(playlistCandidate, { recursive: true, force: true });
                }
            }
        } catch {
            // ignore
        }
    } catch {
        // ignore
    }
}

function verifyHlsOutputWritable(dir, playlistPath) {
    // Best-effort preflight so we can return a clear error before spawning ffmpeg.
    // Returns null when OK, otherwise an error string.
    try {
        ensureDir(dir);
        try {
            const st = fs.statSync(dir);
            if (!st.isDirectory()) return `HLS output path is not a directory: ${dir}`;
        } catch {
            // If it doesn't exist, ensureDir should have created it.
        }

        // If playlistPath exists but isn't a regular file, clean it up.
        try {
            if (fs.existsSync(playlistPath)) {
                const st = fs.statSync(playlistPath);
                if (!st.isFile()) {
                    fs.rmSync(playlistPath, { recursive: true, force: true });
                }
            }
        } catch {
            // ignore
        }

        // Write test
        const probe = path.join(dir, '.write_probe');
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        return null;
    } catch (err) {
        const code = err?.code || err?.name;
        const msg = err?.message || String(err);
        return `${code || 'write_error'}: ${msg}`;
    }
}

// --- Stream Lifecycle Functions ---

function stopHlsStream(cameraId) {
    const id = String(cameraId || '').trim();
    const existing = hlsStreams.get(id);
    if (!existing) return;
    try {
        if (existing.ffmpeg && typeof existing.ffmpeg.kill === 'function') {
            existing.ffmpeg.kill('SIGKILL');
        }
    } catch {
        // ignore
    }
    try {
        cleanupHlsDir(existing.dir);
    } catch {
        // ignore
    }
    hlsStreams.delete(id);
}

function startHlsStream(cameraId, streamUrl, ffmpegPath) {
    const id = String(cameraId || '').trim();
    if (!id) return null;

    const existing = hlsStreams.get(id);
    if (existing && existing.ffmpeg && existing.ffmpeg.exitCode === null) {
        return existing;
    }

    const dir = path.join(RTSP_HLS_DIR, safeCameraDirName(id));
    ensureDir(dir);
    cleanupHlsDir(dir);

    const playlistPath = path.join(dir, 'playlist.m3u8');
    const segmentPattern = path.join(dir, 'seg_%d.ts');

    const outputCheck = verifyHlsOutputWritable(dir, playlistPath);
    if (outputCheck) {
        const prevState = existing || {};
        return {
            dir,
            playlistPath,
            ffmpeg: null,
            lastError: `HLS output not writable: ${outputCheck}`,
            startedAtMs: Date.now(),
            lastSegmentTimeMs: null,
            restartAttempts: prevState.restartAttempts || 0,
            currentBackoffMs: prevState.currentBackoffMs || RTSP_HLS_RESTART_BACKOFF_MS,
            healthStatus: 'dead',
            lastSuccessfulSegmentMs: null,
            totalRestarts: prevState.totalRestarts || 0,
            streamUrl,
            ffmpegPath,
        };
    }

    // Good defaults for compatibility and quality.
    // - Generate sane timestamps even if the RTSP source has broken/non-monotonic PTS.
    // - Transcode to H.264 yuv420p for broad playback support.
    // - Use small segments/list size to keep latency reasonable.
    const args = [
        '-y',
        // Make RTSP sources with bad/missing timestamps behave.
        '-fflags', '+genpts+discardcorrupt',
        '-use_wallclock_as_timestamps', '1',
        '-avoid_negative_ts', 'make_zero',
        '-analyzeduration', String(RTSP_HLS_ANALYZEDURATION),
        '-probesize', String(RTSP_HLS_PROBESIZE),
        '-rtsp_transport', RTSP_HLS_RTSP_TRANSPORT,
        '-i', streamUrl,
        '-an',
        '-sn',
        '-dn',
        '-c:v', 'libx264',
        '-tune', 'zerolatency',
        '-preset', 'veryfast',
        '-crf', String(process.env.RTSP_HLS_CRF || '20'),
        '-pix_fmt', 'yuv420p',
        // Force timestamps to advance consistently for HLS.
        '-r', String(RTSP_HLS_OUTPUT_FPS),
        '-g', String(process.env.RTSP_HLS_GOP || (RTSP_HLS_SEGMENT_SECONDS * 25)),
        '-keyint_min', String(process.env.RTSP_HLS_GOP || (RTSP_HLS_SEGMENT_SECONDS * 25)),
        '-sc_threshold', '0',
        // Force periodic keyframes so HLS segments/playlist appear quickly.
        '-force_key_frames', `expr:gte(t,n_forced*${RTSP_HLS_SEGMENT_SECONDS})`,
        '-f', 'hls',
        '-hls_time', String(RTSP_HLS_SEGMENT_SECONDS),
        '-hls_list_size', String(RTSP_HLS_LIST_SIZE),
        '-hls_flags', 'delete_segments+append_list+omit_endlist',
        '-hls_segment_filename', segmentPattern,
        playlistPath,
    ];

    const bin = ffmpegPath || 'ffmpeg';
    const cp = require('child_process').spawn(bin, args, { detached: false });

    // Preserve restart tracking if this is a restart
    const prevState = existing || {};
    const restartAttempts = (prevState.restartAttempts || 0);
    const totalRestarts = (prevState.totalRestarts || 0);

    const state = {
        dir,
        playlistPath,
        ffmpeg: cp,
        lastError: null,
        stderrTail: [],
        errorLines: [], // Separate buffer for actual error messages (not progress)
        exitCode: null,
        startedAtMs: Date.now(),
        ffmpegArgs: args,
        // Enhanced state tracking for health monitoring
        lastSegmentTimeMs: null,
        restartAttempts,
        currentBackoffMs: prevState.currentBackoffMs || RTSP_HLS_RESTART_BACKOFF_MS,
        healthStatus: 'starting', // starting, healthy, stale, dead, restarting
        lastSuccessfulSegmentMs: null,
        totalRestarts,
        streamUrl,
        ffmpegPath,
        maxAttemptsLogged: false, // Track if we've logged the max attempts message
    };
    hlsStreams.set(id, state);

    try {
        cp.on('error', (err) => {
            state.lastError = err?.message || String(err);
            console.error(`HLS ffmpeg spawn error: ${state.lastError}`);
        });
        cp.stderr?.on?.('data', (buf) => {
            const s = String(buf || '');
            if (!s) return;
            const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (!lines.length) return;
            for (const line of lines) {
                // Check if this is an ffmpeg progress line
                const isProgressLine = FFMPEG_PROGRESS_LINE_REGEX.test(line);
                
                // Store all lines in tail for reference
                state.stderrTail.push(line);
                
                // Separately track actual error/warning messages
                const lineLower = line.toLowerCase();
                const isErrorLine = FFMPEG_ERROR_KEYWORDS.some(keyword => lineLower.includes(keyword));
                
                if (isErrorLine && !isProgressLine) {
                    state.errorLines.push(line);
                    console.error(`HLS ffmpeg stderr (${id}): ${line}`);
                } else if (RTSP_HLS_DEBUG && !isProgressLine) {
                    console.error(`HLS ffmpeg stderr (${id}): ${line}`);
                }
            }
            // Keep last ~60 lines.
            if (state.stderrTail.length > 60) {
                state.stderrTail = state.stderrTail.slice(-60);
            }
            if (state.errorLines.length > 30) {
                state.errorLines = state.errorLines.slice(-30);
            }
            state.lastError = state.stderrTail[state.stderrTail.length - 1] || null;
        });
        cp.on('exit', (code) => {
            state.exitCode = code;
            if (code && code !== 0) {
                console.error(`HLS ffmpeg exited with code ${code} (camera ${id})`);
            }
        });
    } catch {
        // ignore
    }

    return state;
}

// --- Health Monitoring Functions ---

function getNewestSegmentTimeMs(dir) {
    // Returns the mtime of the newest segment file in the directory
    try {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let newestMs = null;
        for (const ent of entries) {
            if (!ent.isFile()) continue;
            if (!/^seg_\d+\.ts$/i.test(ent.name)) continue;
            try {
                const fullPath = path.join(dir, ent.name);
                const stat = fs.statSync(fullPath);
                const mtimeMs = stat.mtimeMs;
                if (newestMs === null || mtimeMs > newestMs) {
                    newestMs = mtimeMs;
                }
            } catch {
                // ignore
            }
        }
        return newestMs;
    } catch {
        return null;
    }
}

function cleanupStaleSegments(dir) {
    // Remove segments older than MAX_SEGMENT_AGE
    try {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const now = Date.now();
        const maxAgeMs = RTSP_HLS_MAX_SEGMENT_AGE_SECONDS * 1000;
        
        for (const ent of entries) {
            if (!ent.isFile()) continue;
            if (!/^seg_\d+\.ts$/i.test(ent.name)) continue;
            try {
                const fullPath = path.join(dir, ent.name);
                const stat = fs.statSync(fullPath);
                const ageMs = now - stat.mtimeMs;
                if (ageMs > maxAgeMs) {
                    fs.unlinkSync(fullPath);
                }
            } catch {
                // ignore
            }
        }
    } catch {
        // ignore
    }
}

function isStreamHealthy(state) {
    // Check if ffmpeg is running
    if (!state.ffmpeg || state.ffmpeg.exitCode !== null) {
        return { healthy: false, reason: 'ffmpeg_not_running' };
    }
    
    // Check if we have segments
    const newestSegmentMs = getNewestSegmentTimeMs(state.dir);
    if (newestSegmentMs === null) {
        // No segments yet - check startup timeout
        const startupAge = Date.now() - state.startedAtMs;
        if (startupAge > RTSP_HLS_STARTUP_TIMEOUT_MS) {
            return { healthy: false, reason: 'startup_timeout' };
        }
        return { healthy: true, reason: 'starting' };
    }
    
    // Check if segments are stale
    const segmentAge = Date.now() - newestSegmentMs;
    const staleThresholdMs = RTSP_HLS_STALE_THRESHOLD_SECONDS * 1000;
    if (segmentAge > staleThresholdMs) {
        return { healthy: false, reason: 'stale_segments' };
    }
    
    return { healthy: true, reason: 'ok' };
}

function attemptRestartHlsStream(cameraId) {
    const id = String(cameraId || '').trim();
    const state = hlsStreams.get(id);
    if (!state) return false;
    
    // Check if we've exceeded max restart attempts
    if (state.restartAttempts >= RTSP_HLS_MAX_RESTART_ATTEMPTS) {
        // Only log once when first reaching the limit
        if (!state.maxAttemptsLogged) {
            console.error(`HLS stream ${id} exceeded max restart attempts (${RTSP_HLS_MAX_RESTART_ATTEMPTS})`);
            
            // Log exit code if available
            if (state.exitCode !== null && state.exitCode !== 0) {
                console.error(`HLS stream ${id} ffmpeg exit code: ${state.exitCode}`);
            }
            
            // Log actual error messages (not progress output)
            if (state.errorLines && state.errorLines.length > 0) {
                console.error(`HLS stream ${id} error messages:`);
                state.errorLines.forEach(line => console.error(`  ${line}`));
            } else if (state.stderrTail && state.stderrTail.length > 0) {
                // If no specific errors captured, log last stderr lines
                const stderrCount = Math.min(MAX_STDERR_LINES_TO_LOG, state.stderrTail.length);
                console.error(`HLS stream ${id} no specific errors captured. Recent stderr (last ${stderrCount} lines):`);
                const recentLines = state.stderrTail.slice(-stderrCount);
                recentLines.forEach(line => console.error(`  ${line}`));
            } else {
                console.error(`HLS stream ${id} no error information available (stderr empty)`);
            }
            
            state.maxAttemptsLogged = true;
        }
        state.healthStatus = 'dead';
        return false;
    }
    
    // Check if we need to backoff
    const timeSinceStart = Date.now() - state.startedAtMs;
    if (timeSinceStart < state.currentBackoffMs) {
        // Still in backoff period
        return false;
    }
    
    console.log(`Attempting to restart HLS stream ${id} (attempt ${state.restartAttempts + 1}/${RTSP_HLS_MAX_RESTART_ATTEMPTS})`);
    
    // Stop existing stream
    try {
        if (state.ffmpeg && typeof state.ffmpeg.kill === 'function') {
            state.ffmpeg.kill('SIGKILL');
        }
    } catch {
        // ignore
    }
    
    // Clean up stale segments
    try {
        cleanupHlsDir(state.dir);
    } catch {
        // ignore
    }
    
    // Update restart tracking with exponential backoff
    const newBackoffMs = Math.min(state.currentBackoffMs * 2, 60000); // Cap at 60 seconds
    
    // Update state for restart
    hlsStreams.set(id, {
        ...state,
        restartAttempts: state.restartAttempts + 1,
        currentBackoffMs: newBackoffMs,
        totalRestarts: state.totalRestarts + 1,
        healthStatus: 'restarting',
    });
    
    // Restart the stream
    const newState = startHlsStream(id, state.streamUrl, state.ffmpegPath);
    
    if (newState && newState.ffmpeg) {
        return true;
    }
    
    return false;
}

function performHealthCheck() {
    // Check all active HLS streams
    for (const [cameraId, state] of hlsStreams.entries()) {
        try {
            // Update last segment time
            const newestSegmentMs = getNewestSegmentTimeMs(state.dir);
            if (newestSegmentMs !== null && newestSegmentMs !== state.lastSegmentTimeMs) {
                state.lastSegmentTimeMs = newestSegmentMs;
                state.lastSuccessfulSegmentMs = newestSegmentMs;
                
                // Reset restart attempts after successful streaming
                const timeSinceLastSegment = Date.now() - newestSegmentMs;
                if (timeSinceLastSegment < RTSP_HLS_STALE_THRESHOLD_SECONDS * 1000) {
                    if (state.restartAttempts > 0) {
                        console.log(`HLS stream ${cameraId} recovered, resetting restart counter`);
                    }
                    state.restartAttempts = 0;
                    state.currentBackoffMs = RTSP_HLS_RESTART_BACKOFF_MS;
                    state.healthStatus = 'healthy';
                    state.maxAttemptsLogged = false;
                }
            }
            
            // Clean up stale segments
            cleanupStaleSegments(state.dir);
            
            // Check stream health
            const health = isStreamHealthy(state);
            if (!health.healthy) {
                // Update health status
                if (health.reason === 'stale_segments') {
                    state.healthStatus = 'stale';
                } else if (health.reason === 'ffmpeg_not_running') {
                    state.healthStatus = 'dead';
                } else if (health.reason === 'startup_timeout') {
                    state.healthStatus = 'dead';
                }
                
                // Attempt restart only if not already in terminal 'dead' state with max attempts exceeded
                // Allow one call at the limit to trigger error logging, then stop if logged
                const isNotDead = state.healthStatus !== 'dead';
                const canStillAttempt = state.restartAttempts <= RTSP_HLS_MAX_RESTART_ATTEMPTS && !state.maxAttemptsLogged;
                if (isNotDead || canStillAttempt) {
                    attemptRestartHlsStream(cameraId);
                }
            }
        } catch (err) {
            console.error(`Health check error for camera ${cameraId}:`, err);
        }
    }
}

function startHlsHealthMonitoring() {
    if (hlsHealthCheckInterval) return; // Already running
    
    console.log(`Starting HLS health monitoring (interval: ${RTSP_HLS_HEALTH_CHECK_INTERVAL_MS}ms)`);
    hlsHealthCheckInterval = setInterval(() => {
        try {
            performHealthCheck();
        } catch (err) {
            console.error('HLS health check error:', err);
        }
    }, RTSP_HLS_HEALTH_CHECK_INTERVAL_MS);
}

function stopHlsHealthMonitoring() {
    if (hlsHealthCheckInterval) {
        clearInterval(hlsHealthCheckInterval);
        hlsHealthCheckInterval = null;
        console.log('Stopped HLS health monitoring');
    }
}

function stopAllHlsStreams() {
    console.log(`Stopping all HLS streams (${hlsStreams.size} active)`);
    for (const [cameraId, state] of hlsStreams.entries()) {
        try {
            if (state.ffmpeg && typeof state.ffmpeg.kill === 'function') {
                state.ffmpeg.kill('SIGKILL');
            }
        } catch (err) {
            console.error(`Failed to kill ffmpeg for camera ${cameraId}:`, err);
        }
        
        if (RTSP_HLS_CLEANUP_ON_SHUTDOWN) {
            try {
                cleanupHlsDir(state.dir);
            } catch (err) {
                console.error(`Failed to cleanup HLS dir for camera ${cameraId}:`, err);
            }
        }
    }
    hlsStreams.clear();
}

// --- Utility Functions ---

function checkFfmpegAvailable(rawFfmpegPath) {
    const ffmpegPath = String(rawFfmpegPath || '').trim();
    const bin = ffmpegPath || 'ffmpeg';
    try {
        const result = spawnSync(bin, ['-version'], { stdio: 'ignore' });
        if (result && result.error) {
            const code = result.error.code || result.error.name;
            const msg = result.error.message || String(result.error);
            return { ok: false, bin, error: `${code || 'spawn_error'}: ${msg}` };
        }
        return { ok: true, bin };
    } catch (err) {
        const code = err?.code || err?.name;
        const msg = err?.message || String(err);
        return { ok: false, bin, error: `${code || 'spawn_error'}: ${msg}` };
    }
}

function getHlsStreams() {
    return hlsStreams;
}

module.exports = {
    // Stream management
    startHlsStream,
    stopHlsStream,
    stopAllHlsStreams,
    getHlsStreams,
    
    // Health monitoring
    startHlsHealthMonitoring,
    stopHlsHealthMonitoring,
    performHealthCheck,
    isStreamHealthy,
    
    // Utility functions
    redactRtspUrl,
    safeCameraDirName,
    ensureDir,
    cleanupHlsDir,
    verifyHlsOutputWritable,
    checkFfmpegAvailable,
    getNewestSegmentTimeMs,
    cleanupStaleSegments,
};
