import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  Flame,
  CircleAlert,
  User,
} from 'lucide-react';

import { getUiScheme } from '../uiScheme';
import { useAppState } from '../appState';
import { buildRoomsWithStatuses, getHomeVisibleDeviceIdSet, getDeviceInfoMetricAllowlist } from '../deviceSelectors';
import { API_HOST } from '../apiHost';
import { inferInternalDeviceType } from '../deviceMapping';
import { getDeviceTypeIconSrc } from '../deviceIcons';
import { asNumber, asText, formatTemp, formatPercent, formatLux, formatSpeed, formatInches, toCompass, isSafeInfoMetricKey, isDisplayableInfoValue, formatInfoMetricLabel, formatInfoMetricValue, sortInfoMetricKeys } from '../utils';
import DeviceInfoGrid from './DeviceInfoGrid';
import InlineSvg from './InlineSvg';
import InteractiveControlIcon from './InteractiveControlIcon';
import HlsPlayer from './HlsPlayer';
import {
  normalizeToleranceColorId,
  getToleranceTextClass as getToleranceTextClassForColorId,
} from '../toleranceColors';

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

  // Additional alert sensor types - track both existence and alarm state
  let smokeCount = 0; // Total smoke detectors in room
  let smokeAlarm = false;
  let smokeAlarmCount = 0;
  let coCount = 0; // Total CO detectors in room
  let coAlarm = false;
  let coAlarmCount = 0;
  let waterCount = 0; // Total water/leak sensors in room
  let waterAlarm = false;
  let waterAlarmCount = 0;
  let presenceCount = 0; // Total presence sensors in room
  let presenceHome = false;
  let presenceHomeCount = 0;

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

    // Smoke detector: smoke attribute = 'detected' | 'clear'
    if (typeof attrs.smoke === 'string') {
      smokeCount += 1; // Track that this room HAS a smoke detector
      const v = String(attrs.smoke).toLowerCase();
      if (v === 'detected') {
        smokeAlarm = true;
        smokeAlarmCount += 1;
      }
    }

    // Carbon monoxide detector: carbonMonoxide attribute = 'detected' | 'clear'
    if (typeof attrs.carbonMonoxide === 'string') {
      coCount += 1; // Track that this room HAS a CO detector
      const v = String(attrs.carbonMonoxide).toLowerCase();
      if (v === 'detected') {
        coAlarm = true;
        coAlarmCount += 1;
      }
    }

    // Water/leak sensor: water attribute = 'wet' | 'dry'
    if (typeof attrs.water === 'string') {
      waterCount += 1; // Track that this room HAS a water sensor
      const v = String(attrs.water).toLowerCase();
      if (v === 'wet') {
        waterAlarm = true;
        waterAlarmCount += 1;
      }
    }

    // Presence sensor: presence attribute = 'present' | 'not present'
    if (typeof attrs.presence === 'string') {
      presenceCount += 1; // Track that this room HAS a presence sensor
      const v = String(attrs.presence).toLowerCase();
      if (v === 'present') {
        presenceHome = true;
        presenceHomeCount += 1;
      }
    }

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
    smokeCount,
    smokeAlarm,
    smokeAlarmCount,
    coCount,
    coAlarm,
    coAlarmCount,
    waterCount,
    waterAlarm,
    waterAlarmCount,
    presenceCount,
    presenceHome,
    presenceHomeCount,
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

const RoomPanel = ({ roomName, devices, connected, uiScheme, climateTolerances, climateToleranceColors, sensorIndicatorColors, colorizeHomeValues, colorizeHomeValuesOpacityPct, deviceCommandAllowlist, deviceHomeMetricAllowlist, deviceInfoMetricAllowlist, deviceTypeIcons, deviceControlIcons, switchControlStyle = 'auto', switchAnimationStyle = 'none', homeRoomMetricKeys = [], homeRoomMetricColumns = 0, homeRoomColumnsXl = 3, primaryTextColorClassName = '', secondaryTextColorClassName = '', tertiaryTextColorClassName = '', contentScale = 1, fillHeight = false }) => {
  const [busyActions, setBusyActions] = useState(() => new Set());
  const [svgHotspotsByDeviceId, setSvgHotspotsByDeviceId] = useState(() => ({}));

  const scaleNumRaw = Number(contentScale);
  const scaleNum = Number.isFinite(scaleNumRaw) ? Math.max(0.5, Math.min(2, scaleNumRaw)) : 1;
  const titleStyle = { fontSize: `calc(${Math.round(18 * scaleNum)}px * var(--jvs-primary-text-size-scale, 1))` };

  const metrics = useMemo(
    () => computeRoomMetrics(devices, null, deviceHomeMetricAllowlist),
    [devices, deviceHomeMetricAllowlist],
  );

  const supportedActions = useMemo(() => {
    return devices
      .map((d) => ({
        id: d.id,
        label: d.label,
        commands: d.status?.commands || [],
        attrs: d.status?.attributes || {},
        caps: Array.isArray(d?.capabilities) ? d.capabilities : (Array.isArray(d?.status?.capabilities) ? d.status.capabilities : []),
        hubitatType: d?.type,
        state: d?.status?.state,
      }))
      .filter((d) => Array.isArray(d.commands) && d.commands.length)
      .map((d) => {
        const perDevice = getDeviceCommandAllowlistForId(deviceCommandAllowlist, d.id);
        let commands = d.commands;
        if (perDevice !== null) {
          if (perDevice.length === 0) commands = [];
          else {
            const set = new Set(perDevice);
            commands = commands.filter((c) => set.has(String(c)));
          }
        }

        // Info cards
        const availableInfoMetricKeys = sortInfoMetricKeys(
          Object.entries(d.attrs)
            .filter(([key, value]) => isSafeInfoMetricKey(key) && isDisplayableInfoValue(value))
            .map(([key]) => key),
        );
        const infoAllowlist = getDeviceInfoMetricAllowlist({ ui: { deviceInfoMetricAllowlist } }, d.id);
        const infoKeys = Array.isArray(infoAllowlist)
          ? availableInfoMetricKeys.filter((k) => infoAllowlist.includes(k))
          : [];
        const infoItems = infoKeys
          .map((key) => {
            const value = formatInfoMetricValue(d.attrs?.[key]);
            if (value === null) return null;
            return { key, label: formatInfoMetricLabel(key), value };
          })
          .filter(Boolean);

        return {
          ...d,
          commands,
          internalType: inferInternalDeviceType({
            hubitatType: d.hubitatType,
            capabilities: d.caps,
            attributes: d.attrs,
            state: d.state,
            commandSchemas: d.commands,
          }),
          infoItems,
        };
      })
      .filter((d) => d.commands.length);
  }, [devices, deviceCommandAllowlist, deviceInfoMetricAllowlist]);

  // Sensor devices: those with info cards configured but possibly no commands
  const sensorDevices = useMemo(() => {
    const actionIds = new Set(supportedActions.map((d) => d.id));
    return devices
      .filter((d) => !actionIds.has(d.id)) // Exclude devices already in supportedActions
      .map((d) => {
        const attrs = d.status?.attributes || {};
        const availableInfoMetricKeys = sortInfoMetricKeys(
          Object.entries(attrs)
            .filter(([key, value]) => isSafeInfoMetricKey(key) && isDisplayableInfoValue(value))
            .map(([key]) => key),
        );
        const infoAllowlist = getDeviceInfoMetricAllowlist({ ui: { deviceInfoMetricAllowlist } }, d.id);
        const infoKeys = Array.isArray(infoAllowlist)
          ? availableInfoMetricKeys.filter((k) => infoAllowlist.includes(k))
          : [];
        const infoItems = infoKeys
          .map((key) => {
            const value = formatInfoMetricValue(attrs?.[key]);
            if (value === null) return null;
            return { key, label: formatInfoMetricLabel(key), value };
          })
          .filter(Boolean);

        return {
          id: d.id,
          label: d.label,
          attrs,
          internalType: inferInternalDeviceType({
            hubitatType: d?.type,
            capabilities: Array.isArray(d?.capabilities) ? d.capabilities : [],
            attributes: attrs,
            state: d?.status?.state,
            commandSchemas: [],
          }),
          infoItems,
        };
      })
      .filter((d) => d.infoItems.length > 0); // Only include if they have info cards
  }, [devices, deviceInfoMetricAllowlist, supportedActions]);

  const formatCommandLabel = (cmd) => {
    const s = String(cmd || '').trim();
    if (!s) return '';
    if (s === 'on') return 'On';
    if (s === 'off') return 'Off';
    if (s === 'toggle') return 'Toggle';
    if (s === 'refresh') return 'Refresh';
    if (s === 'push') return 'Push';
    // human-ish label for arbitrary Hubitat commands
    return s
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim()
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
      .join(' ');
  };

  const runAction = async (deviceId, command, args = []) => {
    const key = `${deviceId}:${command}`;
    setBusyActions((prev) => new Set(prev).add(key));
    try {
      await sendDeviceCommand(deviceId, command, args);
    } finally {
      setBusyActions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const hasEnv = Array.isArray(homeRoomMetricKeys) && homeRoomMetricKeys.length > 0;

  // Any active sensor triggers the header glow
  const hasActiveAlert = metrics.motionActive || metrics.doorOpen || metrics.smokeAlarm || metrics.coAlarm || metrics.waterAlarm || metrics.presenceHome;
  const headerGlow = hasActiveAlert
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

  // Sensor indicator colors with fallback to uiScheme accent
  const motionActiveIconClass = (() => {
    const colorId = sensorIndicatorColors?.motion;
    if (colorId && colorId !== 'none') {
      const textClass = getToleranceTextClassForColorId(colorId);
      if (textClass) return `${textClass} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
    }
    return `${uiScheme?.selectedText || 'text-neon-blue'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
  })();

  const doorActiveIconClass = (() => {
    const colorId = sensorIndicatorColors?.door;
    if (colorId && colorId !== 'none') {
      const textClass = getToleranceTextClassForColorId(colorId);
      if (textClass) return `${textClass} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
    }
    return `${uiScheme?.selectedText || 'text-neon-blue'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
  })();

  const smokeActiveIconClass = (() => {
    const colorId = sensorIndicatorColors?.smoke;
    if (colorId && colorId !== 'none') {
      const textClass = getToleranceTextClassForColorId(colorId);
      if (textClass) return `${textClass} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
    }
    return `text-neon-red ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
  })();

  const coActiveIconClass = (() => {
    const colorId = sensorIndicatorColors?.co;
    if (colorId && colorId !== 'none') {
      const textClass = getToleranceTextClassForColorId(colorId);
      if (textClass) return `${textClass} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
    }
    return `text-neon-red ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
  })();

  const waterActiveIconClass = (() => {
    const colorId = sensorIndicatorColors?.water;
    if (colorId && colorId !== 'none') {
      const textClass = getToleranceTextClassForColorId(colorId);
      if (textClass) return `${textClass} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
    }
    return `text-neon-blue ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
  })();

  const presenceActiveIconClass = (() => {
    const colorId = sensorIndicatorColors?.presence;
    if (colorId && colorId !== 'none') {
      const textClass = getToleranceTextClassForColorId(colorId);
      if (textClass) return `${textClass} ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
    }
    return `text-neon-green ${uiScheme?.headerGlow || 'animate-glow-accent'}`.trim();
  })();

  const inactiveIconClass = 'text-white/35';

  const metricCards = useMemo(() => {
    const cards = [];
    const selectedKeys = Array.isArray(homeRoomMetricKeys)
      ? homeRoomMetricKeys.map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    const selected = new Set(selectedKeys);

    if (selected.has('temperature') && metrics.temperature !== null) {
      cards.push(
        <MetricCard
          key="temperature"
          title="Temperature"
          value={formatTemp(metrics.temperature)}
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

    if (selected.has('humidity') && metrics.humidity !== null) {
      cards.push(
        <MetricCard
          key="humidity"
          title="Humidity"
          value={formatPercent(metrics.humidity)}
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

    if (selected.has('illuminance') && metrics.illuminance !== null) {
      cards.push(
        <MetricCard
          key="illuminance"
          title="Illuminance"
          value={formatLux(metrics.illuminance)}
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
    <section className={`glass-panel p-4 md:p-5 border ${headerGlow} ${fillHeight ? 'h-full flex flex-col' : ''}`.trim()}>
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
              className={`${statusIconSizeClass} jvs-icon ${metrics.motionActive ? motionActiveIconClass : inactiveIconClass}`.trim()}
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
              className={`${statusIconSizeClass} jvs-icon ${metrics.doorOpen ? doorActiveIconClass : inactiveIconClass}`.trim()}
              style={statusIconSizeStyle}
            />
          </span>
          {/* Smoke detector - always show when sensor exists in room */}
          {metrics.smokeCount > 0 ? (
            <span
              className={statusIconBase}
              style={statusIconStyle}
              title={metrics.smokeAlarm ? 'Smoke detected!' : 'Smoke detector'}
              aria-label={metrics.smokeAlarm ? 'Smoke detected' : 'Smoke detector'}
            >
              <Flame
                className={`${statusIconSizeClass} jvs-icon ${metrics.smokeAlarm ? smokeActiveIconClass : inactiveIconClass}`.trim()}
                style={statusIconSizeStyle}
              />
            </span>
          ) : null}
          {/* CO detector - always show when sensor exists in room */}
          {metrics.coCount > 0 ? (
            <span
              className={statusIconBase}
              style={statusIconStyle}
              title={metrics.coAlarm ? 'Carbon monoxide detected!' : 'CO detector'}
              aria-label={metrics.coAlarm ? 'Carbon monoxide detected' : 'CO detector'}
            >
              <CircleAlert
                className={`${statusIconSizeClass} jvs-icon ${metrics.coAlarm ? coActiveIconClass : inactiveIconClass}`.trim()}
                style={statusIconSizeStyle}
              />
            </span>
          ) : null}
          {/* Water/leak sensor - always show when sensor exists in room */}
          {metrics.waterCount > 0 ? (
            <span
              className={statusIconBase}
              style={statusIconStyle}
              title={metrics.waterAlarm ? 'Water/leak detected!' : 'Water sensor'}
              aria-label={metrics.waterAlarm ? 'Water leak detected' : 'Water sensor'}
            >
              <Droplets
                className={`${statusIconSizeClass} jvs-icon ${metrics.waterAlarm ? waterActiveIconClass : inactiveIconClass}`.trim()}
                style={statusIconSizeStyle}
              />
            </span>
          ) : null}
          {/* Presence sensor - always show when sensor exists in room */}
          {metrics.presenceCount > 0 ? (
            <span
              className={statusIconBase}
              style={statusIconStyle}
              title={metrics.presenceHome ? 'Presence detected' : 'Presence sensor'}
              aria-label={metrics.presenceHome ? 'Presence detected' : 'Presence sensor'}
            >
              <User
                className={`${statusIconSizeClass} jvs-icon ${metrics.presenceHome ? presenceActiveIconClass : inactiveIconClass}`.trim()}
                style={statusIconSizeStyle}
              />
            </span>
          ) : null}
        </div>
      </div>

      {metricCards.length > 0 ? (
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
          <div className="flex flex-wrap justify-center gap-3">
            {supportedActions.map((d) => {
              const iconSrc = getDeviceTypeIconSrc({ ui: { deviceTypeIcons } }, d.internalType);
              
              // Check for per-device control icon assignment (supports array or string)
              const controlIconVal = (deviceControlIcons && typeof deviceControlIcons === 'object')
                ? deviceControlIcons[d.id]
                : null;
              const controlIconIds = controlIconVal
                ? (Array.isArray(controlIconVal) ? controlIconVal : [controlIconVal]).map((v) => String(v || '').trim()).filter(Boolean)
                : [];
              
              // Build device object for InteractiveControlIcon
              const deviceObj = {
                id: d.id,
                switch: d.attrs?.switch || 'off',
                level: d.attrs?.level ?? 0,
                ...d.attrs,
              };

              return (
                <div
                  key={d.id}
                  className={`glass-panel ${scaleNum === 1 ? 'p-3' : ''} border border-white/10 inline-flex flex-col items-center`}
                  style={scaleNum === 1 ? undefined : { padding: `${Math.round(16 * scaleNum)}px` }}
                >
                  <div
                    className={`${scaleNum === 1 ? 'text-[11px] md:text-xs' : ''} text-center uppercase tracking-[0.2em] jvs-secondary-text-strong font-semibold ${secondaryTextColorClassName}`.trim()}
                    style={{ fontSize: `calc(${Math.round(11 * scaleNum)}px * var(--jvs-secondary-text-size-scale, 1))` }}
                  >
                    <span className="truncate">{d.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {(() => {
                    const commands = Array.isArray(d.commands)
                      ? d.commands.map((v) => String(v || '').trim()).filter(Boolean)
                      : [];

                    const hasOn = commands.includes('on');
                    const hasOff = commands.includes('off');
                    const hasToggle = commands.includes('toggle');
                    const hasPowerCommands = hasOn || hasOff || hasToggle;

                    const mode = (switchControlStyle === 'buttons' || switchControlStyle === 'switch' || switchControlStyle === 'auto')
                      ? switchControlStyle
                      : 'auto';

                    const switchState = typeof d?.attrs?.switch === 'string'
                      ? String(d.attrs.switch).toLowerCase()
                      : null;
                    const isOn = switchState === 'on';
                    const isOff = switchState === 'off';

                    const busyOn = busyActions.has(`${d.id}:on`);
                    const busyOff = busyActions.has(`${d.id}:off`);
                    const busyToggle = busyActions.has(`${d.id}:toggle`);
                    const anyBusy = busyOn || busyOff || busyToggle;

                    const pulseOn = switchAnimationStyle === 'pulse' && isOn === true && !anyBusy;

                    const runToggle = () => {
                      if (!connected || anyBusy) return;
                      if (isOn === true && hasOff) return runAction(d.id, 'off');
                      if (isOn === false && hasOn) return runAction(d.id, 'on');
                      if (hasToggle) return runAction(d.id, 'toggle');
                      if (isOn === true) return runAction(d.id, 'off');
                      return runAction(d.id, 'on');
                    };

                      const hasIconSurface = Boolean(iconSrc);
                      const svgHasHotspots = svgHotspotsByDeviceId[d.id] === true;

                    const otherCommands = commands.filter((c) => c !== 'on' && c !== 'off' && c !== 'toggle');

                    const resolveCommandForDevice = (rawCmd) => {
                      const wanted = String(rawCmd || '').trim();
                      if (!wanted) return null;
                      const wantedLower = wanted.toLowerCase();
                      const exact = commands.find((c) => c === wanted);
                      if (exact) return exact;
                      return commands.find((c) => String(c || '').toLowerCase() === wantedLower) || null;
                    };

                    const handleSvgCommand = (rawCmd, args) => {
                      if (!connected || anyBusy) return;
                      const resolved = resolveCommandForDevice(rawCmd);
                      if (!resolved) return;
                      runAction(d.id, resolved, Array.isArray(args) ? args : []);
                    };

                    // If control icons are assigned, render them instead of the default controls
                    if (controlIconIds.length > 0) {
                      return (
                        <div className="flex flex-wrap gap-2 justify-center items-end">
                          {controlIconIds.map((iconId) => (
                            <InteractiveControlIcon
                              key={iconId}
                              iconId={iconId}
                              device={deviceObj}
                              disabled={!connected}
                              onCommand={(deviceId, command, args) => runAction(deviceId, command, args)}
                              className="w-16 h-16"
                            />
                          ))}
                        </div>
                      );
                    }

                    return (
                      <>
                          {hasIconSurface && hasPowerCommands ? (
                            svgHasHotspots ? (
                              <div className="w-fit mx-auto inline-flex items-center justify-center">
                                <InlineSvg
                                  src={iconSrc}
                                  rootClassName={isOn === true ? 'is-on' : ''}
                                  onCommand={handleSvgCommand}
                                  onMeta={({ hasHotspots }) => {
                                    setSvgHotspotsByDeviceId((prev) => (
                                      prev[d.id] === hasHotspots ? prev : { ...prev, [d.id]: hasHotspots }
                                    ));
                                  }}
                                  className="mx-auto w-[88px] h-[88px]"
                                  style={{ display: 'block' }}
                                  role="img"
                                  ariaLabel={`${d.label} ${isOn ? 'on' : 'off'}`}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={!connected || anyBusy}
                                onClick={runToggle}
                                className="w-fit mx-auto inline-flex items-center justify-center bg-transparent p-0 active:scale-[0.99] disabled:opacity-100"
                                aria-pressed={isOn === true ? 'true' : 'false'}
                              >
                                <InlineSvg
                                  src={iconSrc}
                                  rootClassName={isOn === true ? 'is-on' : ''}
                                  onCommand={handleSvgCommand}
                                  onMeta={({ hasHotspots }) => {
                                    setSvgHotspotsByDeviceId((prev) => (
                                      prev[d.id] === hasHotspots ? prev : { ...prev, [d.id]: hasHotspots }
                                    ));
                                  }}
                                  className="mx-auto w-[88px] h-[88px]"
                                  style={{ display: 'block' }}
                                  role="img"
                                  ariaLabel={`${d.label} ${isOn ? 'on' : 'off'}`}
                                />
                              </button>
                            )
                          ) : null}

                          {hasIconSurface && !hasPowerCommands ? (
                            <div className="w-fit mx-auto inline-flex items-center justify-center">
                              <InlineSvg
                                src={iconSrc}
                                onCommand={handleSvgCommand}
                                onMeta={({ hasHotspots }) => {
                                  setSvgHotspotsByDeviceId((prev) => (
                                    prev[d.id] === hasHotspots ? prev : { ...prev, [d.id]: hasHotspots }
                                  ));
                                }}
                                className="mx-auto"
                                style={{ display: 'block', width: 180, height: 360 }}
                                role="img"
                                ariaLabel={`${d.label} controls`}
                              />
                            </div>
                          ) : null}

                          {hasPowerCommands && !hasIconSurface && mode === 'switch' ? (
                          <button
                            type="button"
                            disabled={!connected || anyBusy}
                            onClick={runToggle}
                            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-3 transition-colors active:scale-[0.99] ${(!connected || anyBusy) ? 'opacity-50' : 'hover:bg-white/5'} ${
                              isOn === true
                                ? (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10')
                                : 'text-white/70 border-white/10 bg-black/20'
                            }`}
                            aria-pressed={isOn === true ? 'true' : 'false'}
                          >
                            <div className="text-xs font-bold uppercase tracking-[0.18em]">
                              {anyBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (isOn === true ? 'On' : 'Off')}
                            </div>

                            <div
                              className={`relative w-14 h-8 rounded-full border transition-colors ${
                                isOn === true
                                  ? (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10')
                                  : 'border-white/10 bg-black/30'
                              } ${pulseOn ? 'animate-pulse' : ''}`}
                            >
                              <div
                                className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white/70 transition-transform ${
                                  isOn === true ? 'translate-x-6' : 'translate-x-0'
                                }`}
                              />
                            </div>
                          </button>
                        ) : null}

                          {hasPowerCommands && !hasIconSurface && mode !== 'switch' && hasOn ? (
                          <ActionButton
                            key="power:on"
                            label="On"
                            icon={Power}
                            accent={isOn ? 'green' : 'fixed'}
                            disabled={!connected}
                            busy={busyOn}
                            onClick={() => runAction(d.id, 'on')}
                            uiScheme={uiScheme}
                            scaled
                            scale={scaleNum}
                          />
                        ) : null}

                          {hasPowerCommands && !hasIconSurface && mode !== 'switch' && hasOff ? (
                          <ActionButton
                            key="power:off"
                            label="Off"
                            icon={Power}
                            accent={isOff ? 'green' : 'fixed'}
                            disabled={!connected}
                            busy={busyOff}
                            onClick={() => runAction(d.id, 'off')}
                            uiScheme={uiScheme}
                            scaled
                            scale={scaleNum}
                          />
                        ) : null}

                          {hasPowerCommands && !hasIconSurface && mode !== 'switch' && !hasOn && !hasOff && hasToggle ? (
                          <ActionButton
                            key="power:toggle"
                            label="Toggle"
                            icon={Power}
                            accent={isOn ? 'green' : 'fixed'}
                            disabled={!connected}
                            busy={busyToggle}
                            onClick={() => runAction(d.id, 'toggle')}
                            uiScheme={uiScheme}
                            scaled
                            scale={scaleNum}
                          />
                        ) : null}

                        {!svgHasHotspots ? otherCommands.map((cmd) => (
                          <ActionButton
                            key={cmd}
                            label={formatCommandLabel(cmd)}
                            icon={cmd === 'push' ? Activity : SlidersHorizontal}
                            accent="blue"
                            disabled={!connected}
                            busy={busyActions.has(`${d.id}:${cmd}`)}
                            onClick={() => runAction(d.id, cmd)}
                            uiScheme={uiScheme}
                            scaled
                            scale={scaleNum}
                          />
                        )) : null}
                      </>
                    );
                    })()}
                  </div>
                  <DeviceInfoGrid items={d.infoItems} scale={scaleNum} primaryTextColorClassName={primaryTextColorClassName} secondaryTextColorClassName={secondaryTextColorClassName} tertiaryTextColorClassName={tertiaryTextColorClassName} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {sensorDevices.length ? (
        <div className="mt-4">
          <div
            className={`text-[11px] md:text-xs uppercase tracking-[0.2em] jvs-secondary-text font-semibold mb-3 ${secondaryTextColorClassName}`.trim()}
            style={{ fontSize: `calc(11px * var(--jvs-secondary-text-size-scale, 1))` }}
          >
            Sensors
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {sensorDevices.map((d) => {
              const iconSrc = getDeviceTypeIconSrc({ ui: { deviceTypeIcons } }, d.internalType);
              return (
                <div
                  key={d.id}
                  className={`glass-panel ${scaleNum === 1 ? 'p-3' : ''} border border-white/10 inline-flex flex-col items-center`}
                  style={scaleNum === 1 ? undefined : { padding: `${Math.round(16 * scaleNum)}px` }}
                >
                  <div
                    className={`${scaleNum === 1 ? 'text-[11px] md:text-xs' : ''} text-center uppercase tracking-[0.2em] jvs-secondary-text-strong font-semibold ${secondaryTextColorClassName}`.trim()}
                    style={{ fontSize: `calc(${Math.round(11 * scaleNum)}px * var(--jvs-secondary-text-size-scale, 1))` }}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                      {iconSrc ? (
                        <img src={iconSrc} alt="" aria-hidden="true" className="w-4 h-4 shrink-0" />
                      ) : null}
                      <span className="truncate">{d.label}</span>
                    </span>
                  </div>
                  <DeviceInfoGrid items={d.infoItems} scale={scaleNum} primaryTextColorClassName={primaryTextColorClassName} secondaryTextColorClassName={secondaryTextColorClassName} tertiaryTextColorClassName={tertiaryTextColorClassName} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!supportedActions.length && !sensorDevices.length && !hasEnv ? (
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

  const switchControlStyle = useMemo(() => {
    const raw = String(config?.ui?.deviceControlStyles?.switch?.controlStyle ?? '').trim().toLowerCase();
    if (raw === 'buttons' || raw === 'switch' || raw === 'auto') return raw;
    return 'auto';
  }, [config?.ui?.deviceControlStyles?.switch?.controlStyle]);

  const switchAnimationStyle = useMemo(() => {
    const raw = String(config?.ui?.deviceControlStyles?.switch?.animationStyle ?? '').trim().toLowerCase();
    if (raw === 'pulse' || raw === 'none') return raw;
    return 'none';
  }, [config?.ui?.deviceControlStyles?.switch?.animationStyle]);

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

  const sensorIndicatorColors = useMemo(() => {
    const raw = (config?.ui?.sensorIndicatorColors && typeof config.ui.sensorIndicatorColors === 'object')
      ? config.ui.sensorIndicatorColors
      : {};

    return {
      motion: normalizeToleranceColorId(raw.motion, 'warning'),
      door: normalizeToleranceColorId(raw.door, 'neon-red'),
      smoke: normalizeToleranceColorId(raw.smoke, 'neon-red'),
      co: normalizeToleranceColorId(raw.co, 'neon-red'),
      water: normalizeToleranceColorId(raw.water, 'neon-blue'),
      presence: normalizeToleranceColorId(raw.presence, 'neon-green'),
    };
  }, [config?.ui?.sensorIndicatorColors]);

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

  const tertiaryTextColorId = useMemo(() => {
    const raw = String(config?.ui?.tertiaryTextColorId ?? '').trim();
    if (!raw) return '';
    return normalizeToleranceColorId(raw, 'neon-green');
  }, [config?.ui?.tertiaryTextColorId]);

  const tertiaryTextColorClass = useMemo(() => {
    if (!tertiaryTextColorId) return '';
    return getToleranceTextClassForColorId(tertiaryTextColorId);
  }, [tertiaryTextColorId]);

  const homeRoomColumnsXl = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomColumnsXl);
    if (!Number.isFinite(raw)) return 3;
    return Math.max(1, Math.min(6, Math.round(raw)));
  }, [config?.ui?.homeRoomColumnsXl]);

  const homeRoomLayoutMode = useMemo(() => {
    const raw = String(config?.ui?.homeRoomLayoutMode ?? '').trim().toLowerCase();
    return raw === 'masonry' ? 'masonry' : 'grid';
  }, [config?.ui?.homeRoomLayoutMode]);

  const homeRoomMasonryRowHeightPx = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMasonryRowHeightPx);
    if (!Number.isFinite(raw)) return 10;
    return Math.max(4, Math.min(40, Math.round(raw)));
  }, [config?.ui?.homeRoomMasonryRowHeightPx]);

  const homeRoomMinWidthPx = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMinWidthPx);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(1200, Math.round(raw)));
  }, [config?.ui?.homeRoomMinWidthPx]);

  const homeRoomTiles = useMemo(() => {
    const rawMap = (config?.ui?.homeRoomTiles && typeof config.ui.homeRoomTiles === 'object')
      ? config.ui.homeRoomTiles
      : {};
    return rawMap;
  }, [config?.ui?.homeRoomTiles]);

  const roomsGridRef = useRef(null);
  const roomTileElsRef = useRef(new Map());
  const [homeRoomAutoRowSpans, setHomeRoomAutoRowSpans] = useState(() => ({}));

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

  useLayoutEffect(() => {
    if (homeRoomLayoutMode !== 'masonry') {
      setHomeRoomAutoRowSpans({});
      return undefined;
    }

    const gridEl = roomsGridRef.current;
    if (!gridEl) return undefined;

    const getGapPx = () => {
      try {
        const style = window.getComputedStyle(gridEl);
        const rawGap = style.rowGap || style.gap || '0px';
        const gap = parseFloat(String(rawGap));
        return Number.isFinite(gap) ? gap : 0;
      } catch {
        return 0;
      }
    };

    const computeSpanForEl = (el) => {
      if (!el) return 1;
      const rowH = homeRoomMasonryRowHeightPx;
      const gap = getGapPx();
      const contentEl = el.firstElementChild;
      const hRaw = contentEl
        ? Number(contentEl.getBoundingClientRect().height || contentEl.scrollHeight || 0)
        : Number(el.getBoundingClientRect().height || el.scrollHeight || 0);
      const h = Number.isFinite(hRaw) ? hRaw : 0;
      const denom = Math.max(1, rowH + gap);
      const span = Math.ceil((h + gap) / denom);
      return Math.max(1, Math.min(999, span));
    };

    const recomputeAll = () => {
      const next = {};
      for (const [rid, el] of roomTileElsRef.current.entries()) {
        if (!rid || !el) continue;
        next[rid] = computeSpanForEl(el);
      }
      setHomeRoomAutoRowSpans((prev) => {
        // Avoid churn if nothing changed.
        const prevKeys = Object.keys(prev || {});
        const nextKeys = Object.keys(next);
        if (prevKeys.length !== nextKeys.length) return next;
        for (const k of nextKeys) {
          if (prev?.[k] !== next[k]) return next;
        }
        return prev;
      });
    };

    // Compute once after paint.
    const raf = requestAnimationFrame(recomputeAll);

    let ro = null;
    try {
      ro = new ResizeObserver(() => {
        recomputeAll();
      });
      for (const el of roomTileElsRef.current.values()) {
        if (el) ro.observe(el);
      }
      ro.observe(gridEl);
    } catch {
      ro = null;
    }

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, [homeRoomLayoutMode, homeRoomMasonryRowHeightPx, rooms.length]);
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
    const selected = homeTopRowCards;
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
              ref={roomsGridRef}
              className={`jvs-home-rooms-grid gap-4 ${homeRoomMinWidthPx > 0 ? 'jvs-home-rooms-grid--autofit' : ''} ${homeRoomLayoutMode === 'masonry' ? 'jvs-home-rooms-grid--masonry' : ''}`.trim()}
              style={{
                '--jvs-home-rooms-cols-desktop': homeRoomColumnsXl,
                ...(homeRoomMinWidthPx > 0 ? { '--jvs-home-room-min-width': `${homeRoomMinWidthPx}px` } : {}),
                ...(homeRoomLayoutMode === 'masonry' ? { '--jvs-home-room-row-height': `${homeRoomMasonryRowHeightPx}px` } : {}),
              }}
            >
            {rooms.length ? (
              rooms.map((r) => {
                const rid = String(r?.room?.id || '').trim();
                const tile = (rid && homeRoomTiles && typeof homeRoomTiles === 'object') ? homeRoomTiles[rid] : null;
                const spanRaw = tile && typeof tile === 'object' ? Number(tile.span) : NaN;
                const orderRaw = tile && typeof tile === 'object' ? Number(tile.order) : NaN;
                const rowSpanRaw = tile && typeof tile === 'object' ? Number(tile.rowSpan) : NaN;
                const span = Number.isFinite(spanRaw) ? Math.max(1, Math.min(6, Math.round(spanRaw))) : 1;
                const order = Number.isFinite(orderRaw) ? Math.max(-999, Math.min(999, Math.round(orderRaw))) : null;
                const manualRowSpan = Number.isFinite(rowSpanRaw)
                  ? Math.max(1, Math.min(999, Math.round(rowSpanRaw)))
                  : null;
                const autoRowSpan = (rid && homeRoomAutoRowSpans && typeof homeRoomAutoRowSpans === 'object')
                  ? homeRoomAutoRowSpans[rid]
                  : null;
                const effectiveRowSpan = manualRowSpan !== null
                  ? manualRowSpan
                  : (Number.isFinite(Number(autoRowSpan)) ? Math.max(1, Math.min(999, Math.round(Number(autoRowSpan)))) : null);
                const fallbackRowSpan = Math.max(1, Math.min(999, Math.round(420 / Math.max(4, homeRoomMasonryRowHeightPx))));

                const wrapperStyle = {
                  ...(span > 1 ? { gridColumn: `span ${span}` } : {}),
                  ...(order !== null ? { order } : {}),
                  ...(homeRoomLayoutMode === 'masonry'
                    ? { gridRowEnd: `span ${effectiveRowSpan !== null ? effectiveRowSpan : fallbackRowSpan}` }
                    : {}),
                };

                return (
                  <div
                    key={rid || r.room.name}
                    style={wrapperStyle}
                    className={`min-w-0 ${homeRoomLayoutMode === 'masonry' ? '' : 'h-full'}`.trim()}
                    ref={(el) => {
                      if (!rid) return;
                      const map = roomTileElsRef.current;
                      if (!map) return;
                      if (el) map.set(rid, el);
                      else map.delete(rid);
                    }}
                  >
                    <RoomPanel
                      roomName={r.room.name}
                      devices={r.devices}
                      connected={connected}
                      uiScheme={resolvedUiScheme}
                      climateTolerances={climateTolerances}
                      climateToleranceColors={climateToleranceColors}
                      sensorIndicatorColors={sensorIndicatorColors}
                      colorizeHomeValues={colorizeHomeValues}
                      colorizeHomeValuesOpacityPct={colorizeHomeValuesOpacityPct}
                      deviceCommandAllowlist={config?.ui?.deviceCommandAllowlist}
                      deviceHomeMetricAllowlist={config?.ui?.deviceHomeMetricAllowlist}
                      deviceInfoMetricAllowlist={config?.ui?.deviceInfoMetricAllowlist}
                      deviceTypeIcons={config?.ui?.deviceTypeIcons}
                      deviceControlIcons={config?.ui?.deviceControlIcons}
                      switchControlStyle={switchControlStyle}
                      switchAnimationStyle={switchAnimationStyle}
                      homeRoomMetricKeys={homeRoomMetricKeys}
                      homeRoomMetricColumns={homeRoomMetricColumns}
                      homeRoomColumnsXl={homeRoomColumnsXl}
                      primaryTextColorClassName={primaryTextColorClass}
                      secondaryTextColorClassName={secondaryTextColorClass}
                      tertiaryTextColorClassName={tertiaryTextColorClass}
                      contentScale={roomContentScale}
                      fillHeight={homeRoomLayoutMode !== 'masonry'}
                    />
                  </div>
                );
              })
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
