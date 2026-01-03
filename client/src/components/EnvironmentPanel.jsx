import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Thermometer,
  Droplets,
  Sun,
  Activity,
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
import { buildRoomsWithStatuses, getAllowedDeviceIdSet } from '../deviceSelectors';
import { API_HOST } from '../apiHost';
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

const useClock = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

const useFitScale = (cardScalePct = 100) => {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl) return;

    const pctNum = Number(cardScalePct);
    const userFactor = Number.isFinite(pctNum)
      ? Math.max(0.5, Math.min(2, pctNum / 100))
      : 1;

    const compute = () => {
      const isMdUp = typeof window !== 'undefined'
        ? window.matchMedia('(min-width: 768px)').matches
        : true;

      const baseScale = (() => {
        if (!isMdUp) return 1;

        // Safety gutter to avoid sub-pixel rounding causing right-edge peeking
        // on some fullscreen setups (e.g., Firefox/Linux).
        const SAFE_GUTTER_PX = 8;
        const vw = Math.max((viewportEl.clientWidth || 1) - SAFE_GUTTER_PX, 1);
        const vh = Math.max((viewportEl.clientHeight || 1) - SAFE_GUTTER_PX, 1);
        const cw = Math.max(contentEl.scrollWidth, contentEl.clientWidth, 1);
        const ch = Math.max(contentEl.scrollHeight, contentEl.clientHeight, 1);

        // Prefer readability over always fitting.
        // Allow modest scale-up when there is extra space, but never shrink;
        // if content grows (more sensors/rooms), we scroll instead.
        const raw = Math.min(vw / cw, vh / ch) * 0.99;
        return Math.min(Math.max(raw, 1), 1.15);
      })();

      const next = Math.max(0.5, Math.min(2, baseScale * userFactor));
      setScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(viewportEl);
    ro.observe(contentEl);
    window.addEventListener('resize', compute);

    return () => {
      window.removeEventListener('resize', compute);
      ro.disconnect();
    };
  }, [cardScalePct]);

  return { viewportRef, contentRef, scale };
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
  iconWrapClassName,
  className,
  uiScheme,
}) => {
  const effectiveValueClassName = (valueClassName && String(valueClassName).trim().length)
    ? valueClassName
    : 'text-white';

  return (
    <div className={`glass-panel p-4 md:p-5 border ${accentClassName} ${className || ''}`.trim()}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
            {title}
          </div>
          <div
            style={valueStyle}
            className={`mt-2 text-3xl md:text-4xl font-extrabold tracking-tight truncate ${effectiveValueClassName}`.trim()}
          >
            {value}
          </div>
          {sub ? (
            <div className={subClassName || 'mt-1 text-xs text-white/45 truncate'}>{sub}</div>
          ) : null}
        </div>

        <div
          className={`shrink-0 self-start mt-1 md:mt-1.5 translate-x-1.5 translate-y-3.5 w-10 h-10 md:w-12 md:h-12 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center ${iconWrapClassName || ''}`.trim()}
        >
          {React.createElement(IconComponent, {
            className: `w-5 h-5 md:w-6 md:h-6 ${uiScheme?.metricIcon || 'text-neon-blue'}`,
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
    ? `${uiScheme?.selectedCard || 'border-neon-blue/40 jvs-accent-card-bg'} ${uiScheme?.selectedText || 'text-neon-blue'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
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
            <Loader2 className={`w-5 h-5 md:w-6 md:h-6 animate-spin ${uiScheme?.metricIcon || 'text-neon-blue'}`} />
          ) : (
            <Power className={`w-5 h-5 md:w-6 md:h-6 ${isOn ? (uiScheme?.selectedText || 'text-neon-blue') : 'text-white/60'}`} />
          )}
        </div>
      </div>
    </button>
  );
};

const ActionButton = ({ label, icon: IconComponent, disabled, busy, onClick, accent = 'blue', uiScheme }) => {
  const accentClass = accent === 'green'
    ? 'text-neon-green border-neon-green/30 bg-neon-green/10'
    : (accent === 'fixed'
      ? 'text-neon-blue border-neon-blue/30 bg-neon-blue/10'
      : (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10'));

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={`
        rounded-xl border px-3 py-2
        text-xs font-bold uppercase tracking-[0.18em]
        transition-colors
        active:scale-[0.99]
        ${accentClass}
        ${(disabled || busy) ? 'opacity-50' : 'hover:bg-white/5'}
      `}
    >
      <span className="inline-flex items-center gap-2">
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          React.createElement(IconComponent, { className: 'w-4 h-4' })
        )}
        {label}
      </span>
    </button>
  );
};

// Room/device joins are centralized in ../deviceSelectors.

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

const computeRoomMetrics = (devices, allowedControlIds) => {
  const temps = [];
  const hums = [];
  const lux = [];
  let motionActive = false;
  let motionActiveCount = 0;

  let doorCount = 0;
  let doorOpen = false;
  let doorOpenCount = 0;

  const switches = [];

  for (const dev of devices) {
    const attrs = dev.status?.attributes || {};

    const t = asNumber(attrs.temperature);
    if (t !== null) temps.push(t);

    const h = asNumber(attrs.humidity);
    if (h !== null) hums.push(h);

    const lx = asNumber(attrs.illuminance);
    if (lx !== null) lux.push(lx);

    if (attrs.motion === 'active') {
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

    maybeCountDoorState(attrs.contact);
    maybeCountDoorState(attrs.door);

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

const RoomPanel = ({ roomName, devices, connected, allowedControlIds, uiScheme, climateTolerances, climateToleranceColors, colorizeHomeValues, colorizeHomeValuesOpacityPct, sensorIndicatorColors }) => {
  const [busyActions, setBusyActions] = useState(() => new Set());

  const metrics = useMemo(() => computeRoomMetrics(devices, allowedControlIds), [devices, allowedControlIds]);

  const supportedActions = useMemo(() => {
    const allow = new Set(['on', 'off', 'refresh', 'push']);
    return devices
      .map((d) => ({
        id: d.id,
        label: d.label,
        commands: d.status?.commands || [],
        attrs: d.status?.attributes || {},
      }))
      .filter((d) => allowedControlIds?.has(String(d.id)))
      .filter((d) => Array.isArray(d.commands) && d.commands.length)
      .map((d) => ({
        ...d,
        commands: d.commands.filter((c) => allow.has(c)),
      }))
      .filter((d) => d.commands.length);
  }, [devices, allowedControlIds]);

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

  const hasEnv =
    metrics.temperature !== null ||
    metrics.humidity !== null ||
    metrics.illuminance !== null ||
    devices.some((d) => d.status?.attributes?.motion) ||
    devices.some((d) => typeof d.status?.attributes?.contact === 'string' || typeof d.status?.attributes?.door === 'string') ||
    devices.some((d) => {
      const caps = Array.isArray(d?.capabilities) ? d.capabilities : [];
      return caps.includes('ContactSensor')
        || caps.includes('MotionSensor')
        || caps.includes('TemperatureMeasurement')
        || caps.includes('RelativeHumidityMeasurement')
        || caps.includes('IlluminanceMeasurement');
    });

  const headerGlow = (metrics.motionActive || metrics.doorOpen)
    ? `${uiScheme?.selectedCard || 'border-primary/40'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
    : 'border-white/10';

  const badgeBase = 'inline-flex items-center rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] border-white/10 bg-white/5';

  const motionBadgeText = getToleranceTextClassForColorId(
    normalizeToleranceColorId(sensorIndicatorColors?.motion, 'warning')
  );
  const doorBadgeText = getToleranceTextClassForColorId(
    normalizeToleranceColorId(sensorIndicatorColors?.door, 'neon-red')
  );

  return (
    <section className={`glass-panel p-4 md:p-5 border ${headerGlow}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base md:text-lg font-extrabold tracking-wide text-white truncate">
          {roomName}
        </h2>

        <div className="shrink-0 flex items-center gap-2">
          {metrics.motionActive ? <span className={`${badgeBase} ${motionBadgeText}`}>Motion</span> : null}
          {metrics.doorOpen ? <span className={`${badgeBase} ${doorBadgeText}`}>Door</span> : null}
        </div>
      </div>

      {hasEnv ? (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard
            title="Temperature"
            value={formatTemp(metrics.temperature)}
            sub={metrics.temperature === null ? 'No sensor' : null}
            icon={Thermometer}
            accentClassName="border-white/10"
            valueClassName={getColorizedValueClass('temperature', metrics.temperature, climateTolerances, climateToleranceColors, colorizeHomeValues)}
            valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
            iconWrapClassName="bg-white/5"
            uiScheme={uiScheme}
          />
          <MetricCard
            title="Humidity"
            value={metrics.humidity === null ? '—' : formatPercent(metrics.humidity)}
            sub={metrics.humidity === null ? 'No sensor' : null}
            icon={Droplets}
            accentClassName="border-white/10"
            valueClassName={
              colorizeHomeValues
                ? getColorizedValueClass('humidity', metrics.humidity, climateTolerances, climateToleranceColors, true)
                : 'text-white'
            }
            valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
            iconWrapClassName="bg-white/5"
            uiScheme={uiScheme}
          />
          <MetricCard
            title="Illuminance"
            value={metrics.illuminance === null ? '—' : formatLux(metrics.illuminance)}
            sub={metrics.illuminance === null ? 'No sensor' : null}
            icon={Sun}
            accentClassName="border-white/10"
            valueClassName={
              colorizeHomeValues
                ? getColorizedValueClass('illuminance', metrics.illuminance, climateTolerances, climateToleranceColors, true)
                : 'text-white'
            }
            valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
            iconWrapClassName="bg-white/5"
            uiScheme={uiScheme}
          />
        </div>
      ) : null}

      {supportedActions.length ? (
        <div className="mt-4">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/45 font-semibold mb-3">
            Controls
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {supportedActions.map((d) => (
              <div key={d.id} className="glass-panel p-4 border border-white/10">
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold truncate">
                  {d.label}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.commands.includes('on') ? (
                    <ActionButton
                      label="On"
                      icon={Power}
                      accent="fixed"
                      disabled={!connected}
                      busy={busyActions.has(`${d.id}:on`)}
                      onClick={() => runAction(d.id, 'on')}
                      uiScheme={uiScheme}
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

  const resolvedUiScheme = useMemo(
    () => uiScheme || getUiScheme(config?.ui?.colorScheme),
    [uiScheme, config?.ui?.colorScheme],
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

  const sensorIndicatorColors = useMemo(() => {
    const raw = (config?.ui?.sensorIndicatorColors && typeof config.ui.sensorIndicatorColors === 'object')
      ? config.ui.sensorIndicatorColors
      : {};

    return {
      motion: normalizeToleranceColorId(raw.motion, 'warning'),
      door: normalizeToleranceColorId(raw.door, 'neon-red'),
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

  const cardScalePct = useMemo(() => {
    const raw = Number(config?.ui?.cardScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.cardScalePct]);

  const homeRoomColumnsXl = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomColumnsXl);
    if (!Number.isFinite(raw)) return 3;
    return Math.max(1, Math.min(6, Math.round(raw)));
  }, [config?.ui?.homeRoomColumnsXl]);

  const allowedControlIds = useMemo(() => getAllowedDeviceIdSet(config, 'main'), [config]);
  const rooms = useMemo(() => buildRoomsWithStatuses(config, statuses), [config, statuses]);
  const now = useClock(1000);
  const { viewportRef, contentRef, scale } = useFitScale(cardScalePct);

  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [hubitatMode, setHubitatMode] = useState(null);
  const [hubitatModeError, setHubitatModeError] = useState(null);

  const overall = useMemo(() => {
    const allDevices = (rooms || []).flatMap((r) => r.devices);
    return computeRoomMetrics(allDevices, allowedControlIds);
  }, [rooms, allowedControlIds]);

  const outsideSensors = useMemo(() => {
    const outsideDevices = pickOutsideDevices(rooms);
    return computeRoomMetrics(outsideDevices, allowedControlIds);
  }, [rooms, allowedControlIds]);

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

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-auto p-2 md:p-3">
      {homeBackground.enabled && homeBackground.url ? (
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

      <div
        className="relative z-10 w-full h-full"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div ref={contentRef} className="w-full">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <MetricCard
              title="Time"
              value={formatTime(now)}
              sub={formatDate(now)}
              subClassName="mt-1 text-[13px] text-white/45 truncate"
              icon={Clock}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Outside"
              value={formatTemp(outsideTempForValue)}
              sub={(
                <div className="space-y-1">
                  <div className="text-white/55">
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

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-white/45">
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
              subClassName="mt-2 text-[13px] text-white/45"
              icon={Cloud}
              accentClassName="border-white/10"
              valueClassName={getColorizedValueClass('temperature', outsideTempForValue, climateTolerances, climateToleranceColors, colorizeHomeValues)}
              valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Inside"
              value={formatTemp(overall.temperature)}
              sub={
                overall.temperature === null
                  ? 'No sensors'
                  : `RH ${overall.humidity === null ? '—' : formatPercent(overall.humidity)} • Lux ${overall.illuminance === null ? '—' : formatLux(overall.illuminance)}`
              }
              subClassName="mt-1 text-[13px] text-white/45 truncate"
              icon={Thermometer}
              accentClassName="border-white/10"
              valueClassName={getColorizedValueClass('temperature', overall.temperature, climateTolerances, climateToleranceColors, colorizeHomeValues)}
              valueStyle={getColorizeOpacityStyle(colorizeHomeValues, colorizeHomeValuesOpacityPct)}
              iconWrapClassName="bg-white/5"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
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
              subClassName="mt-1 text-[13px] text-white/45 truncate"
              icon={Activity}
              accentClassName={
                connected
                  ? ((overall.motionActive || overall.doorOpen) ? `${resolvedUiScheme.selectedCard}` : 'border-white/10')
                  : 'border-danger/30'
              }
              valueClassName={connected ? 'text-white' : 'text-neon-red'}
              uiScheme={resolvedUiScheme}
            />
          </div>

          <div
            className="mt-4 jvs-home-rooms-grid gap-4"
            style={{ '--jvs-home-rooms-cols-xl': homeRoomColumnsXl }}
          >
            {rooms.length ? (
              rooms.map((r) => (
                <RoomPanel
                  key={r.room.id}
                  roomName={r.room.name}
                  devices={r.devices}
                  connected={connected}
                  allowedControlIds={allowedControlIds}
                  uiScheme={resolvedUiScheme}
                  climateTolerances={climateTolerances}
                  climateToleranceColors={climateToleranceColors}
                  colorizeHomeValues={colorizeHomeValues}
                  colorizeHomeValuesOpacityPct={colorizeHomeValuesOpacityPct}
                  sensorIndicatorColors={sensorIndicatorColors}
                />
              ))
            ) : (
              <div className="glass-panel p-8 border border-white/10 text-center text-white/50 lg:col-span-2 xl:col-span-3">
                <div className="text-sm uppercase tracking-[0.2em]">No data</div>
                <div className="mt-2 text-xl font-extrabold text-white">Waiting for devices…</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentPanel;
