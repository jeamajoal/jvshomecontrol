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
const DEVICE_ICONS_DIR = path.join(DATA_DIR, 'device-icons');
const CONTROL_ICONS_DIR = path.join(DATA_DIR, 'control-icons');
const CLIENT_DIST_DIR = path.join(__dirname, '..', '..', 'client', 'dist');
const CLIENT_INDEX_HTML = path.join(CLIENT_DIST_DIR, 'index.html');
const CERT_DIR_DEFAULT = path.join(DATA_DIR, 'certs');

// --- Server Configuration ---
// Defaults only — runtime values come from config.json (applied at startup).
const PORT = 80;
const MAX_BACKUP_FILES = 200;

// --- UI Color Schemes ---
// New versions use the unified palette (ALLOWED_TOLERANCE_COLOR_IDS) for ui.accentColorId.

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

// --- Home Dashboard Configuration ---
const HOME_TOP_ROW_CARD_IDS = Object.freeze(['time', 'outside', 'inside', 'home']);
const ALLOWED_HOME_TOP_ROW_CARD_IDS = new Set(HOME_TOP_ROW_CARD_IDS);

// Commands that can be rendered by the current UI panels.
// (We intentionally constrain this so config can't inject arbitrary commands into the UI.)
const ALLOWED_PANEL_DEVICE_COMMANDS = new Set(['on', 'off', 'toggle', 'setLevel', 'refresh', 'push']);

// Utility/lifecycle commands that should NOT be enabled by default when a
// device first becomes available.  Everything not in this set is auto-checked.
const SKIP_DEFAULT_COMMANDS = new Set([
    'configure', 'initialize', 'refresh', 'poll',
    'updated', 'installed', 'ping', 'clearState',
]);

// Home metrics that can be shown on the Home dashboard per device.
// (Used for multi-sensors where you want to hide/show specific attributes.)
const ALLOWED_HOME_METRIC_KEYS = new Set(['temperature', 'humidity', 'illuminance', 'motion', 'contact', 'door']);

// Home room metric cards (sub-cards inside each room panel).
// These are configured globally (or per panel profile) and rendered for every room.
const ALLOWED_HOME_ROOM_METRIC_KEYS = new Set(['temperature', 'humidity', 'illuminance']);

// --- Default Panel Profile Presets ---
// Default preset panel profiles that ship with the product.
// These are always available as read-only templates.
//
// IMPORTANT: Presets contain only COLOR IDENTITY fields (accent, icon, glow, text colors,
// and opacity for those colors). They do NOT contain sizing/layout fields (iconSizePct,
// primaryTextSizePct, secondaryTextSizePct, cardOpacityScalePct, blurScalePct, cardScalePct,
// homeRoomColumnsXl) — those come from "global defaults" so users can tune their display
// once and have all presets inherit those settings.
//
// When a user creates a new panel from a preset, the current global sizing values are
// merged into the new profile, allowing per-panel customization from that point on.
const DEFAULT_PANEL_PROFILES_PRESETS = Object.freeze({
    // === SUBTLE / PROFESSIONAL THEMES ===
    
    'Neon Glass': {
        // Tech/digital background - clean, modern look
        _preset: true,
        accentColorId: 'neon-blue',
        iconColorId: 'cyan',
        iconOpacityPct: 85,
        primaryTextColorId: 'white',
        secondaryTextColorId: 'sky',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Stealth Slate': {
        // Dark gradient - ultra minimal, high contrast white text
        _preset: true,
        accentColorId: 'slate',
        iconColorId: 'slate',
        iconOpacityPct: 60,
        primaryTextColorId: 'white',
        secondaryTextColorId: 'zinc',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Zinc Minimal': {
        // Abstract geometric - clean, understated
        _preset: true,
        accentColorId: 'zinc',
        iconColorId: 'neutral',
        iconOpacityPct: 55,
        primaryTextColorId: 'white',
        secondaryTextColorId: 'stone',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Urban Concrete': {
        // City skyline - industrial, grounded neutrals with warm accent
        _preset: true,
        accentColorId: 'amber',
        iconColorId: 'stone',
        iconOpacityPct: 70,
        primaryTextColorId: 'white',
        glowColorId: 'amber',
        secondaryTextColorId: 'neutral',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Platinum Frost': {
        // Icy/snowy peaks - cool, elegant, minimal color
        _preset: true,
        accentColorId: 'sky',
        iconColorId: 'white',
        iconOpacityPct: 70,
        primaryTextColorId: 'white',
        glowColorId: 'sky',
        secondaryTextColorId: 'slate',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1491466424936-e304919aada7?w=1920&q=80',
            opacityPct: 35,
        },
    },
    
    // === WARM EARTH TONES ===
    
    'Copper Warmth': {
        // Copper/metal textures - earthy, rich browns with cream highlights
        _preset: true,
        accentColorId: 'orange',
        iconColorId: 'amber',
        iconOpacityPct: 80,
        primaryTextColorId: 'tan',
        secondaryTextColorId: 'stone',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Amber Signal': {
        // Amber city lights - warm gold on dark, easy on eyes
        _preset: true,
        accentColorId: 'warning',
        iconColorId: 'yellow',
        iconOpacityPct: 80,
        primaryTextColorId: 'amber',
        secondaryTextColorId: 'tan',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1493514789931-586cb221d7a7?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Sunset Horizon': {
        // Mountain sunset - warm oranges with cool slate secondary
        _preset: true,
        accentColorId: 'orange',
        iconColorId: 'amber',
        iconOpacityPct: 90,
        primaryTextColorId: 'white',
        glowColorId: 'orange',
        secondaryTextColorId: 'stone',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Desert Mirage': {
        // Desert dunes - warm sands, golden hour feel
        _preset: true,
        accentColorId: 'amber',
        iconColorId: 'tan',
        iconOpacityPct: 75,
        primaryTextColorId: 'white',
        glowColorId: 'amber',
        secondaryTextColorId: 'stone',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Golden Hour': {
        // Golden sunset field - rich amber with earthy complement
        _preset: true,
        accentColorId: 'orange',
        iconColorId: 'amber',
        iconOpacityPct: 85,
        primaryTextColorId: 'amber',
        glowColorId: 'yellow',
        secondaryTextColorId: 'tan',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1495567720989-cebdbdd97913?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Lava Flow': {
        // Volcanic - intense reds/oranges, dramatic
        _preset: true,
        accentColorId: 'danger',
        iconColorId: 'orange',
        iconOpacityPct: 90,
        primaryTextColorId: 'white',
        glowColorId: 'neon-red',
        secondaryTextColorId: 'amber',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=1920&q=80',
            opacityPct: 35,
        },
    },
    
    // === COOL BLUES & CYANS ===
    
    'Ice Cave': {
        // Winter/ice - crisp cyans, very cool feel
        _preset: true,
        accentColorId: 'cyan',
        iconColorId: 'sky',
        iconOpacityPct: 85,
        primaryTextColorId: 'white',
        secondaryTextColorId: 'cyan',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Midnight Canvas': {
        // Starry mountains - deep indigo with soft violet accents
        _preset: true,
        accentColorId: 'indigo',
        iconColorId: 'violet',
        iconOpacityPct: 80,
        primaryTextColorId: 'white',
        glowColorId: 'indigo',
        secondaryTextColorId: 'slate',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Ocean Depths': {
        // Underwater - deep teals with bright cyan highlights
        _preset: true,
        accentColorId: 'teal',
        iconColorId: 'cyan',
        iconOpacityPct: 85,
        primaryTextColorId: 'cyan',
        glowColorId: 'teal',
        secondaryTextColorId: 'sky',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Azure Dream': {
        // Blue sky mountains - serene blue with white for max readability
        _preset: true,
        accentColorId: 'blue',
        iconColorId: 'sky',
        iconOpacityPct: 85,
        primaryTextColorId: 'white',
        glowColorId: 'primary',
        secondaryTextColorId: 'sky',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&q=80',
            opacityPct: 35,
        },
    },
    
    // === NATURE GREENS ===
    
    'Tropical Oasis': {
        // Tropical beach - fresh teals with emerald leaf tones
        _preset: true,
        accentColorId: 'teal',
        iconColorId: 'emerald',
        iconOpacityPct: 85,
        primaryTextColorId: 'white',
        glowColorId: 'teal',
        secondaryTextColorId: 'cyan',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Forest Whisper': {
        // Sunlit forest - natural greens with earthy secondary
        _preset: true,
        accentColorId: 'emerald',
        iconColorId: 'lime',
        iconOpacityPct: 80,
        primaryTextColorId: 'white',
        glowColorId: 'emerald',
        secondaryTextColorId: 'teal',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80',
            opacityPct: 35,
        },
    },
    
    // === VIBRANT / NEON THEMES ===
    
    'Arcade Mint': {
        // Retro gaming - punchy neon green, arcade vibes
        _preset: true,
        accentColorId: 'neon-green',
        iconColorId: 'neon-green',
        iconOpacityPct: 95,
        primaryTextColorId: 'neon-green',
        secondaryTextColorId: 'cyan',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Red Alert': {
        // Dark red gradient - intense, alert mode
        _preset: true,
        accentColorId: 'neon-red',
        iconColorId: 'rose',
        iconOpacityPct: 90,
        primaryTextColorId: 'white',
        secondaryTextColorId: 'rose',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Electric Storm': {
        // Lightning/purple storm - electric, vibrant purples
        _preset: true,
        accentColorId: 'purple',
        iconColorId: 'fuchsia',
        iconOpacityPct: 90,
        primaryTextColorId: 'white',
        glowColorId: 'purple',
        secondaryTextColorId: 'violet',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Neon Tokyo': {
        // Japanese neon streets - hot pink/magenta, cyberpunk
        _preset: true,
        accentColorId: 'fuchsia',
        iconColorId: 'pink',
        iconOpacityPct: 95,
        primaryTextColorId: 'fuchsia',
        glowColorId: 'pink',
        secondaryTextColorId: 'violet',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=1920&q=80',
            opacityPct: 35,
        },
    },
    'Northern Lights': {
        // Aurora - shifting greens and purples, mystical
        _preset: true,
        accentColorId: 'emerald',
        iconColorId: 'violet',
        iconOpacityPct: 85,
        primaryTextColorId: 'white',
        glowColorId: 'purple',
        secondaryTextColorId: 'teal',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80',
            opacityPct: 35,
        },
    },
    
    // === PINK / SOFT THEMES ===
    
    'Cherry Blossom': {
        // Pink blossoms - soft, romantic pinks with rose accents
        _preset: true,
        accentColorId: 'pink',
        iconColorId: 'rose',
        iconOpacityPct: 85,
        primaryTextColorId: 'white',
        glowColorId: 'pink',
        secondaryTextColorId: 'rose',
        homeBackground: {
            enabled: true,
            url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1920&q=80',
            opacityPct: 35,
        },
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
};
