const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
// Legacy note: previous versions used `net` for RTSP websocket port allocation.
const { Server } = require('socket.io');
const crypto = require('crypto');

// --- Import modular configuration ---
const {
    // Paths
    DATA_DIR,
    CONFIG_FILE,
    BACKUP_DIR,
    SOUNDS_DIR,
    BACKGROUNDS_DIR,
    DEVICE_ICONS_DIR,
    CONTROL_ICONS_DIR,
    CLIENT_DIST_DIR,
    CLIENT_INDEX_HTML,
    CERT_DIR_DEFAULT,
    
    // Server
    PORT,
    MAX_BACKUP_FILES,
    
    // Color Schemes
    ALLOWED_TOLERANCE_COLOR_IDS,
    DEFAULT_ACCENT_COLOR_ID,
    
    // UI Defaults (from config/ui.js)
    UI_CARD_OPACITY_SCALE_PCT_RANGE,
    UI_BLUR_SCALE_PCT_RANGE,
    UI_PRIMARY_TEXT_SIZE_PCT_RANGE,
    UI_SECONDARY_TEXT_SIZE_PCT_RANGE,
    UI_TERTIARY_TEXT_SIZE_PCT_RANGE,
    UI_ICON_SIZE_PCT_RANGE,
    UI_CARD_SCALE_PCT_RANGE,
    UI_HOME_ROOM_COLUMNS_XL_RANGE,
    UI_PRIMARY_TEXT_OPACITY_PCT_DEFAULT,
    UI_SECONDARY_TEXT_OPACITY_PCT_DEFAULT,
    UI_TERTIARY_TEXT_OPACITY_PCT_DEFAULT,
    UI_ICON_OPACITY_PCT_DEFAULT,
    
    // Home Dashboard
    HOME_TOP_ROW_CARD_IDS,
    ALLOWED_HOME_TOP_ROW_CARD_IDS,
    ALLOWED_PANEL_DEVICE_COMMANDS,
    SKIP_DEFAULT_COMMANDS,
    ALLOWED_HOME_METRIC_KEYS,
    ALLOWED_HOME_ROOM_METRIC_KEYS,
    
    // Panel Profiles
    DEFAULT_PANEL_PROFILES_PRESETS,
    PRESET_PANEL_PROFILE_NAMES,
    
    // HLS Configuration
    RTSP_HLS_DIR,
    RTSP_HLS_SEGMENT_SECONDS,
    RTSP_HLS_STARTUP_TIMEOUT_MS,
    RTSP_HLS_DEBUG,
    RTSP_HLS_HEALTH_CHECK_INTERVAL_MS,
    RTSP_HLS_MAX_SEGMENT_AGE_SECONDS,
    RTSP_HLS_STALE_THRESHOLD_SECONDS,
    RTSP_HLS_MAX_RESTART_ATTEMPTS,
    RTSP_HLS_RESTART_BACKOFF_MS,
    RTSP_HLS_CLEANUP_ON_SHUTDOWN,
    RTSP_REDACTED_PLACEHOLDER,
    RTSP_REDACTED_PATTERN,
    
    // Hubitat Configuration
    HUBITAT_HOST,
    HUBITAT_APP_ID,
    HUBITAT_ACCESS_TOKEN,
    HUBITAT_CONFIGURED,
    HUBITAT_POLL_INTERVAL_MS,
    HUBITAT_TLS_INSECURE,
    
    // Events Configuration
    MAX_INGESTED_EVENTS,
    EVENTS_INGEST_TOKEN,
    EVENTS_PERSIST_JSONL,
} = require('./config/');
// NOTE: Require the directory explicitly so this does not accidentally resolve
// to a sibling file like server/config.json.

// --- Import utility functions ---
const {
    truthy,
    falsy,
    parseCommaList,
    stableStringify,
    clampInt,
    normalizeAccentColorId,
    isAllowedAccentColorId,
    normalizePanelName,
    isPresetPanelProfile,
    rejectIfPresetPanelProfile,
    parseDmsOrDecimal,
    describeFetchError,
    redactAccessToken,
    tryParseJsonFromText,
} = require('./utils');

// --- Mutable runtime server settings ---
// These shadow the imported constants and can be updated at runtime via the Settings UI.
// Env vars still override config.json values at startup.
let runtimePollIntervalMs = HUBITAT_POLL_INTERVAL_MS;
let runtimeEventsMax = MAX_INGESTED_EVENTS;
let runtimeEventsPersistJsonl = EVENTS_PERSIST_JSONL;
let runtimeBackupMaxFiles = MAX_BACKUP_FILES;
let runtimePort = PORT;
let hubitatPollIntervalId = null;

// --- Mutable Hubitat connection state ---
// Seeded from the imported constants (which read env vars at startup).
// Updated at runtime via /api/server-settings and persisted to config.json.
const { normalizeHubitatHost } = require('./config/hubitat');
const hubitat = {
    host: HUBITAT_HOST,
    appId: HUBITAT_APP_ID,
    accessToken: HUBITAT_ACCESS_TOKEN,
    tlsInsecure: HUBITAT_TLS_INSECURE,
    configured: HUBITAT_CONFIGURED,
    fetchDispatcher: null, // set below after UndiciAgent loads
};
function hubitatApiBase() {
    return hubitat.configured ? `${hubitat.host}/apps/api/${hubitat.appId}` : '';
}
function hubitatApiUrl() {
    return hubitat.configured ? `${hubitatApiBase()}/devices/all?access_token=${encodeURIComponent(hubitat.accessToken)}` : '';
}
function hubitatModesUrl() {
    return hubitat.configured ? `${hubitatApiBase()}/modes?access_token=${encodeURIComponent(hubitat.accessToken)}` : '';
}
function refreshHubitatConfigured() {
    hubitat.configured = Boolean(hubitat.host && hubitat.appId && hubitat.accessToken);
}

// --- Import HLS service ---
const hlsService = require('./services/hls');

// --- Import control icons service ---
const controlIconsService = require('./services/controlIcons');

let UndiciAgent = null;
try {
    // Node's built-in fetch is backed by undici; this lets us disable TLS verification per-request.
    // (Useful when HUBITAT_HOST is https:// with a self-signed cert.)
    // eslint-disable-next-line global-require
    UndiciAgent = require('undici').Agent;
} catch {
    UndiciAgent = null;
}

// Initialize the mutable fetch dispatcher now that UndiciAgent is loaded.
function rebuildHubitatFetchDispatcher() {
    hubitat.fetchDispatcher = (hubitat.tlsInsecure && UndiciAgent)
        ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
        : null;
}
rebuildHubitatFetchDispatcher();

const app = express();

// Note: HOME_TOP_ROW_CARD_IDS, ALLOWED_HOME_TOP_ROW_CARD_IDS, normalizeAccentColorId,
// SECONDARY_TEXT_SIZE_PCT_RANGE, PRIMARY_TEXT_SIZE_PCT_RANGE, BLUR_SCALE_PCT_RANGE,
// ICON_SIZE_PCT_RANGE, ALLOWED_PANEL_DEVICE_COMMANDS, ALLOWED_HOME_METRIC_KEYS,
// ALLOWED_HOME_ROOM_METRIC_KEYS are now imported from ./config and ./utils

// Note: DEFAULT_PANEL_PROFILES_PRESETS, PRESET_PANEL_PROFILE_NAMES, isPresetPanelProfile,
// rejectIfPresetPanelProfile, normalizePanelName are now imported from ./config and ./utils

// If the UI is built (`client/dist`), serve it from the backend so a single service
// provides both the API and the dashboard.
const HAS_BUILT_CLIENT = fs.existsSync(CLIENT_INDEX_HTML);

// --- HTTPS (optional) ---
// Defaults: server/data/certs/localhost.key + server/data/certs/localhost.crt
// Note: truthy and falsy are now imported from ./utils
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

// --- Certificate info helper ---
// Uses Node's built-in X509Certificate to read cert metadata.
function getCertificateInfo() {
    try {
        if (!fs.existsSync(HTTPS_CERT_PATH)) return null;
        const pem = fs.readFileSync(HTTPS_CERT_PATH, 'utf8');
        const cert = new crypto.X509Certificate(pem);
        return {
            subject: cert.subject,
            issuer: cert.issuer,
            validFrom: cert.validFrom,
            validTo: cert.validTo,
            fingerprint256: cert.fingerprint256,
            selfSigned: cert.subject === cert.issuer,
        };
    } catch {
        return null;
    }
}


// --- RTSP -> HLS (HTTPS-friendly) ---
// HLS streaming functionality is now provided by ./services/hls.js
// HLS configuration constants are imported from ./config/hls.js
// Use hlsService methods: startHlsStream, stopHlsStream, stopAllHlsStreams, etc.

function buildHttpUrl(req, p) {
    const proto = USE_HTTPS ? 'https' : 'http';
    const hostHeader = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
    const host = hostHeader ? hostHeader.split(',')[0].trim() : (req?.hostname || 'localhost');
    const cleaned = String(p || '').startsWith('/') ? String(p) : `/${String(p || '')}`;
    return `${proto}://${host}${cleaned}`;
}

// Note: checkFfmpegAvailable is now available from hlsService

// --- Hubitat Maker API ---
// Note: Hubitat configuration is now in the mutable `hubitat` object.
// Functions: describeFetchError, redactAccessToken are imported from ./utils

if (hubitat.tlsInsecure && !UndiciAgent) {
    console.warn('hubitat.tlsInsecure=1 was set but undici could not be loaded; TLS verification may still fail for Hubitat HTTPS.');
}

function hubitatFetch(url, options) {
    const base = options && typeof options === 'object' ? { ...options } : {};
    if (hubitat.fetchDispatcher) {
        return fetch(url, { ...base, dispatcher: hubitat.fetchDispatcher });
    }
    return fetch(url, base);
}

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

function applyWeatherEnvOverrides() {
    // Env vars override persisted config but are not persisted back to disk.
    // Supported:
    // - OPEN_METEO_LAT, OPEN_METEO_LON
    // - OPEN_METEO_TZ (or OPEN_METEO_TIMEZONE)
    // - OPEN_METEO_TEMPERATURE_UNIT, OPEN_METEO_WIND_SPEED_UNIT, OPEN_METEO_PRECIPITATION_UNIT
    try {
        const weather = (settings.weather && typeof settings.weather === 'object') ? { ...settings.weather } : {};
        const prevOpen = (weather.openMeteo && typeof weather.openMeteo === 'object') ? { ...weather.openMeteo } : {};

        const nextOpen = { ...prevOpen };

        const latEnv = String(process.env.OPEN_METEO_LAT || '').trim();
        const lonEnv = String(process.env.OPEN_METEO_LON || '').trim();
        const tzEnv = String(process.env.OPEN_METEO_TZ || process.env.OPEN_METEO_TIMEZONE || '').trim();
        const tempUnitEnv = String(process.env.OPEN_METEO_TEMPERATURE_UNIT || '').trim();
        const windUnitEnv = String(process.env.OPEN_METEO_WIND_SPEED_UNIT || '').trim();
        const precipUnitEnv = String(process.env.OPEN_METEO_PRECIPITATION_UNIT || '').trim();

        if (latEnv) nextOpen.lat = latEnv;
        if (lonEnv) nextOpen.lon = lonEnv;
        if (tzEnv) nextOpen.timezone = tzEnv;
        if (tempUnitEnv) nextOpen.temperatureUnit = tempUnitEnv;
        if (windUnitEnv) nextOpen.windSpeedUnit = windUnitEnv;
        if (precipUnitEnv) nextOpen.precipitationUnit = precipUnitEnv;

        weather.openMeteo = nextOpen;
        settings.weather = weather;

        const changed = stableStringify(prevOpen) !== stableStringify(nextOpen);
        if (changed) {
            // If env overrides changed location/units, the old cache is not valid.
            lastWeather = null;
            lastWeatherFetchAt = null;
            lastWeatherError = null;
        }
    } catch {
        // best-effort only
    }
}

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

// Serve custom device icons from the server-managed device icons directory.
// Files placed in server/data/device-icons/<deviceType>/ will be reachable at:
//   /device-icons/<deviceType>/<file>
app.use('/device-icons', express.static(DEVICE_ICONS_DIR, {
    dotfiles: 'ignore',
    fallthrough: false,
    setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // These are user-edited drop-in assets; avoid stale client caches.
        res.setHeader('Cache-Control', 'no-store');
    },
}));

// Serve interactive control icons from the server-managed control icons directory.
// Files placed in server/data/control-icons/ will be reachable at:
//   /control-icons/<file>
app.use('/control-icons', express.static(CONTROL_ICONS_DIR, {
    dotfiles: 'ignore',
    fallthrough: false,
    setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // SVG icons with manifests; avoid stale caches during development.
        res.setHeader('Cache-Control', 'no-store');
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

// Safe, minimal device catalog for UI configuration (includes all Hubitat devices).
// This is intentionally separate from config.sensors (which is used for rendering devices).
let discoveredDevicesCatalog = [];

// Cached Open-Meteo response
let lastWeather = null;
let lastWeatherFetchAt = null;
let lastWeatherError = null;
let lastWeatherErrorLoggedAt = 0;

// --- EVENT INBOX ---
// Note: MAX_INGESTED_EVENTS, EVENTS_INGEST_TOKEN, EVENTS_PERSIST_JSONL are imported from ./config/events
// Note: tryParseJsonFromText is imported from ./utils
let ingestedEvents = [];

function pruneIngestedEvents() {
    if (ingestedEvents.length > runtimeEventsMax) {
        ingestedEvents = ingestedEvents.slice(-runtimeEventsMax);
    }
}

function shouldAcceptIngestedEvent(payload) {
    // If an allowlist exists and the payload includes a deviceId, enforce it.
    try {
        const allowed = getUiAllowedDeviceIdsUnion();
        if (!allowed.length) return true;
        const deviceId = payload?.deviceId ?? payload?.device_id ?? payload?.id;
        if (deviceId === undefined || deviceId === null) return true;
        return allowed.includes(String(deviceId));
    } catch {
        return true;
    }
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
// Note: parseCommaList is imported from ./utils

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

    // Availability is a global safety boundary. Panel profiles should not be able to
    // expand server-side availability beyond the global allowlists.
    return Array.from(new Set([...(ctrl.ids || []), ...(main.ids || [])]));
}

function getAllowedPanelDeviceCommands() {
    const cfg = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const cfgExtra = Array.isArray(cfg.extraAllowedPanelDeviceCommands) ? cfg.extraAllowedPanelDeviceCommands : [];
    const envExtraRaw = parseCommaList(process.env.UI_EXTRA_ALLOWED_PANEL_DEVICE_COMMANDS);
    const envExtra = envExtraRaw.slice(0, 128);

    const cleanedExtra = [...cfgExtra, ...envExtra]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .filter((s) => s.length <= 64 && /^[A-Za-z0-9_]+$/.test(s));

    return Array.from(new Set([
        ...Array.from(ALLOWED_PANEL_DEVICE_COMMANDS),
        ...cleanedExtra,
    ]));
}

function getAllowedPanelDeviceCommandsSet() {
    return new Set(getAllowedPanelDeviceCommands());
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
    if (!fs.existsSync(DEVICE_ICONS_DIR)) fs.mkdirSync(DEVICE_ICONS_DIR);
}

function normalizeDeviceIconTypeToken(value) {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return null;
    if (s.length > 64) return null;
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(s)) return null;
    return s;
}

function ensureDeviceIconsTypeDir(deviceType) {
    ensureDataDirs();
    const t = normalizeDeviceIconTypeToken(deviceType);
    if (!t) return null;
    const dir = path.join(DEVICE_ICONS_DIR, t);
    try {
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    } catch {
        return null;
    }
}

function listDeviceIconFilesForType(deviceType) {
    const dir = ensureDeviceIconsTypeDir(deviceType);
    if (!dir) return [];
    const safeNameRe = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.svg$/;
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isFile())
            .map((d) => d.name)
            .filter((name) => {
                if (!name || typeof name !== 'string') return false;
                if (name !== path.basename(name)) return false;
                if (!safeNameRe.test(name)) return false;
                if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
                return path.extname(name).toLowerCase() === '.svg';
            })
            .sort((a, b) => a.localeCompare(b));
    } catch {
        return [];
    }
}

// Note: stableStringify is imported from ./utils

function pruneBackupsSync({ maxFiles = runtimeBackupMaxFiles } = {}) {
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

    const availabilityInitialized = uiRaw.availabilityInitialized === true;
    const visibilityInitialized = uiRaw.visibilityInitialized === true;

    const extraAllowedPanelDeviceCommands = (() => {
        const rawArr = Array.isArray(uiRaw.extraAllowedPanelDeviceCommands) ? uiRaw.extraAllowedPanelDeviceCommands : [];
        const cleaned = rawArr
            .map((v) => String(v || '').trim())
            .filter(Boolean)
            .filter((s) => s.length <= 64 && /^[A-Za-z0-9_]+$/.test(s));
        return Array.from(new Set(cleaned)).slice(0, 128);
    })();

    const isSafeCommandToken = (s) => typeof s === 'string' && s.length <= 64 && /^[A-Za-z0-9_]+$/.test(s);
    const isSafeInfoMetricKey = (s) => typeof s === 'string' && s.length <= 64 && /^[A-Za-z0-9_]+$/.test(s);
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
    // Missing key means "show all"; explicit empty array means "show none".
    const hasHomeVisibleDeviceIds = Object.prototype.hasOwnProperty.call(uiRaw, 'homeVisibleDeviceIds');
    const homeVisibleDeviceIds = (() => {
        if (!hasHomeVisibleDeviceIds) return null;
        const cleaned = Array.isArray(uiRaw.homeVisibleDeviceIds)
            ? uiRaw.homeVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
            : [];
        // Back-compat: older configs used empty array to mean "show all".
        // Once the user saves visibility explicitly, empty array means "show none".
        if (!visibilityInitialized && cleaned.length === 0) return null;
        return cleaned;
    })();

    // Controls visibility (which devices appear on the Controls screen).
    // Missing key means "show all"; explicit empty array means "show none".
    const hasCtrlVisibleDeviceIds = Object.prototype.hasOwnProperty.call(uiRaw, 'ctrlVisibleDeviceIds');
    const ctrlVisibleDeviceIds = (() => {
        if (!hasCtrlVisibleDeviceIds) return null;
        const cleaned = Array.isArray(uiRaw.ctrlVisibleDeviceIds)
            ? uiRaw.ctrlVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
            : [];
        if (!visibilityInitialized && cleaned.length === 0) return null;
        return cleaned;
    })();

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
                .filter((c) => c && isSafeCommandToken(c));
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

    const deviceInfoMetricAllowlist = (() => {
        const rawMap = (uiRaw.deviceInfoMetricAllowlist && typeof uiRaw.deviceInfoMetricAllowlist === 'object')
            ? uiRaw.deviceInfoMetricAllowlist
            : {};
        const outMap = {};
        for (const [k, v] of Object.entries(rawMap)) {
            const id = String(k || '').trim();
            if (!id) continue;
            if (!Array.isArray(v)) continue;
            const keys = v
                .map((c) => String(c || '').trim())
                .filter((c) => c && isSafeInfoMetricKey(c));
            // Empty array is allowed (meaning: show no info cards for this device).
            outMap[id] = Array.from(new Set(keys)).slice(0, 32);
        }
        return outMap;
    })();

    const deviceControlStyles = (() => {
        const rawStyles = (uiRaw.deviceControlStyles && typeof uiRaw.deviceControlStyles === 'object')
            ? uiRaw.deviceControlStyles
            : {};

        const rawSwitch = (rawStyles.switch && typeof rawStyles.switch === 'object') ? rawStyles.switch : {};
        const rawControlStyle = String(rawSwitch.controlStyle ?? '').trim().toLowerCase();
        const rawAnimationStyle = String(rawSwitch.animationStyle ?? '').trim().toLowerCase();

        const controlStyle = (rawControlStyle === 'buttons' || rawControlStyle === 'switch' || rawControlStyle === 'auto')
            ? rawControlStyle
            : 'auto';
        const animationStyle = (rawAnimationStyle === 'pulse' || rawAnimationStyle === 'none')
            ? rawAnimationStyle
            : 'none';

        return {
            switch: {
                controlStyle,
                animationStyle,
            },
        };
    })();

    // Per-device control icon overrides
    // Format: { "<deviceId>": "<controlIconId>" | ["<id1>", "<id2>", ...], ... }
    const deviceControlIcons = (() => {
        const rawMap = (uiRaw.deviceControlIcons && typeof uiRaw.deviceControlIcons === 'object')
            ? uiRaw.deviceControlIcons
            : {};
        const outMap = {};
        const isValidIconId = (s) => {
            if (typeof s !== 'string') return false;
            const trimmed = s.trim();
            if (!trimmed || trimmed.length > 64) return false;
            return /^[a-z0-9][a-z0-9-]*$/i.test(trimmed);
        };
        for (const [deviceId, iconValue] of Object.entries(rawMap)) {
            const id = String(deviceId || '').trim();
            if (!id) continue;
            
            // Handle array of icon IDs
            if (Array.isArray(iconValue)) {
                const validIcons = iconValue
                    .map((v) => String(v || '').trim())
                    .filter(isValidIconId);
                if (validIcons.length > 0) {
                    outMap[id] = validIcons;
                }
                continue;
            }
            
            // Handle single string icon ID
            const icon = String(iconValue || '').trim();
            if (!icon || !isValidIconId(icon)) continue;
            outMap[id] = icon;
        }
        return outMap;
    })();

    const normalizeDeviceTypeToken = (value) => {
        const s = String(value || '').trim().toLowerCase();
        // Keep strict: this token becomes a folder name under server/data/device-icons.
        if (!s) return null;
        if (s.length > 64) return null;
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(s)) return null;
        return s;
    };

    const isSafeIconFileName = (value) => {
        const s = String(value || '').trim();
        if (!s) return false;
        if (s !== path.basename(s)) return false;
        if (s.length > 128) return false;
        if (s.includes('..') || s.includes('/') || s.includes('\\')) return false;
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(s)) return false;
        return path.extname(s).toLowerCase() === '.svg';
    };

    const deviceTypeIcons = (() => {
        const rawMap = (uiRaw.deviceTypeIcons && typeof uiRaw.deviceTypeIcons === 'object')
            ? uiRaw.deviceTypeIcons
            : {};
        const outMap = {};
        for (const [k, v] of Object.entries(rawMap)) {
            const deviceType = normalizeDeviceTypeToken(k);
            if (!deviceType) continue;
            const file = String(v ?? '').trim();
            if (!file) {
                outMap[deviceType] = null;
                continue;
            }
            if (!isSafeIconFileName(file)) continue;
            outMap[deviceType] = file;
        }
        return outMap;
    })();

    const rawAccent = String(uiRaw.accentColorId || '').trim();
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
        smoke: 'neon-red',
        co: 'neon-red',
        water: 'neon-blue',
        presence: 'neon-green',
    };

    const sensorRaw = (uiRaw.sensorIndicatorColors && typeof uiRaw.sensorIndicatorColors === 'object')
        ? uiRaw.sensorIndicatorColors
        : {};

    const sensorIndicatorColors = pickColorGroup(sensorRaw, ['motion', 'door', 'smoke', 'co', 'water', 'presence'], DEFAULT_SENSOR_INDICATOR_COLORS);

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
    // Default is 20 (glassy look) so shipped presets can inherit this without specifying it.
    const cardOpacityScalePct = clampInt(
        uiRaw.cardOpacityScalePct,
        UI_CARD_OPACITY_SCALE_PCT_RANGE.min,
        UI_CARD_OPACITY_SCALE_PCT_RANGE.max,
        UI_CARD_OPACITY_SCALE_PCT_RANGE.def,
    );

    // Backdrop blur scale.
    // 100 = default blur, 0 = no blur, 200 = double blur.
    // Default is 15 (light blur) so shipped presets can inherit this without specifying it.
    const blurScalePct = clampInt(
        uiRaw.blurScalePct,
        UI_BLUR_SCALE_PCT_RANGE.min,
        UI_BLUR_SCALE_PCT_RANGE.max,
        UI_BLUR_SCALE_PCT_RANGE.def,
    );

    // Secondary text styling (Home page).
    // Stored as a percent for easier UI controls; the client maps these to CSS.
    const secondaryTextOpacityPct = clampInt(uiRaw.secondaryTextOpacityPct, 0, 100, UI_SECONDARY_TEXT_OPACITY_PCT_DEFAULT);
    const secondaryTextSizePct = clampInt(
        uiRaw.secondaryTextSizePct,
        UI_SECONDARY_TEXT_SIZE_PCT_RANGE.min,
        UI_SECONDARY_TEXT_SIZE_PCT_RANGE.max,
        UI_SECONDARY_TEXT_SIZE_PCT_RANGE.def,
    );
    const secondaryTextColorIdRaw = String(uiRaw.secondaryTextColorId ?? '').trim();
    const secondaryTextColorId = secondaryTextColorIdRaw
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(secondaryTextColorIdRaw) ? secondaryTextColorIdRaw : null)
        : null;

    // Primary text styling (Home page).
    // Stored as a percent for easier UI controls; the client maps these to CSS.
    const primaryTextOpacityPct = clampInt(uiRaw.primaryTextOpacityPct, 0, 100, UI_PRIMARY_TEXT_OPACITY_PCT_DEFAULT);
    const primaryTextSizePct = clampInt(
        uiRaw.primaryTextSizePct,
        UI_PRIMARY_TEXT_SIZE_PCT_RANGE.min,
        UI_PRIMARY_TEXT_SIZE_PCT_RANGE.max,
        UI_PRIMARY_TEXT_SIZE_PCT_RANGE.def,
    );
    const primaryTextColorIdRaw = String(uiRaw.primaryTextColorId ?? '').trim();
    const primaryTextColorId = primaryTextColorIdRaw
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(primaryTextColorIdRaw) ? primaryTextColorIdRaw : null)
        : null;

    // Tertiary text styling (Info card values).
    // Stored as a percent for easier UI controls; the client maps these to CSS.
    const tertiaryTextOpacityPct = clampInt(uiRaw.tertiaryTextOpacityPct, 0, 100, UI_TERTIARY_TEXT_OPACITY_PCT_DEFAULT);
    const tertiaryTextSizePct = clampInt(
        uiRaw.tertiaryTextSizePct,
        UI_TERTIARY_TEXT_SIZE_PCT_RANGE.min,
        UI_TERTIARY_TEXT_SIZE_PCT_RANGE.max,
        UI_TERTIARY_TEXT_SIZE_PCT_RANGE.def,
    );
    const tertiaryTextColorIdRaw = String(uiRaw.tertiaryTextColorId ?? '').trim();
    const tertiaryTextColorId = tertiaryTextColorIdRaw
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(tertiaryTextColorIdRaw) ? tertiaryTextColorIdRaw : null)
        : null;

    // Card scale percent.
    // 100 = default sizing, 50 = half-size, 200 = double-size.
    // Currently used by the Home panel to scale cards/controls for different screens.
    const cardScalePct = clampInt(
        uiRaw.cardScalePct,
        UI_CARD_SCALE_PCT_RANGE.min,
        UI_CARD_SCALE_PCT_RANGE.max,
        UI_CARD_SCALE_PCT_RANGE.def,
    );

    // Home top row visibility + scale.
    const homeTopRowEnabled = uiRaw.homeTopRowEnabled !== false;
    const homeTopRowScalePct = clampInt(uiRaw.homeTopRowScalePct, 50, 120, 100);
    const hasHomeTopRowCards = Object.prototype.hasOwnProperty.call(uiRaw, 'homeTopRowCards');
    const homeTopRowCards = (() => {
        const raw = hasHomeTopRowCards
            ? (Array.isArray(uiRaw.homeTopRowCards) ? uiRaw.homeTopRowCards : [])
            : HOME_TOP_ROW_CARD_IDS;
        const filtered = raw
            .map((v) => String(v || '').trim())
            .filter((v) => v && ALLOWED_HOME_TOP_ROW_CARD_IDS.has(v));
        const uniq = Array.from(new Set(filtered));
        if (uniq.length) return uniq;
        return hasHomeTopRowCards ? [] : HOME_TOP_ROW_CARD_IDS;
    })();

    // Home room grid columns at XL breakpoint (>= 1280px).
    // Default matches current layout (3 columns).
    const homeRoomColumnsXl = clampInt(
        uiRaw.homeRoomColumnsXl,
        UI_HOME_ROOM_COLUMNS_XL_RANGE.min,
        UI_HOME_ROOM_COLUMNS_XL_RANGE.max,
        UI_HOME_ROOM_COLUMNS_XL_RANGE.def,
    );

    // Home room layout mode.
    // - grid: standard CSS grid behavior
    // - masonry: fixed auto rows + per-tile row spans
    const homeRoomLayoutModeRaw = String(uiRaw.homeRoomLayoutMode ?? '').trim().toLowerCase();
    const homeRoomLayoutMode = homeRoomLayoutModeRaw === 'masonry' ? 'masonry' : 'grid';

    // Masonry row height (px). Only used when homeRoomLayoutMode === 'masonry'.
    const homeRoomMasonryRowHeightPx = clampInt(uiRaw.homeRoomMasonryRowHeightPx, 4, 40, 10);

    // Home room auto-fit layout (optional).
    // 0 disables (use fixed columns behavior), otherwise treated as min tile width in px.
    const homeRoomMinWidthPx = clampInt(uiRaw.homeRoomMinWidthPx, 0, 1200, 0);

    // Per-room overrides for Home tiles.
    // Shape: { [roomId]: { span?: number(1-6), order?: number(-999..999), rowSpan?: number(1-999) } }
    const homeRoomTiles = (() => {
        const rawMap = (uiRaw.homeRoomTiles && typeof uiRaw.homeRoomTiles === 'object') ? uiRaw.homeRoomTiles : {};
        const outMap = {};

        for (const [ridRaw, vRaw] of Object.entries(rawMap)) {
            const rid = String(ridRaw || '').trim();
            if (!rid) continue;
            const v = (vRaw && typeof vRaw === 'object') ? vRaw : {};

            const hasSpan = Object.prototype.hasOwnProperty.call(v, 'span');
            const hasOrder = Object.prototype.hasOwnProperty.call(v, 'order');
            const hasRowSpan = Object.prototype.hasOwnProperty.call(v, 'rowSpan');

            const spanNum = hasSpan ? (typeof v.span === 'number' ? v.span : Number(v.span)) : null;
            const orderNum = hasOrder ? (typeof v.order === 'number' ? v.order : Number(v.order)) : null;
            const rowSpanNum = hasRowSpan ? (typeof v.rowSpan === 'number' ? v.rowSpan : Number(v.rowSpan)) : null;

            const entry = {};
            if (hasSpan && Number.isFinite(spanNum)) {
                entry.span = Math.max(1, Math.min(6, Math.round(spanNum)));
            }
            if (hasOrder && Number.isFinite(orderNum)) {
                entry.order = Math.max(-999, Math.min(999, Math.round(orderNum)));
            }
            if (hasRowSpan && Number.isFinite(rowSpanNum)) {
                entry.rowSpan = Math.max(1, Math.min(999, Math.round(rowSpanNum)));
            }

            if (Object.keys(entry).length) {
                outMap[rid] = entry;
            }
        }

        return outMap;
    })();

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

    const iconOpacityPct = clampInt(uiRaw.iconOpacityPct, 0, 100, UI_ICON_OPACITY_PCT_DEFAULT);
    const iconSizePct = clampInt(
        uiRaw.iconSizePct,
        UI_ICON_SIZE_PCT_RANGE.min,
        UI_ICON_SIZE_PCT_RANGE.max,
        UI_ICON_SIZE_PCT_RANGE.def,
    );

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

        const pSchemeRaw = String(p.accentColorId || '').trim();
        const pColorScheme = (() => {
            if (!pSchemeRaw) return null;
            if (isAllowedAccentColorId(pSchemeRaw)) return pSchemeRaw;
            return null;
        })();
        const pCardOpacityScalePct = Object.prototype.hasOwnProperty.call(p, 'cardOpacityScalePct')
            ? clampInt(p.cardOpacityScalePct, UI_CARD_OPACITY_SCALE_PCT_RANGE.min, UI_CARD_OPACITY_SCALE_PCT_RANGE.max, cardOpacityScalePct)
            : null;
        const pBlurScalePct = Object.prototype.hasOwnProperty.call(p, 'blurScalePct')
            ? clampInt(p.blurScalePct, UI_BLUR_SCALE_PCT_RANGE.min, UI_BLUR_SCALE_PCT_RANGE.max, blurScalePct)
            : null;
        const pSecondaryTextOpacityPct = Object.prototype.hasOwnProperty.call(p, 'secondaryTextOpacityPct')
            ? clampInt(p.secondaryTextOpacityPct, 0, 100, secondaryTextOpacityPct)
            : null;
        const pSecondaryTextSizePct = Object.prototype.hasOwnProperty.call(p, 'secondaryTextSizePct')
            ? clampInt(
                p.secondaryTextSizePct,
                UI_SECONDARY_TEXT_SIZE_PCT_RANGE.min,
                UI_SECONDARY_TEXT_SIZE_PCT_RANGE.max,
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
                UI_PRIMARY_TEXT_SIZE_PCT_RANGE.min,
                UI_PRIMARY_TEXT_SIZE_PCT_RANGE.max,
                primaryTextSizePct,
            )
            : null;
        const pPrimaryTextColorIdRaw = Object.prototype.hasOwnProperty.call(p, 'primaryTextColorId')
            ? String(p.primaryTextColorId ?? '').trim()
            : null;
        const pPrimaryTextColorId = pPrimaryTextColorIdRaw
            ? (ALLOWED_TOLERANCE_COLOR_IDS.has(pPrimaryTextColorIdRaw) ? pPrimaryTextColorIdRaw : null)
            : null;

        const pTertiaryTextOpacityPct = Object.prototype.hasOwnProperty.call(p, 'tertiaryTextOpacityPct')
            ? clampInt(p.tertiaryTextOpacityPct, 0, 100, tertiaryTextOpacityPct)
            : null;
        const pTertiaryTextSizePct = Object.prototype.hasOwnProperty.call(p, 'tertiaryTextSizePct')
            ? clampInt(
                p.tertiaryTextSizePct,
                UI_TERTIARY_TEXT_SIZE_PCT_RANGE.min,
                UI_TERTIARY_TEXT_SIZE_PCT_RANGE.max,
                tertiaryTextSizePct,
            )
            : null;
        const pTertiaryTextColorIdRaw = Object.prototype.hasOwnProperty.call(p, 'tertiaryTextColorId')
            ? String(p.tertiaryTextColorId ?? '').trim()
            : null;
        const pTertiaryTextColorId = pTertiaryTextColorIdRaw
            ? (ALLOWED_TOLERANCE_COLOR_IDS.has(pTertiaryTextColorIdRaw) ? pTertiaryTextColorIdRaw : null)
            : null;

        const pCardScalePct = Object.prototype.hasOwnProperty.call(p, 'cardScalePct')
            ? clampInt(p.cardScalePct, UI_CARD_SCALE_PCT_RANGE.min, UI_CARD_SCALE_PCT_RANGE.max, cardScalePct)
            : null;
        const pHomeTopRowEnabled = Object.prototype.hasOwnProperty.call(p, 'homeTopRowEnabled')
            ? (p.homeTopRowEnabled !== false)
            : null;
        const pHomeTopRowScalePct = Object.prototype.hasOwnProperty.call(p, 'homeTopRowScalePct')
            ? clampInt(p.homeTopRowScalePct, 50, 120, homeTopRowScalePct)
            : null;
        const hasPanelHomeTopRowCards = Object.prototype.hasOwnProperty.call(p, 'homeTopRowCards');
        const pHomeTopRowCards = hasPanelHomeTopRowCards
            ? (() => {
                const raw = Array.isArray(p.homeTopRowCards) ? p.homeTopRowCards : [];
                const cards = raw
                    .map((v) => String(v || '').trim())
                    .filter((v) => v && ALLOWED_HOME_TOP_ROW_CARD_IDS.has(v));
                const uniq = Array.from(new Set(cards));
                return uniq.length ? uniq : [];
            })()
            : null;
        const pHomeRoomColumnsXl = Object.prototype.hasOwnProperty.call(p, 'homeRoomColumnsXl')
            ? clampInt(p.homeRoomColumnsXl, UI_HOME_ROOM_COLUMNS_XL_RANGE.min, UI_HOME_ROOM_COLUMNS_XL_RANGE.max, homeRoomColumnsXl)
            : null;

        const pHomeRoomLayoutMode = Object.prototype.hasOwnProperty.call(p, 'homeRoomLayoutMode')
            ? (() => {
                const raw = String(p.homeRoomLayoutMode ?? '').trim().toLowerCase();
                if (raw === 'masonry') return 'masonry';
                if (raw === 'grid') return 'grid';
                return null;
            })()
            : null;

        const pHomeRoomMasonryRowHeightPx = Object.prototype.hasOwnProperty.call(p, 'homeRoomMasonryRowHeightPx')
            ? clampInt(p.homeRoomMasonryRowHeightPx, 4, 40, homeRoomMasonryRowHeightPx)
            : null;

        const pHomeRoomMinWidthPx = Object.prototype.hasOwnProperty.call(p, 'homeRoomMinWidthPx')
            ? clampInt(p.homeRoomMinWidthPx, 0, 1200, homeRoomMinWidthPx)
            : null;

        const pHomeRoomTiles = Object.prototype.hasOwnProperty.call(p, 'homeRoomTiles')
            ? (() => {
                const rawMap = (p.homeRoomTiles && typeof p.homeRoomTiles === 'object') ? p.homeRoomTiles : {};
                const outMap = {};

                for (const [ridRaw, vRaw] of Object.entries(rawMap)) {
                    const rid = String(ridRaw || '').trim();
                    if (!rid) continue;
                    const v = (vRaw && typeof vRaw === 'object') ? vRaw : {};

                    const hasSpan = Object.prototype.hasOwnProperty.call(v, 'span');
                    const hasOrder = Object.prototype.hasOwnProperty.call(v, 'order');
                    const hasRowSpan = Object.prototype.hasOwnProperty.call(v, 'rowSpan');

                    const spanNum = hasSpan ? (typeof v.span === 'number' ? v.span : Number(v.span)) : null;
                    const orderNum = hasOrder ? (typeof v.order === 'number' ? v.order : Number(v.order)) : null;
                    const rowSpanNum = hasRowSpan ? (typeof v.rowSpan === 'number' ? v.rowSpan : Number(v.rowSpan)) : null;

                    const entry = {};
                    if (hasSpan && Number.isFinite(spanNum)) {
                        entry.span = Math.max(1, Math.min(6, Math.round(spanNum)));
                    }
                    if (hasOrder && Number.isFinite(orderNum)) {
                        entry.order = Math.max(-999, Math.min(999, Math.round(orderNum)));
                    }
                    if (hasRowSpan && Number.isFinite(rowSpanNum)) {
                        entry.rowSpan = Math.max(1, Math.min(999, Math.round(rowSpanNum)));
                    }

                    if (Object.keys(entry).length) {
                        outMap[rid] = entry;
                    }
                }

                return outMap;
            })()
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
            ? clampInt(p.iconSizePct, UI_ICON_SIZE_PCT_RANGE.min, UI_ICON_SIZE_PCT_RANGE.max, iconSizePct)
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

        const pCtrlVisibleDeviceIds = Object.prototype.hasOwnProperty.call(p, 'ctrlVisibleDeviceIds')
            ? (Array.isArray(p.ctrlVisibleDeviceIds)
                ? p.ctrlVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
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
                    .filter((c) => c && isSafeCommandToken(c));
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

        const pDeviceInfoMetricAllowlist = (() => {
            if (!Object.prototype.hasOwnProperty.call(p, 'deviceInfoMetricAllowlist')) return null;
            const rawMap = (p.deviceInfoMetricAllowlist && typeof p.deviceInfoMetricAllowlist === 'object')
                ? p.deviceInfoMetricAllowlist
                : {};
            const outMap = {};
            for (const [k, v] of Object.entries(rawMap)) {
                const id = String(k || '').trim();
                if (!id) continue;
                if (!Array.isArray(v)) continue;
                const keys = v
                    .map((c) => String(c || '').trim())
                    .filter((c) => c && isSafeInfoMetricKey(c));
                outMap[id] = Array.from(new Set(keys)).slice(0, 32);
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
            ...(pTertiaryTextOpacityPct !== null ? { tertiaryTextOpacityPct: pTertiaryTextOpacityPct } : {}),
            ...(pTertiaryTextSizePct !== null ? { tertiaryTextSizePct: pTertiaryTextSizePct } : {}),
            ...(pTertiaryTextColorId !== null ? { tertiaryTextColorId: pTertiaryTextColorId } : {}),
            ...(pCardScalePct !== null ? { cardScalePct: pCardScalePct } : {}),
            ...(pHomeTopRowEnabled !== null ? { homeTopRowEnabled: pHomeTopRowEnabled } : {}),
            ...(pHomeTopRowScalePct !== null ? { homeTopRowScalePct: pHomeTopRowScalePct } : {}),
            ...(pHomeTopRowCards !== null ? { homeTopRowCards: pHomeTopRowCards } : {}),
            ...(pHomeRoomColumnsXl !== null ? { homeRoomColumnsXl: pHomeRoomColumnsXl } : {}),
            ...(pHomeRoomLayoutMode !== null ? { homeRoomLayoutMode: pHomeRoomLayoutMode } : {}),
            ...(pHomeRoomMasonryRowHeightPx !== null ? { homeRoomMasonryRowHeightPx: pHomeRoomMasonryRowHeightPx } : {}),
            ...(pHomeRoomMinWidthPx !== null ? { homeRoomMinWidthPx: pHomeRoomMinWidthPx } : {}),
            ...(pHomeRoomTiles !== null ? { homeRoomTiles: pHomeRoomTiles } : {}),
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
            ...(pCtrlVisibleDeviceIds !== null ? { ctrlVisibleDeviceIds: pCtrlVisibleDeviceIds } : {}),
            ...(pCtrlAllowedDeviceIds !== null ? { ctrlAllowedDeviceIds: pCtrlAllowedDeviceIds } : {}),
            ...(pMainAllowedDeviceIds !== null ? { mainAllowedDeviceIds: pMainAllowedDeviceIds } : {}),
            ...(pDeviceLabelOverrides !== null ? { deviceLabelOverrides: pDeviceLabelOverrides } : {}),
            ...(pDeviceCommandAllowlist !== null ? { deviceCommandAllowlist: pDeviceCommandAllowlist } : {}),
            ...(pDeviceHomeMetricAllowlist !== null ? { deviceHomeMetricAllowlist: pDeviceHomeMetricAllowlist } : {}),
            ...(pDeviceInfoMetricAllowlist !== null ? { deviceInfoMetricAllowlist: pDeviceInfoMetricAllowlist } : {}),
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
        ...(homeVisibleDeviceIds !== null ? { homeVisibleDeviceIds } : {}),
        ...(ctrlVisibleDeviceIds !== null ? { ctrlVisibleDeviceIds } : {}),
        deviceLabelOverrides,
        deviceCommandAllowlist,
        deviceHomeMetricAllowlist,
        deviceInfoMetricAllowlist,
        deviceControlStyles,
        deviceTypeIcons,
        deviceControlIcons,
        extraAllowedPanelDeviceCommands,
        availabilityInitialized,
        visibilityInitialized,
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
        // Tertiary (info card values) text styling.
        tertiaryTextOpacityPct,
        tertiaryTextSizePct,
        tertiaryTextColorId,
        // Scale percent for UI cards/controls (used by Home fit-scale).
        cardScalePct,
        // Home top row visibility/scale/cards.
        homeTopRowEnabled,
        homeTopRowScalePct,
        homeTopRowCards,
        // Home room columns at XL breakpoint.
        homeRoomColumnsXl,
        // Home room layout.
        // - homeRoomLayoutMode: 'grid' | 'masonry'
        // - homeRoomMasonryRowHeightPx: px used by masonry mode
        // - homeRoomMinWidthPx: 0 disables auto-fit
        // - homeRoomTiles: per-room overrides
        homeRoomLayoutMode,
        homeRoomMasonryRowHeightPx,
        // Home room auto-fit layout (optional).
        homeRoomMinWidthPx,
        homeRoomTiles,
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

    // --- Server settings (non-sensitive, runtime-tunable) ---
    out.serverSettings = (() => {
        const raw = (out.serverSettings && typeof out.serverSettings === 'object') ? out.serverSettings : {};
        const safeInt = (v, min, max) => {
            const num = Number(v);
            return Number.isFinite(num) ? Math.max(min, Math.min(max, Math.floor(num))) : null;
        };
        const safeStr = (v) => {
            const s = String(v ?? '').trim();
            return s || null;
        };
        return {
            pollIntervalMs: safeInt(raw.pollIntervalMs, 1000, 3600000),
            eventsMax: safeInt(raw.eventsMax, 50, 10000),
            eventsPersistJsonl: typeof raw.eventsPersistJsonl === 'boolean' ? raw.eventsPersistJsonl : null,
            backupMaxFiles: safeInt(raw.backupMaxFiles, 10, 1000),
            // Hubitat connection (persisted so the UI can configure without env vars)
            hubitatHost: safeStr(raw.hubitatHost),
            hubitatAppId: safeStr(raw.hubitatAppId),
            hubitatAccessToken: safeStr(raw.hubitatAccessToken),
            hubitatTlsInsecure: typeof raw.hubitatTlsInsecure === 'boolean' ? raw.hubitatTlsInsecure : null,
            // Network (port requires restart to take effect; min 80 prevents accidental low-port saves)
            port: safeInt(raw.port, 80, 65535),
        };
    })();

    return out;
}

// Update device control style preferences by internal device type.
// Expected payload: { deviceControlStyles: { switch?: { controlStyle?: 'auto'|'buttons'|'switch', animationStyle?: 'none'|'pulse' } } }
app.put('/api/ui/device-control-styles', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const incoming = (body.deviceControlStyles && typeof body.deviceControlStyles === 'object') ? body.deviceControlStyles : null;
    if (!incoming) {
        return res.status(400).json({ error: 'Missing deviceControlStyles' });
    }

    const prevUi = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const prevStyles = (prevUi.deviceControlStyles && typeof prevUi.deviceControlStyles === 'object') ? prevUi.deviceControlStyles : {};
    const prevSwitch = (prevStyles.switch && typeof prevStyles.switch === 'object') ? prevStyles.switch : {};

    const incomingSwitch = (incoming.switch && typeof incoming.switch === 'object') ? incoming.switch : {};
    const nextStyles = {
        ...prevStyles,
        ...incoming,
        switch: {
            ...prevSwitch,
            ...incomingSwitch,
        },
    };

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...prevUi,
            deviceControlStyles: nextStyles,
        },
    });

    persistConfigToDiskIfChanged('api-ui-device-control-styles');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            deviceControlStyles: persistedConfig?.ui?.deviceControlStyles,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update device icon filename mapping by internal device type.
// Expected payload: { deviceTypeIcons: { [deviceType: string]: string|null } }
app.put('/api/ui/device-type-icons', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const incoming = (body.deviceTypeIcons && typeof body.deviceTypeIcons === 'object') ? body.deviceTypeIcons : null;
    if (!incoming) {
        return res.status(400).json({ error: 'Missing deviceTypeIcons' });
    }

    const prevUi = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const prevMap = (prevUi.deviceTypeIcons && typeof prevUi.deviceTypeIcons === 'object') ? prevUi.deviceTypeIcons : {};

    const nextMap = { ...prevMap };
    for (const [k, v] of Object.entries(incoming)) {
        const t = normalizeDeviceIconTypeToken(k);
        if (!t) continue;
        const file = (v === null || v === undefined) ? '' : String(v).trim();
        nextMap[t] = file || null;
        // Ensure folder exists even if no icon file is chosen yet.
        ensureDeviceIconsTypeDir(t);
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...prevUi,
            deviceTypeIcons: nextMap,
        },
    });

    persistConfigToDiskIfChanged('api-ui-device-type-icons');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            deviceTypeIcons: persistedConfig?.ui?.deviceTypeIcons,
            deviceControlIcons: persistedConfig?.ui?.deviceControlIcons,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update per-device control icon assignments.
// Expected payload: { deviceControlIcons: { [deviceId: string]: string|string[]|null } }
app.put('/api/ui/device-control-icons', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const incoming = (body.deviceControlIcons && typeof body.deviceControlIcons === 'object') ? body.deviceControlIcons : null;
    if (!incoming) {
        return res.status(400).json({ error: 'Missing deviceControlIcons' });
    }

    const prevUi = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
    const prevMap = (prevUi.deviceControlIcons && typeof prevUi.deviceControlIcons === 'object') ? prevUi.deviceControlIcons : {};

    const nextMap = { ...prevMap };
    
    // Validate icon ID format
    const isValidIconId = (id) => {
        if (typeof id !== 'string') return false;
        const trimmed = id.trim();
        return trimmed && /^[a-z0-9][a-z0-9-]*$/i.test(trimmed) && trimmed.length <= 64;
    };
    
    for (const [deviceId, iconValue] of Object.entries(incoming)) {
        const id = String(deviceId || '').trim();
        if (!id) continue;
        
        // Handle null/undefined - remove assignment
        if (iconValue === null || iconValue === undefined) {
            nextMap[id] = null;
            continue;
        }
        
        // Handle array of icon IDs
        if (Array.isArray(iconValue)) {
            const validIcons = iconValue
                .map((v) => String(v || '').trim())
                .filter(isValidIconId);
            nextMap[id] = validIcons.length > 0 ? validIcons : null;
            continue;
        }
        
        // Handle single string icon ID (backward compat)
        const icon = String(iconValue).trim();
        if (isValidIconId(icon)) {
            nextMap[id] = icon;
        }
    }

    // Remove null entries to keep config clean
    for (const k of Object.keys(nextMap)) {
        if (nextMap[k] === null || nextMap[k] === '' || (Array.isArray(nextMap[k]) && nextMap[k].length === 0)) {
            delete nextMap[k];
        }
    }

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        ui: {
            ...prevUi,
            deviceControlIcons: nextMap,
        },
    });

    persistConfigToDiskIfChanged('api-ui-device-control-icons');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            deviceControlIcons: persistedConfig?.ui?.deviceControlIcons,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

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
            ...(Object.prototype.hasOwnProperty.call(ui, 'homeVisibleDeviceIds')
                ? { homeVisibleDeviceIds: Array.isArray(ui.homeVisibleDeviceIds) ? ui.homeVisibleDeviceIds : [] }
                : {}),
            ...(Object.prototype.hasOwnProperty.call(ui, 'ctrlVisibleDeviceIds')
                ? { ctrlVisibleDeviceIds: Array.isArray(ui.ctrlVisibleDeviceIds) ? ui.ctrlVisibleDeviceIds : [] }
                : {}),
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
            tertiaryTextOpacityPct: ui.tertiaryTextOpacityPct,
            tertiaryTextSizePct: ui.tertiaryTextSizePct,
            tertiaryTextColorId: ui.tertiaryTextColorId,
            cardScalePct: ui.cardScalePct,
            homeTopRowEnabled: ui.homeTopRowEnabled,
            homeTopRowScalePct: ui.homeTopRowScalePct,
            homeTopRowCards: Array.isArray(ui.homeTopRowCards) ? ui.homeTopRowCards : HOME_TOP_ROW_CARD_IDS,
            homeRoomColumnsXl: ui.homeRoomColumnsXl,
            homeRoomLayoutMode: String(ui.homeRoomLayoutMode ?? 'grid').trim() || 'grid',
            homeRoomMasonryRowHeightPx: clampInt(ui.homeRoomMasonryRowHeightPx, 4, 40, 10),
            homeRoomMinWidthPx: clampInt(ui.homeRoomMinWidthPx, 0, 1200, 0),
            homeRoomTiles: (ui.homeRoomTiles && typeof ui.homeRoomTiles === 'object') ? ui.homeRoomTiles : {},
            homeRoomMetricColumns: clampInt(ui.homeRoomMetricColumns, 0, 3, 0),
            homeRoomMetricKeys: Array.isArray(ui.homeRoomMetricKeys) ? ui.homeRoomMetricKeys : ['temperature', 'humidity', 'illuminance'],
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
        ...(persistedConfig || {}),
        ui: {
            ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
            panelProfiles: nextProfiles,
        },
    });

    persistConfigToDiskIfChanged('ensure-panel-profile');
    rebuildRuntimeConfigFromPersisted();
    return name;
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
            const hadHomeTopRowEnabled = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeTopRowEnabled'));
            const hadHomeTopRowScalePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeTopRowScalePct'));
            const hadHomeTopRowCards = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeTopRowCards'));
            const hadHomeRoomColumnsXl = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeRoomColumnsXl'));
            const hadHomeRoomMetricColumns = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeRoomMetricColumns'));
            const hadHomeRoomMetricKeys = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'homeRoomMetricKeys'));
            const hadGlowColorId = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'glowColorId'));
            const hadIconColorId = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'iconColorId'));
            const hadIconOpacityPct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'iconOpacityPct'));
            const hadIconSizePct = Boolean(raw?.ui && typeof raw.ui === 'object' && Object.prototype.hasOwnProperty.call(raw.ui, 'iconSizePct'));
            persistedConfig = normalizePersistedConfig(raw);

            // Ensure device icon folder structure exists at startup.
            try {
                ensureDeviceIconsTypeDir('switch');
                ensureDeviceIconsTypeDir('dimmer');
                ensureDeviceIconsTypeDir('media_player');
                ensureDeviceIconsTypeDir('button');
                ensureDeviceIconsTypeDir('sensor');
                ensureDeviceIconsTypeDir('unknown');
                const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
                const types = (ui.deviceTypeIcons && typeof ui.deviceTypeIcons === 'object') ? Object.keys(ui.deviceTypeIcons) : [];
                for (const t of types) ensureDeviceIconsTypeDir(t);
            } catch {
                // ignore
            }

            // If we added new fields for back-compat, write them back once.
            if (!hadAlertSounds || !hadClimateTolerances || !hadColorizeHomeValues || !hadColorizeHomeValuesOpacityPct || !hadClimateToleranceColors || !hadSensorIndicatorColors || !hadHomeBackground || !hadCardOpacityScalePct || !hadBlurScalePct || !hadSecondaryTextOpacityPct || !hadSecondaryTextSizePct || !hadSecondaryTextColorId || !hadPrimaryTextOpacityPct || !hadPrimaryTextSizePct || !hadPrimaryTextColorId || !hadCardScalePct || !hadHomeTopRowEnabled || !hadHomeTopRowScalePct || !hadHomeTopRowCards || !hadHomeRoomColumnsXl || !hadHomeRoomMetricColumns || !hadHomeRoomMetricKeys || !hadGlowColorId || !hadIconColorId || !hadIconOpacityPct || !hadIconSizePct) {
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
                else if (!hadHomeTopRowEnabled) label = 'migrate-ui-home-top-row-enabled';
                else if (!hadHomeTopRowScalePct) label = 'migrate-ui-home-top-row-scale';
                else if (!hadHomeTopRowCards) label = 'migrate-ui-home-top-row-cards';
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

            // Ensure device icon folder structure exists at startup.
            try {
                ensureDeviceIconsTypeDir('switch');
                ensureDeviceIconsTypeDir('dimmer');
                ensureDeviceIconsTypeDir('media_player');
                ensureDeviceIconsTypeDir('button');
                ensureDeviceIconsTypeDir('sensor');
                ensureDeviceIconsTypeDir('unknown');
            } catch {
                // ignore
            }
        }

        // Derive runtime settings from persisted config
        settings.weather = persistedConfig.weather;
        applyWeatherEnvOverrides();
        applyServerSettings();

        lastPersistedSerialized = stableStringify(persistedConfig);
        console.log('Config loaded');
    } catch (err) {
        console.error('Error loading config.json:', err);
        persistedConfig = normalizePersistedConfig({ weather: settings.weather, rooms: [], sensors: [] });
        lastPersistedSerialized = stableStringify(persistedConfig);
        applyWeatherEnvOverrides();
        applyServerSettings();
    }
}

// Apply persisted serverSettings to the mutable runtime variables.
// Env vars take priority: if an env var is set, the persisted value is ignored.
function applyServerSettings() {
    const ss = persistedConfig?.serverSettings || {};
    if (!process.env.HUBITAT_POLL_INTERVAL_MS && ss.pollIntervalMs != null) {
        runtimePollIntervalMs = ss.pollIntervalMs;
    }
    if (!process.env.EVENTS_MAX && ss.eventsMax != null) {
        runtimeEventsMax = ss.eventsMax;
    }
    if (!process.env.EVENTS_PERSIST_JSONL && ss.eventsPersistJsonl != null) {
        runtimeEventsPersistJsonl = ss.eventsPersistJsonl;
    }
    if (!process.env.BACKUP_MAX_FILES && ss.backupMaxFiles != null) {
        runtimeBackupMaxFiles = ss.backupMaxFiles;
    }
    if (!process.env.PORT && ss.port != null) {
        const p = Number(ss.port);
        runtimePort = (Number.isFinite(p) && p >= 80 && p <= 65535) ? Math.floor(p) : PORT;
    }

    // --- Hubitat connection settings ---
    // Env vars always win over config.json values.
    let tlsChanged = false;

    if (!process.env.HUBITAT_HOST && ss.hubitatHost != null) {
        hubitat.host = normalizeHubitatHost(ss.hubitatHost);
    }
    if (!process.env.HUBITAT_APP_ID && ss.hubitatAppId != null) {
        hubitat.appId = ss.hubitatAppId;
    }
    if (!process.env.HUBITAT_ACCESS_TOKEN && ss.hubitatAccessToken != null) {
        hubitat.accessToken = ss.hubitatAccessToken;
    }
    if (!process.env.HUBITAT_TLS_INSECURE && ss.hubitatTlsInsecure != null) {
        const newVal = ss.hubitatTlsInsecure === true;
        if (newVal !== hubitat.tlsInsecure) tlsChanged = true;
        hubitat.tlsInsecure = newVal;
    }

    refreshHubitatConfigured();
    if (tlsChanged) rebuildHubitatFetchDispatcher();
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
    const openMeteo = settings?.weather?.openMeteo || {};
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
        },
        serverSettings: {
            pollIntervalMs: runtimePollIntervalMs,
            eventsMax: runtimeEventsMax,
            eventsPersistJsonl: runtimeEventsPersistJsonl,
            backupMaxFiles: runtimeBackupMaxFiles,
            temperatureUnit: openMeteo.temperatureUnit || 'fahrenheit',
            windSpeedUnit: openMeteo.windSpeedUnit || 'mph',
            precipitationUnit: openMeteo.precipitationUnit || 'inch',
            // Hubitat connection state (token is NEVER sent — write-only from UI)
            hubitatHost: hubitat.host || '',
            hubitatAppId: hubitat.appId || '',
            hubitatConfigured: hubitat.configured,
            hubitatHasAccessToken: Boolean(hubitat.accessToken),
            hubitatTlsInsecure: hubitat.tlsInsecure,
            // Network & Security
            port: runtimePort,
            httpsActive: USE_HTTPS,
            certInfo: getCertificateInfo(),
            certExists: fs.existsSync(HTTPS_CERT_PATH) && fs.existsSync(HTTPS_KEY_PATH),
        },
        serverSettingsEnvLocked: {
            pollIntervalMs: Boolean(String(process.env.HUBITAT_POLL_INTERVAL_MS || '').trim()),
            eventsMax: Boolean(String(process.env.EVENTS_MAX || '').trim()),
            eventsPersistJsonl: Boolean(String(process.env.EVENTS_PERSIST_JSONL || '').trim()),
            backupMaxFiles: Boolean(String(process.env.BACKUP_MAX_FILES || '').trim()),
            temperatureUnit: Boolean(String(process.env.OPEN_METEO_TEMPERATURE_UNIT || '').trim()),
            windSpeedUnit: Boolean(String(process.env.OPEN_METEO_WIND_SPEED_UNIT || '').trim()),
            precipitationUnit: Boolean(String(process.env.OPEN_METEO_PRECIPITATION_UNIT || '').trim()),
            hubitatHost: Boolean(String(process.env.HUBITAT_HOST || '').trim()),
            hubitatAppId: Boolean(String(process.env.HUBITAT_APP_ID || '').trim()),
            hubitatAccessToken: Boolean(String(process.env.HUBITAT_ACCESS_TOKEN || '').trim()),
            hubitatTlsInsecure: Boolean(String(process.env.HUBITAT_TLS_INSECURE || '').trim()),
            port: Boolean(String(process.env.PORT || '').trim()),
        },
    };
}

rebuildRuntimeConfigFromPersisted();

// --- HUBITAT MAPPER ---

function mapDeviceType(capabilities, typeName) {
    const typeLabel = String(typeName || '').toLowerCase();
    if (typeLabel.includes('chromecast video')) return 'chromecast_video';
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
        hue: attrs.hue,
        saturation: attrs.saturation,
        colorTemperature: attrs.colorTemperature,
        colorMode: attrs.colorMode,
        colorName: attrs.colorName,
        // Media/Audio controls
        volume: attrs.volume,
        mute: attrs.mute,
        playbackStatus: attrs.playbackStatus,
        transportStatus: attrs.transportStatus,
        mediaSource: attrs.mediaSource,
        trackDescription: attrs.trackDescription,
    };
}

function pickCommands(commands = []) {
    try {
        return commands.map(c => c?.command).filter(Boolean);
    } catch {
        return [];
    }
}


// Note: parseDmsOrDecimal is imported from ./utils

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

        // Build a safe, minimal catalog for the Settings UI (includes ALL Hubitat devices).
        // Note: this is separate from config.sensors; global availability controls will use this.
        try {
            const source = 'hubitat';
            const sourceId = String(persistedConfig?.hubitat?.name || persistedConfig?.hubitat?.baseUrl || 'hubitat').trim() || 'hubitat';
            discoveredDevicesCatalog = (Array.isArray(devices) ? devices : [])
                .map((d) => {
                    const id = String(d?.id ?? '').trim();
                    if (!id) return null;
                    const label = String(d?.label ?? id).trim() || id;
                    const room = String(d?.room ?? '').trim();
                    const capabilities = Array.isArray(d?.capabilities) ? d.capabilities.map((c) => String(c)) : [];
                    const commands = pickCommands(d.commands);
                    return {
                        id,
                        label,
                        ...(room ? { room } : {}),
                        source,
                        sourceId,
                        capabilities,
                        commands,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        } catch {
            // ignore
        }

        // One-time initialization: if availability was never set, default to "all discovered devices available".
        // This preserves a reasonable out-of-the-box experience while still making availability authoritative.
        try {
            const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
            const availabilityInitialized = ui.availabilityInitialized === true;
            const mainLocked = truthy(process.env.UI_ALLOWED_MAIN_DEVICE_IDS_LOCKED);
            const ctrlLocked = truthy(process.env.UI_ALLOWED_CTRL_DEVICE_IDS_LOCKED);

            const mainArr = Array.isArray(ui.mainAllowedDeviceIds) ? ui.mainAllowedDeviceIds : [];
            const ctrlArr = Array.isArray(ui.ctrlAllowedDeviceIds) ? ui.ctrlAllowedDeviceIds : [];
            const legacyArr = Array.isArray(ui.allowedDeviceIds) ? ui.allowedDeviceIds : [];

            const hasAnyAllowlist = mainArr.length > 0 || ctrlArr.length > 0 || legacyArr.length > 0;
            if (!availabilityInitialized && !hasAnyAllowlist && !mainLocked && !ctrlLocked) {
                const allIds = (Array.isArray(discoveredDevicesCatalog) ? discoveredDevicesCatalog : []).map((d) => String(d.id));
                persistedConfig = normalizePersistedConfig({
                    ...persistedConfig,
                    ui: {
                        ...(ui || {}),
                        availabilityInitialized: true,
                        mainAllowedDeviceIds: allIds,
                        ctrlAllowedDeviceIds: allIds,
                    },
                });
                persistConfigToDiskIfChanged('init-availability-all');
            }
        } catch {
            // ignore
        }

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

        const source = 'hubitat';
        const sourceId = String(persistedConfig?.hubitat?.name || persistedConfig?.hubitat?.baseUrl || 'hubitat').trim() || 'hubitat';

        devices.forEach(dev => {
            const caps = Array.isArray(dev?.capabilities) ? dev.capabilities : [];
            const attrs = (dev?.attributes && typeof dev.attributes === 'object') ? dev.attributes : {};

            // Import all Hubitat devices. The UI surface is controlled by:
            // - Global availability allowlists
            // - Screen visibility allowlists
            // - Per-device command allowlists

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
            const type = mapDeviceType(caps, dev.type);
            const state = mapState({ ...dev, attributes: attrs }, type);

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
                source,
                sourceId,
                roomId: roomId,
                label: dev.label,
                type: type,
                capabilities: caps,
                metadata: { battery: attrs?.battery },
                position
            });

            newStatuses[dev.id] = {
                id: dev.id,
                source,
                sourceId,
                label: dev.label,
                roomId,
                capabilities: caps,
                commands: pickCommands(dev.commands),
                type,
                state,
                attributes: pickAttributes(attrs),
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
        io.emit('device_refresh', getClientSafeStatuses());

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
    if (!hubitat.configured) {
        throw new Error('Hubitat not configured. Set Hubitat Host, App ID, and Access Token in Settings (or via environment variables).');
    }
    let res;
    const apiUrl = hubitatApiUrl();
    try {
        res = await hubitatFetch(apiUrl);
    } catch (err) {
        const safeUrl = redactAccessToken(apiUrl);
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


function restartHubitatPollInterval() {
    if (hubitatPollIntervalId) clearInterval(hubitatPollIntervalId);
    hubitatPollIntervalId = setInterval(syncHubitatData, runtimePollIntervalMs);
}

if (hubitat.configured) {
    restartHubitatPollInterval();
    syncHubitatData();
} else {
    lastHubitatError = 'Hubitat not configured. Set Hubitat Host, App ID, and Access Token in Settings (or via environment variables).';
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
    const getObservedDeviceTypes = () => {
        const types = new Set();
        const sensors = Array.isArray(config?.sensors) ? config.sensors : [];
        for (const s of sensors) {
            const t = normalizeDeviceIconTypeToken(s?.type);
            if (t) types.add(t);
        }
        return Array.from(types).sort((a, b) => a.localeCompare(b));
    };
    const allowlists = getUiAllowlistsInfo();
    const publicCameras = getPublicCamerasList();

    const sensorsRaw = Array.isArray(config?.sensors) ? config.sensors : [];
    const globallyAvailableIds = new Set([
        ...(Array.isArray(allowlists?.main?.ids) ? allowlists.main.ids : []),
        ...(Array.isArray(allowlists?.ctrl?.ids) ? allowlists.ctrl.ids : []),
    ].map((v) => String(v)));
    // Availability is authoritative: only globally-allowed devices are exposed for panels.
    const sensors = sensorsRaw.filter((s) => globallyAvailableIds.has(String(s?.id)));

    return {
        ...config,
        sensors,
        ui: {
            ...(config?.ui || {}),
            // Do not leak snapshot URLs or credentials to the browser.
            cameras: publicCameras,
            // Full discovered catalog for Settings (includes devices not currently available).
            discoveredDevices: Array.isArray(discoveredDevicesCatalog) ? discoveredDevicesCatalog : [],
            // Observed internal device types (for dynamic icon dropdowns).
            deviceTypesObserved: getObservedDeviceTypes(),
            ctrlAllowedDeviceIds: allowlists.ctrl.ids,
            mainAllowedDeviceIds: allowlists.main.ids,
            // Back-compat for older clients
            allowedDeviceIds: getUiAllowedDeviceIdsUnion(),

            // Server-validated list of commands that Settings/UI is allowed to surface.
            allowedPanelDeviceCommands: getAllowedPanelDeviceCommands(),

            ctrlAllowlistSource: allowlists.ctrl.source,
            ctrlAllowlistLocked: allowlists.ctrl.locked,
            mainAllowlistSource: allowlists.main.source,
            mainAllowlistLocked: allowlists.main.locked,
        },
    };
}

function getClientSafeStatuses() {
    const allowlists = getUiAllowlistsInfo();
    const globallyAvailableIds = new Set([
        ...(Array.isArray(allowlists?.main?.ids) ? allowlists.main.ids : []),
        ...(Array.isArray(allowlists?.ctrl?.ids) ? allowlists.ctrl.ids : []),
    ].map((v) => String(v)));

    // Match getClientSafeConfig(): only globally-available devices are exposed.

    const out = {};
    const src = sensorStatuses && typeof sensorStatuses === 'object' ? sensorStatuses : {};
    for (const [id, st] of Object.entries(src)) {
        if (globallyAvailableIds.has(String(id))) out[id] = st;
    }
    return out;
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
        const ffmpegCheck = hlsService.checkFfmpegAvailable(ffmpegPath);
        if (!ffmpegCheck.ok) {
            return res.status(500).json({ ok: false, error: 'ffmpeg_not_available', detail: ffmpegCheck.error || null });
        }

        const state = hlsService.startHlsStream(cameraId, rtspUrl, ffmpegPath);
        if (!state) {
            return res.status(500).json({ ok: false, error: 'failed_to_start_hls' });
        }

        if (!state.ffmpeg) {
            return res.status(502).json({
                ok: false,
                error: 'hls_output_not_writable',
                detail: state.lastError || null,
            });
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

        const debugPayload = RTSP_HLS_DEBUG
            ? {
                ffmpeg: {
                    bin: String(ffmpegPath || 'ffmpeg'),
                    // Redact credentials in args (rtsp url).
                    args: (Array.isArray(state.ffmpegArgs)
                        ? state.ffmpegArgs.map((a) => (a === rtspUrl ? hlsService.redactRtspUrl(rtspUrl) : a))
                        : null),
                },
            }
            : {};

        const stderrTail = Array.isArray(state.stderrTail) ? state.stderrTail.slice(-30) : null;
        const stderrText = Array.isArray(state.stderrTail) ? state.stderrTail.join('\n') : '';

        const hint = (() => {
            // Heuristic hints for common RTSP startup failures.
            if (/Output file does not contain any stream/i.test(stderrText)) {
                return 'ffmpeg did not detect a usable video stream. If this is a D-Link MJPEG RTSP URL (e.g. play3.sdp), try switching the camera to an H.264 RTSP profile/URL or use RTSP over TCP.';
            }
            if (/Quantization tables not found/i.test(stderrText) || /Invalid RTP\/JPEG packet/i.test(stderrText)) {
                return 'The RTSP stream appears to be MJPEG over RTP with invalid/missing JPEG quantization tables (often caused by packet loss on UDP or a camera profile issue). Try RTSP over TCP and/or switch to an H.264 RTSP URL/profile.';
            }
            if (/Could not find codec parameters/i.test(stderrText) || /unspecified size/i.test(stderrText)) {
                return 'ffmpeg could not determine the video dimensions during probe. Verify the RTSP URL is correct and accessible, and prefer RTSP over TCP.';
            }
            return null;
        })();

        if (state.ffmpeg && state.ffmpeg.exitCode !== null && !fs.existsSync(state.playlistPath)) {
            return res.status(502).json({
                ok: false,
                error: 'hls_ffmpeg_exited',
                exitCode: state.ffmpeg.exitCode,
                lastError: state.lastError || null,
                stderrTail,
                ...(hint ? { hint } : {}),
                ...debugPayload,
            });
        }

        if (!fs.existsSync(state.playlistPath)) {
            return res.status(502).json({
                ok: false,
                error: 'hls_start_timeout',
                timeoutMs: RTSP_HLS_STARTUP_TIMEOUT_MS,
                lastError: state.lastError || null,
                stderrTail,
                ...(hint ? { hint } : {}),
                ...debugPayload,
            });
        }

        // Include health status in successful response
        const newestSegmentMs = hlsService.getNewestSegmentTimeMs(state.dir);
        const lastSegmentAge = newestSegmentMs ? Date.now() - newestSegmentMs : null;
        
        return res.json({
            ok: true,
            playlistUrl: buildHttpUrl(req, `/api/cameras/${encodeURIComponent(cameraId)}/hls/playlist.m3u8`),
            health: {
                status: state.healthStatus,
                lastSegmentAgeSeconds: lastSegmentAge ? Math.floor(lastSegmentAge / 1000) : null,
                restartAttempts: state.restartAttempts,
                totalRestarts: state.totalRestarts,
            },
        });
    } catch (err) {
        console.error('HLS ensure error', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

app.get('/api/cameras/:id/hls/playlist.m3u8', async (req, res) => {
    try {
        const cameraId = String(req.params.id || '').trim();
        const state = hlsService.getHlsStreams().get(cameraId);
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
        const state = hlsService.getHlsStreams().get(cameraId);
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

// HLS Health Monitoring Endpoint
app.get('/api/hls/health', (req, res) => {
    try {
        const streams = {};
        const now = Date.now();
        
        for (const [cameraId, state] of hlsService.getHlsStreams().entries()) {
            const newestSegmentMs = hlsService.getNewestSegmentTimeMs(state.dir);
            const ffmpegRunning = state.ffmpeg && state.ffmpeg.exitCode === null;
            const uptime = now - state.startedAtMs;
            const lastSegmentAge = newestSegmentMs ? now - newestSegmentMs : null;
            
            streams[cameraId] = {
                healthStatus: state.healthStatus,
                ffmpegRunning,
                uptime,
                uptimeSeconds: Math.floor(uptime / 1000),
                startedAt: new Date(state.startedAtMs).toISOString(),
                lastSegmentTime: newestSegmentMs ? new Date(newestSegmentMs).toISOString() : null,
                lastSegmentAgeSeconds: lastSegmentAge ? Math.floor(lastSegmentAge / 1000) : null,
                restartAttempts: state.restartAttempts,
                totalRestarts: state.totalRestarts,
                currentBackoffMs: state.currentBackoffMs,
                maxRestartAttempts: RTSP_HLS_MAX_RESTART_ATTEMPTS,
                lastError: state.lastError || null,
            };
        }
        
        const summary = {
            totalStreams: hlsService.getHlsStreams().size,
            healthy: Object.values(streams).filter(s => s.healthStatus === 'healthy').length,
            stale: Object.values(streams).filter(s => s.healthStatus === 'stale').length,
            dead: Object.values(streams).filter(s => s.healthStatus === 'dead').length,
            starting: Object.values(streams).filter(s => s.healthStatus === 'starting').length,
            restarting: Object.values(streams).filter(s => s.healthStatus === 'restarting').length,
        };
        
        return res.json({
            ok: true,
            summary,
            streams,
            config: {
                healthCheckIntervalMs: RTSP_HLS_HEALTH_CHECK_INTERVAL_MS,
                maxSegmentAgeSeconds: RTSP_HLS_MAX_SEGMENT_AGE_SECONDS,
                staleThresholdSeconds: RTSP_HLS_STALE_THRESHOLD_SECONDS,
                maxRestartAttempts: RTSP_HLS_MAX_RESTART_ATTEMPTS,
                restartBackoffMs: RTSP_HLS_RESTART_BACKOFF_MS,
                cleanupOnShutdown: RTSP_HLS_CLEANUP_ON_SHUTDOWN,
            },
        });
    } catch (err) {
        console.error('HLS health endpoint error:', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
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
app.get('/api/status', (req, res) => res.json(getClientSafeStatuses()));

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

app.get('/api/device-icons', (req, res) => {
    try {
        ensureDataDirs();

        // Seed common internal types so the folder structure appears even before icons exist.
        const seededTypes = new Set([
            'switch',
            'dimmer',
            'media_player',
            'button',
            'sensor',
            'unknown',
            ...Object.keys((config?.ui?.deviceTypeIcons && typeof config.ui.deviceTypeIcons === 'object') ? config.ui.deviceTypeIcons : {}),
        ].map((t) => normalizeDeviceIconTypeToken(t)).filter(Boolean));

        for (const t of seededTypes) ensureDeviceIconsTypeDir(t);

        const typesOnDisk = fs.readdirSync(DEVICE_ICONS_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .map((t) => normalizeDeviceIconTypeToken(t))
            .filter(Boolean);

        const allTypes = Array.from(new Set([...Array.from(seededTypes), ...typesOnDisk]))
            .sort((a, b) => a.localeCompare(b));

        const byType = {};
        for (const t of allTypes) {
            byType[t] = listDeviceIconFilesForType(t);
        }

        res.json({ ok: true, rootUrl: '/device-icons', byType });
    } catch (err) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

app.get('/api/device-icons/:deviceType', (req, res) => {
    try {
        const t = normalizeDeviceIconTypeToken(req.params.deviceType);
        if (!t) return res.status(400).json({ ok: false, error: 'invalid_device_type' });
        const files = listDeviceIconFilesForType(t);
        res.json({ ok: true, deviceType: t, rootUrl: '/device-icons', files });
    } catch (err) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL ICONS API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/control-icons
 * Returns all available control icons with their manifests.
 */
app.get('/api/control-icons', (req, res) => {
    try {
        const icons = controlIconsService.getControlIcons();
        res.json({ ok: true, rootUrl: '/control-icons', icons });
    } catch (err) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

/**
 * GET /api/control-icons/:id
 * Returns a specific control icon by ID with its manifest.
 */
app.get('/api/control-icons/:id', (req, res) => {
    try {
        const icon = controlIconsService.getControlIconById(req.params.id);
        if (!icon) {
            return res.status(404).json({ ok: false, error: 'control_icon_not_found' });
        }
        res.json({ ok: true, icon });
    } catch (err) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

/**
 * GET /api/control-icons/:id/svg
 * Returns the raw SVG content for a control icon.
 */
app.get('/api/control-icons/:id/svg', (req, res) => {
    try {
        const svg = controlIconsService.getControlIconSvg(req.params.id);
        if (!svg) {
            return res.status(404).json({ ok: false, error: 'control_icon_not_found' });
        }
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);
    } catch (err) {
        res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
});

/**
 * POST /api/control-icons/compatible
 * Body: { commands: ["on", "off", "setLevel", ...] }
 * Returns control icons that are compatible with the given device commands.
 */
app.post('/api/control-icons/compatible', (req, res) => {
    try {
        const commands = req.body?.commands;
        if (!Array.isArray(commands)) {
            return res.status(400).json({ ok: false, error: 'commands_array_required' });
        }
        const icons = controlIconsService.getCompatibleControlIcons(commands);
        res.json({ ok: true, icons });
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

    if (hubitat.configured) {
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

    if (hubitat.configured) {
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

    if (hubitat.configured) {
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

    if (hubitat.configured) {
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

    if (hubitat.configured) {
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
        const prevRtsp = (prev.rtsp && typeof prev.rtsp === 'object') ? prev.rtsp : {};
        const prevRtspUrl = String(prevRtsp.url || '').trim();
        let url = String(rtspRaw.url || '').trim();

        // Allow redacted RTSP URLs from the Settings UI to keep the stored credentials.
        if (url && prevRtspUrl) {
            const redactedPrev = redactUrlPassword(prevRtspUrl);
            const looksRedacted = RTSP_REDACTED_PATTERN.test(url);
            if (url === redactedPrev || looksRedacted) {
                url = prevRtspUrl;
            }
        }

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
    hlsService.stopHlsStream(id);

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

    // If a device becomes newly available, pre-enable its primary control
    // commands and skip utility / lifecycle commands (configure, initialize, etc.).
    const smartDefaultCommands = (deviceId) => {
        const entry = (Array.isArray(discoveredDevicesCatalog) ? discoveredDevicesCatalog : [])
            .find((d) => String(d.id) === String(deviceId));
        const cmds = Array.isArray(entry?.commands) ? entry.commands : [];
        return cmds.filter((c) => !SKIP_DEFAULT_COMMANDS.has(c));
    };

    const computeNewlyAvailableIds = () => {
        const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};

        if (panelName) {
            const profiles = (ui.panelProfiles && typeof ui.panelProfiles === 'object') ? ui.panelProfiles : {};
            const p = (profiles[panelName] && typeof profiles[panelName] === 'object') ? profiles[panelName] : {};

            const prevCtrl = Array.isArray(p.ctrlAllowedDeviceIds)
                ? p.ctrlAllowedDeviceIds
                : (Array.isArray(p.allowedDeviceIds) ? p.allowedDeviceIds : []);
            const prevMain = Array.isArray(p.mainAllowedDeviceIds) ? p.mainAllowedDeviceIds : [];

            const prevUnion = new Set([...prevCtrl, ...prevMain].map((v) => String(v || '').trim()).filter(Boolean));
            const nextCtrl = nextCtrlIds !== null ? nextCtrlIds : prevCtrl.map((v) => String(v || '').trim()).filter(Boolean);
            const nextMain = nextMainIds !== null ? nextMainIds : prevMain.map((v) => String(v || '').trim()).filter(Boolean);
            const nextUnion = new Set([...nextCtrl, ...nextMain].map((v) => String(v || '').trim()).filter(Boolean));

            const added = [];
            for (const id of nextUnion) {
                if (!prevUnion.has(id)) added.push(id);
            }
            return added;
        }

        const prevCtrl = Array.isArray(ui.ctrlAllowedDeviceIds)
            ? ui.ctrlAllowedDeviceIds
            : (Array.isArray(ui.allowedDeviceIds) ? ui.allowedDeviceIds : []);
        const prevMain = Array.isArray(ui.mainAllowedDeviceIds) ? ui.mainAllowedDeviceIds : [];

        const prevUnion = new Set([...prevCtrl, ...prevMain].map((v) => String(v || '').trim()).filter(Boolean));
        const nextCtrl = nextCtrlIds !== null ? nextCtrlIds : prevCtrl.map((v) => String(v || '').trim()).filter(Boolean);
        const nextMain = nextMainIds !== null ? nextMainIds : prevMain.map((v) => String(v || '').trim()).filter(Boolean);
        const nextUnion = new Set([...nextCtrl, ...nextMain].map((v) => String(v || '').trim()).filter(Boolean));

        const added = [];
        for (const id of nextUnion) {
            if (!prevUnion.has(id)) added.push(id);
        }
        return added;
    };

    const newlyAvailableIds = computeNewlyAvailableIds();

    if (panelName) {
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
        const profiles = (ui.panelProfiles && typeof ui.panelProfiles === 'object') ? ui.panelProfiles : {};
        const prevProfile = (profiles[ensured] && typeof profiles[ensured] === 'object') ? profiles[ensured] : {};
        const prevCmds = (prevProfile.deviceCommandAllowlist && typeof prevProfile.deviceCommandAllowlist === 'object')
            ? prevProfile.deviceCommandAllowlist
            : {};

        const nextCmds = { ...prevCmds };
        for (const id of newlyAvailableIds) {
            if (!Object.prototype.hasOwnProperty.call(nextCmds, id)) {
                nextCmds[id] = smartDefaultCommands(id);
            }
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                availabilityInitialized: true,
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        ...(nextCtrlIds !== null ? { ctrlAllowedDeviceIds: nextCtrlIds } : {}),
                        ...(nextMainIds !== null ? { mainAllowedDeviceIds: nextMainIds } : {}),
                        ...(newlyAvailableIds.length ? { deviceCommandAllowlist: nextCmds } : {}),
                    },
                },
            },
        });
    } else {
        const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
        const prevCmds = (ui.deviceCommandAllowlist && typeof ui.deviceCommandAllowlist === 'object') ? ui.deviceCommandAllowlist : {};
        const nextCmds = { ...prevCmds };
        for (const id of newlyAvailableIds) {
            if (!Object.prototype.hasOwnProperty.call(nextCmds, id)) {
                nextCmds[id] = smartDefaultCommands(id);
            }
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                availabilityInitialized: true,
                ...(nextCtrlIds !== null ? { ctrlAllowedDeviceIds: nextCtrlIds, allowedDeviceIds: nextCtrlIds } : {}),
                ...(nextMainIds !== null ? { mainAllowedDeviceIds: nextMainIds } : {}),
                ...(newlyAvailableIds.length ? { deviceCommandAllowlist: nextCmds } : {}),
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui');

    rebuildRuntimeConfigFromPersisted();

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
    io.emit('device_refresh', getClientSafeStatuses());

    return res.json({
        ok: true,
        ui: {
            ...(config?.ui || {}),
        },
    });
});

// Update which devices are visible on the Home dashboard (metrics/room cards) for the current panel.
// Expected payload: { homeVisibleDeviceIds: string[], panelName?: string }
// Empty list means "show no devices".
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
                visibilityInitialized: true,
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
                visibilityInitialized: true,
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
            ctrlVisibleDeviceIds: persistedConfig?.ui?.ctrlVisibleDeviceIds,
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

// Update which devices are visible on the Controls dashboard for the current panel.
// Expected payload: { ctrlVisibleDeviceIds: string[], panelName?: string }
// Empty list means "show no devices".
app.put('/api/ui/ctrl-visible-device-ids', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const ctrlVisibleDeviceIds = Array.isArray(body.ctrlVisibleDeviceIds)
        ? body.ctrlVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
        : null;

    if (!Array.isArray(ctrlVisibleDeviceIds)) {
        return res.status(400).json({ error: 'Expected { ctrlVisibleDeviceIds: string[] }' });
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
                visibilityInitialized: true,
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured]) ? persistedConfig.ui.panelProfiles[ensured] : {})),
                        ctrlVisibleDeviceIds,
                    },
                },
            },
        });
    } else {
        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                visibilityInitialized: true,
                ctrlVisibleDeviceIds,
            },
        });
    }

    persistConfigToDiskIfChanged('api-ui-ctrl-visible-device-ids');

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
            // fields
            homeVisibleDeviceIds: persistedConfig?.ui?.homeVisibleDeviceIds,
            ctrlVisibleDeviceIds: persistedConfig?.ui?.ctrlVisibleDeviceIds,
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

// Update per-device UI overrides (label + command allowlist + Home metric allowlist + info cards).
// Expected payload: { deviceId: string, label?: string|null, commands?: string[]|null, homeMetrics?: string[]|null, infoMetrics?: string[]|null, panelName?: string }
app.put('/api/ui/device-overrides', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) {
        return res.status(400).json({ error: 'Missing deviceId' });
    }

    const isSafeInfoMetricKey = (s) => typeof s === 'string' && s.length <= 64 && /^[A-Za-z0-9_]+$/.test(s);

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
                .filter((c) => c && c.length <= 64 && /^[A-Za-z0-9_]+$/.test(c))
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

    const infoMetricsRaw = Object.prototype.hasOwnProperty.call(body, 'infoMetrics') ? body.infoMetrics : undefined;
    const infoMetrics = (infoMetricsRaw === null || infoMetricsRaw === undefined)
        ? null
        : (Array.isArray(infoMetricsRaw)
            ? infoMetricsRaw
                .map((c) => String(c || '').trim())
                .filter((c) => c && isSafeInfoMetricKey(c))
            : null);
    if (infoMetricsRaw !== undefined && infoMetricsRaw !== null && !Array.isArray(infoMetricsRaw)) {
        return res.status(400).json({ error: 'infoMetrics must be an array of strings (or null)' });
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
        const prevInfo = (prev.deviceInfoMetricAllowlist && typeof prev.deviceInfoMetricAllowlist === 'object') ? prev.deviceInfoMetricAllowlist : {};

        const nextLabels = { ...prevLabels };
        if (labelRaw !== undefined) {
            if (label === null || label === '') delete nextLabels[deviceId];
            else nextLabels[deviceId] = label;
        }

        const nextCmds = { ...prevCmds };
        if (commandsRaw !== undefined) {
            if (commands === null) {
                delete nextCmds[deviceId];
            } else {
                nextCmds[deviceId] = Array.from(new Set(commands)).slice(0, 32);
            }
        }

        const nextHome = { ...prevHome };
        if (homeMetricsRaw !== undefined) {
            if (homeMetrics === null) {
                delete nextHome[deviceId];
            } else {
                nextHome[deviceId] = Array.from(new Set(homeMetrics)).slice(0, 16);
            }
        }

        const nextInfo = { ...prevInfo };
        if (infoMetricsRaw !== undefined) {
            if (infoMetrics === null) {
                delete nextInfo[deviceId];
            } else {
                nextInfo[deviceId] = Array.from(new Set(infoMetrics)).slice(0, 32);
            }
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
                        deviceInfoMetricAllowlist: nextInfo,
                    },
                },
            },
        });
    } else {
        const ui = (persistedConfig?.ui && typeof persistedConfig.ui === 'object') ? persistedConfig.ui : {};
        const prevLabels = (ui.deviceLabelOverrides && typeof ui.deviceLabelOverrides === 'object') ? ui.deviceLabelOverrides : {};
        const prevCmds = (ui.deviceCommandAllowlist && typeof ui.deviceCommandAllowlist === 'object') ? ui.deviceCommandAllowlist : {};
        const prevHome = (ui.deviceHomeMetricAllowlist && typeof ui.deviceHomeMetricAllowlist === 'object') ? ui.deviceHomeMetricAllowlist : {};
        const prevInfo = (ui.deviceInfoMetricAllowlist && typeof ui.deviceInfoMetricAllowlist === 'object') ? ui.deviceInfoMetricAllowlist : {};

        const nextLabels = { ...prevLabels };
        if (labelRaw !== undefined) {
            if (label === null || label === '') delete nextLabels[deviceId];
            else nextLabels[deviceId] = label;
        }

        const nextCmds = { ...prevCmds };
        if (commandsRaw !== undefined) {
            if (commands === null) {
                delete nextCmds[deviceId];
            } else {
                nextCmds[deviceId] = Array.from(new Set(commands)).slice(0, 32);
            }
        }

        const nextHome = { ...prevHome };
        if (homeMetricsRaw !== undefined) {
            if (homeMetrics === null) {
                delete nextHome[deviceId];
            } else {
                nextHome[deviceId] = Array.from(new Set(homeMetrics)).slice(0, 16);
            }
        }

        const nextInfo = { ...prevInfo };
        if (infoMetricsRaw !== undefined) {
            if (infoMetrics === null) {
                delete nextInfo[deviceId];
            } else {
                nextInfo[deviceId] = Array.from(new Set(infoMetrics)).slice(0, 32);
            }
        }

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...ui,
                deviceLabelOverrides: nextLabels,
                deviceCommandAllowlist: nextCmds,
                deviceHomeMetricAllowlist: nextHome,
                deviceInfoMetricAllowlist: nextInfo,
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
            deviceInfoMetricAllowlist: (persistedConfig?.ui?.deviceInfoMetricAllowlist && typeof persistedConfig.ui.deviceInfoMetricAllowlist === 'object') ? persistedConfig.ui.deviceInfoMetricAllowlist : {},
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
    
    // Check for seed profile in both user profiles and shipped presets.
    const userProfile = (seedFromPanelName && profilesMap[seedFromPanelName] && typeof profilesMap[seedFromPanelName] === 'object')
        ? profilesMap[seedFromPanelName]
        : null;
    const presetProfile = (seedFromPanelName && DEFAULT_PANEL_PROFILES_PRESETS[seedFromPanelName])
        ? DEFAULT_PANEL_PROFILES_PRESETS[seedFromPanelName]
        : null;
    const seedFromProfile = userProfile || presetProfile || null;
    const seedIsPreset = !userProfile && !!presetProfile;
    
    // When seeding from a shipped preset, merge:
    // - COLOR IDENTITY from the preset (accentColorId, iconColorId, glowColorId, text colors, opacities, homeBackground)
    // - SIZING/LAYOUT from the current global ui settings (so user's display tuning is preserved)
    // When seeding from a user profile or no profile, use the full effective ui.
    const effectiveUi = seedIsPreset
        ? {
            // Global sizing/layout (user's display settings)
            ...ui,
            // Preset color identity (overwrites globals for color fields only)
            accentColorId: presetProfile.accentColorId ?? ui.accentColorId,
            iconColorId: presetProfile.iconColorId ?? ui.iconColorId,
            iconOpacityPct: presetProfile.iconOpacityPct ?? ui.iconOpacityPct,
            glowColorId: presetProfile.glowColorId ?? ui.glowColorId,
            primaryTextColorId: presetProfile.primaryTextColorId ?? ui.primaryTextColorId,
            primaryTextOpacityPct: presetProfile.primaryTextOpacityPct ?? ui.primaryTextOpacityPct,
            secondaryTextColorId: presetProfile.secondaryTextColorId ?? ui.secondaryTextColorId,
            secondaryTextOpacityPct: presetProfile.secondaryTextOpacityPct ?? ui.secondaryTextOpacityPct,
            tertiaryTextColorId: presetProfile.tertiaryTextColorId ?? ui.tertiaryTextColorId,
            tertiaryTextOpacityPct: presetProfile.tertiaryTextOpacityPct ?? ui.tertiaryTextOpacityPct,
            homeBackground: presetProfile.homeBackground ?? ui.homeBackground,
        }
        : {
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
        tertiaryTextOpacityPct: effectiveUi.tertiaryTextOpacityPct,
        tertiaryTextSizePct: effectiveUi.tertiaryTextSizePct,
        tertiaryTextColorId: effectiveUi.tertiaryTextColorId,
        cardScalePct: effectiveUi.cardScalePct,
        homeRoomColumnsXl: effectiveUi.homeRoomColumnsXl,
        homeRoomLayoutMode: String(effectiveUi.homeRoomLayoutMode ?? 'grid').trim() || 'grid',
        homeRoomMasonryRowHeightPx: clampInt(effectiveUi.homeRoomMasonryRowHeightPx, 4, 40, 10),
        homeRoomMinWidthPx: clampInt(effectiveUi.homeRoomMinWidthPx, 0, 1200, 0),
        homeRoomTiles: (effectiveUi.homeRoomTiles && typeof effectiveUi.homeRoomTiles === 'object') ? effectiveUi.homeRoomTiles : {},
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
    const raw = String(req.body?.accentColorId ?? '').trim();
    if (!raw) {
        return res.status(400).json({ error: 'Missing accentColorId' });
    }

    const normalized = (() => {
        if (isAllowedAccentColorId(raw)) return raw;
        return null;
    })();

    if (!normalized) {
        return res.status(400).json({
            error: 'Invalid accentColorId',
            allowed: Array.from(ALLOWED_TOLERANCE_COLOR_IDS)
                .filter((id) => id !== 'none')
                .sort((a, b) => a.localeCompare(b)),
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

// Update Home top row visibility/scale/cards (per panel profile aware).
// Expected payload: { homeTopRowEnabled?: boolean, homeTopRowScalePct?: number(50-120), homeTopRowCards?: string[], panelName?: string }
app.put('/api/ui/home-top-row', (req, res) => {
    const hasEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'homeTopRowEnabled');
    const hasScale = Object.prototype.hasOwnProperty.call(req.body || {}, 'homeTopRowScalePct');
    const hasCards = Object.prototype.hasOwnProperty.call(req.body || {}, 'homeTopRowCards');

    if (!hasEnabled && !hasScale && !hasCards) {
        return res.status(400).json({ error: 'Missing homeTopRowEnabled/homeTopRowScalePct/homeTopRowCards' });
    }

    const nextEnabled = hasEnabled ? req.body.homeTopRowEnabled === true : null;

    const nextScale = (() => {
        if (!hasScale) return null;
        const raw = req.body.homeTopRowScalePct;
        const num = (typeof raw === 'number') ? raw : Number(raw);
        if (!Number.isFinite(num)) return 'err';
        return Math.max(50, Math.min(120, Math.round(num)));
    })();
    if (nextScale === 'err') {
        return res.status(400).json({ error: 'Invalid homeTopRowScalePct (50-120)' });
    }

    const nextCards = (() => {
        if (!hasCards) return null;
        const raw = Array.isArray(req.body.homeTopRowCards) ? req.body.homeTopRowCards : [];
        const filtered = raw
            .map((v) => String(v || '').trim())
            .filter((v) => v && ALLOWED_HOME_TOP_ROW_CARD_IDS.has(v));
        return Array.from(new Set(filtered));
    })();

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        const prevProfile = (persistedConfig?.ui?.panelProfiles && persistedConfig.ui.panelProfiles[ensured])
            ? persistedConfig.ui.panelProfiles[ensured]
            : {};

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...prevProfile,
                        ...(nextEnabled !== null ? { homeTopRowEnabled: nextEnabled } : {}),
                        ...(nextScale !== null ? { homeTopRowScalePct: nextScale } : {}),
                        ...(nextCards !== null ? { homeTopRowCards: nextCards } : {}),
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-home-top-row-panel');

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
            ...(nextEnabled !== null ? { homeTopRowEnabled: nextEnabled } : {}),
            ...(nextScale !== null ? { homeTopRowScalePct: nextScale } : {}),
            ...(nextCards !== null ? { homeTopRowCards: nextCards } : {}),
        },
    });

    persistConfigToDiskIfChanged('api-ui-home-top-row');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            homeTopRowEnabled: persistedConfig?.ui?.homeTopRowEnabled,
            homeTopRowScalePct: persistedConfig?.ui?.homeTopRowScalePct,
            homeTopRowCards: persistedConfig?.ui?.homeTopRowCards,
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

    const blurScalePct = Math.max(UI_BLUR_SCALE_PCT_RANGE.min, Math.min(UI_BLUR_SCALE_PCT_RANGE.max, Math.round(num)));

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
        UI_SECONDARY_TEXT_SIZE_PCT_RANGE.min,
        Math.min(UI_SECONDARY_TEXT_SIZE_PCT_RANGE.max, Math.round(num)),
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
        UI_PRIMARY_TEXT_SIZE_PCT_RANGE.min,
        Math.min(UI_PRIMARY_TEXT_SIZE_PCT_RANGE.max, Math.round(num)),
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

// ─────────────────────────────────────────────────────────────────────────────
// Tertiary (info card values) text styling APIs.
// ─────────────────────────────────────────────────────────────────────────────

// Update tertiary text opacity percent.
// Expected payload: { tertiaryTextOpacityPct: number(0-100) }
app.put('/api/ui/tertiary-text-opacity', (req, res) => {
    const raw = req.body?.tertiaryTextOpacityPct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing tertiaryTextOpacityPct (0-100)' });
    }
    const tertiaryTextOpacityPct = Math.max(0, Math.min(100, Math.round(num)));

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
                        tertiaryTextOpacityPct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-tertiary-text-opacity-panel');

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
            tertiaryTextOpacityPct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-tertiary-text-opacity');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            tertiaryTextOpacityPct: persistedConfig?.ui?.tertiaryTextOpacityPct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update tertiary text size percent.
// Expected payload: { tertiaryTextSizePct: number(50-200) }
app.put('/api/ui/tertiary-text-size', (req, res) => {
    const raw = req.body?.tertiaryTextSizePct;
    const num = (typeof raw === 'number') ? raw : Number(raw);
    if (!Number.isFinite(num)) {
        return res.status(400).json({ error: 'Missing tertiaryTextSizePct (50-200)' });
    }

    const tertiaryTextSizePct = Math.max(
        UI_TERTIARY_TEXT_SIZE_PCT_RANGE.min,
        Math.min(UI_TERTIARY_TEXT_SIZE_PCT_RANGE.max, Math.round(num)),
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
                        tertiaryTextSizePct,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-tertiary-text-size-panel');

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
            tertiaryTextSizePct,
        },
    });

    persistConfigToDiskIfChanged('api-ui-tertiary-text-size');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            tertiaryTextSizePct: persistedConfig?.ui?.tertiaryTextSizePct,
            panelProfiles: persistedConfig?.ui?.panelProfiles,
        },
    };
    io.emit('config_update', config);

    return res.json({ ok: true, ui: { ...(config?.ui || {}) } });
});

// Update tertiary text color id.
// Expected payload: { tertiaryTextColorId: string | null } (null/empty = default)
app.put('/api/ui/tertiary-text-color', (req, res) => {
    const raw = req.body?.tertiaryTextColorId;
    const s = String(raw ?? '').trim();
    const tertiaryTextColorId = s
        ? (ALLOWED_TOLERANCE_COLOR_IDS.has(s) ? s : null)
        : null;

    if (s && !tertiaryTextColorId) {
        return res.status(400).json({ error: 'Invalid tertiaryTextColorId' });
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
                        tertiaryTextColorId,
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-tertiary-text-color-panel');

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
            tertiaryTextColorId,
        },
    });

    persistConfigToDiskIfChanged('api-ui-tertiary-text-color');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            tertiaryTextColorId: persistedConfig?.ui?.tertiaryTextColorId,
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

    const iconSizePct = Math.max(UI_ICON_SIZE_PCT_RANGE.min, Math.min(UI_ICON_SIZE_PCT_RANGE.max, Math.round(num)));

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

// Update Home room layout options.
// Expected payload:
// {
//   homeRoomLayoutMode?: 'grid'|'masonry'
//   homeRoomMasonryRowHeightPx?: number(4-40)
//   homeRoomMinWidthPx?: number(0-1200)  // 0 disables auto-fit
//   homeRoomTiles?: { [roomId]: { span?: number(1-6), order?: number(-999..999), rowSpan?: number(1-999) } }
//   panelName?: string
// }
app.put('/api/ui/home-room-layout', (req, res) => {
    const hasLayoutMode = Object.prototype.hasOwnProperty.call(req.body || {}, 'homeRoomLayoutMode');
    const hasRowHeight = Object.prototype.hasOwnProperty.call(req.body || {}, 'homeRoomMasonryRowHeightPx');
    const hasMinWidth = Object.prototype.hasOwnProperty.call(req.body || {}, 'homeRoomMinWidthPx');
    const hasTiles = Object.prototype.hasOwnProperty.call(req.body || {}, 'homeRoomTiles');

    if (!hasLayoutMode && !hasRowHeight && !hasMinWidth && !hasTiles) {
        return res.status(400).json({ error: 'Missing homeRoomLayoutMode, homeRoomMasonryRowHeightPx, homeRoomMinWidthPx and/or homeRoomTiles' });
    }

    let homeRoomLayoutMode = null;
    if (hasLayoutMode) {
        const raw = String(req.body?.homeRoomLayoutMode ?? '').trim().toLowerCase();
        if (raw !== 'grid' && raw !== 'masonry') {
            return res.status(400).json({ error: "Invalid homeRoomLayoutMode ('grid'|'masonry')" });
        }
        homeRoomLayoutMode = raw;
    }

    let homeRoomMasonryRowHeightPx = null;
    if (hasRowHeight) {
        const raw = req.body?.homeRoomMasonryRowHeightPx;
        const num = (typeof raw === 'number') ? raw : Number(raw);
        if (!Number.isFinite(num)) {
            return res.status(400).json({ error: 'Invalid homeRoomMasonryRowHeightPx (4-40)' });
        }
        homeRoomMasonryRowHeightPx = Math.max(4, Math.min(40, Math.round(num)));
    }

    let homeRoomMinWidthPx = null;
    if (hasMinWidth) {
        const raw = req.body?.homeRoomMinWidthPx;
        const num = (typeof raw === 'number') ? raw : Number(raw);
        if (!Number.isFinite(num)) {
            return res.status(400).json({ error: 'Invalid homeRoomMinWidthPx (0-1200)' });
        }
        homeRoomMinWidthPx = Math.max(0, Math.min(1200, Math.round(num)));
    }

    let homeRoomTiles = null;
    if (hasTiles) {
        const rawMap = (req.body?.homeRoomTiles && typeof req.body.homeRoomTiles === 'object') ? req.body.homeRoomTiles : {};
        const outMap = {};

        for (const [ridRaw, vRaw] of Object.entries(rawMap)) {
            const rid = String(ridRaw || '').trim();
            if (!rid) continue;
            const v = (vRaw && typeof vRaw === 'object') ? vRaw : {};

            const hasSpan = Object.prototype.hasOwnProperty.call(v, 'span');
            const hasOrder = Object.prototype.hasOwnProperty.call(v, 'order');
            const hasRowSpan = Object.prototype.hasOwnProperty.call(v, 'rowSpan');

            const spanNum = hasSpan ? (typeof v.span === 'number' ? v.span : Number(v.span)) : null;
            const orderNum = hasOrder ? (typeof v.order === 'number' ? v.order : Number(v.order)) : null;
            const rowSpanNum = hasRowSpan ? (typeof v.rowSpan === 'number' ? v.rowSpan : Number(v.rowSpan)) : null;

            const entry = {};
            if (hasSpan && Number.isFinite(spanNum)) {
                entry.span = Math.max(1, Math.min(6, Math.round(spanNum)));
            }
            if (hasOrder && Number.isFinite(orderNum)) {
                entry.order = Math.max(-999, Math.min(999, Math.round(orderNum)));
            }
            if (hasRowSpan && Number.isFinite(rowSpanNum)) {
                entry.rowSpan = Math.max(1, Math.min(999, Math.round(rowSpanNum)));
            }

            if (Object.keys(entry).length) {
                outMap[rid] = entry;
            }
        }

        homeRoomTiles = outMap;
    }

    const panelName = normalizePanelName(req.body?.panelName);
    if (panelName) {
        if (rejectIfPresetPanelProfile(panelName, res)) return;
        const ensured = ensurePanelProfileExists(panelName);
        if (!ensured) {
            return res.status(400).json({ error: 'Invalid panelName' });
        }

        const prevProfile = ((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles && persistedConfig.ui.panelProfiles[ensured])
            ? persistedConfig.ui.panelProfiles[ensured]
            : {});

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            ui: {
                ...((persistedConfig && persistedConfig.ui) ? persistedConfig.ui : {}),
                panelProfiles: {
                    ...(((persistedConfig && persistedConfig.ui && persistedConfig.ui.panelProfiles) ? persistedConfig.ui.panelProfiles : {})),
                    [ensured]: {
                        ...prevProfile,
                        ...(homeRoomLayoutMode !== null ? { homeRoomLayoutMode } : {}),
                        ...(homeRoomMasonryRowHeightPx !== null ? { homeRoomMasonryRowHeightPx } : {}),
                        ...(homeRoomMinWidthPx !== null ? { homeRoomMinWidthPx } : {}),
                        ...(homeRoomTiles !== null ? { homeRoomTiles } : {}),
                    },
                },
            },
        });

        persistConfigToDiskIfChanged('api-ui-home-room-layout-panel');

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
            ...(homeRoomLayoutMode !== null ? { homeRoomLayoutMode } : {}),
            ...(homeRoomMasonryRowHeightPx !== null ? { homeRoomMasonryRowHeightPx } : {}),
            ...(homeRoomMinWidthPx !== null ? { homeRoomMinWidthPx } : {}),
            ...(homeRoomTiles !== null ? { homeRoomTiles } : {}),
        },
    });

    persistConfigToDiskIfChanged('api-ui-home-room-layout');

    config = {
        ...config,
        ui: {
            ...(config?.ui || {}),
            ...(homeRoomLayoutMode !== null ? { homeRoomLayoutMode: persistedConfig?.ui?.homeRoomLayoutMode } : {}),
            ...(homeRoomMasonryRowHeightPx !== null ? { homeRoomMasonryRowHeightPx: persistedConfig?.ui?.homeRoomMasonryRowHeightPx } : {}),
            ...(homeRoomMinWidthPx !== null ? { homeRoomMinWidthPx: persistedConfig?.ui?.homeRoomMinWidthPx } : {}),
            ...(homeRoomTiles !== null ? { homeRoomTiles: persistedConfig?.ui?.homeRoomTiles } : {}),
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
        configured: hubitat.configured,
        host: hubitat.host || null,
        appId: hubitat.appId || null,
        tlsInsecure: hubitat.tlsInsecure,
        tlsDispatcher: Boolean(hubitat.fetchDispatcher),
        lastFetchAt: lastHubitatFetchAt,
        lastError: lastHubitatError,
        cachedCount: Array.isArray(lastHubitatDevices) ? lastHubitatDevices.length : 0,
    });
});

// Hubitat Maker API modes (proxy). Useful for displaying the currently active Mode.
app.get('/api/hubitat/modes', async (req, res) => {
    if (!hubitat.configured) {
        return res.status(409).json({ ok: false, error: 'Hubitat not configured' });
    }

    let hubitatRes;
    try {
        hubitatRes = await hubitatFetch(hubitatModesUrl());
    } catch (err) {
        const safeUrl = redactAccessToken(hubitatModesUrl());
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
    if (!hubitat.configured) {
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
        if (runtimeEventsPersistJsonl) {
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
                io.emit('device_refresh', getClientSafeStatuses());
            } catch {
                // ignore
            }
        }

        // If we got an event for a device we don't have cached, trigger a refresh.
        if (hadUnknownDevice && hubitat.configured) {
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

// --- Server Settings API ---
// Non-sensitive runtime-tunable server settings.
// Env vars always take priority — if set, the persisted value is ignored and the UI shows the field as locked.
app.put('/api/server-settings', (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};

    // --- Numeric settings ---
    const safeInt = (v, min, max) => {
        if (v === undefined || v === null) return undefined; // not provided
        const num = Number(v);
        return Number.isFinite(num) ? Math.max(min, Math.min(max, Math.floor(num))) : undefined;
    };

    const pollIntervalMs = safeInt(body.pollIntervalMs, 1000, 3600000);
    const eventsMax = safeInt(body.eventsMax, 50, 10000);
    const backupMaxFiles = safeInt(body.backupMaxFiles, 10, 1000);

    // --- Port (requires server restart; min 80 prevents accidental low-port saves) ---
    const port = safeInt(body.port, 80, 65535);

    // --- Boolean settings ---
    const eventsPersistJsonl = typeof body.eventsPersistJsonl === 'boolean' ? body.eventsPersistJsonl : undefined;

    // --- Weather units ---
    const VALID_TEMP_UNITS = ['fahrenheit', 'celsius'];
    const VALID_WIND_UNITS = ['mph', 'kmh', 'ms', 'kn'];
    const VALID_PRECIP_UNITS = ['inch', 'mm'];
    const temperatureUnit = VALID_TEMP_UNITS.includes(body.temperatureUnit) ? body.temperatureUnit : undefined;
    const windSpeedUnit = VALID_WIND_UNITS.includes(body.windSpeedUnit) ? body.windSpeedUnit : undefined;
    const precipitationUnit = VALID_PRECIP_UNITS.includes(body.precipitationUnit) ? body.precipitationUnit : undefined;

    // --- Hubitat connection settings ---
    const hubitatHost = (typeof body.hubitatHost === 'string')
        ? normalizeHubitatHost(body.hubitatHost.trim()) || undefined
        : undefined;
    const hubitatAppId = (typeof body.hubitatAppId === 'string')
        ? (body.hubitatAppId.trim() || undefined)
        : undefined;
    const hubitatAccessToken = (typeof body.hubitatAccessToken === 'string')
        ? (body.hubitatAccessToken.trim() || undefined)
        : undefined;
    const hubitatTlsInsecure = (typeof body.hubitatTlsInsecure === 'boolean')
        ? body.hubitatTlsInsecure
        : undefined;

    const prevConfigured = hubitat.configured;

    // Update persistedConfig.serverSettings (only set fields that were provided)
    const prev = persistedConfig?.serverSettings || {};
    const next = { ...prev };
    if (pollIntervalMs !== undefined) next.pollIntervalMs = pollIntervalMs;
    if (eventsMax !== undefined) next.eventsMax = eventsMax;
    if (backupMaxFiles !== undefined) next.backupMaxFiles = backupMaxFiles;
    if (eventsPersistJsonl !== undefined) next.eventsPersistJsonl = eventsPersistJsonl;
    if (hubitatHost !== undefined) next.hubitatHost = hubitatHost;
    if (hubitatAppId !== undefined) next.hubitatAppId = hubitatAppId;
    if (hubitatAccessToken !== undefined) next.hubitatAccessToken = hubitatAccessToken;
    if (hubitatTlsInsecure !== undefined) next.hubitatTlsInsecure = hubitatTlsInsecure;
    if (port !== undefined) next.port = port;

    persistedConfig = normalizePersistedConfig({
        ...(persistedConfig || {}),
        serverSettings: next,
    });

    // Update weather units if provided
    const weatherChanged = temperatureUnit !== undefined || windSpeedUnit !== undefined || precipitationUnit !== undefined;
    if (weatherChanged) {
        const prevOpen = (persistedConfig?.weather?.openMeteo && typeof persistedConfig.weather.openMeteo === 'object')
            ? persistedConfig.weather.openMeteo : {};
        const nextOpen = { ...prevOpen };
        if (temperatureUnit !== undefined) nextOpen.temperatureUnit = temperatureUnit;
        if (windSpeedUnit !== undefined) nextOpen.windSpeedUnit = windSpeedUnit;
        if (precipitationUnit !== undefined) nextOpen.precipitationUnit = precipitationUnit;

        persistedConfig = normalizePersistedConfig({
            ...(persistedConfig || {}),
            weather: {
                ...((persistedConfig && persistedConfig.weather) ? persistedConfig.weather : {}),
                openMeteo: nextOpen,
            },
        });

        settings.weather = persistedConfig.weather;
        applyWeatherEnvOverrides();
        // Weather units changed — clear cache.
        lastWeather = null;
        lastWeatherFetchAt = null;
        lastWeatherError = null;
    }

    // Apply runtime changes
    applyServerSettings();

    // Restart the poll interval so the new value takes effect immediately.
    if (hubitat.configured) {
        restartHubitatPollInterval();
        // If Hubitat just became configured (user set credentials via UI), do an immediate sync.
        if (!prevConfigured) {
            console.log('Hubitat now configured via Settings UI — starting poll');
            syncHubitatData();
        }
    }

    persistConfigToDiskIfChanged('api-server-settings');
    rebuildRuntimeConfigFromPersisted();
    io.emit('config_update', config);

    return res.json({ ok: true, serverSettings: config.serverSettings });
});

// --- Certificate Management API ---

// Generate a self-signed certificate.
app.post('/api/server/generate-cert', (req, res) => {
    try {
        const selfsigned = require('selfsigned');
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const hostname = String(body.hostname || '').trim() || require('os').hostname() || 'localhost';

        const altNames = [
            { type: 2, value: 'localhost' },
            { type: 2, value: hostname },
            { type: 7, ip: '127.0.0.1' },
        ];
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
            altNames.push({ type: 7, ip: hostname });
        }

        const attrs = [{ name: 'commonName', value: hostname }];
        const pems = selfsigned.generate(attrs, {
            algorithm: 'sha256',
            keySize: 2048,
            days: 3650,
            extensions: [{ name: 'subjectAltName', altNames }],
        });

        const certDir = path.dirname(HTTPS_CERT_PATH);
        fs.mkdirSync(certDir, { recursive: true });
        fs.writeFileSync(HTTPS_KEY_PATH, pems.private, { encoding: 'utf8', mode: 0o600 });
        fs.writeFileSync(HTTPS_CERT_PATH, pems.cert, { encoding: 'utf8' });

        console.log(`HTTPS: self-signed certificate generated for '${hostname}' via Settings UI`);

        // Refresh config so the UI sees updated cert info
        rebuildRuntimeConfigFromPersisted();
        io.emit('config_update', config);

        return res.json({
            ok: true,
            message: `Self-signed certificate generated for '${hostname}'. Restart the server to activate HTTPS.`,
            certInfo: getCertificateInfo(),
        });
    } catch (err) {
        console.error('Certificate generation failed:', err);
        return res.status(500).json({ error: 'Certificate generation failed', details: String(err.message || err) });
    }
});

// Upload custom PEM certificate and key.
app.post('/api/server/upload-cert', (req, res) => {
    try {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const certPem = String(body.cert || '').trim();
        const keyPem = String(body.key || '').trim();

        if (!certPem || !keyPem) {
            return res.status(400).json({ error: 'Both "cert" and "key" PEM fields are required.' });
        }

        // Validate that the PEM data is actually parseable.
        try {
            new crypto.X509Certificate(certPem);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid certificate PEM.', details: String(e.message || e) });
        }
        try {
            crypto.createPrivateKey(keyPem);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid private key PEM.', details: String(e.message || e) });
        }

        const certDir = path.dirname(HTTPS_CERT_PATH);
        fs.mkdirSync(certDir, { recursive: true });
        fs.writeFileSync(HTTPS_KEY_PATH, keyPem, { encoding: 'utf8', mode: 0o600 });
        fs.writeFileSync(HTTPS_CERT_PATH, certPem, { encoding: 'utf8' });

        console.log('HTTPS: custom certificate uploaded via Settings UI');

        // Refresh config so the UI sees updated cert info
        rebuildRuntimeConfigFromPersisted();
        io.emit('config_update', config);

        return res.json({
            ok: true,
            message: 'Certificate uploaded. Restart the server to activate HTTPS.',
            certInfo: getCertificateInfo(),
        });
    } catch (err) {
        console.error('Certificate upload failed:', err);
        return res.status(500).json({ error: 'Certificate upload failed', details: String(err.message || err) });
    }
});

// Delete certificates (revert to HTTP).
app.delete('/api/server/cert', (req, res) => {
    try {
        let deleted = false;
        if (fs.existsSync(HTTPS_CERT_PATH)) { fs.unlinkSync(HTTPS_CERT_PATH); deleted = true; }
        if (fs.existsSync(HTTPS_KEY_PATH)) { fs.unlinkSync(HTTPS_KEY_PATH); deleted = true; }

        if (deleted) console.log('HTTPS: certificates deleted via Settings UI');

        rebuildRuntimeConfigFromPersisted();
        io.emit('config_update', config);

        return res.json({ ok: true, message: deleted ? 'Certificates deleted. Restart the server to revert to HTTP.' : 'No certificates found.' });
    } catch (err) {
        console.error('Certificate deletion failed:', err);
        return res.status(500).json({ error: 'Certificate deletion failed', details: String(err.message || err) });
    }
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
app.get('/api/devices/:id/commands', async (req, res) => {
    try {
        if (!hubitat.configured) {
            return res.status(503).json({ error: 'Hubitat not configured' });
        }

        const deviceId = req.params.id;
        if (!isUiDeviceAllowedForControl(deviceId)) {
            return res.status(403).json({
                error: 'Device not allowed',
                message: 'This device is not in the UI allowlists. Set UI_ALLOWED_MAIN_DEVICE_IDS and/or UI_ALLOWED_CTRL_DEVICE_IDS (or ui.mainAllowedDeviceIds / ui.ctrlAllowedDeviceIds in server/data/config.json).',
            });
        }

        // Maker API command metadata pattern:
        //   /devices/<DEVICE_ID>/commands?access_token=...
        const url = `${hubitatApiBase()}/devices/${encodeURIComponent(deviceId)}/commands?access_token=${encodeURIComponent(hubitat.accessToken)}`;
        const hubRes = await hubitatFetch(url, { method: 'GET' });
        const text = await hubRes.text().catch(() => '');
        if (!hubRes.ok) {
            return res.status(502).json({ error: 'Hubitat commands fetch failed', status: hubRes.status, details: text });
        }

        const parsed = tryParseJsonFromText(text);
        const rawCommands = Array.isArray(parsed) ? parsed : [];

        // Normalize to a predictable shape for the UI mapper.
        // Hubitat typically returns entries like:
        //   { command: 'setLevel', parameters: [{ name, type }] }
        const commands = rawCommands
            .map((c) => {
                if (!c || typeof c !== 'object') return null;
                const command = String(c.command || c.name || '').trim();
                if (!command) return null;

                const paramsRaw = Array.isArray(c.parameters)
                    ? c.parameters
                    : (Array.isArray(c.args) ? c.args : []);

                const parameters = Array.isArray(paramsRaw)
                    ? paramsRaw
                        .map((p) => {
                            if (!p || typeof p !== 'object') return null;
                            const name = String(p.name || '').trim();
                            const type = String(p.type || '').trim();
                            if (!name && !type) return null;
                            return {
                                ...(name ? { name } : {}),
                                ...(type ? { type } : {}),
                            };
                        })
                        .filter(Boolean)
                    : [];

                return {
                    command,
                    parameters,
                    // Preserve raw shape for debugging/future expansion.
                    _raw: c,
                };
            })
            .filter(Boolean);

        return res.json({ ok: true, deviceId: String(deviceId), commands });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Commands error' });
    }
});

app.post('/api/devices/:id/command', async (req, res) => {
    try {
        if (!hubitat.configured) {
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
        const url = `${hubitatApiBase()}/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(command)}${argsPath}?access_token=${encodeURIComponent(hubitat.accessToken)}`;

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
    if (hubitat.configured) {
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
    if (hubitat.configured) {
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
    socket.emit('device_refresh', getClientSafeStatuses());
});

server.listen(runtimePort, '0.0.0.0', () => {
    const proto = USE_HTTPS ? 'https' : 'http';
    console.log(`Server running on ${proto}://0.0.0.0:${runtimePort}`);
    if (USE_HTTPS) {
        console.log(`HTTPS certificate: ${HTTPS_CERT_PATH}`);
        console.log('NOTE: If browsers warn, trust the cert on the client device.');
    }
    
    // Initialize control icons service
    controlIconsService.init(CONTROL_ICONS_DIR);
    
    // Start HLS health monitoring
    hlsService.startHlsHealthMonitoring();
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    
    // Stop health monitoring
    hlsService.stopHlsHealthMonitoring();
    
    // Stop all HLS streams
    hlsService.stopAllHlsStreams();
    
    // Close server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
    
    // Force exit after timeout
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
