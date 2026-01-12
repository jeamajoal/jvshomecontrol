 /**
 * Global UI defaults configuration.
 * 
 * These define the baseline display settings (sizing, layout, transparency, blur)
 * that all shipped presets and new panels inherit. Users tune these once for their
 * specific screen/device, and every theme automatically uses those values.
 * 
 * Color identity (accent, glow, icon, text colors/opacities) lives in the presets,
 * not here — those define the visual theme, not the display calibration.
 */

// Card background opacity scale.
// 100 = default styling, 0 = fully transparent, 200 = twice as opaque.
// Default is 20 (glassy look) so shipped presets can inherit a clean glass aesthetic.
const UI_CARD_OPACITY_SCALE_PCT_DEFAULT = 20;
const UI_CARD_OPACITY_SCALE_PCT_MIN = 0;
const UI_CARD_OPACITY_SCALE_PCT_MAX = 200;

// Backdrop blur scale.
// 100 = default blur, 0 = no blur, 200 = double blur.
// Default is 15 (light blur) for a subtle frosted glass effect.
const UI_BLUR_SCALE_PCT_DEFAULT = 15;
const UI_BLUR_SCALE_PCT_MIN = 0;
const UI_BLUR_SCALE_PCT_MAX = 200;

// Primary text size (main values like room titles, sensor readings).
// 100 = default, 50 = half-size, 200 = double-size.
const UI_PRIMARY_TEXT_SIZE_PCT_DEFAULT = 100;
const UI_PRIMARY_TEXT_SIZE_PCT_MIN = 50;
const UI_PRIMARY_TEXT_SIZE_PCT_MAX = 200;

// Secondary text size (labels, attribute names).
// 100 = default, 50 = half-size, 200 = double-size.
const UI_SECONDARY_TEXT_SIZE_PCT_DEFAULT = 100;
const UI_SECONDARY_TEXT_SIZE_PCT_MIN = 50;
const UI_SECONDARY_TEXT_SIZE_PCT_MAX = 200;

// Icon size.
// 100 = default, 50 = half-size, 200 = double-size.
const UI_ICON_SIZE_PCT_DEFAULT = 100;
const UI_ICON_SIZE_PCT_MIN = 50;
const UI_ICON_SIZE_PCT_MAX = 200;

// Card scale (padding/spacing on Home cards).
// 100 = default, 50 = compact, 200 = spacious.
const UI_CARD_SCALE_PCT_DEFAULT = 100;
const UI_CARD_SCALE_PCT_MIN = 50;
const UI_CARD_SCALE_PCT_MAX = 200;

// Home room grid columns at XL breakpoint (>= 1280px).
const UI_HOME_ROOM_COLUMNS_XL_DEFAULT = 3;
const UI_HOME_ROOM_COLUMNS_XL_MIN = 1;
const UI_HOME_ROOM_COLUMNS_XL_MAX = 6;

// Primary text opacity (0-100%).
const UI_PRIMARY_TEXT_OPACITY_PCT_DEFAULT = 100;

// Secondary text opacity (0-100%).
const UI_SECONDARY_TEXT_OPACITY_PCT_DEFAULT = 45;

// Icon opacity (0-100%).
const UI_ICON_OPACITY_PCT_DEFAULT = 100;

// Bundled range objects for convenience (backwards compat with existing code).
const UI_CARD_OPACITY_SCALE_PCT_RANGE = Object.freeze({
    min: UI_CARD_OPACITY_SCALE_PCT_MIN,
    max: UI_CARD_OPACITY_SCALE_PCT_MAX,
    def: UI_CARD_OPACITY_SCALE_PCT_DEFAULT,
});

const UI_BLUR_SCALE_PCT_RANGE = Object.freeze({
    min: UI_BLUR_SCALE_PCT_MIN,
    max: UI_BLUR_SCALE_PCT_MAX,
    def: UI_BLUR_SCALE_PCT_DEFAULT,
});

const UI_PRIMARY_TEXT_SIZE_PCT_RANGE = Object.freeze({
    min: UI_PRIMARY_TEXT_SIZE_PCT_MIN,
    max: UI_PRIMARY_TEXT_SIZE_PCT_MAX,
    def: UI_PRIMARY_TEXT_SIZE_PCT_DEFAULT,
});

const UI_SECONDARY_TEXT_SIZE_PCT_RANGE = Object.freeze({
    min: UI_SECONDARY_TEXT_SIZE_PCT_MIN,
    max: UI_SECONDARY_TEXT_SIZE_PCT_MAX,
    def: UI_SECONDARY_TEXT_SIZE_PCT_DEFAULT,
});

const UI_ICON_SIZE_PCT_RANGE = Object.freeze({
    min: UI_ICON_SIZE_PCT_MIN,
    max: UI_ICON_SIZE_PCT_MAX,
    def: UI_ICON_SIZE_PCT_DEFAULT,
});

const UI_CARD_SCALE_PCT_RANGE = Object.freeze({
    min: UI_CARD_SCALE_PCT_MIN,
    max: UI_CARD_SCALE_PCT_MAX,
    def: UI_CARD_SCALE_PCT_DEFAULT,
});

const UI_HOME_ROOM_COLUMNS_XL_RANGE = Object.freeze({
    min: UI_HOME_ROOM_COLUMNS_XL_MIN,
    max: UI_HOME_ROOM_COLUMNS_XL_MAX,
    def: UI_HOME_ROOM_COLUMNS_XL_DEFAULT,
});

module.exports = {
    // Individual defaults
    UI_CARD_OPACITY_SCALE_PCT_DEFAULT,
    UI_CARD_OPACITY_SCALE_PCT_MIN,
    UI_CARD_OPACITY_SCALE_PCT_MAX,
    UI_BLUR_SCALE_PCT_DEFAULT,
    UI_BLUR_SCALE_PCT_MIN,
    UI_BLUR_SCALE_PCT_MAX,
    UI_PRIMARY_TEXT_SIZE_PCT_DEFAULT,
    UI_PRIMARY_TEXT_SIZE_PCT_MIN,
    UI_PRIMARY_TEXT_SIZE_PCT_MAX,
    UI_SECONDARY_TEXT_SIZE_PCT_DEFAULT,
    UI_SECONDARY_TEXT_SIZE_PCT_MIN,
    UI_SECONDARY_TEXT_SIZE_PCT_MAX,
    UI_ICON_SIZE_PCT_DEFAULT,
    UI_ICON_SIZE_PCT_MIN,
    UI_ICON_SIZE_PCT_MAX,
    UI_CARD_SCALE_PCT_DEFAULT,
    UI_CARD_SCALE_PCT_MIN,
    UI_CARD_SCALE_PCT_MAX,
    UI_HOME_ROOM_COLUMNS_XL_DEFAULT,
    UI_HOME_ROOM_COLUMNS_XL_MIN,
    UI_HOME_ROOM_COLUMNS_XL_MAX,
    UI_PRIMARY_TEXT_OPACITY_PCT_DEFAULT,
    UI_SECONDARY_TEXT_OPACITY_PCT_DEFAULT,
    UI_ICON_OPACITY_PCT_DEFAULT,

    // Range objects (for code that uses .min/.max/.def pattern)
    UI_CARD_OPACITY_SCALE_PCT_RANGE,
    UI_BLUR_SCALE_PCT_RANGE,
    UI_PRIMARY_TEXT_SIZE_PCT_RANGE,
    UI_SECONDARY_TEXT_SIZE_PCT_RANGE,
    UI_ICON_SIZE_PCT_RANGE,
    UI_CARD_SCALE_PCT_RANGE,
    UI_HOME_ROOM_COLUMNS_XL_RANGE,
};
