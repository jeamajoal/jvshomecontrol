const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

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
const MAX_BACKUP_FILES = (() => {
    const raw = process.env.BACKUP_MAX_FILES;
    const parsed = raw ? Number(raw) : 200;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 200;
})();

const UI_COLOR_SCHEMES = Object.freeze([
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
    return Array.from(new Set([...(ctrl.ids || []), ...(main.ids || [])]));
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

    const rawScheme = String(uiRaw.colorScheme || '').trim();
    const colorScheme = UI_COLOR_SCHEMES.includes(rawScheme) ? rawScheme : 'electric-blue';

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

    const ALLOWED_TOLERANCE_COLOR_IDS = new Set([
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
        colorScheme,
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
    };

    return out;
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
            persistedConfig = normalizePersistedConfig(raw);
            // If we added new fields for back-compat, write them back once.
            if (!hadAlertSounds || !hadClimateTolerances || !hadColorizeHomeValues || !hadColorizeHomeValuesOpacityPct || !hadClimateToleranceColors || !hadSensorIndicatorColors || !hadHomeBackground) {
                lastPersistedSerialized = stableStringify(raw);
                let label = 'migrate-ui-sensor-indicator-colors';
                if (!hadAlertSounds) label = 'migrate-ui-alert-sounds';
                else if (!hadClimateTolerances) label = 'migrate-ui-climate-tolerances';
                else if (!hadColorizeHomeValues) label = 'migrate-ui-colorize-home-values';
                else if (!hadColorizeHomeValuesOpacityPct) label = 'migrate-ui-colorize-home-opacity';
                else if (!hadClimateToleranceColors) label = 'migrate-ui-climate-tolerance-colors';
                else if (!hadHomeBackground) label = 'migrate-ui-home-background';
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
            ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
            mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
            // Back-compat
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
            colorScheme: persistedConfig?.ui?.colorScheme,
            colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
            colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
            alertSounds: persistedConfig?.ui?.alertSounds,
            climateTolerances: persistedConfig?.ui?.climateTolerances,
            climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
            sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
            homeBackground: persistedConfig?.ui?.homeBackground,
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                // Back-compat
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
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

// If we have a built UI, serve it at '/'. Otherwise provide a simple health message.
app.get('/', (req, res) => {
    if (HAS_BUILT_CLIENT) return res.sendFile(CLIENT_INDEX_HTML);
    return res.send('Home Automation Server - Layout Enabled');
});
app.get('/api/config', (req, res) => {
    // Persist the latest discovered mapping/layout into config.json.
    // This makes config.json the stable source of truth.
    persistConfigToDiskIfChanged('api-config');
    const allowlists = getUiAllowlistsInfo();
    res.json({
        ...config,
        ui: {
            ...(config?.ui || {}),
            ctrlAllowedDeviceIds: allowlists.ctrl.ids,
            mainAllowedDeviceIds: allowlists.main.ids,
            // Back-compat for older clients
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),

            ctrlAllowlistSource: allowlists.ctrl.source,
            ctrlAllowlistLocked: allowlists.ctrl.locked,
            mainAllowlistSource: allowlists.main.source,
            mainAllowlistLocked: allowlists.main.locked,
        },
    });
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
            },
        };
        emitConfigUpdateSafe();
    }

    return res.json({ ok: true });
});

// Update UI device allowlists from the kiosk.
// Back-compat: accepts an array or { allowedDeviceIds: [] } to update the CTRL list.
app.put('/api/ui/allowed-device-ids', (req, res) => {
    const body = req.body;
    const allowlists = getUiAllowlistsInfo();

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

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            ...(nextCtrlIds ? { ctrlAllowedDeviceIds: nextCtrlIds, allowedDeviceIds: nextCtrlIds } : {}),
            ...(nextMainIds ? { mainAllowedDeviceIds: nextMainIds } : {}),
        },
    });

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

// Update UI color scheme from the kiosk.
app.put('/api/ui/color-scheme', (req, res) => {
    const raw = String(req.body?.colorScheme || '').trim();
    if (!raw) {
        return res.status(400).json({ error: 'Missing colorScheme' });
    }
    if (!UI_COLOR_SCHEMES.includes(raw)) {
        return res.status(400).json({
            error: 'Invalid colorScheme',
            allowed: UI_COLOR_SCHEMES,
        });
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            colorScheme: raw,
        },
    });

    persistConfigToDiskIfChanged('api-ui-color-scheme');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            colorScheme: persistedConfig?.ui?.colorScheme,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

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

    const prev = (persistedConfig?.ui && typeof persistedConfig.ui === 'object' && persistedConfig.ui.homeBackground && typeof persistedConfig.ui.homeBackground === 'object')
        ? persistedConfig.ui.homeBackground
        : {};

    const next = {
        enabled,
        url: url || null,
        opacityPct: opacityPct === null
            ? (Number.isFinite(Number(prev.opacityPct)) ? Math.max(0, Math.min(100, Math.round(Number(prev.opacityPct)))) : 35)
            : opacityPct,
    };

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

    const ALLOWED = new Set([
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

    const ALLOWED = new Set([
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
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
                ctrlAllowedDeviceIds: getUiCtrlAllowedDeviceIds(),
                mainAllowedDeviceIds: getUiMainAllowedDeviceIds(),
                allowedDeviceIds: getUiAllowedDeviceIdsUnion(),
                colorScheme: persistedConfig?.ui?.colorScheme,
                colorizeHomeValues: persistedConfig?.ui?.colorizeHomeValues,
                colorizeHomeValuesOpacityPct: persistedConfig?.ui?.colorizeHomeValuesOpacityPct,
                alertSounds: persistedConfig?.ui?.alertSounds,
                climateTolerances: persistedConfig?.ui?.climateTolerances,
                climateToleranceColors: persistedConfig?.ui?.climateToleranceColors,
                sensorIndicatorColors: persistedConfig?.ui?.sensorIndicatorColors,
                homeBackground: persistedConfig?.ui?.homeBackground,
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
