/**
 * Application-wide constants and configuration values.
 * These define validation sets, default values, and preset configurations.
 */

const path = require('path');

// --- Directory and File Paths ---
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds');
const BACKGROUNDS_DIR = path.join(DATA_DIR, 'backgrounds');
const CLIENT_DIST_DIR = path.join(__dirname, '..', '..', 'client', 'dist');
const CLIENT_INDEX_HTML = path.join(CLIENT_DIST_DIR, 'index.html');
const CERT_DIR_DEFAULT = path.join(DATA_DIR, 'certs');

// --- Server Configuration ---
const PORT = 3000;

const MAX_BACKUP_FILES = (() => {
    const raw = process.env.BACKUP_MAX_FILES;
    const parsed = raw ? Number(raw) : 200;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 200;
})();

// --- UI Color Schemes ---
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

// --- UI Size Ranges ---
const SECONDARY_TEXT_SIZE_PCT_RANGE = Object.freeze({ min: 50, max: 200, def: 100 });
const PRIMARY_TEXT_SIZE_PCT_RANGE = Object.freeze({ min: 50, max: 200, def: 100 });
const BLUR_SCALE_PCT_RANGE = Object.freeze({ min: 0, max: 200, def: 100 });
const ICON_SIZE_PCT_RANGE = Object.freeze({ min: 50, max: 200, def: 100 });

// --- Home Dashboard Configuration ---
const HOME_TOP_ROW_CARD_IDS = Object.freeze(['time', 'outside', 'inside', 'home']);
const ALLOWED_HOME_TOP_ROW_CARD_IDS = new Set(HOME_TOP_ROW_CARD_IDS);

// Commands that can be rendered by the current UI panels.
// (We intentionally constrain this so config can't inject arbitrary commands into the UI.)
const ALLOWED_PANEL_DEVICE_COMMANDS = new Set(['on', 'off', 'toggle', 'setLevel', 'refresh', 'push']);

// Home metrics that can be shown on the Home dashboard per device.
// (Used for multi-sensors where you want to hide/show specific attributes.)
const ALLOWED_HOME_METRIC_KEYS = new Set(['temperature', 'humidity', 'illuminance', 'motion', 'contact', 'door']);

// Home room metric cards (sub-cards inside each room panel).
// These are configured globally (or per panel profile) and rendered for every room.
const ALLOWED_HOME_ROOM_METRIC_KEYS = new Set(['temperature', 'humidity', 'illuminance']);

// --- Default Panel Profile Presets ---
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

module.exports = {
    // Paths
    DATA_DIR,
    CONFIG_FILE,
    BACKUP_DIR,
    SOUNDS_DIR,
    BACKGROUNDS_DIR,
    CLIENT_DIST_DIR,
    CLIENT_INDEX_HTML,
    CERT_DIR_DEFAULT,
    
    // Server
    PORT,
    MAX_BACKUP_FILES,
    
    // Color Schemes
    LEGACY_UI_COLOR_SCHEMES,
    ALLOWED_TOLERANCE_COLOR_IDS,
    DEFAULT_ACCENT_COLOR_ID,
    ALLOWED_ACCENT_COLOR_IDS,
    
    // UI Ranges
    SECONDARY_TEXT_SIZE_PCT_RANGE,
    PRIMARY_TEXT_SIZE_PCT_RANGE,
    BLUR_SCALE_PCT_RANGE,
    ICON_SIZE_PCT_RANGE,
    
    // Home Dashboard
    HOME_TOP_ROW_CARD_IDS,
    ALLOWED_HOME_TOP_ROW_CARD_IDS,
    ALLOWED_PANEL_DEVICE_COMMANDS,
    ALLOWED_HOME_METRIC_KEYS,
    ALLOWED_HOME_ROOM_METRIC_KEYS,
    
    // Panel Profiles
    DEFAULT_PANEL_PROFILES_PRESETS,
    PRESET_PANEL_PROFILE_NAMES,
};
