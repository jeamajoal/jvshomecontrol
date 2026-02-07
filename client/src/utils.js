/**
 * Shared utility functions used across client components.
 *
 * Centralises helpers that were previously duplicated in deviceMapping.js,
 * deviceSelectors.js, EnvironmentPanel.jsx, InteractionPanel.jsx, etc.
 */

// ── Primitive Coercion ──────────────────────────────────────────────────────

/** Coerce a value to a finite number, or return `null`. */
export const asNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

/** Coerce a value to a non-empty trimmed string, or return `null`. */
export const asText = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

/** Like `asText` but lowercased. */
export const toLowerText = (value) => {
  const s = asText(value);
  return s ? s.toLowerCase() : null;
};

// ── Formatting ──────────────────────────────────────────────────────────────

/** Format a temperature value with one decimal and degree symbol. */
export const formatTemp = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${num.toFixed(1)}°`;
};

/** Format a percentage value as a rounded integer with % suffix. */
export const formatPercent = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)}%`;
};

/** Format a lux/illuminance value as a rounded integer. */
export const formatLux = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)}`;
};

/** Format a wind speed value with "mph" unit. */
export const formatSpeed = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)} mph`;
};

/** Format a precipitation value with two decimals and "in" unit. */
export const formatInches = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${num.toFixed(2)} in`;
};

/** Convert a compass bearing (degrees) to a 16-point compass direction. */
export const toCompass = (deg) => {
  const num = asNumber(deg);
  if (num === null) return null;
  const dirs = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const idx = Math.round((((num % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx];
};

// ── Numeric Clamping ────────────────────────────────────────────────────────

/** Clamp a number between min and max (inclusive). */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Clamp between 0 and 1. */
export const clamp01 = (n) => clamp(n, 0, 1);

// ── Metric Display Helpers ──────────────────────────────────────────────────

/** Whether a metric key is safe to display (alphanumeric + underscore, ≤64 chars). */
export const isSafeInfoMetricKey = (key) =>
  typeof key === 'string' && key.length <= 64 && /^[A-Za-z0-9_]+$/.test(key);

/** Whether a value is displayable in the UI. */
export const isDisplayableInfoValue = (value) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((v) => ['string', 'number', 'boolean'].includes(typeof v));
  }
  if (typeof value === 'object') return false;
  return ['string', 'number', 'boolean'].includes(typeof value);
};

/** Convert a camelCase or snake_case metric key to a Title Case label. */
export const formatInfoMetricLabel = (key) => {
  const s = String(key || '').trim();
  if (!s) return '';
  const upper = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return upper.replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Format a metric value for display — handles arrays, booleans, and primitives. */
export const formatInfoMetricValue = (value) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v ? 'On' : 'Off';
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        const s = String(v).trim();
        return s.length ? s : null;
      })
      .filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  const s = String(value).trim();
  return s.length ? s : null;
};

/** Ordered priority for info metrics — used for sorting. */
export const INFO_METRIC_PRIORITY = [
  'temperature', 'humidity', 'illuminance', 'battery',
  'motion', 'contact', 'door', 'lock', 'presence',
  'switch', 'level', 'volume', 'mute', 'position',
  'power', 'energy', 'speed',
];
