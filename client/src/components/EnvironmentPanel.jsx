import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Thermometer,
  Droplets,
  Sun,
  Activity,
  DoorOpen,
  Power,
  Loader2,
  Clock,
  Cloud,
  Wind,
  CloudRain,
  SlidersHorizontal,
} from 'lucide-react';

import { getUiScheme } from '../uiScheme';
import { useAppState } from '../appState';
import { buildRoomsWithStatuses, getHomeVisibleDeviceIdSet } from '../deviceSelectors';
import { API_HOST } from '../apiHost';
import HlsPlayer from './HlsPlayer';
import {
  normalizeToleranceColorId,
  getToleranceTextClass as getToleranceTextClassForColorId,
} from '../toleranceColors';

const asNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

const formatTemp = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  // Hubitat typically sends configured unit; assume °F for display unless user changes.
  return `${num.toFixed(1)}°`;
};

const formatPercent = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)}%`;
};

const formatLux = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)}`;
};

const formatSpeed = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)} mph`;
};

const formatInches = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${num.toFixed(2)} in`;
};

const toCompass = (deg) => {
  const num = asNumber(deg);
  if (num === null) return null;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round((((num % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx];
};

const asText = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

// Open-Meteo weather codes: https://open-meteo.com/en/docs
const describeWeatherCode = (code) => {
  const c = asNumber(code);
  if (c === null) return null;
  const map = {
    0: 'Clear',
    1: 'Mostly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    56: 'Freezing drizzle',
    57: 'Freezing drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    66: 'Freezing rain',
    67: 'Freezing rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Rain showers',
    81: 'Heavy showers',
    82: 'Violent showers',
    85: 'Snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunder + hail',
    99: 'Thunder + hail',
  };
  return map[c] || `Code ${c}`;
};

const formatTime = (date) => {
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const formatDate = (date) => {
  try {
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: '2-digit' });
  } catch {
    return '—';
  }
};

const HOME_TOP_ROW_CARD_IDS = Object.freeze(['time', 'outside', 'inside', 'home']);
const HOME_TOP_ROW_MIN_GAP_REM = 0.375; // aligns with Tailwind gap-3 (0.75rem) minimum when scaled down
const HOME_TOP_ROW_MIN_MARGIN_REM = 0.5; // aligns with Tailwind mt-2+ minimum space when row is scaled down

const useClock = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

const MetricCard = ({
  title,
  value,
  sub,
  icon: IconComponent,
  accentClassName,
  valueClassName,
  valueStyle,
  subClassName,
  primaryTextColorClassName,
  secondaryTextClassName,
  secondaryTextStrongClassName,
  iconWrapClassName,
  className,
  uiScheme,
  scaled,
  scale,
}) => {
  const valueClassTrimmed = (valueClassName && String(valueClassName).trim().length)
    ? String(valueClassName).trim()
    : '';
  const primaryColorTrimmed = (primaryTextColorClassName && String(primaryTextColorClassName).trim().length)
    ? String(primaryTextColorClassName).trim()
    : '';
  const effectiveValueClassName = valueClassTrimmed
    ? `${primaryColorTrimmed} ${valueClassTrimmed}`.trim()
    : (primaryColorTrimmed || 'text-white');

  const scaleNumRaw = Number(scale);
  const scaleNum = Number.isFinite(scaleNumRaw) ? Math.max(0.5, Math.min(2, scaleNumRaw)) : 1;
  const isScaled = scaled === true;

  const scaledPaddingStyle = isScaled
    ? { padding: `${Math.round(16 * scaleNum)}px` }
    : undefined;

  const secondaryTextScaleVar = 'var(--jvs-secondary-text-size-scale, 1)';
  const titleFontPx = Math.round((isScaled ? 11 * scaleNum : 11));
  const subFontPx = Math.round((isScaled ? 13 * scaleNum : 13));
  const titleStyle = { fontSize: `calc(${titleFontPx}px * ${secondaryTextScaleVar})` };
  const subStyle = { fontSize: `calc(${subFontPx}px * ${secondaryTextScaleVar})` };

  const primaryTextScaleVar = 'var(--jvs-primary-text-size-scale, 1)';
  const scaledValueStyle = isScaled
    ? {
        fontSize: `calc(${Math.round(34 * scaleNum)}px * ${primaryTextScaleVar})`,
        lineHeight: 1.05,
        ...(valueStyle || {}),
      }
    : valueStyle;


  const scaledIconWrapStyle = isScaled
    ? {
        width: `${Math.round(48 * scaleNum)}px`,
        height: `${Math.round(48 * scaleNum)}px`,
        borderRadius: `${Math.round(16 * scaleNum)}px`,
        marginTop: `${Math.round(4 * scaleNum)}px`,
        transform: `translate(${Math.round(6 * scaleNum)}px, ${Math.round(14 * scaleNum)}px)`,
      }
    : undefined;

  const scaledIconStyle = isScaled
    ? {
        width: `${Math.round(24 * scaleNum)}px`,
        height: `${Math.round(24 * scaleNum)}px`,
      }
    : undefined;

  return (
    <div
      className={`glass-panel ${isScaled ? '' : 'p-4 md:p-5'} border ${accentClassName} ${className || ''}`.trim()}
      style={scaledPaddingStyle}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div
            className={`uppercase tracking-[0.2em] jvs-secondary-text-strong font-semibold ${secondaryTextStrongClassName || ''}`.trim()}
            style={titleStyle}
          >
            {title}
          </div>
          <div
            style={scaledValueStyle}
            className={`mt-2 jvs-primary-text-strong ${isScaled ? '' : 'jvs-home-primary-metric-value'} font-extrabold tracking-tight truncate ${effectiveValueClassName}`.trim()}
          >
            {value}
          </div>
          {sub ? (
            <div
              className={subClassName || `mt-1 jvs-secondary-text truncate ${secondaryTextClassName || ''}`}
              style={subStyle}
            >
              {sub}
            </div>
          ) : null}
        </div>

        <div
          className={`shrink-0 self-start ${isScaled ? '' : 'mt-1 md:mt-1.5 translate-x-1.5 translate-y-3.5 w-10 h-10 md:w-12 md:h-12 rounded-2xl'} border border-white/10 bg-black/30 flex items-center justify-center ${iconWrapClassName || ''}`.trim()}
          style={scaledIconWrapStyle}
        >
          {React.createElement(IconComponent, {
            className: `${isScaled ? '' : 'w-5 h-5 md:w-6 md:h-6'} jvs-icon ${uiScheme?.metricIcon || 'text-neon-blue'}`.trim(),
            style: scaledIconStyle,
          })}
        </div>
      </div>
    </div>
  );
};

const getColorizeOpacityStyle = (enabled, opacityPct) => {
  if (!enabled) return undefined;
  const raw = Number(opacityPct);
  if (!Number.isFinite(raw)) return undefined;
  const clamped = Math.max(0, Math.min(100, raw));
  return { opacity: clamped / 100 };
};

const SwitchButton = ({ label, isOn, disabled, onToggle, busy, uiScheme }) => {
  const stateClass = isOn
    ? 'bg-white/10 border-white/20 text-white'
    : 'bg-white/5 border-white/10 text-white/70';

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onToggle}
      className={`
        w-full
        rounded-2xl border p-4 md:p-5
        transition-colors
        active:scale-[0.99]
        ${stateClass}
        ${disabled ? 'opacity-50' : ''}
      `}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 text-left">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] font-semibold truncate">
            {label}
          </div>
          <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight">
            {isOn ? 'ON' : 'OFF'}
          </div>
        </div>

        <div className="shrink-0 self-start mt-1 md:mt-1.5 translate-x-1.5 translate-y-3.5 w-10 h-10 md:w-12 md:h-12 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
          {busy ? (
            <Loader2 className={`w-5 h-5 md:w-6 md:h-6 animate-spin jvs-icon ${uiScheme?.metricIcon || 'text-neon-blue'}`} />
          ) : (
            <Power className={`w-5 h-5 md:w-6 md:h-6 ${isOn ? 'text-white' : 'text-white/60'}`} />
          )}
        </div>
      </div>
    </button>
  );
};

const ActionButton = ({ label, icon: IconComponent, disabled, busy, onClick, accent = 'blue', uiScheme, scaled, scale }) => {
  const accentClass = accent === 'green'
    ? 'text-neon-green border-neon-green/30 bg-neon-green/10'
    : (accent === 'fixed'
      ? 'text-white/80 border-white/15 bg-white/5'
      : (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10'));

  const scaleNumRaw = Number(scale);
  const scaleNum = Number.isFinite(scaleNumRaw) ? Math.max(0.5, Math.min(2, scaleNumRaw)) : 1;
  const isScaled = scaled === true;

  const scaledButtonStyle = isScaled
    ? {
        padding: `${Math.round(8 * scaleNum)}px ${Math.round(12 * scaleNum)}px`,
        borderRadius: `${Math.round(12 * scaleNum)}px`,
        fontSize: `${Math.round(12 * scaleNum)}px`,
      }
    : undefined;

  const scaledIconStyle = isScaled
    ? {
        width: `${Math.round(16 * scaleNum)}px`,
        height: `${Math.round(16 * scaleNum)}px`,
      }
    : undefined;

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      style={scaledButtonStyle}
      className={`
        rounded-xl border ${isScaled ? '' : 'px-3 py-2'}
        ${isScaled ? '' : 'text-xs'} font-bold uppercase tracking-[0.18em]
        transition-colors
        active:scale-[0.99]
        ${accentClass}
        ${(disabled || busy) ? 'opacity-50' : 'hover:bg-white/5'}
      `}
    >
      <span className="inline-flex items-center gap-2">
        {busy ? (
          <Loader2 className={`${isScaled ? '' : 'w-4 h-4'} animate-spin`.trim()} style={scaledIconStyle} />
        ) : (
          React.createElement(IconComponent, { className: isScaled ? '' : 'w-4 h-4', style: scaledIconStyle })
        )}
        {label}
      </span>
    </button>
  );
};


const isOutsideRoomName = (name) => {
  const n = String(name || '').toLowerCase();
  return n.includes('outside') || n.includes('outdoor') || n.includes('exterior') || n.includes('porch') || n.includes('patio');
};

const pickOutsideDevices = (rooms) => {
  const outsideRooms = rooms.filter((r) => isOutsideRoomName(r.room?.name));
  if (outsideRooms.length) return outsideRooms.flatMap((r) => r.devices);

  const all = rooms.flatMap((r) => r.devices);
  return all.filter((d) => isOutsideRoomName(d.label));
};

const computeRoomMetrics = (devices, allowedControlIds, deviceHomeMetricAllowlist) => {
  const temps = [];
  const hums = [];
  const lux = [];
  let motionActive = false;
  let motionActiveCount = 0;

  let doorCount = 0;
  let doorOpen = false;
  let doorOpenCount = 0;

  const switches = [];

  let temperaturePossibleCount = 0;
  let humidityPossibleCount = 0;
  let illuminancePossibleCount = 0;

  const canUseMetric = (deviceId, key) => {
    const id = String(deviceId || '').trim();
    if (!id) return true;
    const raw = (deviceHomeMetricAllowlist && typeof deviceHomeMetricAllowlist === 'object') ? deviceHomeMetricAllowlist : {};
    const arr = raw[id];
    if (!Array.isArray(arr)) return true; // inherit
    return arr.map((v) => String(v || '').trim()).filter(Boolean).includes(key);
  };

  for (const dev of devices) {
    const attrs = dev.status?.attributes || {};
    const caps = Array.isArray(dev?.capabilities) ? dev.capabilities : [];

    const allowTemp = canUseMetric(dev.id, 'temperature');
    const allowHum = canUseMetric(dev.id, 'humidity');
    const allowLux = canUseMetric(dev.id, 'illuminance');
    const allowMotion = canUseMetric(dev.id, 'motion');
    const allowContact = canUseMetric(dev.id, 'contact');
    const allowDoor = canUseMetric(dev.id, 'door');

    if (allowTemp) {
      if (caps.includes('TemperatureMeasurement') || attrs.temperature !== undefined) {
        temperaturePossibleCount += 1;
      }
      const t = asNumber(attrs.temperature);
      if (t !== null) temps.push(t);
    }

    if (allowHum) {
      if (caps.includes('RelativeHumidityMeasurement') || attrs.humidity !== undefined) {
        humidityPossibleCount += 1;
      }
      const h = asNumber(attrs.humidity);
      if (h !== null) hums.push(h);
    }

    if (allowLux) {
      if (caps.includes('IlluminanceMeasurement') || attrs.illuminance !== undefined) {
        illuminancePossibleCount += 1;
      }
      const lx = asNumber(attrs.illuminance);
      if (lx !== null) lux.push(lx);
    }

    if (allowMotion && attrs.motion === 'active') {
      motionActive = true;
      motionActiveCount += 1;
    }

    const maybeCountDoorState = (raw) => {
      if (typeof raw !== 'string') return;
      const v = String(raw).toLowerCase();
      // Hubitat ContactSensor: contact=open|closed
      // Hubitat GarageDoorControl: door=open|closed|opening|closing|unknown
      if (v === 'open' || v === 'closed' || v === 'opening' || v === 'closing') {
        doorCount += 1;
        if (v === 'open' || v === 'opening' || v === 'closing') {
          doorOpen = true;
          doorOpenCount += 1;
        }
      }
    };

    if (allowContact) maybeCountDoorState(attrs.contact);
    if (allowDoor) maybeCountDoorState(attrs.door);

    if (typeof attrs.switch === 'string' && allowedControlIds?.has(String(dev.id))) {
      switches.push({
        id: dev.id,
        label: dev.label,
        state: attrs.switch,
      });
    }
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  return {
    temperature: avg(temps),
    humidity: avg(hums),
    illuminance: avg(lux),
    temperatureCount: temps.length,
    humidityCount: hums.length,
    illuminanceCount: lux.length,
    temperaturePossibleCount,
    humidityPossibleCount,
    illuminancePossibleCount,
    motionActive,
    motionActiveCount,
    doorCount,
    doorOpen,
    doorOpenCount,
    switches,
  };
};

const getToleranceTextClass = (metric, value, climateTolerances, climateToleranceColors) => {
  const v = asNumber(value);
  if (v === null) return '';

  if (!climateTolerances || typeof climateTolerances !== 'object') return '';

  const colors = (climateToleranceColors && typeof climateToleranceColors === 'object')
    ? climateToleranceColors
    : {};

  if (metric === 'temperature') {
    const { cold, comfy, warm } = climateTolerances.temperatureF || {};
    const group = (colors.temperatureF && typeof colors.temperatureF === 'object') ? colors.temperatureF : {};
    const band = (Number.isFinite(cold) && v < cold) ? 'cold'
      : (Number.isFinite(comfy) && v < comfy) ? 'comfy'
      : (Number.isFinite(warm) && v < warm) ? 'warm'
      : 'hot';

    const fallback = band === 'cold' ? 'neon-blue' : band === 'comfy' ? 'neon-green' : band === 'warm' ? 'warning' : 'neon-red';
    return getToleranceTextClassForColorId(normalizeToleranceColorId(group[band], fallback));
  }

  if (metric === 'humidity') {
    const { dry, comfy, humid } = climateTolerances.humidityPct || {};
    const group = (colors.humidityPct && typeof colors.humidityPct === 'object') ? colors.humidityPct : {};
    const band = (Number.isFinite(dry) && v < dry) ? 'dry'
      : (Number.isFinite(comfy) && v < comfy) ? 'comfy'
      : (Number.isFinite(humid) && v < humid) ? 'humid'
      : 'veryHumid';

    const fallback = band === 'dry' ? 'neon-blue' : band === 'comfy' ? 'neon-green' : band === 'humid' ? 'warning' : 'neon-red';
    return getToleranceTextClassForColorId(normalizeToleranceColorId(group[band], fallback));
  }

  // illuminance
  const { dark, dim, bright } = climateTolerances.illuminanceLux || {};
  const group = (colors.illuminanceLux && typeof colors.illuminanceLux === 'object') ? colors.illuminanceLux : {};
  const band = (Number.isFinite(dark) && v < dark) ? 'dark'
    : (Number.isFinite(dim) && v < dim) ? 'dim'
    : (Number.isFinite(bright) && v < bright) ? 'bright'
    : 'veryBright';

  const fallback = band === 'dark' ? 'neon-blue' : band === 'dim' ? 'neon-green' : band === 'bright' ? 'warning' : 'neon-green';
  return getToleranceTextClassForColorId(normalizeToleranceColorId(group[band], fallback));
};

const getColorizedValueClass = (metric, value, climateTolerances, climateToleranceColors, enabled) => {
  if (!enabled) return '';
  const cls = getToleranceTextClass(metric, value, climateTolerances, climateToleranceColors);
  return cls ? `${cls} neon-text` : '';
};

async function sendDeviceCommand(deviceId, command, args = []) {
  const res = await fetch(`${API_HOST}/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Command failed (${res.status})`);
  }
}

const getDeviceCommandAllowlistForId = (deviceCommandAllowlist, deviceId) => {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  const raw = (deviceCommandAllowlist && typeof deviceCommandAllowlist === 'object') ? deviceCommandAllowlist : {};
  const arr = raw[id];
  if (!Array.isArray(arr)) return null;
  return arr.map((v) => String(v || '').trim()).filter(Boolean);
};

const RoomPanel = ({ roomName, devices, connected, uiScheme, climateTolerances, climateToleranceColors, colorizeHomeValues, colorizeHomeValuesOpacityPct, deviceCommandAllowlist, deviceHomeMetricAllowlist, homeRoomMetricKeys = [], homeRoomMetricColumns = 0, homeRoomColumnsXl = 3, primaryTextColorClassName = '', secondaryTextColorClassName = '', contentScale = 1 }) => {
  const [busyActions, setBusyActions] = useState(() => new Set());

  const scaleNumRaw = Number(contentScale);
  const scaleNum = Number.isFinite(scaleNumRaw) ? Math.max(0.5, Math.min(2, scaleNumRaw)) : 1;
  const titleStyle = { fontSize: `calc(${Math.round(18 * scaleNum)}px * var(--jvs-primary-text-size-scale, 1))` };

  const metrics = useMemo(
    () => computeRoomMetrics(devices, null, deviceHomeMetricAllowlist),
    [devices, deviceHomeMetricAllowlist],
  );

  const supportedActions = useMemo(() => {
    const allow = new Set(['on', 'off', 'toggle', 'refresh', 'push']);
    return devices
      .map((d) => ({
        id: d.id,
        label: d.label,
        commands: d.status?.commands || [],
        attrs: d.status?.attributes || {},
      }))
      .filter((d) => Array.isArray(d.commands) && d.commands.length)
      .map((d) => ({
        ...d,
        commands: (() => {
          const base = d.commands.filter((c) => allow.has(c));
          const perDevice = getDeviceCommandAllowlistForId(deviceCommandAllowlist, d.id);
          // Home controls only appear when commands are explicitly selected.
          if (!perDevice || perDevice.length === 0) return [];
          const set = new Set(perDevice);
          return base.filter((c) => set.has(c));
        })(),
      }))
      .filter((d) => d.commands.length);
  }, [devices, deviceCommandAllowlist]);

  const runAction = async (deviceId, command) => {
    const key = `${deviceId}:${command}`;
    setBusyActions((prev) => new Set(prev).add(key));
    try {
      await sendDeviceCommand(deviceId, command);
    } finally {
      setBusyActions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const hasEnv = Array.isArray(homeRoomMetricKeys) && homeRoomMetricKeys.length > 0;

  const headerGlow = (metrics.motionActive || metrics.doorOpen)
    ? `${uiScheme?.selectedCard || 'border-primary/40'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
    : 'border-white/10';

  const statusIconBase = `inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 ${scaleNum === 1 ? 'w-7 h-7' : ''}`;
  const statusIconStyle = scaleNum === 1
    ? undefined
    : {
        width: `${Math.round(28 * scaleNum)}px`,
        height: `${Math.round(28 * scaleNum)}px`,
      };

  const statusIconSizeClass = scaleNum === 1 ? 'w-4 h-4' : '';
  const statusIconSizeStyle = scaleNum === 1
    ? undefined
    : {
        width: `${Math.round(16 * scaleNum)}px`,
        height: `${Math.round(16 * scaleNum)}px`,
      };

  const activeIconClass = `${uiScheme?.selectedText || 'text-neon-blue'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
  const inactiveIconClass = 'text-white/35';

  const metricCards = useMemo(() => {
    const cards = [];
    const selectedKeys = Array.isArray(homeRoomMetricKeys)
      ? homeRoomMetricKeys.map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    const selected = new Set(selectedKeys);

    if (selected.has('temperature')) {
      cards.push(
        <MetricCard
          key="temperature"
          title="Temperature"
          value={metrics.temperature === null ? '—' : formatTemp(metrics.temperature)}
          sub={metrics.temperature === null ? 'No reading' : null}
          icon={Thermometer}
          accentClassName="border-white/10"
          valueClassName={getColorizedValueClass('temperature', metrics.temperature, climateTolerances, climateToleranceColors, colorizeHomeValues)}
          valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
          iconWrapClassName="bg-white/5"
          uiScheme={uiScheme}
          primaryTextColorClassName={primaryTextColorClassName}
          secondaryTextClassName={secondaryTextColorClassName}
          secondaryTextStrongClassName={secondaryTextColorClassName}
          scaled
          scale={scaleNum}
        />
      );
    }

    if (selected.has('humidity')) {
      cards.push(
        <MetricCard
          key="humidity"
          title="Humidity"
          value={metrics.humidity === null ? '—' : formatPercent(metrics.humidity)}
          sub={metrics.humidity === null ? 'No reading' : null}
          icon={Droplets}
          accentClassName="border-white/10"
          valueClassName={
            colorizeHomeValues
              ? getColorizedValueClass('humidity', metrics.humidity, climateTolerances, climateToleranceColors, true)
              : ''
          }
          valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
          iconWrapClassName="bg-white/5"
          uiScheme={uiScheme}
          primaryTextColorClassName={primaryTextColorClassName}
          secondaryTextClassName={secondaryTextColorClassName}
          secondaryTextStrongClassName={secondaryTextColorClassName}
          scaled
          scale={scaleNum}
        />
      );
    }

    if (selected.has('illuminance')) {
      cards.push(
        <MetricCard
          key="illuminance"
          title="Illuminance"
          value={metrics.illuminance === null ? '—' : formatLux(metrics.illuminance)}
          sub={metrics.illuminance === null ? 'No reading' : null}
          icon={Sun}
          accentClassName="border-white/10"
          valueClassName={
            colorizeHomeValues
              ? getColorizedValueClass('illuminance', metrics.illuminance, climateTolerances, climateToleranceColors, true)
              : ''
          }
          valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
          iconWrapClassName="bg-white/5"
          uiScheme={uiScheme}
          primaryTextColorClassName={primaryTextColorClassName}
          secondaryTextClassName={secondaryTextColorClassName}
          secondaryTextStrongClassName={secondaryTextColorClassName}
          scaled
          scale={scaleNum}
        />
      );
    }
    return cards;
  }, [
    metrics.temperature,
    metrics.humidity,
    metrics.illuminance,
    homeRoomMetricKeys,
    climateTolerances,
    climateToleranceColors,
    colorizeHomeValues,
    colorizeHomeValuesOpacityPct,
    uiScheme,
    primaryTextColorClassName,
    secondaryTextColorClassName,
    scaleNum,
  ]);

  const metricGridClassName = useMemo(() => {
    const count = metricCards.length;
    if (count <= 1) return 'grid-cols-1';

    const forcedRaw = Number(homeRoomMetricColumns);
    const forced = Number.isFinite(forcedRaw) ? Math.max(0, Math.min(3, Math.round(forcedRaw))) : 0;
    if (forced >= 1) {
      const cols = Math.max(1, Math.min(forced, count));
      return cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';
    }

    const roomColsRaw = Number(homeRoomColumnsXl);
    const roomCols = Number.isFinite(roomColsRaw) ? Math.max(1, Math.min(6, Math.round(roomColsRaw))) : 3;

    const cap = roomCols >= 5 ? 1 : roomCols >= 4 ? 2 : 3;
    const cols = Math.max(1, Math.min(cap, count));
    return cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3';
  }, [metricCards.length, homeRoomMetricColumns, homeRoomColumnsXl]);

  return (
    <section className={`glass-panel p-4 md:p-5 border ${headerGlow}`}>
      <div className="flex items-center justify-between gap-3">
        <h2
          className={`min-w-0 jvs-primary-text-strong ${scaleNum === 1 ? 'jvs-home-room-title' : ''} font-extrabold tracking-wide truncate ${primaryTextColorClassName || 'text-white'}`.trim()}
          style={scaleNum === 1 ? undefined : titleStyle}
        >
          {roomName}
        </h2>

        <div className="shrink-0 flex items-center gap-2">
          <span
            className={statusIconBase}
            style={statusIconStyle}
            title={metrics.motionActive ? 'Motion active' : 'Motion'}
            aria-label={metrics.motionActive ? 'Motion active' : 'Motion'}
          >
            <Activity
              className={`${statusIconSizeClass} jvs-icon ${metrics.motionActive ? activeIconClass : inactiveIconClass}`.trim()}
              style={statusIconSizeStyle}
            />
          </span>
          <span
            className={statusIconBase}
            style={statusIconStyle}
            title={metrics.doorOpen ? 'Door open' : 'Door'}
            aria-label={metrics.doorOpen ? 'Door open' : 'Door'}
          >
            <DoorOpen
              className={`${statusIconSizeClass} jvs-icon ${metrics.doorOpen ? activeIconClass : inactiveIconClass}`.trim()}
              style={statusIconSizeStyle}
            />
          </span>
        </div>
      </div>

      {hasEnv ? (
        <div className={`mt-4 grid ${metricGridClassName} gap-3`}>
          {metricCards}
        </div>
      ) : null}

      {supportedActions.length ? (
        <div className="mt-4">
          <div
            className={`text-[11px] md:text-xs uppercase tracking-[0.2em] jvs-secondary-text font-semibold mb-3 ${secondaryTextColorClassName}`.trim()}
            style={{ fontSize: `calc(11px * var(--jvs-secondary-text-size-scale, 1))` }}
          >
            Controls
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {supportedActions.map((d) => (
              <div
                key={d.id}
                className={`glass-panel ${scaleNum === 1 ? 'p-4' : ''} border border-white/10`}
                style={scaleNum === 1 ? undefined : { padding: `${Math.round(16 * scaleNum)}px` }}
              >
                <div
                  className={`${scaleNum === 1 ? 'text-[11px] md:text-xs' : ''} uppercase tracking-[0.2em] jvs-secondary-text-strong font-semibold truncate ${secondaryTextColorClassName}`.trim()}
                  style={{ fontSize: `calc(${Math.round(11 * scaleNum)}px * var(--jvs-secondary-text-size-scale, 1))` }}
                >
                  {d.label}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {d.commands.includes('on') ? (
                    <ActionButton
                      label="On"
                      icon={Power}
                      accent="fixed"
                      disabled={!connected}
                      busy={busyActions.has(`${d.id}:on`)}
                      onClick={() => runAction(d.id, 'on')}
                      uiScheme={uiScheme}
                      scaled
                      scale={scaleNum}
                    />
                  ) : null}
                  {d.commands.includes('off') ? (
                    <ActionButton
                      label="Off"
                      icon={Power}
                      accent="fixed"
                      disabled={!connected}
                      busy={busyActions.has(`${d.id}:off`)}
                      onClick={() => runAction(d.id, 'off')}
                      uiScheme={uiScheme}
                      scaled
                      scale={scaleNum}
                    />
                  ) : null}
                  {!d.commands.includes('on') && !d.commands.includes('off') && d.commands.includes('toggle') ? (
                    <ActionButton
                      label="Toggle"
                      icon={Power}
                      accent="fixed"
                      disabled={!connected}
                      busy={busyActions.has(`${d.id}:toggle`)}
                      onClick={() => runAction(d.id, 'toggle')}
                      uiScheme={uiScheme}
                      scaled
                      scale={scaleNum}
                    />
                  ) : null}
                  {d.commands.includes('refresh') ? (
                    <ActionButton
                      label="Refresh"
                      icon={SlidersHorizontal}
                      accent="blue"
                      disabled={!connected}
                      busy={busyActions.has(`${d.id}:refresh`)}
                      onClick={() => runAction(d.id, 'refresh')}
                      uiScheme={uiScheme}
                      scaled
                      scale={scaleNum}
                    />
                  ) : null}
                  {d.commands.includes('push') ? (
                    <ActionButton
                      label="Push"
                      icon={Activity}
                      accent="blue"
                      disabled={!connected}
                      busy={busyActions.has(`${d.id}:push`)}
                      onClick={() => runAction(d.id, 'push')}
                      uiScheme={uiScheme}
                      scaled
                      scale={scaleNum}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!supportedActions.length && !hasEnv ? (
        <div className="mt-4 text-sm text-white/40">No supported devices in this room.</div>
      ) : null}
    </section>
  );
};

const EnvironmentPanel = ({ config: configProp, statuses: statusesProp, connected: connectedProp, uiScheme: uiSchemeProp }) => {
  const ctx = useAppState();
  const config = configProp ?? ctx?.config;
  const statuses = statusesProp ?? ctx?.statuses;
  const connected = connectedProp ?? ctx?.connected;
  const uiScheme = uiSchemeProp ?? ctx?.uiScheme;

  const viewportRef = useRef(null);
  const metricRowRef = useRef(null);

  const resolvedUiScheme = useMemo(
    () => uiScheme || getUiScheme(config?.ui?.accentColorId),
    [uiScheme, config?.ui?.accentColorId],
  );

  const colorizeHomeValues = Boolean(config?.ui?.colorizeHomeValues);
  const colorizeHomeValuesOpacityPct = useMemo(() => {
    const raw = Number(config?.ui?.colorizeHomeValuesOpacityPct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [config?.ui?.colorizeHomeValuesOpacityPct]);

  const climateTolerances = useMemo(() => {
    const raw = (config?.ui?.climateTolerances && typeof config.ui.climateTolerances === 'object')
      ? config.ui.climateTolerances
      : {};

    const t = (raw.temperatureF && typeof raw.temperatureF === 'object') ? raw.temperatureF : {};
    const h = (raw.humidityPct && typeof raw.humidityPct === 'object') ? raw.humidityPct : {};
    const l = (raw.illuminanceLux && typeof raw.illuminanceLux === 'object') ? raw.illuminanceLux : {};

    return {
      temperatureF: {
        cold: asNumber(t.cold) ?? 68,
        comfy: asNumber(t.comfy) ?? 72,
        warm: asNumber(t.warm) ?? 74,
      },
      humidityPct: {
        dry: asNumber(h.dry) ?? 35,
        comfy: asNumber(h.comfy) ?? 55,
        humid: asNumber(h.humid) ?? 65,
      },
      illuminanceLux: {
        dark: asNumber(l.dark) ?? 50,
        dim: asNumber(l.dim) ?? 250,
        bright: asNumber(l.bright) ?? 600,
      },
    };
  }, [config?.ui?.climateTolerances]);

  const climateToleranceColors = useMemo(() => {
    const raw = (config?.ui?.climateToleranceColors && typeof config.ui.climateToleranceColors === 'object')
      ? config.ui.climateToleranceColors
      : {};

    const t = (raw.temperatureF && typeof raw.temperatureF === 'object') ? raw.temperatureF : {};
    const h = (raw.humidityPct && typeof raw.humidityPct === 'object') ? raw.humidityPct : {};
    const l = (raw.illuminanceLux && typeof raw.illuminanceLux === 'object') ? raw.illuminanceLux : {};

    return {
      temperatureF: {
        cold: normalizeToleranceColorId(t.cold, 'neon-blue'),
        comfy: normalizeToleranceColorId(t.comfy, 'neon-green'),
        warm: normalizeToleranceColorId(t.warm, 'warning'),
        hot: normalizeToleranceColorId(t.hot, 'neon-red'),
      },
      humidityPct: {
        dry: normalizeToleranceColorId(h.dry, 'neon-blue'),
        comfy: normalizeToleranceColorId(h.comfy, 'neon-green'),
        humid: normalizeToleranceColorId(h.humid, 'warning'),
        veryHumid: normalizeToleranceColorId(h.veryHumid, 'neon-red'),
      },
      illuminanceLux: {
        dark: normalizeToleranceColorId(l.dark, 'neon-blue'),
        dim: normalizeToleranceColorId(l.dim, 'neon-green'),
        bright: normalizeToleranceColorId(l.bright, 'warning'),
        veryBright: normalizeToleranceColorId(l.veryBright, 'neon-green'),
      },
    };
  }, [config?.ui?.climateToleranceColors]);

  const homeBackground = useMemo(() => {
    const raw = (config?.ui?.homeBackground && typeof config.ui.homeBackground === 'object')
      ? config.ui.homeBackground
      : {};

    const enabled = raw.enabled === true;
    const url = (raw.url === null || raw.url === undefined) ? null : String(raw.url).trim();
    const opacityRaw = Number(raw.opacityPct);
    const opacityPct = Number.isFinite(opacityRaw)
      ? Math.max(0, Math.min(100, Math.round(opacityRaw)))
      : 35;

    if (!enabled || !url) return { enabled: false, url: null, opacityPct };
    return { enabled: true, url, opacityPct };
  }, [config?.ui?.homeBackground]);

  // Track background image load errors for graceful fallback
  const [backgroundImageError, setBackgroundImageError] = useState(false);

  // Reset error state and preload image when URL changes
  useEffect(() => {
    setBackgroundImageError(false);
    
    if (!homeBackground.enabled || !homeBackground.url) return;

    // Preload image and detect errors using Image constructor
    const img = new Image();
    img.onerror = () => {
      setBackgroundImageError(true);
    };
    img.src = homeBackground.url;

    return () => {
      // Clean up by removing event handler
      img.onerror = null;
    };
  }, [homeBackground.enabled, homeBackground.url]);

  const cardScalePct = useMemo(() => {
    const raw = Number(config?.ui?.cardScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.cardScalePct]);

  const homeTopRowEnabled = config?.ui?.homeTopRowEnabled !== false;

  const homeTopRowScalePct = useMemo(() => {
    const raw = Number(config?.ui?.homeTopRowScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(120, Math.round(raw)));
  }, [config?.ui?.homeTopRowScalePct]);

  const homeTopRowScale = useMemo(
    () => Math.max(0.5, Math.min(1.2, homeTopRowScalePct / 100)),
    [homeTopRowScalePct],
  );

  const homeTopRowCards = useMemo(() => {
    const uiObj = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
    const hasCards = Object.prototype.hasOwnProperty.call(uiObj, 'homeTopRowCards');
    const raw = hasCards
      ? (Array.isArray(uiObj.homeTopRowCards) ? uiObj.homeTopRowCards : [])
      : HOME_TOP_ROW_CARD_IDS;
    const allowed = new Set(HOME_TOP_ROW_CARD_IDS);
    const cards = raw
      .map((v) => String(v || '').trim())
      .filter((v) => v && allowed.has(v));
    const uniq = Array.from(new Set(cards));
    if (hasCards) return uniq;
    return uniq.length ? uniq : HOME_TOP_ROW_CARD_IDS;
  }, [config?.ui?.homeTopRowCards]);

  const secondaryTextColorId = useMemo(() => {
    const raw = String(config?.ui?.secondaryTextColorId ?? '').trim();
    if (!raw) return '';
    return normalizeToleranceColorId(raw, 'neon-green');
  }, [config?.ui?.secondaryTextColorId]);

  const secondaryTextColorClass = useMemo(() => {
    if (!secondaryTextColorId) return '';
    return getToleranceTextClassForColorId(secondaryTextColorId);
  }, [secondaryTextColorId]);

  const primaryTextColorId = useMemo(() => {
    const raw = String(config?.ui?.primaryTextColorId ?? '').trim();
    if (!raw) return '';
    return normalizeToleranceColorId(raw, 'neon-green');
  }, [config?.ui?.primaryTextColorId]);

  const primaryTextColorClass = useMemo(() => {
    if (!primaryTextColorId) return '';
    return getToleranceTextClassForColorId(primaryTextColorId);
  }, [primaryTextColorId]);

  const homeRoomColumnsXl = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomColumnsXl);
    if (!Number.isFinite(raw)) return 3;
    return Math.max(1, Math.min(6, Math.round(raw)));
  }, [config?.ui?.homeRoomColumnsXl]);

  const homeRoomMetricColumns = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMetricColumns);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(3, Math.round(raw)));
  }, [config?.ui?.homeRoomMetricColumns]);

  const homeRoomMetricKeys = useMemo(() => {
    const allowed = new Set(['temperature', 'humidity', 'illuminance']);
    const raw = Array.isArray(config?.ui?.homeRoomMetricKeys)
      ? config.ui.homeRoomMetricKeys
      : ['temperature', 'humidity', 'illuminance'];
    const keys = raw
      .map((v) => String(v || '').trim())
      .filter((v) => allowed.has(v));
    return Array.from(new Set(keys));
  }, [config?.ui?.homeRoomMetricKeys]);

  const homeCameraPreviewsEnabled = useMemo(
    () => config?.ui?.homeCameraPreviewsEnabled === true,
    [config?.ui?.homeCameraPreviewsEnabled],
  );

  const cameraPreviewRefreshSeconds = useMemo(() => {
    const raw = Number(config?.ui?.cameraPreviewRefreshSeconds);
    if (!Number.isFinite(raw)) return 10;
    return Math.max(2, Math.min(120, Math.round(raw)));
  }, [config?.ui?.cameraPreviewRefreshSeconds]);

  const cameras = useMemo(
    () => (Array.isArray(config?.ui?.cameras) ? config.ui.cameras : []),
    [config?.ui?.cameras],
  );

  const visibleCameraIds = useMemo(
    () => (Array.isArray(config?.ui?.visibleCameraIds) ? config.ui.visibleCameraIds : []),
    [config?.ui?.visibleCameraIds],
  );

  const topCameraIds = useMemo(
    () => (Array.isArray(config?.ui?.topCameraIds) ? config.ui.topCameraIds.map((v) => String(v || '').trim()).filter(Boolean) : []),
    [config?.ui?.topCameraIds],
  );

  const topCameraSize = useMemo(() => {
    const raw = String(config?.ui?.topCameraSize ?? '').trim().toLowerCase();
    if (raw === 'xs' || raw === 'sm' || raw === 'md' || raw === 'lg') return raw;
    return 'md';
  }, [config?.ui?.topCameraSize]);

  const homeVisibleDeviceIds = useMemo(() => getHomeVisibleDeviceIdSet(config), [config]);
  const rooms = useMemo(
    () => buildRoomsWithStatuses(config, statuses, { deviceIdSet: homeVisibleDeviceIds }),
    [config, statuses, homeVisibleDeviceIds],
  );
  const now = useClock(1000);
  const roomContentScale = useMemo(() => {
    const raw = Number(cardScalePct);
    if (!Number.isFinite(raw)) return 1;
    return Math.max(0.5, Math.min(2, raw / 100));
  }, [cardScalePct]);

  const [cameraBrokenIds, setCameraBrokenIds] = useState(() => new Set());

  const topCameras = useMemo(() => {
    if (!homeCameraPreviewsEnabled) return [];
    const ids = Array.isArray(topCameraIds) ? topCameraIds : [];
    if (!ids.length) return [];

    const allow = Array.isArray(visibleCameraIds)
      ? visibleCameraIds.map((v) => String(v || '').trim()).filter(Boolean)
      : [];
    const allowSet = new Set(allow);
    const allowAll = allowSet.size === 0;

    const list = Array.isArray(cameras) ? cameras : [];
    const byId = new Map(list.map((c) => [String(c?.id || '').trim(), c]));

    return ids
      .map((idRaw) => {
        const id = String(idRaw || '').trim();
        if (!id) return null;
        const c = byId.get(id);
        if (!c || typeof c !== 'object') return null;
        const cid = String(c.id || '').trim();
        if (!cid) return null;
        const label = String(c.label || cid).trim() || cid;
        const enabled = c.enabled !== false;
        const hasSnapshot = c.hasSnapshot === true;
        const hasEmbed = c.hasEmbed === true && typeof c.embedUrl === 'string' && c.embedUrl.trim();
        const embedUrl = hasEmbed ? String(c.embedUrl).trim() : '';
        const hasRtsp = c.hasRtsp === true;
        const hasAnyPreview = Boolean(hasEmbed || hasRtsp || hasSnapshot);

        if (!enabled || !hasAnyPreview) return null;
        if (!allowAll && !allowSet.has(cid)) return null;

        return {
          id: cid,
          label,
          hasSnapshot,
          hasEmbed,
          embedUrl,
          hasRtsp,
        };
      })
      .filter(Boolean);
  }, [cameras, homeCameraPreviewsEnabled, topCameraIds, visibleCameraIds]);

  const cameraRefreshMs = useMemo(() => {
    const raw = Number(cameraPreviewRefreshSeconds);
    const secs = Number.isFinite(raw) ? Math.max(2, Math.min(120, Math.round(raw))) : 10;
    return secs * 1000;
  }, [cameraPreviewRefreshSeconds]);

  const cameraTick = useMemo(() => {
    const t = Number(now);
    if (!Number.isFinite(t)) return 0;
    return cameraRefreshMs > 0 ? Math.floor(t / cameraRefreshMs) : 0;
  }, [now, cameraRefreshMs]);

  const topCameraGridClassName = useMemo(() => {
    if (topCameraSize === 'lg') return 'grid-cols-1';
    if (topCameraSize === 'sm') return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    if (topCameraSize === 'xs') return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    return 'grid-cols-1 md:grid-cols-2';
  }, [topCameraSize]);

  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [hubitatMode, setHubitatMode] = useState(null);
  const [hubitatModeError, setHubitatModeError] = useState(null);

  const overall = useMemo(() => {
    const allDevices = (rooms || []).flatMap((r) => r.devices);
    return computeRoomMetrics(allDevices, null, config?.ui?.deviceHomeMetricAllowlist);
  }, [rooms, config?.ui?.deviceHomeMetricAllowlist]);

  const outsideSensors = useMemo(() => {
    const outsideDevices = pickOutsideDevices(rooms);
    return computeRoomMetrics(outsideDevices, null, config?.ui?.deviceHomeMetricAllowlist);
  }, [rooms, config?.ui?.deviceHomeMetricAllowlist]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`${API_HOST}/api/weather`);
        if (!res.ok) throw new Error(`weather ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setWeather(data?.weather || null);
        setWeatherError(null);
      } catch (e) {
        if (!alive) return;
        setWeatherError(e?.message || 'weather error');
      }
    };

    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`${API_HOST}/api/hubitat/modes`);
        if (!res.ok) throw new Error(`modes ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setHubitatMode(data?.active || null);
        setHubitatModeError(null);
      } catch (e) {
        if (!alive) return;
        setHubitatMode(null);
        setHubitatModeError(e?.message || 'modes error');
      }
    };

    load();
    const id = setInterval(load, 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const outsideDisplay = useMemo(() => {
    const current = weather?.current || null;
    const today = weather?.today || null;

    const currentTemp = current ? current.temperature : null;
    const currentHumidity = current ? current.humidity : null;
    const apparentTemp = current ? current.apparentTemperature : null;
    const windSpeed = current ? current.windSpeed : null;
    const windDir = current ? current.windDirection : null;
    const precipNow = current ? current.precipitation : null;
    const code = current ? current.weatherCode : null;
    const condition = describeWeatherCode(code);

    const todayHigh = today ? today.temperatureMax : null;
    const todayLow = today ? today.temperatureMin : null;
    const precipProb = today ? today.precipitationProbabilityMax : null;
    const todayCode = today ? today.weatherCode : null;
    const todayCondition = describeWeatherCode(todayCode);

    return {
      currentTemp,
      currentHumidity,
      apparentTemp,
      windSpeed,
      windDir,
      precipNow,
      condition,
      todayHigh,
      todayLow,
      precipProb,
      todayCondition,
    };
  }, [weather]);

  const outsideTempForValue = outsideDisplay.currentTemp !== null
    ? outsideDisplay.currentTemp
    : outsideSensors.temperature;

  const topRowCards = useMemo(() => {
    const selected = homeTopRowCards.length ? homeTopRowCards : HOME_TOP_ROW_CARD_IDS;
    const selectedSet = new Set(selected);
    const scaled = homeTopRowScalePct !== 100;
    const cards = [];

    if (selectedSet.has('time')) {
      cards.push(
        <MetricCard
          key="time"
          title="Time"
          value={formatTime(now)}
          sub={formatDate(now)}
          subClassName={`mt-1 text-[13px] jvs-secondary-text truncate ${secondaryTextColorClass}`.trim()}
          icon={Clock}
          accentClassName="border-white/10"
          iconWrapClassName="bg-white/5"
          uiScheme={resolvedUiScheme}
          primaryTextColorClassName={primaryTextColorClass}
          secondaryTextClassName={secondaryTextColorClass}
          secondaryTextStrongClassName={secondaryTextColorClass}
          scaled={scaled}
          scale={homeTopRowScale}
        />
      );
    }

    if (selectedSet.has('outside')) {
      cards.push(
        <MetricCard
          key="outside"
          title="Outside"
          value={formatTemp(outsideTempForValue)}
          sub={(
            <div className="space-y-1">
              <div className={`jvs-secondary-text-strong ${secondaryTextColorClass}`.trim()}>
                {asText(outsideDisplay.condition)
                  ? (
                    `${outsideDisplay.condition}${outsideDisplay.currentHumidity !== null ? ` • ${formatPercent(outsideDisplay.currentHumidity)}` : ''}`
                  )
                  : (
                    outsideSensors.humidity === null
                      ? (weatherError ? `Weather offline (${weatherError})` : 'Weather loading…')
                      : `Outside sensors • Humidity ${formatPercent(outsideSensors.humidity)}`
                  )}
              </div>

              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 jvs-secondary-text ${secondaryTextColorClass}`.trim()}>
                {(outsideDisplay.todayHigh !== null || outsideDisplay.todayLow !== null) ? (
                  <span className="inline-flex items-center gap-1">
                    <Cloud className="w-3.5 h-3.5" />
                    H {formatTemp(outsideDisplay.todayHigh)} • L {formatTemp(outsideDisplay.todayLow)}
                    {outsideDisplay.precipProb !== null ? ` • ${Math.round(Number(outsideDisplay.precipProb))}%` : ''}
                  </span>
                ) : null}

                {outsideDisplay.windSpeed !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Wind className="w-3.5 h-3.5" />
                    {formatSpeed(outsideDisplay.windSpeed)}{toCompass(outsideDisplay.windDir) ? ` ${toCompass(outsideDisplay.windDir)}` : ''}
                  </span>
                ) : null}

                {outsideDisplay.precipNow !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <CloudRain className="w-3.5 h-3.5" />
                    {formatInches(outsideDisplay.precipNow)}
                  </span>
                ) : null}

                {outsideDisplay.apparentTemp !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5" />
                    Feels {formatTemp(outsideDisplay.apparentTemp)}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          subClassName={`mt-2 text-[13px] jvs-secondary-text ${secondaryTextColorClass}`.trim()}
          icon={Cloud}
          accentClassName="border-white/10"
          iconWrapClassName="bg-white/5"
          valueClassName={getColorizedValueClass('temperature', outsideTempForValue, climateTolerances, climateToleranceColors, colorizeHomeValues)}
          valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
          uiScheme={resolvedUiScheme}
          primaryTextColorClassName={primaryTextColorClass}
          secondaryTextClassName={secondaryTextColorClass}
          secondaryTextStrongClassName={secondaryTextColorClass}
          scaled={scaled}
          scale={homeTopRowScale}
        />
      );
    }

    if (selectedSet.has('inside')) {
      cards.push(
        <MetricCard
          key="inside"
          title="Inside"
          value={formatTemp(overall.temperature)}
          sub={
            overall.temperature === null
              ? 'No sensors'
              : `RH ${overall.humidity === null ? '—' : formatPercent(overall.humidity)} • Lux ${overall.illuminance === null ? '—' : formatLux(overall.illuminance)}`
          }
          subClassName={`mt-1 text-[13px] jvs-secondary-text truncate ${secondaryTextColorClass}`.trim()}
          icon={Thermometer}
          accentClassName="border-white/10"
          valueClassName={getColorizedValueClass('temperature', overall.temperature, climateTolerances, climateToleranceColors, colorizeHomeValues)}
          valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
          iconWrapClassName="bg-white/5"
          uiScheme={resolvedUiScheme}
          primaryTextColorClassName={primaryTextColorClass}
          secondaryTextClassName={secondaryTextColorClass}
          secondaryTextStrongClassName={secondaryTextColorClass}
          scaled={scaled}
          scale={homeTopRowScale}
        />
      );
    }

    if (selectedSet.has('home')) {
      cards.push(
        <MetricCard
          key="home"
          title="Home"
          value={
            !connected
              ? 'OFFLINE'
              : (asText(hubitatMode?.name) || asText(hubitatMode?.label) || asText(hubitatMode?.id) || '—')
          }
          sub={
            !connected
              ? 'Disconnected'
              : (`Motion: ${overall.motionActiveCount || 0} • Doors: ${overall.doorOpenCount || 0}${hubitatModeError ? ` • Mode unavailable (${hubitatModeError})` : ''}`)
          }
          subClassName={`mt-1 text-[13px] jvs-secondary-text truncate ${secondaryTextColorClass}`.trim()}
          icon={Activity}
          iconWrapClassName="bg-white/5"
          accentClassName={
            connected
              ? ((overall.motionActive || overall.doorOpen) ? `${resolvedUiScheme.selectedCard}` : 'border-white/10')
              : 'border-danger/30'
          }
          valueClassName={connected ? '' : 'text-neon-red'}
          uiScheme={resolvedUiScheme}
          primaryTextColorClassName={primaryTextColorClass}
          secondaryTextClassName={secondaryTextColorClass}
          secondaryTextStrongClassName={secondaryTextColorClass}
          scaled={scaled}
          scale={homeTopRowScale}
        />
      );
    }

    return cards;
  }, [
    homeTopRowCards,
    homeTopRowScale,
    homeTopRowScalePct,
    now,
    secondaryTextColorClass,
    resolvedUiScheme,
    primaryTextColorClass,
    outsideTempForValue,
    outsideDisplay,
    outsideSensors.humidity,
    climateTolerances,
    climateToleranceColors,
    colorizeHomeValues,
    colorizeHomeValuesOpacityPct,
    overall.temperature,
    overall.humidity,
    overall.illuminance,
    overall.motionActive,
    overall.motionActiveCount,
    overall.doorOpen,
    overall.doorOpenCount,
    connected,
    hubitatMode?.name,
    hubitatMode?.label,
    hubitatMode?.id,
    hubitatModeError,
    weatherError,
  ]);

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-auto p-2 md:p-3">
      {homeBackground.enabled && homeBackground.url && !backgroundImageError ? (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: `url(${JSON.stringify(String(homeBackground.url))})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: homeBackground.opacityPct / 100,
          }}
        />
      ) : null}

      <div className="relative z-10 w-full">
        <div className="w-full">
          {homeTopRowEnabled && topRowCards.length ? (
            <div
              ref={metricRowRef}
              className="grid grid-cols-2 lg:grid-cols-4 gap-3"
              style={
                homeTopRowScale !== 1
                  ? { gap: `${Math.max(HOME_TOP_ROW_MIN_GAP_REM, 0.75 * homeTopRowScale)}rem` }
                  : undefined
              }
            >
              {topRowCards}
            </div>
          ) : null}

          <div
            className="mt-4"
            style={
              homeTopRowEnabled && topRowCards.length
                ? { marginTop: `${Math.max(HOME_TOP_ROW_MIN_MARGIN_REM, homeTopRowScale)}rem` }
                : undefined
            }
          >
            {topCameras.length ? (
              <div className="mb-4">
                <div
                  className={`text-[11px] md:text-xs uppercase tracking-[0.2em] jvs-secondary-text font-semibold mb-3 ${secondaryTextColorClass}`.trim()}
                  style={{ fontSize: `calc(11px * var(--jvs-secondary-text-size-scale, 1))` }}
                >
                  Cameras
                </div>
                <div className={`grid ${topCameraGridClassName} gap-3`}>
                  {topCameras.map((cam) => {
                    const broken = cameraBrokenIds.has(cam.id);
                    const src = `${API_HOST}/api/cameras/${encodeURIComponent(cam.id)}/snapshot?t=${cameraTick}`;
                    return (
                      <div key={cam.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className={`text-[11px] uppercase tracking-[0.2em] font-semibold ${primaryTextColorClass || 'text-white/80'} truncate`.trim()}>
                          {cam.label || cam.id}
                        </div>
                        <div className="mt-2 overflow-hidden rounded-xl bg-black/30">
                          {cam.hasEmbed ? (
                            <iframe
                              src={cam.embedUrl}
                              title={cam.label || cam.id}
                              className="w-full aspect-video"
                              style={{ border: 0 }}
                              allow="autoplay; fullscreen"
                              referrerPolicy="no-referrer"
                            />
                          ) : cam.hasRtsp ? (
                            <HlsPlayer cameraId={cam.id} />
                          ) : (!broken ? (
                            <img
                              src={src}
                              alt={cam.label || cam.id}
                              className="w-full aspect-video object-cover"
                              onError={() => {
                                setCameraBrokenIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(cam.id);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <div className="w-full aspect-video flex items-center justify-center text-xs text-white/45">
                              Snapshot unavailable
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div
              className="jvs-home-rooms-grid gap-4"
              style={{
                '--jvs-home-rooms-cols-desktop': homeRoomColumnsXl,
              }}
            >
            {rooms.length ? (
              rooms.map((r) => (
                <RoomPanel
                  key={r.room.id}
                  roomName={r.room.name}
                  devices={r.devices}
                  connected={connected}
                  uiScheme={resolvedUiScheme}
                  climateTolerances={climateTolerances}
                  climateToleranceColors={climateToleranceColors}
                  colorizeHomeValues={colorizeHomeValues}
                  colorizeHomeValuesOpacityPct={colorizeHomeValuesOpacityPct}
                  deviceCommandAllowlist={config?.ui?.deviceCommandAllowlist}
                  deviceHomeMetricAllowlist={config?.ui?.deviceHomeMetricAllowlist}
                  homeRoomMetricKeys={homeRoomMetricKeys}
                  homeRoomMetricColumns={homeRoomMetricColumns}
                  homeRoomColumnsXl={homeRoomColumnsXl}
                  primaryTextColorClassName={primaryTextColorClass}
                  secondaryTextColorClassName={secondaryTextColorClass}
                  contentScale={roomContentScale}
                />
              ))
            ) : (
              <div className="glass-panel p-8 border border-white/10 text-center text-white/50 lg:col-span-2 xl:col-span-3">
                <div className="text-sm uppercase tracking-[0.2em]">No data</div>
                <div className={`mt-2 text-xl font-extrabold jvs-primary-text-strong ${primaryTextColorClass || 'text-white'}`.trim()}>Waiting for devices…</div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentPanel;
