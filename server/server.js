const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUP_FILES = (() => {
    const raw = process.env.BACKUP_MAX_FILES;
    const parsed = raw ? Number(raw) : 200;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 200;
})();

// If the UI is built (`client/dist`), serve it from the backend so a single service
// provides both the API and the dashboard.
const CLIENT_DIST_DIR = path.join(__dirname, '..', 'client', 'dist');
const CLIENT_INDEX_HTML = path.join(CLIENT_DIST_DIR, 'index.html');
const HAS_BUILT_CLIENT = fs.existsSync(CLIENT_INDEX_HTML);

// Hubitat Maker API
// Prefer env vars for deploy safety, but keep the existing defaults.
const HUBITAT_HOST = process.env.HUBITAT_HOST 
const HUBITAT_MAKER_APP_ID = process.env.HUBITAT_MAKER_APP_ID
const HUBITAT_ACCESS_TOKEN = process.env.HUBITAT_ACCESS_TOKEN 
const HUBITAT_API_BASE = `${HUBITAT_HOST}/apps/api/${HUBITAT_MAKER_APP_ID}`;
const HUBITAT_API_URL = `${HUBITAT_API_BASE}/devices/all?access_token=${HUBITAT_ACCESS_TOKEN}`;

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
app.use(bodyParser.json());

if (HAS_BUILT_CLIENT) {
    app.use(express.static(CLIENT_DIST_DIR));
}

// State
let persistedConfig = { weather: settings.weather, rooms: [], sensors: [] }; // Stored in server/data/config.json
let lastPersistedSerialized = '';
let config = { rooms: [], sensors: [] }; // The merged view sent to client
let sensorStatuses = {};

let lastConfigWriteAtMs = 0;

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

// --- PERSISTENCE ---

function ensureDataDirs() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
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
            persistedConfig = normalizePersistedConfig(raw);
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

function persistConfigToDiskIfChanged(label) {
    try {
        ensureDataDirs();
        const nextSerialized = stableStringify(persistedConfig);
        if (nextSerialized === lastPersistedSerialized) return false;

        // Prevent a tight write-loop if something is hammering /api/config
        const now = Date.now();
        if (now - lastConfigWriteAtMs < 500) return false;
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

// --- HUBITAT MAPPER ---

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

    // Current + daily summary. Keep fields minimal.
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('timezone', open.timezone || 'auto');
    url.searchParams.set('temperature_unit', open.temperatureUnit || 'fahrenheit');
    url.searchParams.set('wind_speed_unit', open.windSpeedUnit || 'mph');
    url.searchParams.set('precipitation_unit', open.precipitationUnit || 'inch');
    url.searchParams.set('current', [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'precipitation',
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

async function syncHubitatData() {
    try {
        const devices = await fetchHubitatAllDevices();

        const existingRooms = Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [];
        const existingSensors = Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [];

        const norm = (s) => String(s || '').trim().toLowerCase();
        const roomByName = new Map(existingRooms.map(r => [norm(r?.name), r]));
        const roomById = new Map(existingRooms.map(r => [String(r?.id), r]));
        const sensorById = new Map(existingSensors.map(s => [String(s?.id), s]));

        const newRoomsById = new Map();
        const newSensorsById = new Map();
        const newStatuses = {};
        const roomSensorCounts = {};

        devices.forEach(dev => {
            const relevantCaps = [
                "ContactSensor",
                "MotionSensor",
                "SmokeDetector",
                "CarbonMonoxideDetector",
                "TemperatureMeasurement",
                "RelativeHumidityMeasurement",
                "IlluminanceMeasurement",
                "Switch",
                "SwitchLevel",
            ];
            const isRelevant = dev.capabilities?.some(c => relevantCaps.includes(c));
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

        config = { rooms: mergedRooms, sensors: orderedSensors };
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
        });

        io.emit('config_update', config);
        io.emit('device_refresh', sensorStatuses);

    } catch (err) {
        lastHubitatError = err?.message || String(err);
        const now = Date.now();
        // Throttle to avoid log spam if Hubitat is down.
        if (now - lastHubitatErrorLoggedAt > 30_000) {
            lastHubitatErrorLoggedAt = now;
            console.error("Hubitat polling error:", lastHubitatError);
        }
    }
}

async function fetchHubitatAllDevices() {
    const res = await fetch(HUBITAT_API_URL);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Hubitat API Error: ${res.status} ${text}`);
    }
    const devices = await res.json();
    if (!Array.isArray(devices)) {
        throw new Error(`Hubitat API returned non-array payload`);
    }

    lastHubitatDevices = devices;
    lastHubitatFetchAt = new Date().toISOString();
    lastHubitatError = null;
    return devices;
}

setInterval(syncHubitatData, 2000);
syncHubitatData();

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
    res.json(config);
});
app.get('/api/status', (req, res) => res.json(sensorStatuses));

// Debug/inspection endpoints (do not include access token)
app.get('/api/hubitat/health', (req, res) => {
    res.json({
        ok: !lastHubitatError,
        lastFetchAt: lastHubitatFetchAt,
        lastError: lastHubitatError,
        cachedCount: Array.isArray(lastHubitatDevices) ? lastHubitatDevices.length : 0,
    });
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

// Open-Meteo weather endpoint (cached)
app.get('/api/weather', async (req, res) => {
    try {
        const force = String(req.query.force || '').toLowerCase() === 'true';
        const ttlMs = 5 * 60 * 1000;
        const now = Date.now();
        const lastAt = lastWeatherFetchAt ? Date.parse(lastWeatherFetchAt) : 0;

        if (!force && lastWeather && Number.isFinite(lastAt) && (now - lastAt) < ttlMs) {
            return res.json({ fetchedAt: lastWeatherFetchAt, cached: true, weather: lastWeather });
        }

        const weather = await fetchOpenMeteoForecast();
        return res.json({ fetchedAt: lastWeatherFetchAt, cached: false, weather });
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
        const deviceId = req.params.id;
        const { command, args = [] } = req.body || {};
        if (!command || typeof command !== 'string') {
            return res.status(400).json({ error: 'Missing command' });
        }

        const argsPath = Array.isArray(args) && args.length
            ? `/${args.map(a => encodeURIComponent(String(a))).join('/')}`
            : '';

        const url = `${HUBITAT_API_BASE}/devices/${encodeURIComponent(deviceId)}/command/${encodeURIComponent(command)}${argsPath}?access_token=${encodeURIComponent(HUBITAT_ACCESS_TOKEN)}`;

        const hubRes = await fetch(url, { method: 'GET' });
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
    const { rooms, sensors } = req.body || {};

    const roomsArr = Array.isArray(persistedConfig?.rooms) ? persistedConfig.rooms : [];
    const sensorsArr = Array.isArray(persistedConfig?.sensors) ? persistedConfig.sensors : [];

    const byRoomId = new Map(roomsArr.map(r => [String(r.id), r]));
    const byRoomName = new Map(roomsArr.map(r => [String(r.name || '').trim().toLowerCase(), r]));
    const bySensorId = new Map(sensorsArr.map(s => [String(s.id), s]));

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

    persistedConfig.rooms = roomsArr;
    persistedConfig.sensors = sensorsArr;
    persistConfigToDiskIfChanged('api-layout');

    // Re-sync runtime (positions + layouts affect UI)
    syncHubitatData();
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
    persistConfigToDiskIfChanged('api-layout-delete');
    syncHubitatData();
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
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
