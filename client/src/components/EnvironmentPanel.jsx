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
import { API_HOST } from '../apiHost';

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

const getSeason = (date) => {
  const m = date.getMonth();
  if (m === 11 || m === 0 || m === 1) return 'Winter';
  if (m === 2 || m === 3 || m === 4) return 'Spring';
  if (m === 5 || m === 6 || m === 7) return 'Summer';
  return 'Fall';
};

const useClock = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

const useFitScale = () => {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl) return;

    const compute = () => {
      const isMdUp = typeof window !== 'undefined'
        ? window.matchMedia('(min-width: 768px)').matches
        : true;

      if (!isMdUp) {
        setScale(1);
        return;
      }

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
      const next = Math.min(Math.max(raw, 1), 1.15);
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
  }, []);

  return { viewportRef, contentRef, scale };
};

const MetricCard = ({ title, value, sub, icon: IconComponent, accentClassName, valueClassName, uiScheme }) => {
  return (
    <div className={`glass-panel p-4 md:p-5 border ${accentClassName}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
            {title}
          </div>
          <div className={`mt-2 text-3xl md:text-4xl font-extrabold tracking-tight text-white ${valueClassName || ''}`}>
            {value}
          </div>
          {sub ? (
            <div className="mt-1 text-xs text-white/45 truncate">{sub}</div>
          ) : null}
        </div>

        <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
          {React.createElement(IconComponent, {
            className: `w-6 h-6 md:w-7 md:h-7 ${uiScheme?.metricIcon || 'text-neon-blue'}`,
          })}
        </div>
      </div>
    </div>
  );
};

const SwitchButton = ({ label, isOn, disabled, onToggle, busy, uiScheme }) => {
  const stateClass = isOn
    ? `${uiScheme?.selectedCard || 'bg-neon-blue/15 border-neon-blue/40'} ${uiScheme?.selectedText || 'text-neon-blue'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
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

        <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
          {busy ? (
            <Loader2 className={`w-6 h-6 md:w-7 md:h-7 animate-spin ${uiScheme?.metricIcon || 'text-neon-blue'}`} />
          ) : (
            <Power className={`w-6 h-6 md:w-7 md:h-7 ${isOn ? (uiScheme?.selectedText || 'text-neon-blue') : 'text-white/60'}`} />
          )}
        </div>
      </div>
    </button>
  );
};

const ActionButton = ({ label, icon: IconComponent, disabled, busy, onClick, accent = 'blue', uiScheme }) => {
  const accentClass = accent === 'green'
    ? 'text-neon-green border-neon-green/30 bg-neon-green/10'
    : (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10');

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

const buildRooms = (config, statuses) => {
  const rooms = (config?.rooms || []).map((r) => ({ ...r }));
  const sensors = config?.sensors || [];

  const byRoomId = new Map();
  for (const room of rooms) byRoomId.set(room.id, { room, devices: [] });

  for (const dev of sensors) {
    const bucket = byRoomId.get(dev.roomId);
    if (!bucket) continue;
    bucket.devices.push({
      ...dev,
      status: statuses?.[dev.id] || null,
    });
  }

  // Include unassigned devices under a synthetic room if needed
  const unassigned = sensors
    .filter((d) => !byRoomId.has(d.roomId))
    .map((dev) => ({ ...dev, status: statuses?.[dev.id] || null }));

  const result = Array.from(byRoomId.values())
    .map(({ room, devices }) => ({ room, devices }))
    .filter((r) => r.devices.length > 0);

  if (unassigned.length) {
    result.push({
      room: { id: 'unassigned', name: 'Unassigned' },
      devices: unassigned,
    });
  }

  return result;
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

    if (typeof attrs.contact === 'string') {
      const v = String(attrs.contact).toLowerCase();
      if (v === 'open' || v === 'closed') {
        doorCount += 1;
        if (v === 'open') {
          doorOpen = true;
          doorOpenCount += 1;
        }
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
    motionActive,
    motionActiveCount,
    doorCount,
    doorOpen,
    doorOpenCount,
    switches,
  };
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

const RoomPanel = ({ roomName, devices, connected, allowedControlIds, uiScheme }) => {
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
    devices.some((d) => typeof d.status?.attributes?.contact === 'string');

  const headerGlow = (metrics.motionActive || metrics.doorOpen)
    ? `${uiScheme?.selectedCard || 'border-primary/40'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
    : 'border-white/10';

  return (
    <section className={`glass-panel p-4 md:p-5 border ${headerGlow}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-extrabold tracking-wide text-white truncate">
            {roomName}
          </h2>
          {(metrics.motionActive || metrics.doorOpen) ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {metrics.motionActive ? (
                <span className={`inline-flex items-center rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${uiScheme?.selectedText || 'text-neon-blue'} border-white/10 bg-white/5`}>
                  Motion
                </span>
              ) : null}
              {metrics.doorOpen ? (
                <span className={`inline-flex items-center rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${uiScheme?.selectedText || 'text-neon-blue'} border-white/10 bg-white/5`}>
                  Door
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {hasEnv ? (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MetricCard
            title="Temperature"
            value={formatTemp(metrics.temperature)}
            sub={metrics.temperature === null ? 'No sensor' : 'Average'}
            icon={Thermometer}
            accentClassName="border-white/10"
            uiScheme={uiScheme}
          />
          <MetricCard
            title="Humidity"
            value={metrics.humidity === null ? '—' : formatPercent(metrics.humidity)}
            sub={metrics.humidity === null ? 'No sensor' : 'Average'}
            icon={Droplets}
            accentClassName="border-white/10"
            uiScheme={uiScheme}
          />
          <MetricCard
            title="Illuminance"
            value={metrics.illuminance === null ? '—' : formatLux(metrics.illuminance)}
            sub={metrics.illuminance === null ? 'No sensor' : 'Average'}
            icon={Sun}
            accentClassName="border-white/10"
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
              <div key={d.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold truncate">
                  {d.label}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.commands.includes('on') ? (
                    <ActionButton
                      label="On"
                      icon={Power}
                      accent="blue"
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
                      accent="green"
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

const EnvironmentPanel = ({ config, statuses, connected, uiScheme }) => {
  const resolvedUiScheme = useMemo(
    () => uiScheme || getUiScheme(config?.ui?.colorScheme),
    [uiScheme, config?.ui?.colorScheme],
  );

  const allowedControlIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.mainAllowedDeviceIds)
      ? config.ui.mainAllowedDeviceIds
      : (Array.isArray(config?.ui?.allowedDeviceIds) ? config.ui.allowedDeviceIds : []);
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.mainAllowedDeviceIds, config?.ui?.allowedDeviceIds]);

  const rooms = useMemo(() => buildRooms(config, statuses), [config, statuses]);
  const now = useClock(1000);
  const { viewportRef, contentRef, scale } = useFitScale();

  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);

  const overall = useMemo(() => {
    const allDevices = (rooms || []).flatMap((r) => r.devices);
    return computeRoomMetrics(allDevices, allowedControlIds);
  }, [rooms, allowedControlIds]);

  const outsideSensors = useMemo(() => {
    const outsideDevices = pickOutsideDevices(rooms);
    return computeRoomMetrics(outsideDevices, allowedControlIds);
  }, [rooms, allowedControlIds]);

  const season = useMemo(() => getSeason(now), [now]);

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

  return (
    <div ref={viewportRef} className="w-full h-full overflow-auto p-2 md:p-3">
      <div
        className="w-full h-full"
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
              icon={Clock}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Outside"
              value={outsideDisplay.currentTemp !== null ? formatTemp(outsideDisplay.currentTemp) : formatTemp(outsideSensors.temperature)}
              sub={
                asText(outsideDisplay.condition)
                  ? `${outsideDisplay.condition}${outsideDisplay.currentHumidity !== null ? ` • ${formatPercent(outsideDisplay.currentHumidity)}` : ''}`
                  : (
                    outsideSensors.humidity === null
                      ? (weatherError ? `Weather offline (${weatherError})` : 'Weather loading…')
                      : `Outside sensors • Humidity ${formatPercent(outsideSensors.humidity)}`
                  )
              }
              icon={Thermometer}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Forecast"
              value={asText(outsideDisplay.todayCondition) || season}
              sub={
                (outsideDisplay.todayHigh !== null || outsideDisplay.todayLow !== null)
                  ? `H ${formatTemp(outsideDisplay.todayHigh)} • L ${formatTemp(outsideDisplay.todayLow)}${outsideDisplay.precipProb !== null ? ` • ${Math.round(Number(outsideDisplay.precipProb))}%` : ''}`
                  : 'Open‑Meteo'
              }
              icon={Cloud}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Home"
              value={connected ? 'ONLINE' : 'OFFLINE'}
              sub={
                !connected
                  ? 'Disconnected'
                  : (
                    (overall.motionActive || overall.doorOpen)
                      ? `${overall.motionActive ? 'Motion active' : 'No motion'}${overall.doorOpen ? ` • Doors open: ${overall.doorOpenCount}` : ''}`
                      : 'All clear'
                  )
              }
              icon={Activity}
              accentClassName={
                connected
                  ? ((overall.motionActive || overall.doorOpen) ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.headerGlow}` : 'border-white/10')
                  : 'border-danger/30'
              }
              valueClassName={connected ? 'text-neon-green' : 'text-neon-red'}
              uiScheme={resolvedUiScheme}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <MetricCard
              title="Feels Like"
              value={outsideDisplay.apparentTemp !== null ? formatTemp(outsideDisplay.apparentTemp) : '—'}
              sub={asText(outsideDisplay.condition) || 'Outside'}
              icon={Thermometer}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Wind"
              value={outsideDisplay.windSpeed !== null ? formatSpeed(outsideDisplay.windSpeed) : '—'}
              sub={toCompass(outsideDisplay.windDir) || '—'}
              icon={Wind}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Rain"
              value={outsideDisplay.precipNow !== null ? formatInches(outsideDisplay.precipNow) : '—'}
              sub="Now"
              icon={CloudRain}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Outside RH"
              value={outsideDisplay.currentHumidity !== null ? formatPercent(outsideDisplay.currentHumidity) : '—'}
              sub="Relative humidity"
              icon={Droplets}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <MetricCard
              title="Avg Temp"
              value={formatTemp(overall.temperature)}
              sub={overall.temperature === null ? 'No sensors' : 'Whole home average'}
              icon={Thermometer}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Avg Humidity"
              value={overall.humidity === null ? '—' : formatPercent(overall.humidity)}
              sub={overall.humidity === null ? 'No sensors' : 'Whole home average'}
              icon={Droplets}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Avg Lux"
              value={overall.illuminance === null ? '—' : formatLux(overall.illuminance)}
              sub={overall.illuminance === null ? 'No sensors' : 'Whole home average'}
              icon={Sun}
              accentClassName="border-white/10"
              uiScheme={resolvedUiScheme}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {rooms.length ? (
              rooms.map((r) => (
                <RoomPanel
                  key={r.room.id}
                  roomName={r.room.name}
                  devices={r.devices}
                  connected={connected}
                  allowedControlIds={allowedControlIds}
                  uiScheme={resolvedUiScheme}
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
