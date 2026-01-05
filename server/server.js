const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// Legacy note: previous versions used `net` for RTSP websocket port allocation.
const { Server } = require('socket.io');
const crypto = require('crypto');



let UndiciAgent = null;
try {
    // Node's built-in fetch is backed by undici; this lets us disable TLS verification per-request.
    // (Useful when HUBITAT_HOST is https:// with a self-signed cert.)
    // eslint-disable-next-line global-require
    UndiciAgent = require('undici').Agent;
} catch {
    UndiciAgent = null;
}

const app = express();

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds');
const BACKGROUNDS_DIR = path.join(DATA_DIR, 'backgrounds');
const MAX_BACKUP_FILES = (() => {
    const raw = process.env.BACKUP_MAX_FILES;
    const parsed = raw ? Number(raw) : 200;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 200;
})();

// Legacy UI accent scheme ids from earlier versions.
// New versions use the unified palette (ALLOWED_TOLERANCE_COLOR_IDS) for ui.accentColorId.
const LEGACY_UI_COLOR_SCHEMES = Object.freeze([
    'electric-blue',
    'classic-blue',
    'emerald',
    'amber',
    'stone',
    'slate',
    'zinc',
    'white',
    'copper',
    'neon-green',
    'neon-red',
]);

// Used for validating color id settings coming from the UI (climate tolerance colors,
// sensor indicator colors, and Home secondary text color).
const ALLOWED_TOLERANCE_COLOR_IDS = new Set([
    'none',
    'neon-blue',
    'neon-green',
    'warning',
    'neon-red',
    'primary',
    'success',
    'danger',
    'sky',
    'cyan',
    'teal',
    'emerald',
    'lime',
    'amber',
    'yellow',
    'orange',
    'rose',
    'pink',
    'fuchsia',
    'purple',
    'violet',
    'indigo',
    'blue',
    'slate',
    'stone',
    'white',
    'black',
    'zinc',
    'neutral',
    'tan',
    'brown',
]);

const DEFAULT_ACCENT_COLOR_ID = 'neon-blue';
const ALLOWED_ACCENT_COLOR_IDS = new Set(Array.from(ALLOWED_TOLERANCE_COLOR_IDS).filter((id) => id !== 'none'));

const normalizeAccentColorId = (raw) => {
    const v = String(raw ?? '').trim();
    if (!v) return DEFAULT_ACCENT_COLOR_ID;

    // Accept new palette ids directly.
    if (ALLOWED_ACCENT_COLOR_IDS.has(v)) return v;

    // Migrate legacy scheme ids.
    if (LEGACY_UI_COLOR_SCHEMES.includes(v)) {
        const legacyMap = {
            'electric-blue': 'neon-blue',
            'classic-blue': 'primary',
            emerald: 'success',
            amber: 'warning',
            copper: 'brown',
            'neon-green': 'neon-green',
            'neon-red': 'neon-red',
            slate: 'slate',
            stone: 'stone',
            zinc: 'zinc',
            white: 'white',
        };

        const mapped = legacyMap[v];
        if (mapped && ALLOWED_ACCENT_COLOR_IDS.has(mapped)) return mapped;
    }

    return DEFAULT_ACCENT_COLOR_ID;
};

const SECONDARY_TEXT_SIZE_PCT_RANGE = Object.freeze({ min: 50, max: 200, def: 100 });
const PRIMARY_TEXT_SIZE_PCT_RANGE = Object.freeze({ min: 50, max: 200, def: 100 });
const BLUR_SCALE_PCT_RANGE = Object.freeze({ min: 0, max: 200, def: 100 });
const ICON_SIZE_PCT_RANGE = Object.freeze({ min: 50, max: 200, def: 100 });

// Commands that can be rendered by the current UI panels.
// (We intentionally constrain this so config can't inject arbitrary commands into the UI.)
const ALLOWED_PANEL_DEVICE_COMMANDS = new Set(['on', 'off', 'toggle', 'setLevel', 'refresh', 'push']);

// Home metrics that can be shown on the Home dashboard per device.
// (Used for multi-sensors where you want to hide/show specific attributes.)
const ALLOWED_HOME_METRIC_KEYS = new Set(['temperature', 'humidity', 'illuminance', 'motion', 'contact', 'door']);

// Home room metric cards (sub-cards inside each room panel).
// These are configured globally (or per panel profile) and rendered for every room.
const ALLOWED_HOME_ROOM_METRIC_KEYS = new Set(['temperature', 'humidity', 'illuminance']);

// Default preset panel profiles that ship with the product.
// These are always available as read-only templates.
const DEFAULT_PANEL_PROFILES_PRESETS = Object.freeze({
    'Neon Glass': {
        _preset: true,
        accentColorId: 'neon-blue',
        iconColorId: 'neon-blue',
        iconOpacityPct: 90,
        iconSizePct: 110,
        cardOpacityScalePct: 75,
        blurScalePct: 170,
        primaryTextOpacityPct: 100,
        primaryTextSizePct: 110,
        primaryTextColorId: 'white',
        secondaryTextOpacityPct: 55,
        secondaryTextSizePct: 105,
        secondaryTextColorId: 'slate',
        cardScalePct: 105,
        homeRoomColumnsXl: 3,
    },
    'Stealth Slate': {
        _preset: true,
        accentColorId: 'slate',
        iconColorId: 'white',
        iconOpacityPct: 70,
        iconSizePct: 105,
        cardOpacityScalePct: 60,
        blurScalePct: 0,
        primaryTextOpacityPct: 95,
        primaryTextSizePct: 105,
        primaryTextColorId: 'white',
        secondaryTextOpacityPct: 35,
        secondaryTextSizePct: 95,
        secondaryTextColorId: 'slate',
        cardScalePct: 110,
        homeRoomColumnsXl: 3,
    },
    'Arcade Mint': {
        _preset: true,
        accentColorId: 'neon-green',
        iconColorId: 'neon-green',
        iconOpacityPct: 100,
        iconSizePct: 120,
        cardOpacityScalePct: 90,
        blurScalePct: 140,
        primaryTextOpacityPct: 100,
        primaryTextSizePct: 115,
        primaryTextColorId: 'neon-green',
        secondaryTextOpacityPct: 50,
        secondaryTextSizePct: 100,
        secondaryTextColorId: 'emerald',
        cardScalePct: 100,
        homeRoomColumnsXl: 3,
    },
    'Copper Warmth': {
        _preset: true,
        accentColorId: 'brown',
        iconColorId: 'tan',
        iconOpacityPct: 90,
        iconSizePct: 105,
        cardOpacityScalePct: 115,
        blurScalePct: 110,
        primaryTextOpacityPct: 100,
        primaryTextSizePct: 110,
        primaryTextColorId: 'tan',
        secondaryTextOpacityPct: 45,
        secondaryTextSizePct: 100,
        secondaryTextColorId: 'brown',
        cardScalePct: 100,
        homeRoomColumnsXl: 3,
    },
    'Ice Cave': {
        _preset: true,
        accentColorId: 'primary',
        iconColorId: 'cyan',
        iconOpacityPct: 95,
        iconSizePct: 110,
        cardOpacityScalePct: 80,
        blurScalePct: 200,
        primaryTextOpacityPct: 100,
        primaryTextSizePct: 110,
        primaryTextColorId: 'cyan',
        secondaryTextOpacityPct: 50,
        secondaryTextSizePct: 100,
        secondaryTextColorId: 'sky',
        cardScalePct: 100,
        homeRoomColumnsXl: 3,
    },
    'Amber Signal': {
        _preset: true,
        accentColorId: 'warning',
        iconColorId: 'amber',
        iconOpacityPct: 95,
        iconSizePct: 110,
        cardOpacityScalePct: 100,
        blurScalePct: 120,
        primaryTextOpacityPct: 100,
        primaryTextSizePct: 110,
        primaryTextColorId: 'amber',
        secondaryTextOpacityPct: 45,
        secondaryTextSizePct: 100,
        secondaryTextColorId: 'stone',
        cardScalePct: 100,
        homeRoomColumnsXl: 3,
    },
    'Zinc Minimal': {
        _preset: true,
        accentColorId: 'zinc',
        iconColorId: 'zinc',
        iconOpacityPct: 60,
        iconSizePct: 95,
        cardOpacityScalePct: 130,
        blurScalePct: 35,
        primaryTextOpacityPct: 100,
        primaryTextSizePct: 105,
        primaryTextColorId: 'white',
        secondaryTextOpacityPct: 30,
        secondaryTextSizePct: 95,
        secondaryTextColorId: 'zinc',
        cardScalePct: 95,
        homeRoomColumnsXl: 3,
    },
    'Red Alert': {
        _preset: true,
        accentColorId: 'neon-red',
        iconColorId: 'neon-red',
        iconOpacityPct: 100,
        iconSizePct: 115,
        cardOpacityScalePct: 95,
        blurScalePct: 90,
        primaryTextOpacityPct: 100,
        primaryTextSizePct: 115,
        primaryTextColorId: 'neon-red',
        secondaryTextOpacityPct: 50,
        secondaryTextSizePct: 100,
        secondaryTextColorId: 'rose',
        cardScalePct: 105,
        homeRoomColumnsXl: 3,
    },
});

const PRESET_PANEL_PROFILE_NAMES = new Set(Object.keys(DEFAULT_PANEL_PROFILES_PRESETS));

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

function normalizePanelName(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    // Allow user-friendly names, but keep them safe/stable as object keys.
    // Permit letters/numbers/space/_/- and limit length.
    if (s.length > 48) return null;
    if (!/^[a-zA-Z0-9 _-]+$/.test(s)) return null;
    return s;
}

// If the UI is built (`client/dist`), serve it from the backend so a single service
// provides both the API and the dashboard.
const CLIENT_DIST_DIR = path.join(__dirname, '..', 'client', 'dist');
const CLIENT_INDEX_HTML = path.join(CLIENT_DIST_DIR, 'index.html');
const HAS_BUILT_CLIENT = fs.existsSync(CLIENT_INDEX_HTML);

// --- HTTPS (optional) ---
// Defaults: server/data/certs/localhost.key + server/data/certs/localhost.crt
const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
const falsy = (v) => ['0', 'false', 'no', 'off'].includes(String(v || '').trim().toLowerCase());

const CERT_DIR_DEFAULT = path.join(DATA_DIR, 'certs');
const HTTPS_KEY_PATH = String(process.env.HTTPS_KEY_PATH || '').trim() || path.join(CERT_DIR_DEFAULT, 'localhost.key');
const HTTPS_CERT_PATH = String(process.env.HTTPS_CERT_PATH || '').trim() || path.join(CERT_DIR_DEFAULT, 'localhost.crt');

const HTTPS_FORCED_OFF = truthy(process.env.HTTP_ONLY) || falsy(process.env.HTTPS);
const HTTPS_FORCED_ON = truthy(process.env.HTTPS);
const HTTPS_HAS_CERT = fs.existsSync(HTTPS_KEY_PATH) && fs.existsSync(HTTPS_CERT_PATH);

const HTTPS_REQUESTED = !HTTPS_FORCED_OFF && (HTTPS_FORCED_ON || HTTPS_HAS_CERT);
const USE_HTTPS = HTTPS_REQUESTED && HTTPS_HAS_CERT;

if (HTTPS_REQUESTED && !HTTPS_HAS_CERT) {
    console.warn('HTTPS: enabled/requested but certificate not found; starting in HTTP mode.');
    console.warn(`HTTPS_CERT_PATH: ${HTTPS_CERT_PATH}`);
    console.warn(`HTTPS_KEY_PATH:  ${HTTPS_KEY_PATH}`);
    console.warn('Run: node server/scripts/https-setup.js (or re-run the install script interactively) to create a self-signed certificate.');
}

const server = USE_HTTPS
    ? https.createServer(
        {
            key: fs.readFileSync(HTTPS_KEY_PATH),
            cert: fs.readFileSync(HTTPS_CERT_PATH),
        },
        app,
    )
    : http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- RTSP -> HLS (HTTPS-friendly) ---
// We intentionally implement HLS on the same origin as the app so customers don't
// run into HTTPS+ws mixed-content issues.
const RTSP_HLS_DIR = (() => {
    const raw = String(process.env.RTSP_HLS_DIR || '').trim();
    return raw || path.join(DATA_DIR, 'hls');
})();

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

const hlsStreams = new Map(); // cameraId -> { dir, playlistPath, ffmpeg, lastError, startedAtMs }

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
        try { fs.unlinkSync(path.join(dir, 'playlist.m3u8')); } catch { /* ignore */ }
    } catch {
        // ignore
    }
}

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

    // Good defaults for compatibility and quality.
    // - Generate sane timestamps even if the RTSP source has broken/non-monotonic PTS.
    // - Transcode to H.264 yuv420p for broad playback support.
    // - Use small segments/list size to keep latency reasonable.
    const args = [
        // Make RTSP sources with bad/missing timestamps behave.
        '-fflags', '+genpts',
        '-use_wallclock_as_timestamps', '1',
        '-avoid_negative_ts', 'make_zero',
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
        '-fps_mode', 'cfr',
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
        '-reset_timestamps', '1',
        '-hls_segment_filename', segmentPattern,
        playlistPath,
    ];

    const bin = ffmpegPath || 'ffmpeg';
    const cp = require('child_process').spawn(bin, args, { detached: false });

    const state = {
        dir,
        playlistPath,
        ffmpeg: cp,
        lastError: null,
        startedAtMs: Date.now(),
    };
    hlsStreams.set(id, state);

    try {
        cp.on('error', (err) => {
            state.lastError = err?.message || String(err);
            console.error(`HLS ffmpeg spawn error: ${state.lastError}`);
        });
        cp.stderr?.on?.('data', (buf) => {
            const s = String(buf || '').trim();
            if (!s) return;
            // Keep only the last chunk; avoids huge memory.
            state.lastError = s.slice(-1000);
        });
        cp.on('exit', (code) => {
            if (code && code !== 0) {
                console.error(`HLS ffmpeg exited with code ${code} (camera ${id})`);
            }
        });
    } catch {
        // ignore
    }

    return state;
}

function buildHttpUrl(req, p) {
    const proto = USE_HTTPS ? 'https' : 'http';
    const hostHeader = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
    const host = hostHeader ? hostHeader.split(',')[0].trim() : (req?.hostname || 'localhost');
    const cleaned = String(p || '').startsWith('/') ? String(p) : `/${String(p || '')}`;
    return `${proto}://${host}${cleaned}`;
}

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

// Hubitat Maker API
// Public-repo posture: no built-in defaults or legacy env var fallbacks.
// If Hubitat isn't configured, the server still runs but Hubitat polling/commands are disabled.
const envTrim = (name) => String(process.env[name] || '').trim();

const normalizeHubitatHost = (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const noTrailingSlash = trimmed.replace(/\/$/, '');
    // If the user provides just an IP/hostname, default to HTTPS.
    // Use http:// explicitly if your Hubitat is only available over HTTP.
    if (!/^https?:\/\//i.test(noTrailingSlash)) return `https://${noTrailingSlash}`;
    return noTrailingSlash;
};

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

if (HUBITAT_TLS_INSECURE && !UndiciAgent) {
    console.warn('HUBITAT_TLS_INSECURE=1 was set but undici could not be loaded; TLS verification may still fail for Hubitat HTTPS.');
}

const HUBITAT_FETCH_DISPATCHER = (HUBITAT_TLS_INSECURE && UndiciAgent)
    ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
    : null;

function hubitatFetch(url, options) {
    const base = options && typeof options === 'object' ? { ...options } : {};
    if (HUBITAT_FETCH_DISPATCHER) {
        return fetch(url, { ...base, dispatcher: HUBITAT_FETCH_DISPATCHER });
    }
    return fetch(url, base);
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

const HUBITAT_API_BASE = HUBITAT_CONFIGURED ? `${HUBITAT_HOST}/apps/api/${HUBITAT_APP_ID}` : '';
const HUBITAT_API_URL = HUBITAT_CONFIGURED
    ? `${HUBITAT_API_BASE}/devices/all?access_token=${encodeURIComponent(HUBITAT_ACCESS_TOKEN)}`
    : '';
const HUBITAT_MODES_URL = HUBITAT_CONFIGURED
    ? `${HUBITAT_API_BASE}/modes?access_token=${encodeURIComponent(HUBITAT_ACCESS_TOKEN)}`
    : '';

// Open-Meteo (free) weather
// Config priority: env vars > server/data/config.json > defaults
// DMS example: 35°29'44.9"N 86°04'53.8"W
let settings = {
    weather: {
        openMeteo: {
            lat: `35°29'44.9"N`,
            lon: `86°04'53.8"W`,
            timezone: 'auto',
            temperatureUnit: 'fahrenheit',
            windSpeedUnit: 'mph',
            precipitationUnit: 'inch',
        }
    }
};

app.use(cors());
// Hubitat Maker API postURL can send JSON as text/plain (and sometimes with log prefixes).
// Parse /api/events as raw text first, then normalize inside the handler.
app.use('/api/events', bodyParser.text({ type: '*/*', limit: '1mb' }));

app.use(bodyParser.json());

if (HAS_BUILT_CLIENT) {
    app.use(express.static(CLIENT_DIST_DIR));
}

// Serve custom alert sounds from the server-managed sounds directory.
// Files placed in server/data/sounds will be reachable at /sounds/<file>.
app.use('/sounds', express.static(SOUNDS_DIR));

// Serve custom Home background images from the server-managed backgrounds directory.
// Files placed in server/data/backgrounds will be reachable at /backgrounds/<file>.
app.use('/backgrounds', express.static(BACKGROUNDS_DIR, {
    dotfiles: 'ignore',
    fallthrough: false,
    maxAge: '7d',
    setHeaders(res) {
        // Helps prevent MIME sniffing surprises if someone drops a weird file here.
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=604800');
    },
}));

// State
let persistedConfig = { weather: settings.weather, rooms: [], sensors: [] }; // Stored in server/data/config.json
let lastPersistedSerialized = '';
let config = { rooms: [], sensors: [], ui: { allowedDeviceIds: [] } }; // The merged view sent to client
let sensorStatuses = {};

let lastConfigWriteAtMs = 0;
let pendingPersistTimeout = null;
let pendingPersistLabel = null;

// Cached last Hubitat payload for debugging/inspection
let lastHubitatDevices = [];
let lastHubitatFetchAt = null;
let lastHubitatError = null;
let lastHubitatErrorLoggedAt = 0;

// Cached Open-Meteo response
let lastWeather = null;
let lastWeatherFetchAt = null;
let lastWeatherError = null;
let lastWeatherErrorLoggedAt = 0;

// --- EVENT INBOX ---
// Hubitat Maker API can POST back to our API via the Maker "postURL" endpoint.
// This keeps a small in-memory ring buffer of recent events so the UI (or logs)
// can inspect what is arriving.
const MAX_INGESTED_EVENTS = (() => {
    const raw = process.env.EVENTS_MAX;
    const parsed = raw ? Number(raw) : 500;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 500;
})();

const EVENTS_INGEST_TOKEN = String(process.env.EVENTS_INGEST_TOKEN || '').trim();
const EVENTS_PERSIST_JSONL = (() => {
    const raw = String(process.env.EVENTS_PERSIST_JSONL || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();
let ingestedEvents = [];

function pruneIngestedEvents() {
    if (ingestedEvents.length > MAX_INGESTED_EVENTS) {
        ingestedEvents = ingestedEvents.slice(-MAX_INGESTED_EVENTS);
    }
}

function shouldAcceptIngestedEvent(payload) {
    // If an allowlist exists and the payload includes a deviceId, enforce it.
    try {
        const allowed = getUiAllowedDeviceIds();
        if (!allowed.length) return true;
        const deviceId = payload?.deviceId ?? payload?.device_id ?? payload?.id;
        if (deviceId === undefined || deviceId === null) return true;
        return allowed.includes(String(deviceId));
    } catch {
        return true;
    }
}

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

function normalizePostedEventsBody(body) {
    // Accept:
    // - JSON object event (Maker event payload)
    // - JSON array of events
    // - { event: {...} } or { events: [...] }
    // - text/plain containing JSON or "device event: {...}"

    let parsed = body;
    if (typeof body === 'string') {
        parsed = tryParseJsonFromText(body);
    }

    if (!parsed) return [];

    if (Array.isArray(parsed)) {
        return parsed.filter((e) => e && typeof e === 'object');
    }

    if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.events)) {
            return parsed.events.filter((e) => e && typeof e === 'object');
        }
        if (parsed.event && typeof parsed.event === 'object') {
            return [parsed.event];
        }
        return [parsed];
    }

    return [];
}

// --- UI DEVICE ALLOWLISTS ---
// Controls (switch toggles, commands) are restricted to explicit allowlists.
// There are two independent lists:
// - Main dashboard controls (Environment page)
// - Ctrl dashboard controls (Interactions page)
//
// Sources (priority): env vars > server/data/config.json
// - UI_ALLOWED_CTRL_DEVICE_IDS (comma-separated) [recommended]
// - UI_ALLOWED_MAIN_DEVICE_IDS (comma-separated)
// Back-compat:
// - UI_ALLOWED_DEVICE_IDS is treated as CTRL allowlist.
//
// Default: deny (no controls) when a list is empty.
function parseCommaList(raw) {
    return String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function getUiAllowlistsInfo() {
    const envCtrl = parseCommaList(process.env.UI_ALLOWED_CTRL_DEVICE_IDS);
    const envMain = parseCommaList(process.env.UI_ALLOWED_MAIN_DEVICE_IDS);

    // Back-compat: old single env var maps to CTRL
    const envLegacy = parseCommaList(process.env.UI_ALLOWED_DEVICE_IDS);
    const envCtrlMerged = envCtrl.length ? envCtrl : envLegacy;

    const cfg = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const cfgCtrl = Array.isArray(cfg.ctrlAllowedDeviceIds) ? cfg.ctrlAllowedDeviceIds : (Array.isArray(cfg.allowedDeviceIds) ? cfg.allowedDeviceIds : []);
    const cfgMain = Array.isArray(cfg.mainAllowedDeviceIds) ? cfg.mainAllowedDeviceIds : [];

    const ctrl = envCtrlMerged.length
        ? { ids: envCtrlMerged, source: 'env', locked: true }
        : {
            ids: cfgCtrl.map((v) => String(v || '').trim()).filter(Boolean),
            source: cfgCtrl.length ? 'config' : 'empty',
            locked: false,
        };

    const main = envMain.length
        ? { ids: envMain, source: 'env', locked: true }
        : {
            ids: cfgMain.map((v) => String(v || '').trim()).filter(Boolean),
            source: cfgMain.length ? 'config' : 'empty',
            locked: false,
        };

    return { ctrl, main };
}

function getUiCtrlAllowedDeviceIds() {
    return getUiAllowlistsInfo().ctrl.ids;
}

function getUiMainAllowedDeviceIds() {
    return getUiAllowlistsInfo().main.ids;
}

function getUiAllowedDeviceIdsUnion() {
    const { ctrl, main } = getUiAllowlistsInfo();

    // Panel profiles can further restrict the UI, but server-side enforcement must allow
    // any device that *any* panel is configured to control, otherwise the UI can show
    // a control that the backend rejects.
    //
    // Important: environment allowlists remain authoritative/locked.
    const profiles = (persistedConfig?.ui?.panelProfiles && typeof persistedConfig.ui.panelProfiles === 'object')
        ? persistedConfig.ui.panelProfiles
        : {};

    const profileCtrl = [];
    const profileMain = [];
    for (const p of Object.values(profiles)) {
        if (!p || typeof p !== 'object') continue;
        if (!ctrl.locked) {
            const ids = Array.isArray(p.ctrlAllowedDeviceIds)
                ? p.ctrlAllowedDeviceIds
                : (Array.isArray(p.allowedDeviceIds) ? p.allowedDeviceIds : []);
            for (const v of ids) {
                const s = String(v || '').trim();
                if (s) profileCtrl.push(s);
            }
        }
        if (!main.locked) {
            const ids = Array.isArray(p.mainAllowedDeviceIds) ? p.mainAllowedDeviceIds : [];
            for (const v of ids) {
                const s = String(v || '').trim();
                if (s) profileMain.push(s);
            }
        }
    }

    return Array.from(new Set([...(ctrl.ids || []), ...(main.ids || []), ...profileCtrl, ...profileMain]));
}

function isUiDeviceAllowedForControl(deviceId) {
    const allowed = getUiAllowedDeviceIdsUnion();
    if (!allowed.length) return false;
    return allowed.includes(String(deviceId));
}

// --- PERSISTENCE ---

function ensureDataDirs() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
    if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR);
    if (!fs.existsSync(BACKGROUNDS_DIR)) fs.mkdirSync(BACKGROUNDS_DIR);
}

function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}

function pruneBackupsSync({ maxFiles = MAX_BACKUP_FILES } = {}) {
    try {
        ensureDataDirs();
        const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
            .filter(d => d.isFile())
            .map(d => ({
                name: d.name,
                fullPath: path.join(BACKUP_DIR, d.name),
            }))
            .map((f) => {
                try {
                    const st = fs.statSync(f.fullPath);
                    return { ...f, mtimeMs: st.mtimeMs };
                } catch {
                    return { ...f, mtimeMs: 0 };
                }
            });

        if (entries.length <= maxFiles) return;

        entries.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
        const toDelete = entries.slice(maxFiles);
        for (const f of toDelete) {
            try {
                fs.rmSync(f.fullPath, { force: true });
            } catch {
                // best-effort cleanup
            }
        }
    } catch {
        // best-effort cleanup
    }
}

function backupFileSync(filePath, label) {
    try {
        if (!fs.existsSync(filePath)) return null;
        ensureDataDirs();

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = path.basename(filePath, path.extname(filePath));
        const backupName = `${base}.${label}.${stamp}.json`;
        const target = path.join(BACKUP_DIR, backupName);

        fs.copyFileSync(filePath, target);
        pruneBackupsSync();
        return target;
    } catch (err) {
        console.error('Failed to back up file:', err);
        return null;
    }
}

function normalizePersistedConfig(raw) {
    const out = (raw && typeof raw === 'object') ? { ...raw } : {};

    // Back-compat: some earlier versions stored weather under settings.weather
    const weather = out.weather || out?.settings?.weather || {};
    out.weather = {
        ...settings.weather,
        ...(weather || {}),
    };

    out.rooms = Array.isArray(out.rooms) ? out.rooms : [];
    out.sensors = Array.isArray(out.sensors) ? out.sensors : [];
    out.labels = Array.isArray(out.labels) ? out.labels : [];

    out.labels = out.labels
        .map((l) => {
            if (!l || typeof l !== 'object') return null;
            const id = String(l.id || '').trim();
            if (!id) return null;
            const text = String(l.text ?? '').toString();
            const layout = (l.layout && typeof l.layout === 'object') ? l.layout : {};
            return {
                id,
                text,
                layout: {
                    x: Number.isFinite(layout.x) ? layout.x : 0,
                    y: Number.isFinite(layout.y) ? layout.y : 9999,
                    w: Number.isFinite(layout.w) ? layout.w : 2,
                    h: Number.isFinite(layout.h) ? layout.h : 1,
                },
            };
        })
        .filter(Boolean);

    const uiRaw = out.ui && typeof out.ui === 'object' ? out.ui : {};
    const legacyAllowed = Array.isArray(uiRaw.allowedDeviceIds)
        ? uiRaw.allowedDeviceIds
        : [];
    const ctrlAllowed = Array.isArray(uiRaw.ctrlAllowedDeviceIds)
        ? uiRaw.ctrlAllowedDeviceIds
        : legacyAllowed;
    const mainAllowed = Array.isArray(uiRaw.mainAllowedDeviceIds)
        ? uiRaw.mainAllowedDeviceIds
        : [];

    // Home visibility (which devices contribute to Home room cards/metrics).
    // Empty list means "show all".
    const homeVisibleDeviceIds = Array.isArray(uiRaw.homeVisibleDeviceIds)
        ? uiRaw.homeVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
        : [];

    const visibleRoomIds = Array.isArray(uiRaw.visibleRoomIds)
        ? uiRaw.visibleRoomIds.map((v) => String(v || '').trim()).filter(Boolean)
        : [];

    const deviceLabelOverrides = (() => {
        const rawMap = (uiRaw.deviceLabelOverrides && typeof uiRaw.deviceLabelOverrides === 'object')
            ? uiRaw.deviceLabelOverrides
            : {};
        const outMap = {};
        for (const [k, v] of Object.entries(rawMap)) {
            const id = String(k || '').trim();
            if (!id) continue;
            const label = String(v ?? '').trim();
            if (!label) continue;
            if (label.length > 64) continue;
            outMap[id] = label;
        }
        return outMap;
    })();

    const deviceCommandAllowlist = (() => {
        const rawMap = (uiRaw.deviceCommandAllowlist && typeof uiRaw.deviceCommandAllowlist === 'object')
            ? uiRaw.deviceCommandAllowlist
            : {};
        const outMap = {};
        for (const [k, v] of Object.entries(rawMap)) {
            const id = String(k || '').trim();
            if (!id) continue;
            if (!Array.isArray(v)) continue;
            const cmds = v
                .map((c) => String(c || '').trim())
                .filter((c) => c && ALLOWED_PANEL_DEVICE_COMMANDS.has(c));
            // Empty array is allowed (meaning: show no commands for this device on this panel).
            outMap[id] = Array.from(new Set(cmds)).slice(0, 32);
        }
        return outMap;
    })();

    const deviceHomeMetricAllowlist = (() => {
        const rawMap = (uiRaw.deviceHomeMetricAllowlist && typeof uiRaw.deviceHomeMetricAllowlist === 'object')
            ? uiRaw.deviceHomeMetricAllowlist
            : {};
        const outMap = {};
        for (const [k, v] of Object.entries(rawMap)) {
            const id = String(k || '').trim();
            if (!id) continue;
            if (!Array.isArray(v)) continue;
            const keys = v
                .map((c) => String(c || '').trim())
                .filter((c) => c && ALLOWED_HOME_METRIC_KEYS.has(c));
            // Empty array is allowed (meaning: show no Home metrics from this device).
            outMap[id] = Array.from(new Set(keys)).slice(0, 16);
        }
        return outMap;
    })();

    const rawAccent = String(uiRaw.accentColorId || uiRaw.colorScheme || '').trim();
    const accentColorId = normalizeAccentColorId(rawAccent);

    const colorizeHomeValues = uiRaw.colorizeHomeValues === true;

    const clampInt = (n, min, max, fallback) => {
        const num = (typeof n === 'number') ? n : Number(n);
        if (!Number.isFinite(num)) return fallback;
        const rounded = Math.round(num);
        return Math.max(min, Math.min(max, rounded));
    };

    const colorizeHomeValuesOpacityPct = clampInt(uiRaw.colorizeHomeValuesOpacityPct, 0, 100, 100);

    const soundsRaw = (uiRaw.alertSounds && typeof uiRaw.alertSounds === 'object') ? uiRaw.alertSounds : {};
    const climateRaw = (uiRaw.climateTolerances && typeof uiRaw.climateTolerances === 'object') ? uiRaw.climateTolerances : {};
    const asFile = (v) => {
        const s = String(v ?? '').trim();
        return s.length ? s : null;
    };

    const asFinite = (v) => {
        const num = (typeof v === 'number') ? v : Number(v);
        return Number.isFinite(num) ? num : null;
    };

    const defaultClimate = {
        // Thresholds define 4 bands. Example for temperature:
        // < cold => cold color, < comfy => comfy color, < warm => warm color, else => hot color
        temperatureF: { cold: 68, comfy: 72, warm: 74 },
        // For humidity:
        // < dry => dry, < comfy => comfy, < humid => humid, else => very humid
        humidityPct: { dry: 35, comfy: 55, humid: 65 },
        // For illuminance:
        // < dark => dark, < dim => dim, < bright => bright, else => very bright
        illuminanceLux: { dark: 50, dim: 250, bright: 600 },
    };

    const DEFAULT_TOLERANCE_COLORS = {
        temperatureF: { cold: 'neon-blue', comfy: 'neon-green', warm: 'warning', hot: 'neon-red' },
        humidityPct: { dry: 'neon-blue', comfy: 'neon-green', humid: 'warning', veryHumid: 'neon-red' },
        illuminanceLux: { dark: 'neon-blue', dim: 'neon-green', bright: 'warning', veryBright: 'neon-green' },
    };

    const colorsRaw = (uiRaw.climateToleranceColors && typeof uiRaw.climateToleranceColors === 'object')
        ? uiRaw.climateToleranceColors
        : {};

    const pickColorGroup = (rawObj, keys, fallback) => {
        const outObj = { ...fallback };
        if (!rawObj || typeof rawObj !== 'object') return outObj;
        for (const k of keys) {
            const v = String(rawObj[k] ?? '').trim();
            if (ALLOWED_TOLERANCE_COLOR_IDS.has(v)) outObj[k] = v;
        }
        return outObj;
    };

    const climateToleranceColors = {
        temperatureF: pickColorGroup(colorsRaw.temperatureF, ['cold', 'comfy', 'warm', 'hot'], DEFAULT_TOLERANCE_COLORS.temperatureF),
        humidityPct: pickColorGroup(colorsRaw.humidityPct, ['dry', 'comfy', 'humid', 'veryHumid'], DEFAULT_TOLERANCE_COLORS.humidityPct),
        illuminanceLux: pickColorGroup(colorsRaw.illuminanceLux, ['dark', 'dim', 'bright', 'veryBright'], DEFAULT_TOLERANCE_COLORS.illuminanceLux),
    };

    const DEFAULT_SENSOR_INDICATOR_COLORS = {
        motion: 'warning',
        door: 'neon-red',
    };

    const sensorRaw = (uiRaw.sensorIndicatorColors && typeof uiRaw.sensorIndicatorColors === 'object')
        ? uiRaw.sensorIndicatorColors
        : {};

    const sensorIndicatorColors = pickColorGroup(sensorRaw, ['motion', 'door'], DEFAULT_SENSOR_INDICATOR_COLORS);

    const homeBgRaw = (uiRaw.homeBackground && typeof uiRaw.homeBackground === 'object')
        ? uiRaw.homeBackground
        : {};

    const homeBackground = {
        enabled: homeBgRaw.enabled === true,
        url: asFile(homeBgRaw.url),
        opacityPct: clampInt(homeBgRaw.opacityPct, 0, 100, 35),
    };

    // If there's no URL, don't treat the background as enabled.
    if (homeBackground.enabled && !homeBackground.url) {
        homeBackground.enabled = false;
    }

    // Card background opacity scale.
    // 100 = default styling, 0 = fully transparent, 200 = twice as opaque (clamped per-card).
    const cardOpacityScalePct = clampInt(uiRaw.cardOpacityScalePct, 0, 200, 100);

    // Backdrop blur scale.
    // 100 = default blur, 0 = no blur, 200 = double blur.
    const blurScalePct = clampInt(uiRaw.blurScalePct, BLUR_SCALE_PCT_RANGE.min, BLUR_SCALE_PCT_RANGE.max, BLUR_SCALE_PCT_RANGE.def);

    // Secondary text styling (Home page).
    // Stored as a percent for easier UI controls; the client maps these to CSS.
    const secondaryTextOpacityPct = clampInt(uiRaw.secondaryTextOpacityPct, 0, 100, 45);
    const secondaryTextSizePct = clampInt(
        uiRaw.secondaryTextSizePct,
        SECONDARY_TEXT_SIZE_PCT_RANGE.min,
        SECONDARY_TEXT_SIZE_PCT_RANGE.max,
        SECONDARY_TEXT_SIZE_PCT_RANGE.def,
    );
    const secondaryTextColorIdRaw = String(uiRaw.secondaryTextColorId ?? '').trim();
    const secondaryTextColorId = secondaryTextColorIdRaw
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(secondaryTextColorIdRaw) ? secondaryTextColorIdRaw : null)
        : null;

    // Primary text styling (Home page).
    // Stored as a percent for easier UI controls; the client maps these to CSS.
    const primaryTextOpacityPct = clampInt(uiRaw.primaryTextOpacityPct, 0, 100, 100);
    const primaryTextSizePct = clampInt(
        uiRaw.primaryTextSizePct,
        PRIMARY_TEXT_SIZE_PCT_RANGE.min,
        PRIMARY_TEXT_SIZE_PCT_RANGE.max,
        PRIMARY_TEXT_SIZE_PCT_RANGE.def,
    );
    const primaryTextColorIdRaw = String(uiRaw.primaryTextColorId ?? '').trim();
    const primaryTextColorId = primaryTextColorIdRaw
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(primaryTextColorIdRaw) ? primaryTextColorIdRaw : null)
        : null;

    // Card scale percent.
    // 100 = default sizing, 50 = half-size, 200 = double-size.
    // Currently used by the Home panel to scale cards/controls for different screens.
    const cardScalePct = clampInt(uiRaw.cardScalePct, 50, 200, 100);

    // Home room grid columns at XL breakpoint (>= 1280px).
    // Default matches current layout (3 columns).
    const homeRoomColumnsXl = clampInt(uiRaw.homeRoomColumnsXl, 1, 6, 3);

    // Home room metric grid columns (sub-cards inside each room panel).
    // 0 = auto (derived from room columns), 1-3 = forced columns.
    const homeRoomMetricColumns = clampInt(uiRaw.homeRoomMetricColumns, 0, 3, 0);

    // Home room metric cards to show (applies to every room).
    // Default: show temperature/humidity/illuminance.
    const homeRoomMetricKeys = (() => {
        if (!Object.prototype.hasOwnProperty.call(uiRaw, 'homeRoomMetricKeys')) {
            return ['temperature', 'humidity', 'illuminance'];
        }
        const raw = Array.isArray(uiRaw.homeRoomMetricKeys) ? uiRaw.homeRoomMetricKeys : [];
        const keys = raw
            .map((v) => String(v || '').trim())
            .filter((v) => v && ALLOWED_HOME_ROOM_METRIC_KEYS.has(v));
        return Array.from(new Set(keys));
    })();

    // --- Cameras (registered devices, then assigned to rooms per panel) ---
    // Cameras are not standard Hubitat devices; this registry supports:
    // - Snapshot previews via server-side proxy
    // - HTTP(S) embeds (iframe)
    // - RTSP playback via server-side HLS (requires ffmpeg)
    const cameras = (() => {
        const rawList = Array.isArray(uiRaw.cameras) ? uiRaw.cameras : [];
        const outList = [];

        for (const rawCam of rawList) {
            if (!rawCam || typeof rawCam !== 'object') continue;
            const id = String(rawCam.id || '').trim();
            if (!id) continue;

            const label = String(rawCam.label || id).trim().slice(0, 64) || id;
            const enabled = rawCam.enabled !== false;

            // Legacy: roomId (old) -> defaultRoomId (new default assignment).
            const defaultRoomId = String(rawCam.defaultRoomId || rawCam.roomId || '').trim();

            const snapRaw = (rawCam.snapshot && typeof rawCam.snapshot === 'object') ? rawCam.snapshot : {};
            const snapshotUrl = asFile(snapRaw.url);

            const authRaw = (snapRaw.basicAuth && typeof snapRaw.basicAuth === 'object') ? snapRaw.basicAuth : null;
            const basicAuth = authRaw
                ? {
                    username: String(authRaw.username ?? '').trim(),
                    password: String(authRaw.password ?? '').trim(),
                }
                : null;

            const embedRaw = (rawCam.embed && typeof rawCam.embed === 'object') ? rawCam.embed : {};
            const embedUrl = asFile(embedRaw.url);

            const rtspRaw = (rawCam.rtsp && typeof rawCam.rtsp === 'object') ? rawCam.rtsp : {};
            const rtspUrl = String(rtspRaw.url || '').trim();

            outList.push({
                id,
                label,
                enabled,
                ...(defaultRoomId ? { defaultRoomId } : {}),
                ...(snapshotUrl ? {
                    snapshot: {
                        url: snapshotUrl,
                        ...(basicAuth && (basicAuth.username || basicAuth.password) ? { basicAuth } : {}),
                    },
                } : {}),
                ...(embedUrl ? { embed: { url: embedUrl } } : {}),
                ...(rtspUrl ? { rtsp: { url: rtspUrl } } : {}),
            });
        }

        // Hard cap to avoid accidental huge payloads.
        return outList.slice(0, 100);
    })();

    // Room -> camera ids assignment.
    // If omitted, client falls back to per-camera defaultRoomId.
    const roomCameraIds = (() => {
        if (uiRaw.roomCameraIds && typeof uiRaw.roomCameraIds === 'object') {
            const rawMap = uiRaw.roomCameraIds;
            const outMap = {};
            for (const [ridRaw, idsRaw] of Object.entries(rawMap)) {
                const rid = String(ridRaw || '').trim();
                if (!rid) continue;
                const ids = Array.isArray(idsRaw)
                    ? idsRaw.map((v) => String(v || '').trim()).filter(Boolean)
                    : [];
                outMap[rid] = Array.from(new Set(ids));
            }
            return outMap;
        }

        // Back-compat: derive a default mapping from legacy/defaultRoomId values.
        const outMap = {};
        for (const cam of cameras) {
            const rid = String(cam?.defaultRoomId || '').trim();
            if (!rid) continue;
            const id = String(cam?.id || '').trim();
            if (!id) continue;
            outMap[rid] = Array.from(new Set([...(outMap[rid] || []), id]));
        }
        return outMap;
    })();

    const homeCameraPreviewsEnabled = uiRaw.homeCameraPreviewsEnabled === true;
    const controlsCameraPreviewsEnabled = uiRaw.controlsCameraPreviewsEnabled === true;
    const cameraPreviewRefreshSeconds = clampInt(uiRaw.cameraPreviewRefreshSeconds, 2, 120, 10);

    // Top-of-panel camera bar configuration.
    // Empty list means "show none".
    const topCameraIds = Array.isArray(uiRaw.topCameraIds)
        ? uiRaw.topCameraIds.map((v) => String(v || '').trim()).filter(Boolean)
        : [];

    // Camera bar size: xs | sm | md | lg
    const topCameraSize = (() => {
        const raw = String(uiRaw.topCameraSize ?? '').trim().toLowerCase();
        if (raw === 'xs' || raw === 'sm' || raw === 'md' || raw === 'lg') return raw;
        return 'md';
    })();

    // Camera visibility allowlist.
    // Empty list means "show all configured cameras".
    const visibleCameraIds = Array.isArray(uiRaw.visibleCameraIds)
        ? uiRaw.visibleCameraIds.map((v) => String(v || '').trim()).filter(Boolean)
        : [];

    // Glow/icon styling (Home page).
    // Color IDs use the same shared allowlist as tolerance/text colors.
    const glowColorIdRaw = String(uiRaw.glowColorId ?? '').trim();
    const glowColorId = glowColorIdRaw
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(glowColorIdRaw) ? glowColorIdRaw : null)
        : null;

    const iconColorIdRaw = String(uiRaw.iconColorId ?? '').trim();
    const iconColorId = iconColorIdRaw
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(iconColorIdRaw) ? iconColorIdRaw : null)
        : null;

    const iconOpacityPct = clampInt(uiRaw.iconOpacityPct, 0, 100, 100);
    const iconSizePct = clampInt(uiRaw.iconSizePct, ICON_SIZE_PCT_RANGE.min, ICON_SIZE_PCT_RANGE.max, ICON_SIZE_PCT_RANGE.def);

    const rawPanelProfiles = (uiRaw.panelProfiles && typeof uiRaw.panelProfiles === 'object') ? uiRaw.panelProfiles : {};
    // Always include shipped presets, but do not allow persisted config to override them.
    const userPanelProfiles = {};
    for (const [k, v] of Object.entries(rawPanelProfiles)) {
        const normalized = normalizePanelName(k);
        if (!normalized) continue;
        if (PRESET_PANEL_PROFILE_NAMES.has(normalized)) continue;
        userPanelProfiles[normalized] = v;
    }
    const sourcePanelProfiles = {
        ...DEFAULT_PANEL_PROFILES_PRESETS,
        ...userPanelProfiles,
    };
    const panelProfiles = {};
    for (const [rawName, rawProfile] of Object.entries(sourcePanelProfiles)) {
        const name = normalizePanelName(rawName);
        if (!name) continue;
        const p = (rawProfile && typeof rawProfile === 'object') ? rawProfile : {};

        const pSchemeRaw = String(p.accentColorId || p.colorScheme || '').trim();
        const pColorScheme = (() => {
            if (!pSchemeRaw) return null;
            if (ALLOWED_ACCENT_COLOR_IDS.has(pSchemeRaw)) return pSchemeRaw;
            if (LEGACY_UI_COLOR_SCHEMES.includes(pSchemeRaw)) return normalizeAccentColorId(pSchemeRaw);
            return null;
        })();
        const pCardOpacityScalePct = Object.prototype.hasOwnProperty.call(p, 'cardOpacityScalePct')
            ? clampInt(p.cardOpacityScalePct, 0, 200, cardOpacityScalePct)
            : null;
        const pBlurScalePct = Object.prototype.hasOwnProperty.call(p, 'blurScalePct')
            ? clampInt(p.blurScalePct, BLUR_SCALE_PCT_RANGE.min, BLUR_SCALE_PCT_RANGE.max, blurScalePct)
            : null;
        const pSecondaryTextOpacityPct = Object.prototype.hasOwnProperty.call(p, 'secondaryTextOpacityPct')
            ? clampInt(p.secondaryTextOpacityPct, 0, 100, secondaryTextOpacityPct)
            : null;
        const pSecondaryTextSizePct = Object.prototype.hasOwnProperty.call(p, 'secondaryTextSizePct')
            ? clampInt(
                p.secondaryTextSizePct,
                SECONDARY_TEXT_SIZE_PCT_RANGE.min,
                SECONDARY_TEXT_SIZE_PCT_RANGE.max,
                secondaryTextSizePct,
            )
            : null;
        const pSecondaryTextColorIdRaw = Object.prototype.hasOwnProperty.call(p, 'secondaryTextColorId')
            ? String(p.secondaryTextColorId ?? '').trim()
            : null;
        const pSecondaryTextColorId = pSecondaryTextColorIdRaw
            ? (ALLOWED_TOLERANCE_COLOR_IDS.has(pSecondaryTextColorIdRaw) ? pSecondaryTextColorIdRaw : null)
            : null;

        const pPrimaryTextOpacityPct = Object.prototype.hasOwnProperty.call(p, 'primaryTextOpacityPct')
            ? clampInt(p.primaryTextOpacityPct, 0, 100, primaryTextOpacityPct)
            : null;
        const pPrimaryTextSizePct = Object.prototype.hasOwnProperty.call(p, 'primaryTextSizePct')
            ? clampInt(
                p.primaryTextSizePct,
                PRIMARY_TEXT_SIZE_PCT_RANGE.min,
                PRIMARY_TEXT_SIZE_PCT_RANGE.max,
                primaryTextSizePct,
            )
            : null;
        const pPrimaryTextColorIdRaw = Object.prototype.hasOwnProperty.call(p, 'primaryTextColorId')
            ? String(p.primaryTextColorId ?? '').trim()
            : null;
        const pPrimaryTextColorId = pPrimaryTextColorIdRaw
            ? (ALLOWED_TOLERANCE_COLOR_IDS.has(pPrimaryTextColorIdRaw) ? pPrimaryTextColorIdRaw : null)
            : null;
        const pCardScalePct = Object.prototype.hasOwnProperty.call(p, 'cardScalePct')
            ? clampInt(p.cardScalePct, 50, 200, cardScalePct)
            : null;
        const pHomeRoomColumnsXl = Object.prototype.hasOwnProperty.call(p, 'homeRoomColumnsXl')
            ? clampInt(p.homeRoomColumnsXl, 1, 6, homeRoomColumnsXl)
            : null;

        const pHomeRoomMetricColumns = Object.prototype.hasOwnProperty.call(p, 'homeRoomMetricColumns')
            ? clampInt(p.homeRoomMetricColumns, 0, 3, homeRoomMetricColumns)
            : null;

        const pHomeRoomMetricKeys = Object.prototype.hasOwnProperty.call(p, 'homeRoomMetricKeys')
            ? (() => {
                const raw = Array.isArray(p.homeRoomMetricKeys) ? p.homeRoomMetricKeys : [];
                const keys = raw
                    .map((v) => String(v || '').trim())
                    .filter((v) => v && ALLOWED_HOME_ROOM_METRIC_KEYS.has(v));
                return Array.from(new Set(keys));
            })()
            : null;

        const pHomeCameraPreviewsEnabled = Object.prototype.hasOwnProperty.call(p, 'homeCameraPreviewsEnabled')
            ? (p.homeCameraPreviewsEnabled === true)
            : null;

        const pControlsCameraPreviewsEnabled = Object.prototype.hasOwnProperty.call(p, 'controlsCameraPreviewsEnabled')
            ? (p.controlsCameraPreviewsEnabled === true)
            : null;

        const pCameraPreviewRefreshSeconds = Object.prototype.hasOwnProperty.call(p, 'cameraPreviewRefreshSeconds')
            ? clampInt(p.cameraPreviewRefreshSeconds, 2, 120, cameraPreviewRefreshSeconds)
            : null;

        const pRoomCameraIds = Object.prototype.hasOwnProperty.call(p, 'roomCameraIds')
            ? (() => {
                const rawMap = (p.roomCameraIds && typeof p.roomCameraIds === 'object') ? p.roomCameraIds : {};
                const outMap = {};
                for (const [ridRaw, idsRaw] of Object.entries(rawMap)) {
                    const rid = String(ridRaw || '').trim();
                    if (!rid) continue;
                    const ids = Array.isArray(idsRaw)
                        ? idsRaw.map((v) => String(v || '').trim()).filter(Boolean)
                        : [];
                    outMap[rid] = Array.from(new Set(ids));
                }
                return outMap;
            })()
            : null;

        const pVisibleCameraIds = Object.prototype.hasOwnProperty.call(p, 'visibleCameraIds')
            ? (Array.isArray(p.visibleCameraIds)
                ? p.visibleCameraIds.map((v) => String(v || '').trim()).filter(Boolean)
                : [])
            : null;

        const pTopCameraIds = Object.prototype.hasOwnProperty.call(p, 'topCameraIds')
            ? (Array.isArray(p.topCameraIds)
                ? p.topCameraIds.map((v) => String(v || '').trim()).filter(Boolean)
                : [])
            : null;

        const pTopCameraSize = Object.prototype.hasOwnProperty.call(p, 'topCameraSize')
            ? (() => {
                const raw = String(p.topCameraSize ?? '').trim().toLowerCase();
                if (raw === 'xs' || raw === 'sm' || raw === 'md' || raw === 'lg') return raw;
                return null;
            })()
            : null;

        const pGlowColorIdRaw = Object.prototype.hasOwnProperty.call(p, 'glowColorId')
            ? String(p.glowColorId ?? '').trim()
            : null;
        const pGlowColorId = pGlowColorIdRaw
            ? (ALLOWED_TOLERANCE_COLOR_IDS.has(pGlowColorIdRaw) ? pGlowColorIdRaw : null)
            : null;

        const pIconColorIdRaw = Object.prototype.hasOwnProperty.call(p, 'iconColorId')
            ? String(p.iconColorId ?? '').trim()
            : null;
        const pIconColorId = pIconColorIdRaw
            ? (ALLOWED_TOLERANCE_COLOR_IDS.has(pIconColorIdRaw) ? pIconColorIdRaw : null)
            : null;

        const pIconOpacityPct = Object.prototype.hasOwnProperty.call(p, 'iconOpacityPct')
            ? clampInt(p.iconOpacityPct, 0, 100, iconOpacityPct)
            : null;
        const pIconSizePct = Object.prototype.hasOwnProperty.call(p, 'iconSizePct')
            ? clampInt(p.iconSizePct, ICON_SIZE_PCT_RANGE.min, ICON_SIZE_PCT_RANGE.max, iconSizePct)
            : null;

        const pVisibleRoomIds = Object.prototype.hasOwnProperty.call(p, 'visibleRoomIds')
            ? (Array.isArray(p.visibleRoomIds)
                ? p.visibleRoomIds.map((v) => String(v || '').trim()).filter(Boolean)
                : [])
            : null;

        const pHomeVisibleDeviceIds = Object.prototype.hasOwnProperty.call(p, 'homeVisibleDeviceIds')
            ? (Array.isArray(p.homeVisibleDeviceIds)
                ? p.homeVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
                : [])
            : null;

        const pCtrlAllowedDeviceIds = (() => {
            if (!Object.prototype.hasOwnProperty.call(p, 'ctrlAllowedDeviceIds') && !Object.prototype.hasOwnProperty.call(p, 'allowedDeviceIds')) {
                return null;
            }
            const raw = Array.isArray(p.ctrlAllowedDeviceIds)
                ? p.ctrlAllowedDeviceIds
                : (Array.isArray(p.allowedDeviceIds) ? p.allowedDeviceIds : []);
            return raw.map((v) => String(v || '').trim()).filter(Boolean);
        })();

        const pMainAllowedDeviceIds = Object.prototype.hasOwnProperty.call(p, 'mainAllowedDeviceIds')
            ? (Array.isArray(p.mainAllowedDeviceIds)
                ? p.mainAllowedDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
                : [])
            : null;

        const pDeviceLabelOverrides = (() => {
            if (!Object.prototype.hasOwnProperty.call(p, 'deviceLabelOverrides')) return null;
            const rawMap = (p.deviceLabelOverrides && typeof p.deviceLabelOverrides === 'object')
                ? p.deviceLabelOverrides
                : {};
            const outMap = {};
            for (const [k, v] of Object.entries(rawMap)) {
                const id = String(k || '').trim();
                if (!id) continue;
                const label = String(v ?? '').trim();
                if (!label) continue;
                if (label.length > 64) continue;
                outMap[id] = label;
            }
            return outMap;
        })();

        const pDeviceCommandAllowlist = (() => {
            if (!Object.prototype.hasOwnProperty.call(p, 'deviceCommandAllowlist')) return null;
            const rawMap = (p.deviceCommandAllowlist && typeof p.deviceCommandAllowlist === 'object')
                ? p.deviceCommandAllowlist
                : {};
            const outMap = {};
            for (const [k, v] of Object.entries(rawMap)) {
                const id = String(k || '').trim();
                if (!id) continue;
                if (!Array.isArray(v)) continue;
                const cmds = v
                    .map((c) => String(c || '').trim())
                    .filter((c) => c && ALLOWED_PANEL_DEVICE_COMMANDS.has(c));
                outMap[id] = Array.from(new Set(cmds)).slice(0, 32);
            }
            return outMap;
        })();

        const pDeviceHomeMetricAllowlist = (() => {
            if (!Object.prototype.hasOwnProperty.call(p, 'deviceHomeMetricAllowlist')) return null;
            const rawMap = (p.deviceHomeMetricAllowlist && typeof p.deviceHomeMetricAllowlist === 'object')
                ? p.deviceHomeMetricAllowlist
                : {};
            const outMap = {};
            for (const [k, v] of Object.entries(rawMap)) {
                const id = String(k || '').trim();
                if (!id) continue;
                if (!Array.isArray(v)) continue;
                const keys = v
                    .map((c) => String(c || '').trim())
                    .filter((c) => c && ALLOWED_HOME_METRIC_KEYS.has(c));
                outMap[id] = Array.from(new Set(keys)).slice(0, 16);
            }
            return outMap;
        })();

        const pHomeBgRaw = (p.homeBackground && typeof p.homeBackground === 'object') ? p.homeBackground : null;
        const pHomeBackground = pHomeBgRaw
            ? {
                enabled: pHomeBgRaw.enabled === true,
                url: asFile(pHomeBgRaw.url),
                opacityPct: clampInt(pHomeBgRaw.opacityPct, 0, 100, homeBackground.opacityPct),
            }
            : null;
        if (pHomeBackground && pHomeBackground.enabled && !pHomeBackground.url) {
            pHomeBackground.enabled = false;
        }

        const outProfile = {
            ...(pColorScheme ? { accentColorId: pColorScheme } : {}),
            ...(pHomeBackground ? { homeBackground: pHomeBackground } : {}),
            ...(pCardOpacityScalePct !== null ? { cardOpacityScalePct: pCardOpacityScalePct } : {}),
            ...(pBlurScalePct !== null ? { blurScalePct: pBlurScalePct } : {}),
            ...(pSecondaryTextOpacityPct !== null ? { secondaryTextOpacityPct: pSecondaryTextOpacityPct } : {}),
            ...(pSecondaryTextSizePct !== null ? { secondaryTextSizePct: pSecondaryTextSizePct } : {}),
            ...(pSecondaryTextColorId !== null ? { secondaryTextColorId: pSecondaryTextColorId } : {}),
            ...(pPrimaryTextOpacityPct !== null ? { primaryTextOpacityPct: pPrimaryTextOpacityPct } : {}),
            ...(pPrimaryTextSizePct !== null ? { primaryTextSizePct: pPrimaryTextSizePct } : {}),
            ...(pPrimaryTextColorId !== null ? { primaryTextColorId: pPrimaryTextColorId } : {}),
            ...(pCardScalePct !== null ? { cardScalePct: pCardScalePct } : {}),
            ...(pHomeRoomColumnsXl !== null ? { homeRoomColumnsXl: pHomeRoomColumnsXl } : {}),
            ...(pHomeRoomMetricColumns !== null ? { homeRoomMetricColumns: pHomeRoomMetricColumns } : {}),
            ...(pHomeRoomMetricKeys !== null ? { homeRoomMetricKeys: pHomeRoomMetricKeys } : {}),
            ...(pHomeCameraPreviewsEnabled !== null ? { homeCameraPreviewsEnabled: pHomeCameraPreviewsEnabled } : {}),
            ...(pControlsCameraPreviewsEnabled !== null ? { controlsCameraPreviewsEnabled: pControlsCameraPreviewsEnabled } : {}),
            ...(pCameraPreviewRefreshSeconds !== null ? { cameraPreviewRefreshSeconds: pCameraPreviewRefreshSeconds } : {}),
            ...(pVisibleCameraIds !== null ? { visibleCameraIds: pVisibleCameraIds } : {}),
            ...(pTopCameraIds !== null ? { topCameraIds: pTopCameraIds } : {}),
            ...(pTopCameraSize !== null ? { topCameraSize: pTopCameraSize } : {}),
            ...(pRoomCameraIds !== null ? { roomCameraIds: pRoomCameraIds } : {}),
            ...(pGlowColorId !== null ? { glowColorId: pGlowColorId } : {}),
            ...(pIconColorId !== null ? { iconColorId: pIconColorId } : {}),
            ...(pIconOpacityPct !== null ? { iconOpacityPct: pIconOpacityPct } : {}),
            ...(pIconSizePct !== null ? { iconSizePct: pIconSizePct } : {}),
            ...(pVisibleRoomIds !== null ? { visibleRoomIds: pVisibleRoomIds } : {}),
            ...(pHomeVisibleDeviceIds !== null ? { homeVisibleDeviceIds: pHomeVisibleDeviceIds } : {}),
            ...(pCtrlAllowedDeviceIds !== null ? { ctrlAllowedDeviceIds: pCtrlAllowedDeviceIds } : {}),
            ...(pMainAllowedDeviceIds !== null ? { mainAllowedDeviceIds: pMainAllowedDeviceIds } : {}),
            ...(pDeviceLabelOverrides !== null ? { deviceLabelOverrides: pDeviceLabelOverrides } : {}),
            ...(pDeviceCommandAllowlist !== null ? { deviceCommandAllowlist: pDeviceCommandAllowlist } : {}),
            ...(pDeviceHomeMetricAllowlist !== null ? { deviceHomeMetricAllowlist: pDeviceHomeMetricAllowlist } : {}),
            ...(PRESET_PANEL_PROFILE_NAMES.has(name) ? { _preset: true } : {}),
        };

        if (Object.keys(outProfile).length) {
            panelProfiles[name] = outProfile;
        }
    }

    const normalizeTriplet = (rawObj, keys, fallback) => {
        const outObj = { ...fallback };
        if (!rawObj || typeof rawObj !== 'object') return outObj;
        for (const k of keys) {
            const n = asFinite(rawObj[k]);
            if (n !== null) outObj[k] = n;
        }
        return outObj;
    };

    const climateTolerances = {
        temperatureF: normalizeTriplet(climateRaw.temperatureF, ['cold', 'comfy', 'warm'], defaultClimate.temperatureF),
        humidityPct: normalizeTriplet(climateRaw.humidityPct, ['dry', 'comfy', 'humid'], defaultClimate.humidityPct),
        illuminanceLux: normalizeTriplet(climateRaw.illuminanceLux, ['dark', 'dim', 'bright'], defaultClimate.illuminanceLux),
    };

    out.ui = {
        // Keep legacy key for older clients (harmless), but prefer the new split keys.
        allowedDeviceIds: legacyAllowed.map((v) => String(v || '').trim()).filter(Boolean),
        ctrlAllowedDeviceIds: ctrlAllowed.map((v) => String(v || '').trim()).filter(Boolean),
        mainAllowedDeviceIds: mainAllowed.map((v) => String(v || '').trim()).filter(Boolean),
        visibleRoomIds,
        homeVisibleDeviceIds,
        deviceLabelOverrides,
        deviceCommandAllowlist,
        deviceHomeMetricAllowlist,
        accentColorId,
        colorizeHomeValues,
        colorizeHomeValuesOpacityPct,
        // Back-compat: always include alertSounds, even if unset.
        alertSounds: {
            motion: asFile(soundsRaw.motion),
            doorOpen: asFile(soundsRaw.doorOpen),
            doorClose: asFile(soundsRaw.doorClose),
        },
        // Back-compat: always include climate tolerances so clients can rely on them.
        climateTolerances,
        // Back-compat: always include tolerance colors (used by Heatmap + optional Home value coloring).
        climateToleranceColors,
        // Home indicator badge colors (Motion/Door)
        sensorIndicatorColors,
        // Optional Home background image (rendered behind all controls)
        homeBackground,
        // Opacity scale for UI cards/panels (affects panel backgrounds only).
        cardOpacityScalePct,
        // Backdrop blur scale for UI cards/panels.
        blurScalePct,
        // Secondary (small/gray) text styling (Home page).
        secondaryTextOpacityPct,
        secondaryTextSizePct,
        secondaryTextColorId,
        // Primary (main) text styling (Home page).
        primaryTextOpacityPct,
        primaryTextSizePct,
        primaryTextColorId,
        // Scale percent for UI cards/controls (used by Home fit-scale).
        cardScalePct,
        // Home room columns at XL breakpoint.
        homeRoomColumnsXl,
        // Home room metric sub-card columns (0=auto).
        homeRoomMetricColumns,
        // Home room metric cards to show.
        homeRoomMetricKeys,
        // Cameras (public fields are sanitized in /api/config; full snapshot URLs stay server-side).
        cameras,
        roomCameraIds,
        homeCameraPreviewsEnabled,
        controlsCameraPreviewsEnabled,
        cameraPreviewRefreshSeconds,
        visibleCameraIds,
        topCameraIds,
        topCameraSize,
        // Accent glow + icon styling.
        glowColorId,
        iconColorId,
        iconOpacityPct,
        iconSizePct,
        // Optional per-panel overrides stored server-side.
        panelProfiles,
    };

    return out;
}

function ensurePanelProfileExists(panelName) {
    const name = normalizePanelName(panelName);
    if (!name) return null;

    const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const profiles = (ui.panelProfiles && typeof ui.panelProfiles === 'object') ? ui.panelProfiles : {};
    if (profiles[name] && typeof profiles[name] === 'object') return name;

    const nextProfiles = {
        ...profiles,
        [name]: {
            // Seed new profiles from current global defaults.
            visibleRoomIds: Array.isArray(ui.visibleRoomIds) ? ui.visibleRoomIds : [],
            homeVisibleDeviceIds: Array.isArray(ui.homeVisibleDeviceIds) ? ui.homeVisibleDeviceIds : [],
            ctrlAllowedDeviceIds: Array.isArray(ui.ctrlAllowedDeviceIds)
                ? ui.ctrlAllowedDeviceIds
                : (Array.isArray(ui.allowedDeviceIds) ? ui.allowedDeviceIds : []),
            mainAllowedDeviceIds: Array.isArray(ui.mainAllowedDeviceIds) ? ui.mainAllowedDeviceIds : [],
            deviceLabelOverrides: (ui.deviceLabelOverrides && typeof ui.deviceLabelOverrides === 'object') ? ui.deviceLabelOverrides : {},
            deviceCommandAllowlist: (ui.deviceCommandAllowlist && typeof ui.deviceCommandAllowlist === 'object') ? ui.deviceCommandAllowlist : {},
            deviceHomeMetricAllowlist: (ui.deviceHomeMetricAllowlist && typeof ui.deviceHomeMetricAllowlist === 'object') ? ui.deviceHomeMetricAllowlist : {},
            accentColorId: ui.accentColorId,
            homeBackground: ui.homeBackground,
            cardOpacityScalePct: ui.cardOpacityScalePct,
            blurScalePct: ui.blurScalePct,
            secondaryTextOpacityPct: ui.secondaryTextOpacityPct,
            secondaryTextSizePct: ui.secondaryTextSizePct,
            secondaryTextColorId: ui.secondaryTextColorId,
            primaryTextOpacityPct: ui.primaryTextOpacityPct,
            primaryTextSizePct: ui.primaryTextSizePct,
            primaryTextColorId: ui.primaryTextColorId,
            cardScalePct: ui.cardScalePct,
            homeRoomColumnsXl: ui.homeRoomColumnsXl,
            homeCameraPreviewsEnabled: ui.homeCameraPreviewsEnabled,
            controlsCameraPreviewsEnabled: ui.controlsCameraPreviewsEnabled,
            cameraPreviewRefreshSeconds: ui.cameraPreviewRefreshSeconds,
            visibleCameraIds: Array.isArray(ui.visibleCameraIds) ? ui.visibleCameraIds : [],
            topCameraIds: Array.isArray(ui.topCameraIds) ? ui.topCameraIds : [],
            topCameraSize: String(ui.topCameraSize ?? 'md').trim() || 'md',
            roomCameraIds: (ui.roomCameraIds && typeof ui.roomCameraIds === 'object') ? ui.roomCameraIds : {},
            glowColorId: ui.glowColorId,
            iconColorId: ui.iconColorId,
            iconOpacityPct: ui.iconOpacityPct,
            iconSizePct: ui.iconSizePct,
        },
    };

    persistedConfig = normalizePersistedConfig({
        ...persistedConfig,
        ui: {
            ...ui,
            panelProfiles: nextProfiles,
        },
    });

    return name;
}

function applyWeatherEnvOverrides() {
    const open = settings.weather?.openMeteo || {};
    settings.weather.openMeteo = {
        ...open,
        lat: process.env.OPEN_METEO_LAT || open.lat,
        lon: process.env.OPEN_METEO_LON || open.lon,
        timezone: process.env.OPEN_METEO_TZ || open.timezone,
        temperatureUnit: process.env.OPEN_METEO_TEMPERATURE_UNIT || open.temperatureUnit,
        windSpeedUnit: process.env.OPEN_METEO_WIND_SPEED_UNIT || open.windSpeedUnit,
        precipitationUnit: process.env.OPEN_METEO_PRECIPITATION_UNIT || open.precipitationUnit,
    };
}

function loadPersistedConfig() {
    ensureDataDirs();
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            const hadAlertSounds = Boolean(raw?.ui && typeof raw.ui === 'object' && raw.ui.alertSounds && typeof raw.ui.alertSounds === 'object');
            const hadClimateTolerances = Boolean(raw?.ui && typeof raw.ui === 'object' && raw.ui.climateTolerances && typeof raw.ui.climateTolerances === 'object');
            const hadColorizeHomeValues = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'colorizeHomeValues'));
            const hadColorizeHomeValuesOpacityPct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'colorizeHomeValuesOpacityPct'));
            const hadClimateToleranceColors = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'climateToleranceColors'));
            const hadSensorIndicatorColors = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'sensorIndicatorColors'));
            const hadHomeBackground = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeBackground'));
            const hadCardOpacityScalePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'cardOpacityScalePct'));
            const hadBlurScalePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'blurScalePct'));
            const hadSecondaryTextOpacityPct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'secondaryTextOpacityPct'));
            const hadSecondaryTextSizePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'secondaryTextSizePct'));
            const hadSecondaryTextColorId = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'secondaryTextColorId'));
            const hadPrimaryTextOpacityPct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'primaryTextOpacityPct'));
            const hadPrimaryTextSizePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'primaryTextSizePct'));
            const hadPrimaryTextColorId = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'primaryTextColorId'));
            const hadCardScalePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'cardScalePct'));
            const hadHomeRoomColumnsXl = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeRoomColumnsXl'));
            const hadHomeRoomMetricColumns = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeRoomMetricColumns'));
            const hadHomeRoomMetricKeys = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeRoomMetricKeys'));
            const hadGlowColorId = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'glowColorId'));
            const hadIconColorId = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'iconColorId'));
            const hadIconOpacityPct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'iconOpacityPct'));
            const hadIconSizePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'iconSizePct'));
            persistedConfig = normalizePersistedConfig(raw);
            // If we added new fields for back-compat, write them back once.
            if (!hadAlertSounds || !hadClimateTolerances || !hadColorizeHomeValues || !hadColorizeHomeValuesOpacityPct || !hadClimateToleranceColors || !hadSensorIndicatorColors || !hadHomeBackground || !hadCardOpacityScalePct || !hadBlurScalePct || !hadSecondaryTextOpacityPct || !hadSecondaryTextSizePct || !hadSecondaryTextColorId || !hadPrimaryTextOpacityPct || !hadPrimaryTextSizePct || !hadPrimaryTextColorId || !hadCardScalePct || !hadHomeRoomColumnsXl || !hadHomeRoomMetricColumns || !hadHomeRoomMetricKeys || !hadGlowColorId || !hadIconColorId || !hadIconOpacityPct || !hadIconSizePct) {
                lastPersistedSerialized = stableStringify(raw);
                let label = 'migrate-ui-sensor-indicator-colors';
                if (!hadAlertSounds) label = 'migrate-ui-alert-sounds';
                else if (!hadClimateTolerances) label = 'migrate-ui-climate-tolerances';
                else if (!hadColorizeHomeValues) label = 'migrate-ui-colorize-home-values';
                else if (!hadColorizeHomeValuesOpacityPct) label = 'migrate-ui-colorize-home-opacity';
                else if (!hadClimateToleranceColors) label = 'migrate-ui-climate-tolerance-colors';
                else if (!hadHomeBackground) label = 'migrate-ui-home-background';
                else if (!hadCardOpacityScalePct) label = 'migrate-ui-card-opacity-scale';
                else if (!hadBlurScalePct) label = 'migrate-ui-blur-scale';
                else if (!hadSecondaryTextOpacityPct) label = 'migrate-ui-secondary-text-opacity';
                else if (!hadSecondaryTextSizePct) label = 'migrate-ui-secondary-text-size';
                else if (!hadSecondaryTextColorId) label = 'migrate-ui-secondary-text-color';
                else if (!hadPrimaryTextOpacityPct) label = 'migrate-ui-primary-text-opacity';
                else if (!hadPrimaryTextSizePct) label = 'migrate-ui-primary-text-size';
                else if (!hadPrimaryTextColorId) label = 'migrate-ui-primary-text-color';
                else if (!hadCardScalePct) label = 'migrate-ui-card-scale';
                else if (!hadHomeRoomColumnsXl) label = 'migrate-ui-home-room-columns';
                else if (!hadHomeRoomMetricColumns) label = 'migrate-ui-home-room-metric-columns';
                else if (!hadHomeRoomMetricKeys) label = 'migrate-ui-home-room-metric-keys';
                else if (!hadGlowColorId) label = 'migrate-ui-glow-color';
                else if (!hadIconColorId) label = 'migrate-ui-icon-color';
                else if (!hadIconOpacityPct) label = 'migrate-ui-icon-opacity';
                else if (!hadIconSizePct) label = 'migrate-ui-icon-size';
                persistConfigToDiskIfChanged(label, { force: true });
            }
        } else {
            persistedConfig = normalizePersistedConfig({ weather: settings.weather, rooms: [], sensors: [] });
        }

        // Derive runtime settings from persisted config
        settings.weather = persistedConfig.weather;
        applyWeatherEnvOverrides();

        lastPersistedSerialized = stableStringify(persistedConfig);
        console.log('Config loaded');
    } catch (err) {
        console.error('Error loading config.json:', err);
        persistedConfig = normalizePersistedConfig({ weather: settings.weather, rooms: [], sensors: [] });
        lastPersistedSerialized = stableStringify(persistedConfig);
        applyWeatherEnvOverrides();
    }
}

function schedulePersist(label) {
    pendingPersistLabel = label || pendingPersistLabel || 'write';
    if (pendingPersistTimeout) return;

    const now = Date.now();
    const elapsed = now - lastConfigWriteAtMs;
    const delayMs = elapsed >= 500 ? 0 : (500 - elapsed) + 25;

    pendingPersistTimeout = setTimeout(() => {
        pendingPersistTimeout = null;
        const lbl = pendingPersistLabel || 'write';
        pendingPersistLabel = null;
        // Force a write attempt now that we're past the throttle window.
        persistConfigToDiskIfChanged(lbl, { force: true });
    }, delayMs);
}

function persistConfigToDiskIfChanged(label, { force = false } = {}) {
    try {
        ensureDataDirs();
        const nextSerialized = stableStringify(persistedConfig);
        if (nextSerialized === lastPersistedSerialized) return false;

        // Prevent a tight write-loop if something is hammering config updates,
        // but do NOT drop changes: schedule a trailing write instead.
        const now = Date.now();
        if (!force && now - lastConfigWriteAtMs < 500) {
            schedulePersist(label);
            return false;
        }

        lastConfigWriteAtMs = now;
        backupFileSync(CONFIG_FILE, label || 'write');
        fs.writeFileSync(CONFIG_FILE, nextSerialized);
        lastPersistedSerialized = nextSerialized;
        return true;
    } catch (err) {
        console.error('Error saving config.json:', err);
        return false;
    }
}

loadPersistedConfig();

function rebuildRuntimeConfigFromPersisted() {
    // Ensure the UI has something meaningful immediately on startup even if
    // Hubitat polling is disabled or temporarily failing.
    config = {
        rooms: Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [],
        sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
        labels: Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [],
        ui: {
            ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
            ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
            mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
            // Back-compat
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            // Back-compat (legacy clients)
            colorScheme: persistedConfig?.ui?.accentColorId,
        },
    };
}

rebuildRuntimeConfigFromPersisted();

// --- HUBITAT MAPPER ---

// These capabilities determine whether a device is considered "relevant" and will be imported
// into config.sensors during syncHubitatDataInner().
const IMPORT_RELEVANT_CAPS = Object.freeze([
    'ContactSensor',
    'MotionSensor',
    'SmokeDetector',
    'CarbonMonoxideDetector',
    'TemperatureMeasurement',
    'RelativeHumidityMeasurement',
    'IlluminanceMeasurement',
    'Switch',
    'SwitchLevel',
]);

function mapDeviceType(capabilities, typeName) {
    if (capabilities.includes("SmokeDetector")) return "smoke";
    if (capabilities.includes("CarbonMonoxideDetector")) return "co";
    if (capabilities.includes("MotionSensor")) return "motion";
    if (capabilities.includes("ContactSensor")) return "entry";
    if (capabilities.includes("Switch")) return "switch";
    if (capabilities.includes("IlluminanceMeasurement")) return "illuminance";
    if (capabilities.includes("RelativeHumidityMeasurement")) return "humidity";
    if (capabilities.includes("TemperatureMeasurement")) return "temperature";
    return "unknown";
}

function analyzeHubitatDeviceForImport(dev) {
    const caps = Array.isArray(dev?.capabilities) ? dev.capabilities.map((c) => String(c)) : [];
    const capSet = new Set(caps);
    const relevantCapsPresent = IMPORT_RELEVANT_CAPS.filter((c) => capSet.has(c));
    const isRelevant = relevantCapsPresent.length > 0;

    // A broader, "what is it" categorization (used only for analysis output)
    const kind = (() => {
        if (capSet.has('Thermostat')) return 'thermostat';
        if (capSet.has('Lock')) return 'lock';
        if (capSet.has('GarageDoorControl')) return 'garage';
        if (capSet.has('WindowShade')) return 'shade';
        if (capSet.has('FanControl')) return 'fan';
        if (capSet.has('Valve')) return 'valve';
        if (capSet.has('WaterSensor')) return 'water';
        if (capSet.has('PresenceSensor')) return 'presence';
        if (capSet.has('AccelerationSensor')) return 'acceleration';
        if (capSet.has('Button') || capSet.has('PushableButton') || capSet.has('HoldableButton') || capSet.has('DoubleTapableButton')) return 'button';
        if (capSet.has('PowerMeter') || capSet.has('EnergyMeter')) return 'power';
        if (capSet.has('ContactSensor')) return 'contact';
        if (capSet.has('MotionSensor')) return 'motion';
        if (capSet.has('SmokeDetector') || capSet.has('CarbonMonoxideDetector')) return 'safety';
        if (capSet.has('Switch') || capSet.has('SwitchLevel')) return 'switch';
        if (capSet.has('TemperatureMeasurement') || capSet.has('RelativeHumidityMeasurement') || capSet.has('IlluminanceMeasurement')) return 'environment';
        return 'unknown';
    })();

    const reasons = [];
    if (!isRelevant) reasons.push('no_relevant_capabilities');
    if (!Array.isArray(dev?.capabilities) || dev.capabilities.length === 0) reasons.push('missing_capabilities');

    // Mirror the sync pipeline mapping for the devices that WOULD be imported.
    let mappedType = null;
    let mappedState = null;
    if (isRelevant) {
        try {
            mappedType = mapDeviceType(caps, dev?.type);
        } catch {
            mappedType = 'unknown';
        }
        try {
            mappedState = mapState(dev, mappedType);
        } catch {
            mappedState = null;
        }
    }

    return {
        isRelevant,
        relevantCapsPresent,
        kind,
        mappedType,
        mappedState,
        reasons,
    };
}

function summarizeAdvancedDeviceAnalysis(analyzedDevices) {
    const out = {
        total: 0,
        imported: 0,
        ignored: 0,
        byKind: {},
        ignoredCapabilitiesTop: [],
    };

    const ignoredCapsCounts = new Map();
    const bump = (obj, key) => {
        const k = String(key || 'unknown');
        obj[k] = (obj[k] || 0) + 1;
    };

    const devices = Array.isArray(analyzedDevices) ? analyzedDevices : [];
    out.total = devices.length;

    for (const d of devices) {
        const analysis = d?.analysis;
        const isRelevant = Boolean(analysis?.isRelevant);
        if (isRelevant) out.imported += 1;
        else out.ignored += 1;

        bump(out.byKind, analysis?.kind);

        if (!isRelevant) {
            const caps = Array.isArray(d?.capabilities) ? d.capabilities.map((c) => String(c)) : [];
            for (const c of caps) {
                if (IMPORT_RELEVANT_CAPS.includes(c)) continue;
                ignoredCapsCounts.set(c, (ignoredCapsCounts.get(c) || 0) + 1);
            }
        }
    }

    const ignoredTop = Array.from(ignoredCapsCounts.entries())
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, 30)
        .map(([capability, count]) => ({ capability, count }));
    out.ignoredCapabilitiesTop = ignoredTop;

    return out;
}

function mapState(device, appType) {
    const attrs = device.attributes;
    if (appType === 'smoke') return attrs.smoke === 'detected' ? 'alarm' : 'closed';
    if (appType === 'co') return attrs.carbonMonoxide === 'detected' ? 'alarm' : 'closed';
    if (appType === 'motion') return attrs.motion === 'active' ? 'open' : 'closed';
    if (appType === 'switch') return attrs.switch === 'on' ? 'on' : 'off';
    if (appType === 'temperature' || appType === 'humidity' || appType === 'illuminance') return 'ok';
    return attrs.contact === 'open' ? 'open' : 'closed';
}

function pickAttributes(attrs = {}) {
    // Keep payload small but include what the tablet UI needs.
    return {
        battery: attrs.battery,
        temperature: attrs.temperature,
        humidity: attrs.humidity,
        illuminance: attrs.illuminance,
        pressure: attrs.pressure,
        weather: attrs.weather,
        weatherSummary: attrs.weatherSummary,
        condition_text: attrs.condition_text,
        city: attrs.city,
        percentPrecip: attrs.percentPrecip,
        forecast_text: attrs.forecast_text,
        forecast_text1: attrs.forecast_text1,
        forecast_text2: attrs.forecast_text2,
        forecastHigh1: attrs.forecastHigh1,
        forecastLow1: attrs.forecastLow1,
        forecastHigh2: attrs.forecastHigh2,
        forecastLow2: attrs.forecastLow2,
        localSunrise: attrs.localSunrise,
        localSunset: attrs.localSunset,
        windSpeed: attrs.windSpeed,
        wind_direction: attrs.wind_direction,
        wind_string: attrs.wind_string,
        motion: attrs.motion,
        contact: attrs.contact,
        smoke: attrs.smoke,
        carbonMonoxide: attrs.carbonMonoxide,
        switch: attrs.switch,
        level: attrs.level,
    };
}

function pickCommands(commands = []) {
    try {
        return commands.map(c => c?.command).filter(Boolean);
    } catch {
        return [];
    }
}

function parseDmsOrDecimal(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    // Decimal
    const asDec = Number(raw);
    if (Number.isFinite(asDec)) return asDec;

    // DMS like: 35°29'44.9"N
    const m = raw.match(/^(\d+(?:\.\d+)?)\s*[°]\s*(\d+(?:\.\d+)?)\s*['’]\s*(\d+(?:\.\d+)?)\s*(?:["”])?\s*([NSEW])$/i);
    if (!m) return null;

    const deg = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    const hemi = String(m[4]).toUpperCase();
    if (![deg, min, sec].every(Number.isFinite)) return null;

    let dec = deg + (min / 60) + (sec / 3600);
    if (hemi === 'S' || hemi === 'W') dec = -dec;
    return dec;
}

function getOpenMeteoCoords() {
    const open = settings?.weather?.openMeteo || {};
    const lat = parseDmsOrDecimal(open.lat);
    const lon = parseDmsOrDecimal(open.lon);
    return { lat, lon };
}

async function fetchOpenMeteoForecast() {
    const { lat, lon } = getOpenMeteoCoords();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Invalid OPEN_METEO_LAT/OPEN_METEO_LON (must be decimal or DMS)');
    }

    const open = settings?.weather?.openMeteo || {};

    // Current + daily + hourly. Keep fields focused on what the UI needs.
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('timezone', open.timezone || 'auto');
    url.searchParams.set('temperature_unit', open.temperatureUnit || 'fahrenheit');
    url.searchParams.set('wind_speed_unit', open.windSpeedUnit || 'mph');
    url.searchParams.set('precipitation_unit', open.precipitationUnit || 'inch');
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('current', [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'precipitation',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m'
    ].join(','));
    url.searchParams.set('hourly', [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'precipitation',
        'precipitation_probability',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m'
    ].join(','));
    url.searchParams.set('daily', [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
    ].join(','));

    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Open-Meteo error: ${res.status} ${text}`);
    }
    const data = await res.json();

    lastWeather = data;
    lastWeatherFetchAt = new Date().toISOString();
    lastWeatherError = null;
    return data;
}

function asFiniteNumber(value) {
    const num = (typeof value === 'number') ? value : Number(String(value));
    return Number.isFinite(num) ? num : null;
}

function normalizeOpenMeteoPayload(raw) {
    const open = settings?.weather?.openMeteo || {};
    const { lat, lon } = getOpenMeteoCoords();

    const current = raw && typeof raw === 'object' ? raw.current : null;
    const hourlyRaw = raw && typeof raw === 'object' ? raw.hourly : null;
    const dailyRaw = raw && typeof raw === 'object' ? raw.daily : null;

    const hourly = [];
    if (hourlyRaw && typeof hourlyRaw === 'object' && Array.isArray(hourlyRaw.time)) {
        const len = hourlyRaw.time.length;
        for (let i = 0; i < len; i += 1) {
            const time = (typeof hourlyRaw.time[i] === 'string') ? hourlyRaw.time[i] : null;
            hourly.push({
                time,
                temperature: asFiniteNumber(hourlyRaw.temperature_2m?.[i]),
                humidity: asFiniteNumber(hourlyRaw.relative_humidity_2m?.[i]),
                apparentTemperature: asFiniteNumber(hourlyRaw.apparent_temperature?.[i]),
                precipitation: asFiniteNumber(hourlyRaw.precipitation?.[i]),
                precipitationProbability: asFiniteNumber(hourlyRaw.precipitation_probability?.[i]),
                weatherCode: asFiniteNumber(hourlyRaw.weather_code?.[i]),
                windSpeed: asFiniteNumber(hourlyRaw.wind_speed_10m?.[i]),
                windDirection: asFiniteNumber(hourlyRaw.wind_direction_10m?.[i]),
            });
        }
    }

    const daily = [];
    if (dailyRaw && typeof dailyRaw === 'object' && Array.isArray(dailyRaw.time)) {
        const len = dailyRaw.time.length;
        for (let i = 0; i < len; i += 1) {
            const date = (typeof dailyRaw.time[i] === 'string') ? dailyRaw.time[i] : null;
            daily.push({
                date,
                weatherCode: asFiniteNumber(dailyRaw.weather_code?.[i]),
                temperatureMax: asFiniteNumber(dailyRaw.temperature_2m_max?.[i]),
                temperatureMin: asFiniteNumber(dailyRaw.temperature_2m_min?.[i]),
                precipitationProbabilityMax: asFiniteNumber(dailyRaw.precipitation_probability_max?.[i]),
            });
        }
    }

    const today = daily.length ? daily[0] : null;

    return {
        source: 'open-meteo',
        fetchedAt: lastWeatherFetchAt,
        location: {
            lat: Number.isFinite(lat) ? lat : null,
            lon: Number.isFinite(lon) ? lon : null,
            timezone: (raw && typeof raw === 'object' && typeof raw.timezone === 'string')
                ? raw.timezone
                : (open.timezone || 'auto'),
        },
        units: {
            temperature: open.temperatureUnit || 'fahrenheit',
            windSpeed: open.windSpeedUnit || 'mph',
            precipitation: open.precipitationUnit || 'inch',
        },
        current: current ? {
            temperature: asFiniteNumber(current.temperature_2m),
            humidity: asFiniteNumber(current.relative_humidity_2m),
            apparentTemperature: asFiniteNumber(current.apparent_temperature),
            precipitation: asFiniteNumber(current.precipitation),
            weatherCode: asFiniteNumber(current.weather_code),
            windSpeed: asFiniteNumber(current.wind_speed_10m),
            windDirection: asFiniteNumber(current.wind_direction_10m),
            time: (typeof current.time === 'string') ? current.time : null,
        } : {
            temperature: null,
            humidity: null,
            apparentTemperature: null,
            precipitation: null,
            weatherCode: null,
            windSpeed: null,
            windDirection: null,
            time: null,
        },
        today: today ? {
            weatherCode: today.weatherCode,
            temperatureMax: today.temperatureMax,
            temperatureMin: today.temperatureMin,
            precipitationProbabilityMax: today.precipitationProbabilityMax,
            date: today.date,
        } : {
            weatherCode: null,
            temperatureMax: null,
            temperatureMin: null,
            precipitationProbabilityMax: null,
            date: null,
        },
        hourly,
        daily,
    };
}

let hubitatSyncInFlight = null;
let hubitatSyncQueued = false;

async function syncHubitatDataInner() {
    try {
        const devices = await fetchHubitatAllDevices();

        const existingRooms = Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [];
        const existingSensors = Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [];

        const norm = (s) => String(s || '').trim().toLowerCase();

        const discoveredRoomNames = new Set();
        const discoveredRoomIds = new Set();
        for (const dev of devices) {
            const roomName = dev?.room || 'Unassigned';
            const roomNameNorm = norm(roomName);
            if (!roomNameNorm) continue;
            discoveredRoomNames.add(roomNameNorm);
            discoveredRoomIds.add(String(roomName).toLowerCase().replace(/[^a-z0-9]/g, '_'));
        }

        // Migration: rooms that exist only in config.json (not discovered from Hubitat)
        // are considered "manual" so they appear in the Config UI for optional removal.
        // This helps older setups where rooms were added by editing config.json.
        let migratedAnyRooms = false;
        for (const r of existingRooms) {
            if (!r || typeof r !== 'object') continue;
            if (r.manual === true) continue;
            const id = String(r.id || '').trim();
            const nameNorm = norm(r.name || r.id);
            const isDiscovered = (id && discoveredRoomIds.has(id)) || (nameNorm && discoveredRoomNames.has(nameNorm));
            if (!isDiscovered) {
                r.manual = true;
                migratedAnyRooms = true;
            }
        }
        if (migratedAnyRooms) {
            persistedConfig = normalizePersistedConfig({
                ...persistedConfig,
                rooms: existingRooms,
            });
            persistConfigToDiskIfChanged('migrate-rooms-manual');
        }

        const roomByName = new Map(existingRooms.map(r => [norm(r?.name), r]));
        const roomById = new Map(existingRooms.map(r => [String(r?.id), r]));
        const sensorById = new Map(existingSensors.map(s => [String(s?.id), s]));

        const newRoomsById = new Map();
        const newSensorsById = new Map();
        const newStatuses = {};
        const roomSensorCounts = {};

        devices.forEach(dev => {
            const isRelevant = dev.capabilities?.some(c => IMPORT_RELEVANT_CAPS.includes(c));
            if (!isRelevant) return;

            // ROOMS (persisted by id; mapped by Hubitat's room display name)
            const roomName = dev.room || "Unassigned";
            const existingRoom = roomByName.get(norm(roomName));

            const roomId = existingRoom?.id
                ? String(existingRoom.id)
                : String(roomName).toLowerCase().replace(/[^a-z0-9]/g, '_');

            if (!newRoomsById.has(roomId)) {
                const keep = roomById.get(roomId) || { id: roomId, name: roomName };
                const savedLayout = keep?.layout || {};
                newRoomsById.set(roomId, {
                    id: roomId,
                    name: keep?.name || roomName,
                    manual: keep?.manual === true,
                    floor: keep?.floor ?? 1,
                    gridArea: keep?.gridArea,
                    opacity: keep?.opacity,
                    layout: {
                        x: Number.isFinite(savedLayout?.x) ? savedLayout.x : 0,
                        y: Number.isFinite(savedLayout?.y) ? savedLayout.y : 9999,
                        w: Number.isFinite(savedLayout?.w) ? savedLayout.w : 2,
                        h: Number.isFinite(savedLayout?.h) ? savedLayout.h : 3,
                    },
                });
            }

            // TYPE & STATE
            const type = mapDeviceType(dev.capabilities, dev.type);
            const state = mapState(dev, type);

            // SENSOR (persist position in config.json)
            const existingSensor = sensorById.get(String(dev.id));
            let position = existingSensor?.position;
            if (!(position && Number.isFinite(position.x) && Number.isFinite(position.y))) {
                // Auto-layout: Distribute new sensors so they don't stack
                const count = (roomSensorCounts[roomId] || 0);
                roomSensorCounts[roomId] = count + 1;

                // Grid layout: 3 columns using percentages
                // Map columns to ~10%, 40%, 70% width
                // Map rows to ~20%, 50%, 80% height
                const col = count % 3;
                const row = Math.floor(count / 3);

                position = {
                    x: 0.10 + (col * 0.30),
                    y: 0.12 + (row * 0.30)
                };
            }

            newSensorsById.set(String(dev.id), {
                id: dev.id,
                roomId: roomId,
                label: dev.label,
                type: type,
                capabilities: dev.capabilities,
                metadata: { battery: dev.attributes?.battery },
                position
            });

            newStatuses[dev.id] = {
                id: dev.id,
                label: dev.label,
                roomId,
                capabilities: dev.capabilities,
                commands: pickCommands(dev.commands),
                type,
                state,
                attributes: pickAttributes(dev.attributes),
                lastUpdated: new Date().toISOString(),
            };
        });

        // Preserve existing room ordering where possible
        const orderedRooms = [];
        for (const r of existingRooms) {
            const id = String(r?.id || '');
            if (!id) continue;
            const next = newRoomsById.get(id);
            if (next) orderedRooms.push(next);
        }
        for (const next of newRoomsById.values()) {
            if (!orderedRooms.some(r => r.id === next.id)) orderedRooms.push(next);
        }

        // Also include rooms that exist only in persisted config (manual rooms).
        // They may have zero devices today but should still be visible in the editor.
        const mergedRooms = [...orderedRooms];
        const mergedRoomIds = new Set(mergedRooms.map(r => String(r?.id)));
        for (const r of existingRooms) {
            const id = String(r?.id || '');
            if (!id || mergedRoomIds.has(id)) continue;
            const savedLayout = r?.layout || {};
            mergedRooms.push({
                id,
                name: r?.name || id,
                manual: r?.manual === true,
                floor: r?.floor ?? 1,
                gridArea: r?.gridArea,
                opacity: r?.opacity,
                layout: {
                    x: Number.isFinite(savedLayout?.x) ? savedLayout.x : 0,
                    y: Number.isFinite(savedLayout?.y) ? savedLayout.y : 9999,
                    w: Number.isFinite(savedLayout?.w) ? savedLayout.w : 2,
                    h: Number.isFinite(savedLayout?.h) ? savedLayout.h : 3,
                },
            });
            mergedRoomIds.add(id);
        }

        const orderedSensors = [];
        for (const s of existingSensors) {
            const id = String(s?.id || '');
            if (!id) continue;
            const next = newSensorsById.get(id);
            if (next) orderedSensors.push(next);
        }
        for (const next of newSensorsById.values()) {
            if (!orderedSensors.some(s => String(s.id) === String(next.id))) orderedSensors.push(next);
        }

        config = {
            rooms: mergedRooms,
            sensors: orderedSensors,
            labels: Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [],
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                // Back-compat
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        sensorStatuses = newStatuses;

        // Persisted config becomes source of truth for layout + mapping.
        // IMPORTANT: do not delete rooms that exist in config.json but are not currently discovered.
        // This allows manually-added rooms to remain stable in config.json.

        const persistedRooms = Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [];
        const persistedRoomsById = new Map(persistedRooms.map(r => [String(r?.id), r]));

        // Update persisted rooms that are currently discovered/monitored
        for (const r of config.rooms) {
            const id = String(r?.id || '');
            if (!id) continue;
            const prev = persistedRoomsById.get(id);
            if (prev) {
                Object.assign(prev, r);
            } else {
                persistedRooms.push(r);
                persistedRoomsById.set(id, r);
            }
        }

        // Sensors: keep in sync with currently discovered devices
        persistedConfig = normalizePersistedConfig({
            ...persistedConfig,
            weather: persistedConfig.weather,
            rooms: persistedRooms,
            sensors: config.sensors,
            labels: persistedConfig.labels,
        });

        io.emit('config_update', config);
        io.emit('device_refresh', sensorStatuses);

    } catch (err) {
        lastHubitatError = describeFetchError(err);
        const now = Date.now();
        // Throttle to avoid log spam if Hubitat is down.
        if (now - lastHubitatErrorLoggedAt > 30_000) {
            lastHubitatErrorLoggedAt = now;
            console.error("Hubitat polling error:", lastHubitatError);
        }
    }
}

// Ensure sync calls cannot overlap (polling + manual refresh + device command triggers).
// Overlapping syncs can race and temporarily overwrite fresher state with older payloads.
async function syncHubitatData() {
    if (hubitatSyncInFlight) {
        hubitatSyncQueued = true;
        return hubitatSyncInFlight;
    }

    hubitatSyncInFlight = (async () => {
        await syncHubitatDataInner();
    })();

    try {
        return await hubitatSyncInFlight;
    } finally {
        hubitatSyncInFlight = null;
        if (hubitatSyncQueued) {
            hubitatSyncQueued = false;
            // Fire-and-return (callers already awaited the in-flight sync above).
            syncHubitatData();
        }
    }
}

async function fetchHubitatAllDevices() {
    if (!HUBITAT_CONFIGURED) {
        throw new Error('Hubitat not configured. Set HUBITAT_HOST, HUBITAT_APP_ID, and HUBITAT_ACCESS_TOKEN to enable Hubitat polling.');
    }
    let res;
    try {
        res = await hubitatFetch(HUBITAT_API_URL);
    } catch (err) {
        const safeUrl = redactAccessToken(HUBITAT_API_URL);
        throw new Error(`Hubitat fetch failed: ${describeFetchError(err)} (url: ${safeUrl})`);
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Hubitat API Error: ${res.status} ${text}`);
    }
    const raw = await res.text().catch(() => '');
    if (!raw.trim()) {
        throw new Error('Hubitat API returned an empty response body');
    }

    let devices;
    try {
        devices = JSON.parse(raw);
    } catch (err) {
        const contentType = res.headers.get('content-type') || '';
        const snippet = raw.slice(0, 300).replace(/\s+/g, ' ').trim();
        throw new Error(`Hubitat API returned invalid JSON (content-type: ${contentType || 'unknown'}). Snippet: ${snippet}`);
    }
    if (!Array.isArray(devices)) {
        throw new Error(`Hubitat API returned non-array payload`);
    }

    lastHubitatDevices = devices;
    lastHubitatFetchAt = new Date().toISOString();
    lastHubitatError = null;
    return devices;
}


if (HUBITAT_CONFIGURED) {
    setInterval(syncHubitatData, HUBITAT_POLL_INTERVAL_MS);
    syncHubitatData();
} else {
    lastHubitatError = 'Hubitat not configured. Set HUBITAT_HOST, HUBITAT_APP_ID, and HUBITAT_ACCESS_TOKEN to enable Hubitat polling.';
    console.warn(lastHubitatError);
}

function applyPostedEventToStatuses(payload) {
    try {
        const deviceId = payload?.deviceId ?? payload?.device_id ?? payload?.id;
        const attrName = payload?.name ?? payload?.attribute;
        const attrValue = payload?.value;
        if (deviceId === undefined || deviceId === null) return false;
        if (!attrName) return false;

        const id = String(deviceId);
        const existing = sensorStatuses?.[id];
        if (!existing) return false;

        const next = {
            ...existing,
            attributes: {
                ...(existing.attributes || {}),
                [String(attrName)]: attrValue,
            },
            lastUpdated: new Date().toISOString(),
        };

        // Recompute high-level state when possible.
        try {
            next.state = mapState({ attributes: next.attributes }, next.type);
        } catch {
            // ignore
        }

        // Preserve/refresh label if the payload includes it.
        if (payload?.displayName) next.label = payload.displayName;

        sensorStatuses = { ...(sensorStatuses || {}), [id]: next };
        return true;
    } catch {
        return false;
    }
}

// --- API ---

function getPublicCamerasList() {
    const ui = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
    const cams = Array.isArray(ui.cameras) ? ui.cameras : [];
    return cams
        .map((c) => {
            const id = String(c?.id || '').trim();
            if (!id) return null;
            const label = String(c?.label || id).trim() || id;
            const enabled = c?.enabled !== false;
            const hasSnapshot = Boolean(c?.snapshot && typeof c.snapshot === 'object' && typeof c.snapshot.url === 'string' && c.snapshot.url.trim());
            const defaultRoomId = String(c?.defaultRoomId || c?.roomId || '').trim();
            const embedUrl = (c?.embed && typeof c.embed === 'object' && typeof c.embed.url === 'string') ? String(c.embed.url).trim() : '';
            const rtspUrl = (c?.rtsp && typeof c.rtsp === 'object' && typeof c.rtsp.url === 'string') ? String(c.rtsp.url).trim() : '';
            const hasEmbed = Boolean(embedUrl);
            const hasRtsp = Boolean(rtspUrl);
            return {
                id,
                label,
                enabled,
                ...(defaultRoomId ? { defaultRoomId } : {}),
                hasSnapshot,
                hasEmbed,
                ...(hasEmbed ? { embedUrl } : {}),
                hasRtsp,
            };
        })
        .filter(Boolean);
}

function getClientSafeConfig() {
    const allowlists = getUiAllowlistsInfo();
    const publicCameras = getPublicCamerasList();
    return {
        ...config,
        ui: {
            ...(config?.ui || {}),
            // Do not leak snapshot URLs or credentials to the browser.
            cameras: publicCameras,
            ctrlAllowedDeviceIds: allowlists.ctrl.ids,
            mainAllowedDeviceIds: allowlists.main.ids,
            // Back-compat for older clients
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),

            ctrlAllowlistSource: allowlists.ctrl.source,
            ctrlAllowlistLocked: allowlists.ctrl.locked,
            mainAllowlistSource: allowlists.main.source,
            mainAllowlistLocked: allowlists.main.locked,
        },
    };
}

// Ensure any socket "config_update" payloads are sanitized.
// This avoids leaking camera snapshot URLs/auth via websockets.
try {
    const rawEmit = io.emit.bind(io);
    // eslint-disable-next-line no-param-reassign
    io.emit = (event, ...args) => {
        if (event === 'config_update') {
            return rawEmit('config_update', getClientSafeConfig());
        }
        return rawEmit(event, ...args);
    };
} catch {
    // ignore
}

function getCameraById(cameraId) {
    const id = String(cameraId || '').trim();
    if (!id) return null;
    const ui = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
    const cams = Array.isArray(ui.cameras) ? ui.cameras : [];
    return cams.find((c) => String(c?.id || '').trim() === id) || null;
}

// If we have a built UI, serve it at '/'. Otherwise provide a simple health message.
app.get('/', (req, res) => {
    if (HAS_BUILT_CLIENT) return res.sendFile(CLIENT_INDEX_HTML);
    return res.send('Home Automation Server - Layout Enabled');
});

app.get('/api/cameras', (req, res) => {
    res.json({ ok: true, cameras: getPublicCamerasList() });
});

// --- HLS (RTSP -> HTTPS-friendly playback) ---
app.get('/api/cameras/:id/hls/ensure', async (req, res) => {
    try {
        const cameraId = String(req.params.id || '').trim();
        const camera = getCameraById(cameraId);
        if (!camera) {
            return res.status(404).json({ ok: false, error: 'camera_not_found' });
        }
        const rtspUrl = camera?.rtsp?.url;
        if (!rtspUrl) {
            return res.status(400).json({ ok: false, error: 'camera_has_no_rtsp_url' });
        }

        // Reuse existing ffmpeg preflight (respects FFMPEG_PATH).
        const ffmpegPath = String(process.env.FFMPEG_PATH || '').trim() || null;
        const ffmpegCheck = checkFfmpegAvailable(ffmpegPath);
        if (!ffmpegCheck.ok) {
            return res.status(500).json({ ok: false, error: 'ffmpeg_not_available', detail: ffmpegCheck.error || null });
        }

        const state = startHlsStream(cameraId, rtspUrl, ffmpegPath);
        if (!state) {
            return res.status(500).json({ ok: false, error: 'failed_to_start_hls' });
        }

        const hasAnySegment = () => {
            try {
                const entries = fs.readdirSync(state.dir, { withFileTypes: true });
                return entries.some((e) => e.isFile() && /^seg_\d+\.ts$/i.test(e.name));
            } catch {
                return false;
            }
        };

        // Wait until playlist appears (or timeout).
        const deadline = Date.now() + RTSP_HLS_STARTUP_TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (fs.existsSync(state.playlistPath)) break;
            if (hasAnySegment()) break;
            if (state.ffmpeg && state.ffmpeg.exitCode !== null) break;
            await new Promise((r) => setTimeout(r, 150));
        }

        if (state.ffmpeg && state.ffmpeg.exitCode !== null && !fs.existsSync(state.playlistPath)) {
            return res.status(502).json({
                ok: false,
                error: 'hls_ffmpeg_exited',
                exitCode: state.ffmpeg.exitCode,
                lastError: state.lastError || null,
            });
        }

        if (!fs.existsSync(state.playlistPath)) {
            return res.status(502).json({
                ok: false,
                error: 'hls_start_timeout',
                timeoutMs: RTSP_HLS_STARTUP_TIMEOUT_MS,
                lastError: state.lastError || null,
            });
        }

        return res.json({
            ok: true,
            playlistUrl: buildHttpUrl(req, `/api/cameras/${encodeURIComponent(cameraId)}/hls/playlist.m3u8`),
        });
    } catch (err) {
        console.error('HLS ensure error', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

app.get('/api/cameras/:id/hls/playlist.m3u8', async (req, res) => {
    try {
        const cameraId = String(req.params.id || '').trim();
        const state = hlsStreams.get(cameraId);
        if (!state) {
            return res.status(404).send('not_started');
        }
        if (!fs.existsSync(state.playlistPath)) {
            return res.status(404).send('playlist_missing');
        }

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(fs.readFileSync(state.playlistPath, 'utf8'));
    } catch (err) {
        console.error('HLS playlist error', err);
        return res.status(500).send('internal_error');
    }
});

app.get('/api/cameras/:id/hls/:segment', async (req, res) => {
    try {
        const cameraId = String(req.params.id || '').trim();
        const segment = String(req.params.segment || '').trim();
        if (!/^seg_\d+\.ts$/i.test(segment)) {
            return res.status(400).send('invalid_segment');
        }
        const state = hlsStreams.get(cameraId);
        if (!state) {
            return res.status(404).send('not_started');
        }
        const segmentPath = path.join(state.dir, segment);
        if (!fs.existsSync(segmentPath)) {
            return res.status(404).send('missing');
        }
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Cache-Control', 'no-store');
        return res.sendFile(segmentPath);
    } catch (err) {
        console.error('HLS segment error', err);
        return res.status(500).send('internal_error');
    }
});

app.get('/api/cameras/:id/snapshot', async (req, res) => {
    try {
        const cam = getCameraById(req.params.id);
        if (!cam || cam.enabled === false) {
            res.status(404).json({ ok: false, error: 'Camera not found' });
            return;
        }

        const snap = (cam.snapshot && typeof cam.snapshot === 'object') ? cam.snapshot : {};
        const url = String(snap.url || '').trim();
        if (!url) {
            res.status(404).json({ ok: false, error: 'No snapshot configured' });
            return;
        }

        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            res.status(400).json({ ok: false, error: 'Invalid snapshot URL' });
            return;
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            res.status(400).json({ ok: false, error: 'Snapshot URL must be http(s)' });
            return;
        }

        const headers = {};
        const auth = (snap.basicAuth && typeof snap.basicAuth === 'object') ? snap.basicAuth : null;
        const user = auth ? String(auth.username ?? '').trim() : '';
        const pass = auth ? String(auth.password ?? '').trim() : '';
        if (user || pass) {
            headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
        }

        const ctrl = new AbortController();
        const timeoutMs = 8000;
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        let upstream;
        try {
            upstream = await fetch(url, {
                method: 'GET',
                headers,
                signal: ctrl.signal,
            });
        } finally {
            clearTimeout(t);
        }

        if (!upstream.ok) {
            const text = await upstream.text().catch(() => '');
            res.status(502).json({ ok: false, error: text || `Snapshot fetch failed (${upstream.status})` });
            return;
        }

        const ct = upstream.headers.get('content-type') || 'image/jpeg';
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length > 8 * 1024 * 1024) {
            res.status(413).json({ ok: false, error: 'Snapshot too large' });
            return;
        }

        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(buf);
    } catch (err) {
        const msg = err?.name === 'AbortError' ? 'Snapshot timed out' : (err?.message || String(err));
        res.status(500).json({ ok: false, error: msg });
    }
});

app.get('/api/config', (req, res) => {
    // Persist the latest discovered mapping/layout into config.json.
    // This makes config.json the stable source of truth.
    persistConfigToDiskIfChanged('api-config');
    res.json(getClientSafeConfig());
});
app.get('/api/status', (req, res) => res.json(sensorStatuses));

app.get('/api/sounds', (req, res) => {
    try {
        ensureDataDirs();
        const exts = new Set(['.mp3', '.wav', '.ogg']);
        const files = fs.readdirSync(SOUNDS_DIR, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => d.name)
            .filter((name) => exts.has(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b));

        res.json({ ok: true, files });
    } catch (err) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

app.get('/api/backgrounds', (req, res) => {
    try {
        ensureDataDirs();
        const exts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
        const safeNameRe = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}(\.[a-zA-Z0-9]{1,8})$/;
        const files = fs.readdirSync(BACKGROUNDS_DIR, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => d.name)
            .filter((name) => {
                if (!name || typeof name !== 'string') return false;
                if (name !== path.basename(name)) return false;
                if (!safeNameRe.test(name)) return false;
                if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
                return exts.has(path.extname(name).toLowerCase());
            })
            .sort((a, b) => a.localeCompare(b));

        res.json({ ok: true, files });
    } catch (err) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

function slugifyId(input) {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
}

function emitConfigUpdateSafe() {
    try {
        io.emit('config_update', config);
    } catch {
        // ignore
    }
}

function redactUrlPassword(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) return '';
    try {
        const u = new URL(url);
        if (!u.password) return url;
        u.password = '***';
        return u.toString();
    } catch {
        // Not parseable by WHATWG URL (rtsp:// is usually parseable in Node, but be safe).
        return url.replace(/:(?!\/\/)([^@/]+)@/, ':***@');
    }
}

function redactCameraForUi(cam) {
    if (!cam || typeof cam !== 'object') return null;
    const id = String(cam.id || '').trim();
    if (!id) return null;
    const label = String(cam.label || id).trim() || id;
    const enabled = cam.enabled !== false;
    const defaultRoomId = String(cam.defaultRoomId || cam.roomId || '').trim();

    const snap = (cam.snapshot && typeof cam.snapshot === 'object') ? cam.snapshot : null;
    const snapUrl = snap ? String(snap.url || '').trim() : '';
    const auth = snap && snap.basicAuth && typeof snap.basicAuth === 'object' ? snap.basicAuth : null;
    const user = auth ? String(auth.username ?? '').trim() : '';
    const hasPassword = Boolean(auth && String(auth.password ?? '').trim());

    const embed = (cam.embed && typeof cam.embed === 'object') ? cam.embed : null;
    const embedUrl = embed ? String(embed.url || '').trim() : '';

    const rtsp = (cam.rtsp && typeof cam.rtsp === 'object') ? cam.rtsp : null;
    const rtspUrl = rtsp ? redactUrlPassword(rtsp.url) : '';

    return {
        id,
        label,
        enabled,
        ...(defaultRoomId ? { defaultRoomId } : {}),
        ...(snapUrl ? {
            snapshot: {
                url: snapUrl,
                ...(user || hasPassword ? { basicAuth: { username: user, hasPassword } } : {}),
            },
        } : {}),
                ...(embedUrl ? { embed: { url: embedUrl } } : {}),
                ...(rtspUrl ? { rtsp: { url: rtspUrl } } : {}),
    };
}

// Create/delete manual rooms (rooms not discovered via Maker API)
app.post('/api/rooms', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing name' });

    const baseId = slugifyId(name);
    if (!baseId) return res.status(400).json({ error: 'Invalid name' });

    const roomsArr = Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [];
    const existingIds = new Set(roomsArr.map((r) => String(r?.id)));

    let id = baseId;
    let i = 2;
    while (existingIds.has(id)) {
        id = `${baseId}_${i}`;
        i += 1;
    }

    const room = {
        id,
        name,
        manual: true,
        floor: 1,
        layout: { x: 0, y: 9999, w: 2, h: 3 },
    };

    roomsArr.push(room);
    persistedConfig.rooms = roomsArr;
    persistConfigToDiskIfChanged('api-room-add');

    if (HUBITAT_CONFIGURED) {
        syncHubitatData();
    } else {
        config = {
            rooms: persistedConfig.rooms,
            sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
            labels: Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [],
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        emitConfigUpdateSafe();
    }

    return res.json({ ok: true, room });
});

app.delete('/api/rooms/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const roomsArr = Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [];
    const room = roomsArr.find((r) => String(r?.id) === id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.manual !== true) {
        return res.status(409).json({
            error: 'Not removable',
            message: 'Only manual rooms can be deleted from the kiosk config.',
        });
    }

    const sensorsArr = Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [];
    // If sensors are assigned to this manual room, unassign them so the room can be removed.
    // This matches kiosk expectations: deleting a room shouldn't be blocked by stale mappings.
    const nextSensors = sensorsArr.map((s) => (
        String(s?.roomId) === id
            ? { ...(s || {}), roomId: '' }
            : s
    ));
    persistedConfig.sensors = nextSensors;

    persistedConfig.rooms = roomsArr.filter((r) => String(r?.id) !== id);
    persistConfigToDiskIfChanged('api-room-delete');

    if (HUBITAT_CONFIGURED) {
        syncHubitatData();
    } else {
        config = {
            rooms: persistedConfig.rooms,
            sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
            labels: Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [],
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        emitConfigUpdateSafe();
    }

    return res.json({ ok: true });
});

// Labels (freeform text boxes placed on the Heatmap grid)
app.post('/api/labels', (req, res) => {
    const text = String(req.body?.text ?? 'Label').trim() || 'Label';
    const labelsArr = Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [];

    const id = `lbl_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
    const label = {
        id,
        text,
        layout: { x: 0, y: 9999, w: 2, h: 1 },
    };

    labelsArr.push(label);
    persistedConfig.labels = labelsArr;
    persistConfigToDiskIfChanged('api-label-add');

    if (HUBITAT_CONFIGURED) {
        syncHubitatData();
    } else {
        config = {
            rooms: Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [],
            sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
            labels: persistedConfig.labels,
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        emitConfigUpdateSafe();
    }

    return res.json({ ok: true, label });
});

app.put('/api/labels/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const labelsArr = Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [];
    const label = labelsArr.find((l) => String(l?.id) === id);
    if (!label) return res.status(404).json({ error: 'Label not found' });
    label.text = text;

    persistedConfig.labels = labelsArr;
    persistConfigToDiskIfChanged('api-label-update');

    if (HUBITAT_CONFIGURED) {
        syncHubitatData();
    } else {
        config = {
            rooms: Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [],
            sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
            labels: persistedConfig.labels,
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        emitConfigUpdateSafe();
    }

    return res.json({ ok: true, label });
});

app.delete('/api/labels/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const labelsArr = Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [];
    const before = labelsArr.length;
    const next = labelsArr.filter((l) => String(l?.id) !== id);
    if (next.length === before) return res.status(404).json({ error: 'Label not found' });

    persistedConfig.labels = next;
    persistConfigToDiskIfChanged('api-label-delete');

    if (HUBITAT_CONFIGURED) {
        syncHubitatData();
    } else {
        config = {
            rooms: Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [],
            sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
            labels: persistedConfig.labels,
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        emitConfigUpdateSafe();
    }

    return res.json({ ok: true });
});

// --- Camera registry (Settings -> Cameras) ---
// Note: snapshot/basicAuth passwords are never returned to the UI.
app.get('/api/ui/cameras', (req, res) => {
    const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const cams = Array.isArray(ui.cameras) ? ui.cameras : [];
    return res.json({ ok: true, cameras: cams.map(redactCameraForUi).filter(Boolean) });
});

app.post('/api/ui/cameras', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawCam = (body.camera && typeof body.camera === 'object') ? body.camera : {};
    const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const existing = Array.isArray(ui.cameras) ? ui.cameras : [];

    const requestedId = String(rawCam.id || '').trim();
    const label = String(rawCam.label || requestedId || '').trim();
    if (!label && !requestedId) {
        return res.status(400).json({ ok: false, error: 'Camera requires id or label' });
    }

    const baseId = slugifyId(requestedId || label);
    if (!baseId) {
        return res.status(400).json({ ok: false, error: 'Invalid camera id/label' });
    }

    const used = new Set(existing.map((c) => String(c?.id || '').trim()).filter(Boolean));
    let id = baseId;
    let n = 2;
    while (used.has(id)) {
        id = `${baseId}_${n}`;
        n += 1;
    }

    const cam = {
        id,
        label: label || id,
        enabled: rawCam.enabled !== false,
        defaultRoomId: String(rawCam.defaultRoomId || '').trim(),
        snapshot: rawCam.snapshot,
        embed: rawCam.embed,
        rtsp: rawCam.rtsp,
    };

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...ui,
            cameras: [...existing, cam],
        },
    });

    persistConfigToDiskIfChanged('api-ui-cameras-create');
    rebuildRuntimeConfigFromPersisted();
    io.emit('config_update', config);

    const created = (Array.isArray(persistedConfig?.ui?.cameras) ? persistedConfig.ui.cameras : [])
        .find((c) => String(c?.id || '').trim() === id);
    return res.json({ ok: true, camera: redactCameraForUi(created) });
});

app.put('/api/ui/cameras/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawCam = (body.camera && typeof body.camera === 'object') ? body.camera : {};

    const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const existing = Array.isArray(ui.cameras) ? ui.cameras : [];
    const idx = existing.findIndex((c) => String(c?.id || '').trim() === id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Camera not found' });

    const prev = existing[idx] && typeof existing[idx] === 'object' ? existing[idx] : {};
    const next = { ...prev };

    if (Object.prototype.hasOwnProperty.call(rawCam, 'label')) {
        next.label = String(rawCam.label || id).trim().slice(0, 64) || id;
    }
    if (Object.prototype.hasOwnProperty.call(rawCam, 'enabled')) {
        next.enabled = rawCam.enabled !== false;
    }
    if (Object.prototype.hasOwnProperty.call(rawCam, 'defaultRoomId')) {
        next.defaultRoomId = String(rawCam.defaultRoomId || '').trim();
    }

    // Snapshot settings (preserve password unless explicitly provided).
    if (Object.prototype.hasOwnProperty.call(rawCam, 'snapshot')) {
        const snapRaw = (rawCam.snapshot && typeof rawCam.snapshot === 'object') ? rawCam.snapshot : {};
        const prevSnap = (prev.snapshot && typeof prev.snapshot === 'object') ? prev.snapshot : {};
        const prevAuth = (prevSnap.basicAuth && typeof prevSnap.basicAuth === 'object') ? prevSnap.basicAuth : {};

        const authRaw = (snapRaw.basicAuth && typeof snapRaw.basicAuth === 'object') ? snapRaw.basicAuth : {};
        const hasPasswordField = Object.prototype.hasOwnProperty.call(authRaw, 'password');

        const nextAuth = {
            username: String(authRaw.username ?? prevAuth.username ?? '').trim(),
            password: hasPasswordField ? String(authRaw.password ?? '').trim() : String(prevAuth.password ?? '').trim(),
        };

        const url = String(snapRaw.url ?? prevSnap.url ?? '').trim();
        if (url) {
            next.snapshot = {
                url,
                ...(nextAuth.username || nextAuth.password ? { basicAuth: nextAuth } : {}),
            };
        } else {
            delete next.snapshot;
        }
    }

    if (Object.prototype.hasOwnProperty.call(rawCam, 'embed')) {
        const embedRaw = (rawCam.embed && typeof rawCam.embed === 'object') ? rawCam.embed : {};
        const url = String(embedRaw.url || '').trim();
        if (url) next.embed = { url };
        else delete next.embed;
    }

    if (Object.prototype.hasOwnProperty.call(rawCam, 'rtsp')) {
        const rtspRaw = (rawCam.rtsp && typeof rawCam.rtsp === 'object') ? rawCam.rtsp : {};
        const url = String(rtspRaw.url || '').trim();
        if (url) {
            next.rtsp = { url };
        } else {
            delete next.rtsp;
        }
    }

    const nextList = [...existing];
    nextList[idx] = next;

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...ui,
            cameras: nextList,
        },
    });

    persistConfigToDiskIfChanged('api-ui-cameras-update');
    rebuildRuntimeConfigFromPersisted();
    io.emit('config_update', config);

    const updated = (Array.isArray(persistedConfig?.ui?.cameras) ? persistedConfig.ui.cameras : [])
        .find((c) => String(c?.id || '').trim() === id);
    return res.json({ ok: true, camera: redactCameraForUi(updated) });
});

app.delete('/api/ui/cameras/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

    const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const existing = Array.isArray(ui.cameras) ? ui.cameras : [];
    const nextCameras = existing.filter((c) => String(c?.id || '').trim() !== id);
    if (nextCameras.length === existing.length) {
        return res.status(404).json({ ok: false, error: 'Camera not found' });
    }

    // Best-effort stop HLS stream if running.
    stopHlsStream(id);

    const cleanRoomMap = (rawMap) => {
        const map = (rawMap && typeof rawMap === 'object') ? rawMap : {};
        const out = {};
        for (const [rid, arr] of Object.entries(map)) {
            const nextArr = (Array.isArray(arr) ? arr : [])
                .map((v) => String(v || '').trim())
                .filter((v) => v && v !== id);
            if (nextArr.length) out[rid] = Array.from(new Set(nextArr));
        }
        return out;
    };

    const cleanVisibleIds = (arr) => (Array.isArray(arr) ? arr : [])
        .map((v) => String(v || '').trim())
        .filter((v) => v && v !== id);

    const profiles = (ui.panelProfiles && typeof ui.panelProfiles === 'object') ? ui.panelProfiles : {};
    const nextProfiles = {};
    for (const [name, p] of Object.entries(profiles)) {
        if (!p || typeof p !== 'object') continue;
        nextProfiles[name] = {
            ...p,
            ...(Object.prototype.hasOwnProperty.call(p, 'roomCameraIds') ? { roomCameraIds: cleanRoomMap(p.roomCameraIds) } : {}),
            ...(Object.prototype.hasOwnProperty.call(p, 'visibleCameraIds') ? { visibleCameraIds: cleanVisibleIds(p.visibleCameraIds) } : {}),
        };
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...ui,
            cameras: nextCameras,
            roomCameraIds: cleanRoomMap(ui.roomCameraIds),
            visibleCameraIds: cleanVisibleIds(ui.visibleCameraIds),
            panelProfiles: nextProfiles,
        },
    });

    persistConfigToDiskIfChanged('api-ui-cameras-delete');
    rebuildRuntimeConfigFromPersisted();
    io.emit('config_update', config);
    return res.json({ ok: true });
});

// Update UI device allowlists from the kiosk.
// Back-compat: accepts an array or { allowedDeviceIds: [] } to update the CTRL list.
app.put('/api/ui/allowed-device-ids', (req, res) => {
    const body = req.body;
    const allowlists = getUiAllowlistsInfo();

    const panelName = normalizePanelName(body && typeof body === 'object' ? body.panelName : null);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
    }

    const legacyCtrl = Array.isArray(body)
        ? body
        : (body && typeof body === 'object' ? body.allowedDeviceIds : null);

    const incomingCtrl = (body && typeof body === 'object' && Array.isArray(body.ctrlAllowedDeviceIds))
        ? body.ctrlAllowedDeviceIds
        : legacyCtrl;
    const incomingMain = (body && typeof body === 'object' && Array.isArray(body.mainAllowedDeviceIds))
        ? body.mainAllowedDeviceIds
        : null;

    if (!Array.isArray(incomingCtrl) && !Array.isArray(incomingMain)) {
        return res.status(400).json({
            error:
                'Expected an array (legacy ctrl list) or { ctrlAllowedDeviceIds: [], mainAllowedDeviceIds: [] }',
        });
    }

    if (Array.isArray(incomingCtrl) && allowlists.ctrl.locked) {
        return res.status(409).json({
            error: 'Ctrl allowlist locked',
            message:
                'UI_ALLOWED_CTRL_DEVICE_IDS (or legacy UI_ALLOWED_DEVICE_IDS) is set in the environment, so the kiosk cannot edit the Ctrl allowlist. Remove it to enable UI editing.',
        });
    }

    if (Array.isArray(incomingMain) && allowlists.main.locked) {
        return res.status(409).json({
            error: 'Main allowlist locked',
            message:
                'UI_ALLOWED_MAIN_DEVICE_IDS is set in the environment, so the kiosk cannot edit the Main allowlist. Remove it to enable UI editing.',
        });
    }

    const normalizeIds = (arr) => arr.map((v) => String(v || '').trim()).filter(Boolean);
    const nextCtrlIds = Array.isArray(incomingCtrl) ? normalizeIds(incomingCtrl) : null;
    const nextMainIds = Array.isArray(incomingMain) ? normalizeIds(incomingMain) : null;

    if (panelName) {
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        ...(nextCtrlIds ? { ctrlAllowedDeviceIds: nextCtrlIds } : {}),
                        ...(nextMainIds ? { mainAllowedDeviceIds: nextMainIds } : {}),
                    },
                },
            },
        });
    } else {
        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                ...(nextCtrlIds ? { ctrlAllowedDeviceIds: nextCtrlIds, allowedDeviceIds: nextCtrlIds } : {}),
                ...(nextMainIds ? { mainAllowedDeviceIds: nextMainIds } : {}),
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui');

    const nextAllowlists = getUiAllowlistsInfo();
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            ctrlAllowedDeviceIds: nextAllowlists.ctrl.ids,
            mainAllowedDeviceIds: nextAllowlists.main.ids,
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            ctrlAllowlistSource: nextAllowlists.ctrl.source,
            ctrlAllowlistLocked: nextAllowlists.ctrl.locked,
            mainAllowlistSource: nextAllowlists.main.source,
            mainAllowlistLocked: nextAllowlists.main.locked,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({
        ok: true,
        ui: {
            ...(config?.ui || {}),
        },
    });
});

// Update which devices are visible on the Home dashboard (metrics/room cards) for the current panel.
// Expected payload: { homeVisibleDeviceIds: string[], panelName?: string }
// Empty list means "show all devices".
app.put('/api/ui/home-visible-device-ids', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const homeVisibleDeviceIds = Array.isArray(body.homeVisibleDeviceIds)
        ? body.homeVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
        : null;

    if (!Array.isArray(homeVisibleDeviceIds)) {
        return res.status(400).json({ error: 'Expected { homeVisibleDeviceIds: string[] }' });
    }

    const panelName = normalizePanelName(body.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        homeVisibleDeviceIds,
                    },
                },
            },
        });
    } else {
        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                homeVisibleDeviceIds,
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui-home-visible-device-ids');

    const nextAllowlists = getUiAllowlistsInfo();
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            // carry through allowlist lock/source fields
            ctrlAllowedDeviceIds: nextAllowlists.ctrl.ids,
            mainAllowedDeviceIds: nextAllowlists.main.ids,
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            ctrlAllowlistSource: nextAllowlists.ctrl.source,
            ctrlAllowlistLocked: nextAllowlists.ctrl.locked,
            mainAllowlistSource: nextAllowlists.main.source,
            mainAllowlistLocked: nextAllowlists.main.locked,
            // new field
            homeVisibleDeviceIds: persistedConfig?.ui?.homeVisibleDeviceIds,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({
        ok: true,
        ui: {
            ...(config?.ui || {}),
        },
    });
});

// Update visible rooms (room filtering) for the current panel.
// Expected payload: { visibleRoomIds: string[], panelName?: string }
app.put('/api/ui/visible-room-ids', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const visibleRoomIds = Array.isArray(body.visibleRoomIds)
        ? body.visibleRoomIds.map((v) => String(v || '').trim()).filter(Boolean)
        : null;

    if (!Array.isArray(visibleRoomIds)) {
        return res.status(400).json({ error: 'Expected { visibleRoomIds: string[] }' });
    }

    const panelName = normalizePanelName(body.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        visibleRoomIds,
                    },
                },
            },
        });
    } else {
        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                visibleRoomIds,
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui-visible-room-ids');

    const nextAllowlists = getUiAllowlistsInfo();
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            ctrlAllowedDeviceIds: nextAllowlists.ctrl.ids,
            mainAllowedDeviceIds: nextAllowlists.main.ids,
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            ctrlAllowlistSource: nextAllowlists.ctrl.source,
            ctrlAllowlistLocked: nextAllowlists.ctrl.locked,
            mainAllowlistSource: nextAllowlists.main.source,
            mainAllowlistLocked: nextAllowlists.main.locked,
            visibleRoomIds: Array.isArray(persistedConfig?.ui?.visibleRoomIds) ? persistedConfig.ui.visibleRoomIds : [],
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update which cameras are visible on this panel.
// Expected payload: { visibleCameraIds: string[], panelName?: string }
// Empty list means "show all cameras".
app.put('/api/ui/visible-camera-ids', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const visibleCameraIds = Array.isArray(body.visibleCameraIds)
        ? body.visibleCameraIds.map((v) => String(v || '').trim()).filter(Boolean)
        : null;

    if (!Array.isArray(visibleCameraIds)) {
        return res.status(400).json({ error: 'Expected { visibleCameraIds: string[] }' });
    }

    const panelName = normalizePanelName(body.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        visibleCameraIds,
                    },
                },
            },
        });
    } else {
        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                visibleCameraIds,
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui-visible-camera-ids');

    const nextAllowlists = getUiAllowlistsInfo();
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            ctrlAllowedDeviceIds: nextAllowlists.ctrl.ids,
            mainAllowedDeviceIds: nextAllowlists.main.ids,
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            ctrlAllowlistSource: nextAllowlists.ctrl.source,
            ctrlAllowlistLocked: nextAllowlists.ctrl.locked,
            mainAllowlistSource: nextAllowlists.main.source,
            mainAllowlistLocked: nextAllowlists.main.locked,
            visibleCameraIds: Array.isArray(persistedConfig?.ui?.visibleCameraIds) ? persistedConfig.ui.visibleCameraIds : [],
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update which cameras are assigned to a specific room on this panel.
// Expected payload: { roomId: string, cameraIds: string[], panelName?: string }
app.put('/api/ui/room-camera-ids', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const roomId = String(body.roomId || '').trim();
    if (!roomId) {
        return res.status(400).json({ error: 'Expected { roomId: string, cameraIds: string[] }' });
    }

    const cameraIds = Array.isArray(body.cameraIds)
        ? body.cameraIds.map((v) => String(v || '').trim()).filter(Boolean)
        : null;

    if (!Array.isArray(cameraIds)) {
        return res.status(400).json({ error: 'Expected { roomId: string, cameraIds: string[] }' });
    }

    const uniq = Array.from(new Set(cameraIds));

    const panelName = normalizePanelName(body.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        const prevProfile = (persistedConfig?.ui?.panelProfiles && persistedConfig.ui.panelProfiles[ensured] && typeof persistedConfig.ui.panelProfiles[ensured] === 'object')
            ? persistedConfig.ui.panelProfiles[ensured]
            : {};
        const prevMap = (prevProfile.roomCameraIds && typeof prevProfile.roomCameraIds === 'object') ? prevProfile.roomCameraIds : {};
        const nextMap = { ...prevMap };
        // Persist empty arrays to represent an explicit "none" override.
        // Absence of a room key means "use defaults" (derived from camera.defaultRoomId).
        nextMap[roomId] = uniq;

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...prevProfile,
                        roomCameraIds: nextMap,
                    },
                },
            },
        });
    } else {
        const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
        const prevMap = (ui.roomCameraIds && typeof ui.roomCameraIds === 'object') ? ui.roomCameraIds : {};
        const nextMap = { ...prevMap };
        // Persist empty arrays to represent an explicit "none" override.
        // Absence of a room key means "use defaults" (derived from camera.defaultRoomId).
        nextMap[roomId] = uniq;

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...ui,
                roomCameraIds: nextMap,
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui-room-camera-ids');

    const nextAllowlists = getUiAllowlistsInfo();
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            ctrlAllowedDeviceIds: nextAllowlists.ctrl.ids,
            mainAllowedDeviceIds: nextAllowlists.main.ids,
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            ctrlAllowlistSource: nextAllowlists.ctrl.source,
            ctrlAllowlistLocked: nextAllowlists.ctrl.locked,
            mainAllowlistSource: nextAllowlists.main.source,
            mainAllowlistLocked: nextAllowlists.main.locked,
            roomCameraIds: (persistedConfig?.ui?.roomCameraIds && typeof persistedConfig.ui.roomCameraIds === 'object') ? persistedConfig.ui.roomCameraIds : {},
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update which cameras are shown in the top-of-panel camera bar, plus optional size.
// Expected payload: { cameraIds?: string[]|null, size?: 'xs'|'sm'|'md'|'lg'|null, panelName?: string }
app.put('/api/ui/top-cameras', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};

    const cameraIds = Object.prototype.hasOwnProperty.call(body, 'cameraIds')
        ? (Array.isArray(body.cameraIds)
            ? body.cameraIds.map((v) => String(v || '').trim()).filter(Boolean)
            : null)
        : undefined;

    if (cameraIds === null) {
        return res.status(400).json({ error: 'Expected cameraIds to be an array when provided' });
    }

    const size = Object.prototype.hasOwnProperty.call(body, 'size')
        ? String(body.size ?? '').trim().toLowerCase()
        : undefined;

    if (size !== undefined && size !== '' && size !== 'xs' && size !== 'sm' && size !== 'md' && size !== 'lg') {
        return res.status(400).json({ error: "Expected size to be one of: 'xs', 'sm', 'md', 'lg'" });
    }

    const panelName = normalizePanelName(body.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        const prevProfile = (persistedConfig?.ui?.panelProfiles && persistedConfig.ui.panelProfiles[ensured] && typeof persistedConfig.ui.panelProfiles[ensured] === 'object')
            ? persistedConfig.ui.panelProfiles[ensured]
            : {};

        const nextProfile = {
            ...prevProfile,
            ...(cameraIds !== undefined ? { topCameraIds: Array.from(new Set(cameraIds)) } : {}),
            ...(size !== undefined ? { topCameraSize: (size || 'md') } : {}),
        };

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: nextProfile,
                },
            },
        });
    } else {
        const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...ui,
                ...(cameraIds !== undefined ? { topCameraIds: Array.from(new Set(cameraIds)) } : {}),
                ...(size !== undefined ? { topCameraSize: (size || 'md') } : {}),
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui-top-cameras');

    const nextAllowlists = getUiAllowlistsInfo();
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            ctrlAllowedDeviceIds: nextAllowlists.ctrl.ids,
            mainAllowedDeviceIds: nextAllowlists.main.ids,
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            ctrlAllowlistSource: nextAllowlists.ctrl.source,
            ctrlAllowlistLocked: nextAllowlists.ctrl.locked,
            mainAllowlistSource: nextAllowlists.main.source,
            mainAllowlistLocked: nextAllowlists.main.locked,
            topCameraIds: Array.isArray(persistedConfig?.ui?.topCameraIds) ? persistedConfig.ui.topCameraIds : [],
            topCameraSize: String(persistedConfig?.ui?.topCameraSize ?? 'md').trim() || 'md',
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update per-device UI overrides (label + command allowlist + Home metric allowlist).
// Expected payload: { deviceId: string, label?: string|null, commands?: string[]|null, homeMetrics?: string[]|null, panelName?: string }
app.put('/api/ui/device-overrides', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) {
        return res.status(400).json({ error: 'Missing deviceId' });
    }

    const labelRaw = Object.prototype.hasOwnProperty.call(body, 'label') ? body.label : undefined;
    const label = (labelRaw === null || labelRaw === undefined)
        ? null
        : String(labelRaw ?? '').trim();
    if (typeof label === 'string' && label.length > 64) {
        return res.status(400).json({ error: 'Label too long (max 64 chars)' });
    }

    const commandsRaw = Object.prototype.hasOwnProperty.call(body, 'commands') ? body.commands : undefined;
    const commands = (commandsRaw === null || commandsRaw === undefined)
        ? null
        : (Array.isArray(commandsRaw)
            ? commandsRaw
                .map((c) => String(c || '').trim())
                .filter((c) => c && ALLOWED_PANEL_DEVICE_COMMANDS.has(c))
            : null);
    if (commandsRaw !== undefined && commandsRaw !== null && !Array.isArray(commandsRaw)) {
        return res.status(400).json({ error: 'commands must be an array of strings (or null)' });
    }

    const homeMetricsRaw = Object.prototype.hasOwnProperty.call(body, 'homeMetrics') ? body.homeMetrics : undefined;
    const homeMetrics = (homeMetricsRaw === null || homeMetricsRaw === undefined)
        ? null
        : (Array.isArray(homeMetricsRaw)
            ? homeMetricsRaw
                .map((c) => String(c || '').trim())
                .filter((c) => c && ALLOWED_HOME_METRIC_KEYS.has(c))
            : null);
    if (homeMetricsRaw !== undefined && homeMetricsRaw !== null && !Array.isArray(homeMetricsRaw)) {
        return res.status(400).json({ error: 'homeMetrics must be an array of strings (or null)' });
    }

    const panelName = normalizePanelName(body.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        const prev = (persistedConfig?.ui?.panelProfiles && persistedConfig.ui.panelProfiles[ensured] && typeof persistedConfig.ui.panelProfiles[ensured] === 'object')
            ? persistedConfig.ui.panelProfiles[ensured]
            : {};
        const prevLabels = (prev.deviceLabelOverrides && typeof prev.deviceLabelOverrides === 'object') ? prev.deviceLabelOverrides : {};
        const prevCmds = (prev.deviceCommandAllowlist && typeof prev.deviceCommandAllowlist === 'object') ? prev.deviceCommandAllowlist : {};
        const prevHome = (prev.deviceHomeMetricAllowlist && typeof prev.deviceHomeMetricAllowlist === 'object') ? prev.deviceHomeMetricAllowlist : {};

        const nextLabels = { ...prevLabels };
        if (label === null || label === '') delete nextLabels[deviceId];
        else nextLabels[deviceId] = label;

        const nextCmds = { ...prevCmds };
        if (commands === null) {
            delete nextCmds[deviceId];
        } else {
            nextCmds[deviceId] = Array.from(new Set(commands)).slice(0, 32);
        }

        const nextHome = { ...prevHome };
        if (homeMetrics === null) {
            delete nextHome[deviceId];
        } else {
            nextHome[deviceId] = Array.from(new Set(homeMetrics)).slice(0, 16);
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...prev,
                        deviceLabelOverrides: nextLabels,
                        deviceCommandAllowlist: nextCmds,
                        deviceHomeMetricAllowlist: nextHome,
                    },
                },
            },
        });
    } else {
        const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
        const prevLabels = (ui.deviceLabelOverrides && typeof ui.deviceLabelOverrides === 'object') ? ui.deviceLabelOverrides : {};
        const prevCmds = (ui.deviceCommandAllowlist && typeof ui.deviceCommandAllowlist === 'object') ? ui.deviceCommandAllowlist : {};
        const prevHome = (ui.deviceHomeMetricAllowlist && typeof ui.deviceHomeMetricAllowlist === 'object') ? ui.deviceHomeMetricAllowlist : {};

        const nextLabels = { ...prevLabels };
        if (label === null || label === '') delete nextLabels[deviceId];
        else nextLabels[deviceId] = label;

        const nextCmds = { ...prevCmds };
        if (commands === null) {
            delete nextCmds[deviceId];
        } else {
            nextCmds[deviceId] = Array.from(new Set(commands)).slice(0, 32);
        }

        const nextHome = { ...prevHome };
        if (homeMetrics === null) {
            delete nextHome[deviceId];
        } else {
            nextHome[deviceId] = Array.from(new Set(homeMetrics)).slice(0, 16);
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...ui,
                deviceLabelOverrides: nextLabels,
                deviceCommandAllowlist: nextCmds,
                deviceHomeMetricAllowlist: nextHome,
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui-device-overrides');

    const nextAllowlists = getUiAllowlistsInfo();
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            ctrlAllowedDeviceIds: nextAllowlists.ctrl.ids,
            mainAllowedDeviceIds: nextAllowlists.main.ids,
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            ctrlAllowlistSource: nextAllowlists.ctrl.source,
            ctrlAllowlistLocked: nextAllowlists.ctrl.locked,
            mainAllowlistSource: nextAllowlists.main.source,
            mainAllowlistLocked: nextAllowlists.main.locked,
            visibleRoomIds: Array.isArray(persistedConfig?.ui?.visibleRoomIds) ? persistedConfig.ui.visibleRoomIds : [],
            deviceLabelOverrides: (persistedConfig?.ui?.deviceLabelOverrides && typeof persistedConfig.ui.deviceLabelOverrides === 'object') ? persistedConfig.ui.deviceLabelOverrides : {},
            deviceCommandAllowlist: (persistedConfig?.ui?.deviceCommandAllowlist && typeof persistedConfig.ui.deviceCommandAllowlist === 'object') ? persistedConfig.ui.deviceCommandAllowlist : {},
            deviceHomeMetricAllowlist: (persistedConfig?.ui?.deviceHomeMetricAllowlist && typeof persistedConfig.ui.deviceHomeMetricAllowlist === 'object') ? persistedConfig.ui.deviceHomeMetricAllowlist : {},
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// List server-side panel profiles.
app.get('/api/ui/panels', (req, res) => {
    const profiles = (persistedConfig?.ui?.panelProfiles && typeof persistedConfig.ui.panelProfiles === 'object')
        ? persistedConfig.ui.panelProfiles
        : {};
    return res.json({
        ok: true,
        panels: Object.keys(profiles).sort((a, b) => a.localeCompare(b)),
    });
});

// Create a new server-side panel profile.
// Expected payload: { name: string, seedFromPanelName?: string }
app.post('/api/ui/panels', (req, res) => {
    const name = normalizePanelName(req.body?.name);
    if (!name) {
        return res.status(400).json({ error: 'Invalid name (letters/numbers/space/_/-; max 48 chars)' });
    }

    if (isPresetPanelProfile(name)) {
        return res.status(409).json({
            error: 'Panel name reserved',
            message: 'That name is reserved for a shipped preset. Choose a different name.',
        });
    }

    const existing = (persistedConfig?.ui?.panelProfiles && typeof persistedConfig.ui.panelProfiles === 'object')
        ? persistedConfig.ui.panelProfiles
        : {};
    if (existing[name]) {
        return res.status(409).json({ error: 'Panel already exists' });
    }

    const seedFromPanelName = normalizePanelName(req.body?.seedFromPanelName);
    const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const profilesMap = (ui.panelProfiles && typeof ui.panelProfiles === 'object') ? ui.panelProfiles : {};
    const seedFromProfile = (seedFromPanelName && profilesMap[seedFromPanelName] && typeof profilesMap[seedFromPanelName] === 'object')
        ? profilesMap[seedFromPanelName]
        : null;
    const effectiveUi = {
        ...ui,
        ...(seedFromProfile || {}),
    };

    // Seed from "current" effective UI settings (global defaults, or the selected profile/preset).
    const seed = {
        visibleRoomIds: Array.isArray(effectiveUi.visibleRoomIds) ? effectiveUi.visibleRoomIds : [],
        ctrlAllowedDeviceIds: Array.isArray(effectiveUi.ctrlAllowedDeviceIds)
            ? effectiveUi.ctrlAllowedDeviceIds
            : (Array.isArray(effectiveUi.allowedDeviceIds) ? effectiveUi.allowedDeviceIds : []),
        mainAllowedDeviceIds: Array.isArray(effectiveUi.mainAllowedDeviceIds) ? effectiveUi.mainAllowedDeviceIds : [],
        deviceLabelOverrides: (effectiveUi.deviceLabelOverrides && typeof effectiveUi.deviceLabelOverrides === 'object') ? effectiveUi.deviceLabelOverrides : {},
        deviceCommandAllowlist: (effectiveUi.deviceCommandAllowlist && typeof effectiveUi.deviceCommandAllowlist === 'object') ? effectiveUi.deviceCommandAllowlist : {},
        accentColorId: effectiveUi.accentColorId,
        homeBackground: effectiveUi.homeBackground,
        cardOpacityScalePct: effectiveUi.cardOpacityScalePct,
        blurScalePct: effectiveUi.blurScalePct,
        secondaryTextOpacityPct: effectiveUi.secondaryTextOpacityPct,
        secondaryTextSizePct: effectiveUi.secondaryTextSizePct,
        secondaryTextColorId: effectiveUi.secondaryTextColorId,
        primaryTextOpacityPct: effectiveUi.primaryTextOpacityPct,
        primaryTextSizePct: effectiveUi.primaryTextSizePct,
        primaryTextColorId: effectiveUi.primaryTextColorId,
        cardScalePct: effectiveUi.cardScalePct,
        homeRoomColumnsXl: effectiveUi.homeRoomColumnsXl,
        homeRoomMetricColumns: effectiveUi.homeRoomMetricColumns,
        homeRoomMetricKeys: Array.isArray(effectiveUi.homeRoomMetricKeys) ? effectiveUi.homeRoomMetricKeys : ['temperature', 'humidity', 'illuminance'],
        glowColorId: effectiveUi.glowColorId,
        iconColorId: effectiveUi.iconColorId,
        iconOpacityPct: effectiveUi.iconOpacityPct,
        iconSizePct: effectiveUi.iconSizePct,
    };

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...ui,
            panelProfiles: {
                ...profilesMap,
                [name]: seed,
            },
        },
    });

    const ensured = name;

    persistConfigToDiskIfChanged('api-ui-panels-create');

    // Ensure clients receive updated profiles list.
    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    const profilesMapAfter = (persistedConfig?.ui?.panelProfiles && typeof persistedConfig.ui.panelProfiles === 'object')
        ? persistedConfig.ui.panelProfiles
        : {};
    return res.json({
        ok: true,
        name: ensured,
        panels: Object.keys(profilesMapAfter).sort((a, b) => a.localeCompare(b)),
    });
});

const updateAccentColorId = (req, res, sourceLabel) => {
    const raw = String(req.body?.accentColorId ?? req.body?.colorScheme ?? '').trim();
    if (!raw) {
        return res.status(400).json({ error: 'Missing accentColorId' });
    }

    const normalized = (() => {
        if (ALLOWED_ACCENT_COLOR_IDS.has(raw)) return raw;
        if (LEGACY_UI_COLOR_SCHEMES.includes(raw)) return normalizeAccentColorId(raw);
        return null;
    })();

    if (!normalized) {
        return res.status(400).json({
            error: 'Invalid accentColorId',
            allowed: Array.from(ALLOWED_ACCENT_COLOR_IDS).sort((a, b) => a.localeCompare(b)),
        });
    }

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        accentColorId: normalized,
                    },
                },
            },
        });
        persistConfigToDiskIfChanged(`${sourceLabel}-panel`);

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            accentColorId: normalized,
        },
    });

    persistConfigToDiskIfChanged(sourceLabel);

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            accentColorId: persistedConfig?.ui?.accentColorId,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
};

// New endpoint name.
app.put('/api/ui/accent-color', (req, res) => updateAccentColorId(req, res, 'api-ui-accent-color'));

// Legacy alias.
app.put('/api/ui/color-scheme', (req, res) => updateAccentColorId(req, res, 'api-ui-color-scheme'));

// Update UI toggle for coloring Home values from the kiosk.
// Expected payload: { colorizeHomeValues: boolean, colorizeHomeValuesOpacityPct?: number(0-100) }
app.put('/api/ui/colorize-home-values', (req, res) => {
    const incoming = req.body?.colorizeHomeValues;
    if (typeof incoming !== 'boolean') {
        return res.status(400).json({ error: 'Missing colorizeHomeValues (boolean)' });
    }

    const opacityRaw = req.body?.colorizeHomeValuesOpacityPct;
    const hasOpacity = opacityRaw !== undefined;
    const opacityNum = (typeof opacityRaw === 'number') ? opacityRaw : Number(opacityRaw);
    const opacityPct = hasOpacity && Number.isFinite(opacityNum)
        ? Math.max(0, Math.min(100, Math.round(opacityNum)))
        : null;

    if (hasOpacity && opacityPct === null) {
        return res.status(400).json({ error: 'Invalid colorizeHomeValuesOpacityPct (0-100)' });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            colorizeHomeValues: incoming,
            ...(opacityPct === null ? {} : { colorizeHomeValuesOpacityPct: opacityPct }),
        },
    });

    persistConfigToDiskIfChanged('api-ui-colorize-home-values');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
            colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update UI Home background from the kiosk.
// Expected payload: { homeBackground: { enabled: boolean, url: string|null, opacityPct?: number(0-100) } }
app.put('/api/ui/home-background', (req, res) => {
    const incoming = req.body?.homeBackground;
    if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Missing homeBackground' });
    }

    const enabled = incoming.enabled;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Missing homeBackground.enabled (boolean)' });
    }

    const rawUrl = incoming.url;
    const url = (rawUrl === null || rawUrl === undefined)
        ? null
        : String(rawUrl).trim();

    // Restrict to either:
    // - Server-managed backgrounds: /backgrounds/<file>
    // - Remote http(s) URLs
    // This avoids scheme injection (javascript:, data:, file:) and reduces the attack surface.
    let normalizedUrl = url;
    if (normalizedUrl) {
        if (normalizedUrl.startsWith('/backgrounds/')) {
            const rawFile = normalizedUrl.slice('/backgrounds/'.length);
            let decodedFile = rawFile;
            try {
                decodedFile = decodeURIComponent(rawFile);
            } catch {
                return res.status(400).json({ error: 'Invalid homeBackground.url encoding' });
            }

            const safeFileRe = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.(jpg|jpeg|png|webp|gif)$/i;
            if (!safeFileRe.test(decodedFile) || decodedFile !== path.basename(decodedFile) || decodedFile.includes('..') || decodedFile.includes('/') || decodedFile.includes('\\')) {
                return res.status(400).json({ error: 'Invalid homeBackground.url (unsafe background filename)' });
            }

            // Canonicalize to a safely-encoded URL segment.
            normalizedUrl = `/backgrounds/${encodeURIComponent(decodedFile)}`;
        } else {
            let parsed;
            try {
                parsed = new URL(normalizedUrl);
            } catch {
                return res.status(400).json({ error: 'Invalid homeBackground.url (expected http(s) or /backgrounds/<file>)' });
            }

            if (!(parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
                return res.status(400).json({ error: 'Invalid homeBackground.url (only http/https allowed)' });
            }

            if (parsed.username || parsed.password) {
                return res.status(400).json({ error: 'Invalid homeBackground.url (credentials not allowed)' });
            }

            if (normalizedUrl.length > 2048) {
                return res.status(400).json({ error: 'Invalid homeBackground.url (too long)' });
            }
        }
    }

    if (enabled && !url) {
        return res.status(400).json({ error: 'homeBackground.url is required when enabled=true' });
    }

    const opacityRaw = Object.prototype.hasOwnProperty.call(incoming, 'opacityPct')
        ? incoming.opacityPct
        : undefined;

    const hasOpacity = opacityRaw !== undefined;
    const opacityNum = (typeof opacityRaw === 'number') ? opacityRaw : Number(opacityRaw);
    const opacityPct = hasOpacity && Number.isFinite(opacityNum)
        ? Math.max(0, Math.min(100, Math.round(opacityNum)))
        : null;

    if (hasOpacity && opacityPct === null) {
        return res.status(400).json({ error: 'Invalid homeBackground.opacityPct (0-100)' });
    }

    const panelName = normalizePanelName(req.body?.panelName);

    const prev = (persistedConfig?.ui && typeof persistedConfig.ui === 'object' && persistedConfig.ui.homeBackground && typeof persistedConfig.ui.homeBackground === 'object')
        ? persistedConfig.ui.homeBackground
        : {};

    const next = {
        enabled,
        url: normalizedUrl || null,
        opacityPct: opacityPct === null
            ? (Number.isFinite(Number(prev.opacityPct)) ? Math.max(0, Math.min(100, Math.round(Number(prev.opacityPct)))) : 35)
            : opacityPct,
    };

    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        homeBackground: next,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-home-background-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);

        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            homeBackground: next,
        },
    });

    persistConfigToDiskIfChanged('api-ui-home-background');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            homeBackground: persistedConfig?.ui?.homeBackground,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update UI card background opacity scale from the kiosk.
// Expected payload: { cardOpacityScalePct: number(0-200) }
app.put('/api/ui/card-opacity-scale', (req, res) => {
    const raw = req.body?.cardOpacityScalePct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing cardOpacityScalePct (0-200)' });
    }

    const cardOpacityScalePct = Math.max(0, Math.min(200, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        cardOpacityScalePct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-card-opacity-scale-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            cardOpacityScalePct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-card-opacity-scale');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            cardOpacityScalePct: persistedConfig?.ui?.cardOpacityScalePct,
            cardScalePct: persistedConfig?.ui?.cardScalePct,
            homeRoomColumnsXl: persistedConfig?.ui?.homeRoomColumnsXl,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update UI blur scale from the kiosk.
// Expected payload: { blurScalePct: number(0-200) }
app.put('/api/ui/blur-scale', (req, res) => {
    const raw = req.body?.blurScalePct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing blurScalePct (0-200)' });
    }

    const blurScalePct = Math.max(BLUR_SCALE_PCT_RANGE.min, Math.min(BLUR_SCALE_PCT_RANGE.max, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        blurScalePct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-blur-scale-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            blurScalePct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-blur-scale');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            blurScalePct: persistedConfig?.ui?.blurScalePct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update secondary (small/gray) text opacity percent (Home page).
// Expected payload: { secondaryTextOpacityPct: number(0-100) }
app.put('/api/ui/secondary-text-opacity', (req, res) => {
    const raw = req.body?.secondaryTextOpacityPct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing secondaryTextOpacityPct (0-100)' });
    }

    const secondaryTextOpacityPct = Math.max(0, Math.min(100, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        secondaryTextOpacityPct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-secondary-text-opacity-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            secondaryTextOpacityPct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-secondary-text-opacity');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            secondaryTextOpacityPct: persistedConfig?.ui?.secondaryTextOpacityPct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update secondary (small/gray) text size percent (Home page).
// Expected payload: { secondaryTextSizePct: number(50-200) }
app.put('/api/ui/secondary-text-size', (req, res) => {
    const raw = req.body?.secondaryTextSizePct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing secondaryTextSizePct (50-200)' });
    }

    const secondaryTextSizePct = Math.max(
        SECONDARY_TEXT_SIZE_PCT_RANGE.min,
        Math.min(SECONDARY_TEXT_SIZE_PCT_RANGE.max, Math.round(num)),
    );

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        secondaryTextSizePct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-secondary-text-size-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            secondaryTextSizePct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-secondary-text-size');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            secondaryTextSizePct: persistedConfig?.ui?.secondaryTextSizePct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update secondary (small/gray) text color id (Home page).
// Expected payload: { secondaryTextColorId: string | null } (null/empty = default)
app.put('/api/ui/secondary-text-color', (req, res) => {
    const raw = req.body?.secondaryTextColorId;
    const s = String(raw ?? '').trim();
    const secondaryTextColorId = s
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(s) ? s : null)
        : null;

    if (s && !secondaryTextColorId) {
        return res.status(400).json({ error: 'Invalid secondaryTextColorId' });
    }

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        secondaryTextColorId,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-secondary-text-color-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            secondaryTextColorId,
        },
    });

    persistConfigToDiskIfChanged('api-ui-secondary-text-color');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            secondaryTextColorId: persistedConfig?.ui?.secondaryTextColorId,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update primary (main) text opacity percent (Home page).
// Expected payload: { primaryTextOpacityPct: number(0-100) }
app.put('/api/ui/primary-text-opacity', (req, res) => {
    const raw = req.body?.primaryTextOpacityPct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing primaryTextOpacityPct (0-100)' });
    }

    const primaryTextOpacityPct = Math.max(0, Math.min(100, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        primaryTextOpacityPct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-primary-text-opacity-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            primaryTextOpacityPct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-primary-text-opacity');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            primaryTextOpacityPct: persistedConfig?.ui?.primaryTextOpacityPct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update primary (main) text size percent (Home page).
// Expected payload: { primaryTextSizePct: number(50-200) }
app.put('/api/ui/primary-text-size', (req, res) => {
    const raw = req.body?.primaryTextSizePct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing primaryTextSizePct (50-200)' });
    }

    const primaryTextSizePct = Math.max(
        PRIMARY_TEXT_SIZE_PCT_RANGE.min,
        Math.min(PRIMARY_TEXT_SIZE_PCT_RANGE.max, Math.round(num)),
    );

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        primaryTextSizePct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-primary-text-size-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            primaryTextSizePct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-primary-text-size');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            primaryTextSizePct: persistedConfig?.ui?.primaryTextSizePct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update primary (main) text color id (Home page).
// Expected payload: { primaryTextColorId: string | null } (null/empty = default)
app.put('/api/ui/primary-text-color', (req, res) => {
    const raw = req.body?.primaryTextColorId;
    const s = String(raw ?? '').trim();
    const primaryTextColorId = s
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(s) ? s : null)
        : null;

    if (s && !primaryTextColorId) {
        return res.status(400).json({ error: 'Invalid primaryTextColorId' });
    }

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        primaryTextColorId,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-primary-text-color-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            primaryTextColorId,
        },
    });

    persistConfigToDiskIfChanged('api-ui-primary-text-color');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            primaryTextColorId: persistedConfig?.ui?.primaryTextColorId,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update Home accent glow color id.
// Expected payload: { glowColorId: string | null } (null/empty = inherit from scheme accent)
app.put('/api/ui/glow-color', (req, res) => {
    const raw = req.body?.glowColorId;
    const s = String(raw ?? '').trim();
    const glowColorId = s
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(s) ? s : null)
        : null;

    if (s && !glowColorId) {
        return res.status(400).json({ error: 'Invalid glowColorId' });
    }

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        glowColorId,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-glow-color-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            glowColorId,
        },
    });

    persistConfigToDiskIfChanged('api-ui-glow-color');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            glowColorId: persistedConfig?.ui?.glowColorId,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update Home icon color id.
// Expected payload: { iconColorId: string | null } (null/empty = inherit from scheme accent)
app.put('/api/ui/icon-color', (req, res) => {
    const raw = req.body?.iconColorId;
    const s = String(raw ?? '').trim();
    const iconColorId = s
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(s) ? s : null)
        : null;

    if (s && !iconColorId) {
        return res.status(400).json({ error: 'Invalid iconColorId' });
    }

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        iconColorId,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-icon-color-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            iconColorId,
        },
    });

    persistConfigToDiskIfChanged('api-ui-icon-color');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            iconColorId: persistedConfig?.ui?.iconColorId,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update Home icon opacity percent.
// Expected payload: { iconOpacityPct: number(0-100) }
app.put('/api/ui/icon-opacity', (req, res) => {
    const raw = req.body?.iconOpacityPct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing iconOpacityPct (0-100)' });
    }

    const iconOpacityPct = Math.max(0, Math.min(100, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        iconOpacityPct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-icon-opacity-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            iconOpacityPct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-icon-opacity');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            iconOpacityPct: persistedConfig?.ui?.iconOpacityPct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update Home icon size percent.
// Expected payload: { iconSizePct: number(50-200) }
app.put('/api/ui/icon-size', (req, res) => {
    const raw = req.body?.iconSizePct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing iconSizePct (50-200)' });
    }

    const iconSizePct = Math.max(ICON_SIZE_PCT_RANGE.min, Math.min(ICON_SIZE_PCT_RANGE.max, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        iconSizePct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-icon-size-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            iconSizePct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-icon-size');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            iconSizePct: persistedConfig?.ui?.iconSizePct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update UI card scale percent from the kiosk.
// Expected payload: { cardScalePct: number(50-200) }
app.put('/api/ui/card-scale', (req, res) => {
    const raw = req.body?.cardScalePct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing cardScalePct (50-200)' });
    }

    const cardScalePct = Math.max(50, Math.min(200, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        cardScalePct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-card-scale-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            cardScalePct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-card-scale');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            cardScalePct: persistedConfig?.ui?.cardScalePct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update Home room grid columns (XL breakpoint) from the kiosk.
// Expected payload: { homeRoomColumnsXl: number(1-6) }
app.put('/api/ui/home-room-columns-xl', (req, res) => {
    const raw = req.body?.homeRoomColumnsXl;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing homeRoomColumnsXl (1-6)' });
    }

    const homeRoomColumnsXl = Math.max(1, Math.min(6, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        homeRoomColumnsXl,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-home-room-columns-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            homeRoomColumnsXl,
        },
    });

    persistConfigToDiskIfChanged('api-ui-home-room-columns-xl');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            homeRoomColumnsXl: persistedConfig?.ui?.homeRoomColumnsXl,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update Home room metric grid columns (sub-cards inside each room panel).
// Expected payload: { homeRoomMetricColumns: number(0-3), panelName?: string }
// 0 = auto.
app.put('/api/ui/home-room-metric-columns', (req, res) => {
    const raw = req.body?.homeRoomMetricColumns;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing homeRoomMetricColumns (0-3)' });
    }

    const homeRoomMetricColumns = Math.max(0, Math.min(3, Math.round(num)));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        homeRoomMetricColumns,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-home-room-metric-columns-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            homeRoomMetricColumns,
        },
    });

    persistConfigToDiskIfChanged('api-ui-home-room-metric-columns');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            homeRoomMetricColumns: persistedConfig?.ui?.homeRoomMetricColumns,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update which room metric cards are shown on Home.
// Expected payload: { homeRoomMetricKeys: string[], panelName?: string }
app.put('/api/ui/home-room-metric-keys', (req, res) => {
    const raw = req.body?.homeRoomMetricKeys;
    if (!Array.isArray(raw)) {
        return res.status(400).json({ error: 'Missing homeRoomMetricKeys (array)' });
    }

    const homeRoomMetricKeys = Array.from(new Set(
        raw
            .map((v) => String(v || '').trim())
            .filter((v) => v && ALLOWED_HOME_ROOM_METRIC_KEYS.has(v)),
    ));

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        homeRoomMetricKeys,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-home-room-metric-keys-panel');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);
        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            homeRoomMetricKeys,
        },
    });

    persistConfigToDiskIfChanged('api-ui-home-room-metric-keys');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            homeRoomMetricKeys: persistedConfig?.ui?.homeRoomMetricKeys,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

    // Update camera preview settings.
    // Expected payload: { homeCameraPreviewsEnabled: boolean, controlsCameraPreviewsEnabled: boolean, cameraPreviewRefreshSeconds: number(2-120), panelName?: string }
    app.put('/api/ui/camera-previews', (req, res) => {
        const hasHome = typeof req.body?.homeCameraPreviewsEnabled === 'boolean';
        const hasControls = typeof req.body?.controlsCameraPreviewsEnabled === 'boolean';
        if (!hasHome || !hasControls) {
            return res.status(400).json({ error: 'Missing homeCameraPreviewsEnabled and/or controlsCameraPreviewsEnabled (boolean)' });
        }

        const rawSeconds = req.body?.cameraPreviewRefreshSeconds;
        const num = (typeof rawSeconds === 'number') ? rawSeconds : Number(rawSeconds);
        if (!Number.isFinite(num)) {
            return res.status(400).json({ error: 'Missing cameraPreviewRefreshSeconds (2-120)' });
        }

        const homeCameraPreviewsEnabled = req.body?.homeCameraPreviewsEnabled === true;
        const controlsCameraPreviewsEnabled = req.body?.controlsCameraPreviewsEnabled === true;
        const cameraPreviewRefreshSeconds = Math.max(2, Math.min(120, Math.round(num)));

        const panelName = normalizePanelName(req.body?.panelName);
        if (panelName) {
            if (rejectIfPresetPanelProfile(panelName, res)) return;
            const ensured = ensurePanelProfileExists(panelName);
            if (!ensured) {
                return res.status(400).json({ error: 'Invalid panelName' });
            }

            persistedConfig = normalizePersistedConfig({
                ...(persistedConfig || {}),
                ui: {
                    ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                    panelProfiles: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                        [ensured]: {
                            ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                            homeCameraPreviewsEnabled,
                            controlsCameraPreviewsEnabled,
                            cameraPreviewRefreshSeconds,
                        },
                    },
                },
            });

            persistConfigToDiskIfChanged('api-ui-camera-previews-panel');

            config = {
                ...config,
                ui: {
                    ...(config?.ui || {}),
                    panelProfiles: persistedConfig?.ui?.panelProfiles,
                },
            };
            io.emit('config_update', config);
            return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                homeCameraPreviewsEnabled,
                controlsCameraPreviewsEnabled,
                cameraPreviewRefreshSeconds,
            },
        });

        persistConfigToDiskIfChanged('api-ui-camera-previews');

        config = {
            ...config,
            ui: {
                ...(config?.ui || {}),
                homeCameraPreviewsEnabled: persistedConfig?.ui?.homeCameraPreviewsEnabled,
                controlsCameraPreviewsEnabled: persistedConfig?.ui?.controlsCameraPreviewsEnabled,
                cameraPreviewRefreshSeconds: persistedConfig?.ui?.cameraPreviewRefreshSeconds,
                panelProfiles: persistedConfig?.ui?.panelProfiles,
            },
        };
        io.emit('config_update', config);

        return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
    });

// Update UI climate tolerances from the kiosk.
// Expected payload: { climateTolerances: { temperatureF: { cold, comfy, warm }, humidityPct: { dry, comfy, humid }, illuminanceLux: { dark, dim, bright } } }
app.put('/api/ui/climate-tolerances', (req, res) => {
    const incoming = req.body?.climateTolerances;
    if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Missing climateTolerances' });
    }

    const toFinite = (v) => {
        const n = (typeof v === 'number') ? v : Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const prev = (persistedConfig?.ui && typeof persistedConfig.ui === 'object' && persistedConfig.ui.climateTolerances && typeof persistedConfig.ui.climateTolerances === 'object')
        ? persistedConfig.ui.climateTolerances
        : {};

    const pickTriplet = (groupKey, keys) => {
        const base = (prev[groupKey] && typeof prev[groupKey] === 'object') ? prev[groupKey] : {};
        const inc = (incoming[groupKey] && typeof incoming[groupKey] === 'object') ? incoming[groupKey] : {};
        const out = { ...base };
        for (const k of keys) {
            if (inc[k] === undefined) continue;
            const n = toFinite(inc[k]);
            if (n === null) {
                return { error: 'Invalid number', field: `${groupKey}.${k}` };
            }
            out[k] = n;
        }
        return { value: out };
    };

    const t = pickTriplet('temperatureF', ['cold', 'comfy', 'warm']);
    if (t.error) return res.status(400).json(t);
    const h = pickTriplet('humidityPct', ['dry', 'comfy', 'humid']);
    if (h.error) return res.status(400).json(h);
    const l = pickTriplet('illuminanceLux', ['dark', 'dim', 'bright']);
    if (l.error) return res.status(400).json(l);

    const isIncreasing = (a, b, c) => Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && a < b && b < c;
    if (!isIncreasing(t.value.cold, t.value.comfy, t.value.warm)) {
        return res.status(400).json({
            error: 'Invalid temperatureF thresholds',
            message: 'Expected cold < comfy < warm',
            value: t.value,
        });
    }
    if (!isIncreasing(h.value.dry, h.value.comfy, h.value.humid)) {
        return res.status(400).json({
            error: 'Invalid humidityPct thresholds',
            message: 'Expected dry < comfy < humid',
            value: h.value,
        });
    }
    if (!isIncreasing(l.value.dark, l.value.dim, l.value.bright)) {
        return res.status(400).json({
            error: 'Invalid illuminanceLux thresholds',
            message: 'Expected dark < dim < bright',
            value: l.value,
        });
    }

    const next = {
        temperatureF: t.value,
        humidityPct: h.value,
        illuminanceLux: l.value,
    };

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            climateTolerances: next,
        },
    });

    persistConfigToDiskIfChanged('api-ui-climate-tolerances');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            climateTolerances: persistedConfig?.ui?.climateTolerances,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update UI tolerance colors from the kiosk.
// Expected payload: { climateToleranceColors: { temperatureF: { cold, comfy, warm, hot }, humidityPct: { dry, comfy, humid, veryHumid }, illuminanceLux: { dark, dim, bright, veryBright } } }
app.put('/api/ui/climate-tolerance-colors', (req, res) => {
    const incoming = req.body?.climateToleranceColors;
    if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Missing climateToleranceColors' });
    }

    const ALLOWED = ALLOWED_TOLERANCE_COLOR_IDS;

    const prev = (persistedConfig?.ui && typeof persistedConfig.ui === 'object' && persistedConfig.ui.climateToleranceColors && typeof persistedConfig.ui.climateToleranceColors === 'object')
        ? persistedConfig.ui.climateToleranceColors
        : {};

    const pickGroup = (groupKey, keys) => {
        const base = (prev[groupKey] && typeof prev[groupKey] === 'object') ? prev[groupKey] : {};
        const inc = (incoming[groupKey] && typeof incoming[groupKey] === 'object') ? incoming[groupKey] : {};
        const out = { ...base };
        for (const k of keys) {
            if (inc[k] === undefined) continue;
            const v = String(inc[k] ?? '').trim();
            if (!ALLOWED.has(v)) {
                return { error: 'Invalid color id', field: `${groupKey}.${k}`, value: v, allowed: Array.from(ALLOWED) };
            }
            out[k] = v;
        }
        return { value: out };
    };

    const t = pickGroup('temperatureF', ['cold', 'comfy', 'warm', 'hot']);
    if (t.error) return res.status(400).json(t);
    const h = pickGroup('humidityPct', ['dry', 'comfy', 'humid', 'veryHumid']);
    if (h.error) return res.status(400).json(h);
    const l = pickGroup('illuminanceLux', ['dark', 'dim', 'bright', 'veryBright']);
    if (l.error) return res.status(400).json(l);

    const next = {
        temperatureF: t.value,
        humidityPct: h.value,
        illuminanceLux: l.value,
    };

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            climateToleranceColors: next,
        },
    });

    persistConfigToDiskIfChanged('api-ui-climate-tolerance-colors');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
            sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update sensor indicator badge colors on Home (Motion / Door).
// Expected payload: { sensorIndicatorColors: { motion: <colorId>, door: <colorId> } }
app.put('/api/ui/sensor-indicator-colors', (req, res) => {
    const incoming = req.body?.sensorIndicatorColors;
    if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Missing sensorIndicatorColors' });
    }

    const ALLOWED = ALLOWED_TOLERANCE_COLOR_IDS;

    const prev = (persistedConfig?.ui && typeof persistedConfig.ui === 'object' && persistedConfig.ui.sensorIndicatorColors && typeof persistedConfig.ui.sensorIndicatorColors === 'object')
        ? persistedConfig.ui.sensorIndicatorColors
        : {};

    const next = { ...prev };
    for (const k of ['motion', 'door']) {
        if (incoming[k] === undefined) continue;
        const v = String(incoming[k] ?? '').trim();
        if (!ALLOWED.has(v)) {
            return res.status(400).json({ error: 'Invalid color id', field: `sensorIndicatorColors.${k}`, value: v, allowed: Array.from(ALLOWED) });
        }
        next[k] = v;
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            sensorIndicatorColors: next,
        },
    });

    persistConfigToDiskIfChanged('api-ui-sensor-indicator-colors');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update UI alert sounds from the kiosk.
// Expected payload: { alertSounds: { motion, doorOpen, doorClose } }
app.put('/api/ui/alert-sounds', (req, res) => {
    const incoming = req.body?.alertSounds;
    if (!incoming || typeof incoming !== 'object') {
        return res.status(400).json({ error: 'Missing alertSounds' });
    }

    const clean = (v) => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s.length ? s : null;
    };

    // Validate selections against files actually present on the server.
    ensureDataDirs();
    const exts = new Set(['.mp3', '.wav', '.ogg']);
    const available = new Set(
        fs.readdirSync(SOUNDS_DIR, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => d.name)
            .filter((name) => exts.has(path.extname(name).toLowerCase()))
    );

    const next = {
        motion: clean(incoming.motion),
        doorOpen: clean(incoming.doorOpen),
        doorClose: clean(incoming.doorClose),
    };

    for (const [k, v] of Object.entries(next)) {
        if (!v) continue;
        if (!available.has(v)) {
            return res.status(400).json({
                error: 'Unknown sound file',
                field: k,
                value: v,
                available: Array.from(available).sort((a, b) => a.localeCompare(b)),
            });
        }
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            alertSounds: next,
        },
    });

    persistConfigToDiskIfChanged('api-ui-alert-sounds');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            alertSounds: persistedConfig?.ui?.alertSounds,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Debug/inspection endpoints (do not include access token)
app.get('/api/hubitat/health', (req, res) => {
    res.json({
        ok: !lastHubitatError,
        configured: HUBITAT_CONFIGURED,
        host: HUBITAT_HOST || null,
        appId: HUBITAT_APP_ID || null,
        tlsInsecure: HUBITAT_TLS_INSECURE,
        tlsDispatcher: Boolean(HUBITAT_FETCH_DISPATCHER),
        lastFetchAt: lastHubitatFetchAt,
        lastError: lastHubitatError,
        cachedCount: Array.isArray(lastHubitatDevices) ? lastHubitatDevices.length : 0,
    });
});

// Hubitat Maker API modes (proxy). Useful for displaying the currently active Mode.
app.get('/api/hubitat/modes', async (req, res) => {
    if (!HUBITAT_CONFIGURED) {
        return res.status(409).json({ ok: false, error: 'Hubitat not configured' });
    }

    let hubitatRes;
    try {
        hubitatRes = await hubitatFetch(HUBITAT_MODES_URL);
    } catch (err) {
        const safeUrl = redactAccessToken(HUBITAT_MODES_URL);
        return res.status(502).json({ ok: false, error: `Hubitat fetch failed: ${describeFetchError(err)} (url: ${safeUrl})` });
    }

    if (!hubitatRes.ok) {
        const text = await hubitatRes.text().catch(() => '');
        return res.status(502).json({ ok: false, error: `Hubitat API Error: ${hubitatRes.status} ${text}` });
    }

    const raw = await hubitatRes.text().catch(() => '');
    if (!raw.trim()) {
        return res.status(502).json({ ok: false, error: 'Hubitat API returned an empty response body' });
    }

    let modes;
    try {
        modes = JSON.parse(raw);
    } catch (err) {
        const contentType = hubitatRes.headers.get('content-type') || '';
        const snippet = raw.slice(0, 300).replace(/\s+/g, ' ').trim();
        return res.status(502).json({
            ok: false,
            error: `Hubitat API returned invalid JSON (content-type: ${contentType || 'unknown'}). Snippet: ${snippet}`,
        });
    }

    if (!Array.isArray(modes)) {
        return res.status(502).json({ ok: false, error: 'Hubitat API returned non-array payload' });
    }

    const active = modes.find((m) => m && typeof m === 'object' && m.active === true) || null;
    return res.json({ ok: true, active, modes });
});

// Trigger an immediate refresh from Hubitat (useful when polling interval is long).
// Returns the latest known hubitat error status after attempting a sync.
app.post('/api/refresh', async (req, res) => {
    if (!HUBITAT_CONFIGURED) {
        return res.status(409).json({ ok: false, error: 'Hubitat not configured' });
    }

    try {
        await syncHubitatData();
        return res.json({ ok: !lastHubitatError, lastFetchAt: lastHubitatFetchAt, lastError: lastHubitatError });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

// Force a live fetch from Hubitat Maker API
app.get('/api/hubitat/devices/all', async (req, res) => {
    try {
        const devices = await fetchHubitatAllDevices();
        // Return raw devices so you can inspect things like "Weatherman".
        res.json({ fetchedAt: lastHubitatFetchAt, count: devices.length, devices });
    } catch (err) {
        res.status(502).json({ error: err?.message || String(err) });
    }
});

// Advanced: return all devices + an "import relevance" analysis + summary.
// This is meant to help decide which currently-ignored device types should be supported next.
app.get('/api/hubitat/devices/all/advanced', async (req, res) => {
    try {
        const devices = await fetchHubitatAllDevices();
        const analyzed = devices.map((d) => ({
            ...d,
            analysis: analyzeHubitatDeviceForImport(d),
        }));

        const summary = summarizeAdvancedDeviceAnalysis(analyzed);
        return res.json({
            fetchedAt: lastHubitatFetchAt,
            count: devices.length,
            summary,
            devices: analyzed,
        });
    } catch (err) {
        return res.status(502).json({ error: err?.message || String(err) });
    }
});

// Simple search helper (case-insensitive substring match on name/label/type/room)
app.get('/api/hubitat/devices/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.status(400).json({ error: 'Missing q' });

    const devices = Array.isArray(lastHubitatDevices) ? lastHubitatDevices : [];
    const matches = devices.filter(d => {
        const hay = [d?.name, d?.label, d?.type, d?.room].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    });

    res.json({
        q,
        fetchedAt: lastHubitatFetchAt,
        count: matches.length,
        matches,
    });
});

// Event ingest endpoint (Hubitat Maker API "postURL" target)
// Security: if EVENTS_INGEST_TOKEN is set, require it via:
// - header: X-Events-Token
// - or query: ?token=
app.post('/api/events', (req, res) => {
    const token = String(req.get('x-events-token') || req.query.token || '').trim();
    if (EVENTS_INGEST_TOKEN && token !== EVENTS_INGEST_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const events = normalizePostedEventsBody(req.body);
    if (!events.length) {
        return res.status(400).json({
            error: 'Expected JSON event payload',
            hint: 'Send application/json (or text/plain containing JSON). Example: {"name":"motion","value":"active","displayName":"Kitchen Motion","deviceId":"24"}',
        });
    }

    let acceptedCount = 0;
    let rejectedCount = 0;
    const acceptedEvents = [];

    for (const payload of events) {
        if (!shouldAcceptIngestedEvent(payload)) {
            rejectedCount += 1;
            continue;
        }

        const event = {
            receivedAt: new Date().toISOString(),
            sourceIp: req.ip,
            payload,
        };

        ingestedEvents.push(event);
        acceptedEvents.push(event);
        acceptedCount += 1;

        // Optional disk persistence for debugging (disabled by default).
        if (EVENTS_PERSIST_JSONL) {
            try {
                ensureDataDirs();
                fs.appendFileSync(path.join(DATA_DIR, 'events.jsonl'), JSON.stringify(event) + '\n');
            } catch {
                // ignore
            }
        }
    }

    pruneIngestedEvents();

    if (acceptedEvents.length) {
        try {
            io.emit('events_ingested', { events: acceptedEvents });
        } catch {
            // ignore
        }

        // Best-effort live updates: apply event payloads to the cached statuses.
        // Polling remains the source of truth and will self-heal any missed events.
        let appliedAny = false;
        let hadUnknownDevice = false;
        for (const evt of acceptedEvents) {
            const payload = evt?.payload;
            const deviceId = payload?.deviceId ?? payload?.device_id ?? payload?.id;
            if (deviceId !== undefined && deviceId !== null) {
                const id = String(deviceId);
                if (!sensorStatuses?.[id]) hadUnknownDevice = true;
            }
            if (applyPostedEventToStatuses(payload)) appliedAny = true;
        }

        if (appliedAny) {
            try {
                io.emit('device_refresh', sensorStatuses);
            } catch {
                // ignore
            }
        }

        // If we got an event for a device we don't have cached, trigger a refresh.
        if (hadUnknownDevice && HUBITAT_CONFIGURED) {
            setTimeout(() => {
                try {
                    syncHubitatData();
                } catch {
                    // ignore
                }
            }, 0);
        }
    }

    return res.status(acceptedCount ? 200 : 202).json({
        accepted: acceptedCount > 0,
        acceptedCount,
        rejectedCount,
    });
});

// Read recent ingested events (newest first)
app.get('/api/events', (req, res) => {
    const limitRaw = String(req.query.limit || '').trim();
    const limitParsed = limitRaw ? Number(limitRaw) : 100;
    const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.floor(limitParsed) : 100;

    const events = ingestedEvents.slice(-limit).reverse();
    res.json({ count: events.length, events });
});

// Open-Meteo weather endpoint (cached)
app.get('/api/weather', async (req, res) => {
    try {
        const force = String(req.query.force || '').toLowerCase() === 'true';
        const includeRaw = String(req.query.raw || '').toLowerCase() === 'true';
        const ttlMs = 5 * 60 * 1000;
        const now = Date.now();
        const lastAt = lastWeatherFetchAt ? Date.parse(lastWeatherFetchAt) : 0;

        if (!force && lastWeather && Number.isFinite(lastAt) && (now - lastAt) < ttlMs) {
            const normalized = normalizeOpenMeteoPayload(lastWeather);
            return res.json({ fetchedAt: lastWeatherFetchAt, cached: true, weather: normalized, ...(includeRaw ? { raw: lastWeather } : {}) });
        }

        const raw = await fetchOpenMeteoForecast();
        const normalized = normalizeOpenMeteoPayload(raw);
        return res.json({ fetchedAt: lastWeatherFetchAt, cached: false, weather: normalized, ...(includeRaw ? { raw } : {}) });
    } catch (err) {
        lastWeatherError = err?.message || String(err);
        const now = Date.now();
        if (now - lastWeatherErrorLoggedAt > 30_000) {
            lastWeatherErrorLoggedAt = now;
            console.error('Open-Meteo error:', lastWeatherError);
        }
        return res.status(502).json({ error: lastWeatherError });
    }
});

// Read the effective Open-Meteo settings (after env overrides).
app.get('/api/weather/open-meteo-config', (req, res) => {
    const open = settings?.weather?.openMeteo || {};
    const env = {
        lat: Boolean(String(process.env.OPEN_METEO_LAT || '').trim()),
        lon: Boolean(String(process.env.OPEN_METEO_LON || '').trim()),
        timezone: Boolean(String(process.env.OPEN_METEO_TZ || '').trim()),
        temperatureUnit: Boolean(String(process.env.OPEN_METEO_TEMPERATURE_UNIT || '').trim()),
        windSpeedUnit: Boolean(String(process.env.OPEN_METEO_WIND_SPEED_UNIT || '').trim()),
        precipitationUnit: Boolean(String(process.env.OPEN_METEO_PRECIPITATION_UNIT || '').trim()),
    };

    return res.json({
        ok: true,
        openMeteo: {
            lat: String(open.lat ?? ''),
            lon: String(open.lon ?? ''),
            timezone: String(open.timezone ?? 'auto'),
            temperatureUnit: String(open.temperatureUnit ?? 'fahrenheit'),
            windSpeedUnit: String(open.windSpeedUnit ?? 'mph'),
            precipitationUnit: String(open.precipitationUnit ?? 'inch'),
        },
        overriddenByEnv: env,
    });
});

// Update Open-Meteo location in server/data/config.json.
// Note: OPEN_METEO_* env vars still override these values.
app.put('/api/weather/open-meteo-config', (req, res) => {
    const raw = req.body && typeof req.body === 'object' ? req.body : {};
    const incoming = raw.openMeteo && typeof raw.openMeteo === 'object' ? raw.openMeteo : raw;

    const latRaw = String(incoming.lat ?? '').trim();
    const lonRaw = String(incoming.lon ?? '').trim();
    const tzRaw = String(incoming.timezone ?? '').trim();

    if (!latRaw || !lonRaw) {
        return res.status(400).json({ error: 'Missing lat/lon' });
    }

    const latParsed = parseDmsOrDecimal(latRaw);
    const lonParsed = parseDmsOrDecimal(lonRaw);
    if (!Number.isFinite(latParsed) || !Number.isFinite(lonParsed)) {
        return res.status(400).json({ error: 'Invalid lat/lon (must be decimal or DMS like 35°29\'44.9"N)' });
    }

    const nextTimezone = tzRaw || 'auto';

    const prevOpen = (persistedConfig?.weather && persistedConfig.weather.openMeteo && typeof persistedConfig.weather.openMeteo === 'object')
        ? persistedConfig.weather.openMeteo
        : {};

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        weather: {
            ...((persistedConfig && persistedConfig.weather) ? persistedConfig.weather : {}),
            openMeteo: {
                ...prevOpen,
                lat: latRaw,
                lon: lonRaw,
                timezone: nextTimezone,
            },
        },
    });

    // Apply immediately for subsequent fetches.
    settings.weather = persistedConfig.weather;
    applyWeatherEnvOverrides();

    // Location changed: clear cache so the next /api/weather reflects it.
    lastWeather = null;
    lastWeatherFetchAt = null;
    lastWeatherError = null;

    persistConfigToDiskIfChanged('api-open-meteo-config');

    const env = {
        lat: Boolean(String(process.env.OPEN_METEO_LAT || '').trim()),
        lon: Boolean(String(process.env.OPEN_METEO_LON || '').trim()),
        timezone: Boolean(String(process.env.OPEN_METEO_TZ || '').trim()),
    };

    return res.json({
        ok: true,
        openMeteo: persistedConfig.weather.openMeteo,
        overriddenByEnv: env,
    });
});

app.get('/api/weather/health', (req, res) => {
    const { lat, lon } = getOpenMeteoCoords();
    res.json({
        ok: !lastWeatherError,
        lat,
        lon,
        lastFetchAt: lastWeatherFetchAt,
        lastError: lastWeatherError,
        cached: !!lastWeather,
    });
});

// Generic Maker API command passthrough (used for switches)
// Body: { command: string, args?: (string|number)[] }
app.post('/api/devices/:id/command', async (req, res) => {
    try {
        if (!HUBITAT_CONFIGURED) {
            return res.status(503).json({ error: 'Hubitat not configured' });
        }
        const deviceId = req.params.id;
        if (!isUiDeviceAllowedForControl(deviceId)) {
            return res.status(403).json({
                error: 'Device not allowed',
                message: 'This device is not in the UI allowlists. Set UI_ALLOWED_MAIN_DEVICE_IDS and/or UI_ALLOWED_CTRL_DEVICE_IDS (or ui.mainAllowedDeviceIds / ui.ctrlAllowedDeviceIds in server/data/config.json).',
            });
        }
        const { command, args = [] } = req.body || {};
        if (!command || typeof command !== 'string') {
            return res.status(400).json({ error: 'Missing command' });
        }

        // MakerAPI can throw internal NullPointerException (sendDeviceCommandSecondary)
        // when the device doesn't support the command (or device id is invalid).
        // Validate against the last cached status to prevent sending unsupported commands.
        const status = sensorStatuses?.[String(deviceId)] || sensorStatuses?.[Number(deviceId)] || null;
        const knownCommands = Array.isArray(status?.commands) ? status.commands.map(String) : null;
        const attrs = status?.attributes && typeof status.attributes === 'object' ? status.attributes : {};
        if (knownCommands && knownCommands.length && !knownCommands.includes(command)) {
            // Special-case: some devices may omit on/off but still expose switch attr; allow on/off anyway.
            const hasSwitchAttr = typeof attrs.switch === 'string';
            const isOnOff = command === 'on' || command === 'off';
            if (!(hasSwitchAttr && isOnOff)) {
                return res.status(400).json({
                    error: 'Unsupported command',
                    message: `Device ${deviceId} does not report support for command '${command}'.`,
                    supportedCommands: knownCommands,
                });
            }
        }

        const cleanedArgs = Array.isArray(args)
            ? args
                .filter((a) => a !== null && a !== undefined)
                .filter((a) => typeof a === 'string' || typeof a === 'number')
                .filter((a) => (typeof a !== 'number') || Number.isFinite(a))
            : [];

        const argsPath = cleanedArgs.length
            ? `/${cleanedArgs.map(a => encodeURIComponent(String(a))).join('/')}`
            : '';

        // Maker API command pattern:
        //   /devices/<DEVICE_ID>/<COMMAND>/<SECONDARY?>?access_token=...
        // Do NOT include an extra "/command/" path segment.
        const url = `${HUBITAT_API_BASE}/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(command)}${argsPath}?access_token=${encodeURIComponent(HUBITAT_ACCESS_TOKEN)}`;

        const hubRes = await hubitatFetch(url, { method: 'GET' });
        if (!hubRes.ok) {
            const text = await hubRes.text().catch(() => '');
            return res.status(502).json({ error: 'Hubitat command failed', status: hubRes.status, details: text });
        }

        // Trigger an immediate refresh so the UI updates quickly
        syncHubitatData();
        return res.json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Command error' });
    }
});

app.post('/api/layout', (req, res) => {
    // Back-compat endpoint: updates persistedConfig.rooms[].layout and persistedConfig.sensors[].position.
    const { rooms, sensors, labels } = req.body || {};

    const roomsArr = Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [];
    const sensorsArr = Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [];
    const labelsArr = Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [];

    const byRoomId = new Map(roomsArr.map(r => [String(r.id), r]));
    const byRoomName = new Map(roomsArr.map(r => [String(r.name || '').trim().toLowerCase(), r]));
    const bySensorId = new Map(sensorsArr.map(s => [String(s.id), s]));
    const byLabelId = new Map(labelsArr.map(l => [String(l.id), l]));

    if (rooms && typeof rooms === 'object') {
        for (const key of Object.keys(rooms)) {
            const patch = rooms[key];
            if (!patch || typeof patch !== 'object') continue;
            const room = byRoomId.get(String(key)) || byRoomName.get(String(key).trim().toLowerCase());
            if (!room) continue;
            room.layout = {
                ...(room.layout || {}),
                x: Number.isFinite(patch.x) ? patch.x : (room.layout?.x ?? 0),
                y: Number.isFinite(patch.y) ? patch.y : (room.layout?.y ?? 9999),
                w: Number.isFinite(patch.w) ? patch.w : (room.layout?.w ?? 2),
                h: Number.isFinite(patch.h) ? patch.h : (room.layout?.h ?? 3),
            };
        }
    }

    if (sensors && typeof sensors === 'object') {
        for (const key of Object.keys(sensors)) {
            const patch = sensors[key];
            if (!patch || typeof patch !== 'object') continue;
            const sensor = bySensorId.get(String(key));
            if (!sensor) continue;
            sensor.position = {
                ...(sensor.position || {}),
                x: Number.isFinite(patch.x) ? patch.x : (sensor.position?.x ?? 0.5),
                y: Number.isFinite(patch.y) ? patch.y : (sensor.position?.y ?? 0.5),
            };
        }
    }

    if (labels && typeof labels === 'object') {
        for (const key of Object.keys(labels)) {
            const patch = labels[key];
            if (!patch || typeof patch !== 'object') continue;
            const label = byLabelId.get(String(key));
            if (!label) continue;
            label.layout = {
                ...(label.layout || {}),
                x: Number.isFinite(patch.x) ? patch.x : (label.layout?.x ?? 0),
                y: Number.isFinite(patch.y) ? patch.y : (label.layout?.y ?? 9999),
                w: Number.isFinite(patch.w) ? patch.w : (label.layout?.w ?? 2),
                h: Number.isFinite(patch.h) ? patch.h : (label.layout?.h ?? 1),
            };
        }
    }

    persistedConfig.rooms = roomsArr;
    persistedConfig.sensors = sensorsArr;
    persistedConfig.labels = labelsArr;
    persistConfigToDiskIfChanged('api-layout');

    // Re-sync runtime (positions + layouts affect UI)
    if (HUBITAT_CONFIGURED) {
        syncHubitatData();
    } else {
        config = {
            rooms: Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [],
            sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
            labels: Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [],
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        io.emit('config_update', config);
    }
    res.json({ success: true });
});

app.delete('/api/layout', (req, res) => {
    // Clears layouts/positions in config.json (keeps discovered rooms/sensors)
    if (Array.isArray(persistedConfig?.rooms)) {
        for (const r of persistedConfig.rooms) {
            if (r && typeof r === 'object') delete r.layout;
        }
    }
    if (Array.isArray(persistedConfig?.sensors)) {
        for (const s of persistedConfig.sensors) {
            if (s && typeof s === 'object') delete s.position;
        }
    }
    if (Array.isArray(persistedConfig?.labels)) {
        for (const l of persistedConfig.labels) {
            if (l && typeof l === 'object') delete l.layout;
        }
    }
    persistConfigToDiskIfChanged('api-layout-delete');
    if (HUBITAT_CONFIGURED) {
        syncHubitatData();
    } else {
        config = {
            rooms: Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [],
            sensors: Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [],
            labels: Array.isArray(persistedConfig?.labels) ? persistedConfig.labels : [],
            ui: {
                ...(persistedConfig?.ui && typeof persistedConfig.ui === 'object' ? persistedConfig.ui : {}),
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                // Back-compat (legacy clients)
                colorScheme: persistedConfig?.ui?.accentColorId,
            },
        };
        io.emit('config_update', config);
    }
    res.json({ success: true });
});

// SPA fallback (only when client is built). Must be after /api routes.
if (HAS_BUILT_CLIENT) {
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (req, res) => {
        res.sendFile(CLIENT_INDEX_HTML);
    });
}

io.on('connection', (socket) => {
    console.log('Client connected');
    socket.emit('config_update', config);
    socket.emit('device_refresh', sensorStatuses);
});

server.listen(PORT, '0.0.0.0', () => {
    const proto = USE_HTTPS ? 'https' : 'http';
    console.log(`Server running on ${proto}://0.0.0.0:${PORT}`);
    if (USE_HTTPS) {
        console.log(`HTTPS certificate: ${HTTPS_CERT_PATH}`);
        console.log('NOTE: If browsers warn, trust the cert on the client device.');
    }
});
