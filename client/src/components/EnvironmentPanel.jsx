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

const API_HOST = `http://${window.location.hostname}:3000`;

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
  return `${Math.round(num)} lx`;
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
      // Safety gutter to avoid sub-pixel rounding causing right-edge peeking
      // on some fullscreen setups (e.g., Firefox/Linux).
      const SAFE_GUTTER_PX = 40;
      const vw = Math.max((viewportEl.clientWidth || 1) - SAFE_GUTTER_PX, 1);
      const vh = Math.max((viewportEl.clientHeight || 1) - SAFE_GUTTER_PX, 1);
      const cw = Math.max(contentEl.scrollWidth, contentEl.clientWidth, 1);
      const ch = Math.max(contentEl.scrollHeight, contentEl.clientHeight, 1);

      // Allow modest scale-up when there is extra space (kiosk TVs/tablets),
      // while still guaranteeing the content fits without scrolling.
      const raw = Math.min(vw / cw, vh / ch) * 0.99;
      const next = Math.min(raw, 1.15);
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

const MetricCard = ({ title, value, sub, icon: IconComponent, accentClassName, valueClassName }) => {
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
            className: 'w-6 h-6 md:w-7 md:h-7 text-neon-blue',
          })}
        </div>
      </div>
    </div>
  );
};

const SwitchButton = ({ label, isOn, disabled, onToggle, busy }) => {
  const stateClass = isOn
    ? 'bg-neon-blue/15 border-neon-blue/40 text-neon-blue animate-glow-blue'
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
            <Loader2 className="w-6 h-6 md:w-7 md:h-7 animate-spin text-neon-blue" />
          ) : (
            <Power className={`w-6 h-6 md:w-7 md:h-7 ${isOn ? 'text-neon-blue' : 'text-white/60'}`} />
          )}
        </div>
      </div>
    </button>
  );
};

const ActionButton = ({ label, icon: IconComponent, disabled, busy, onClick, accent = 'blue' }) => {
  const accentClass = accent === 'green'
    ? 'text-neon-green border-neon-green/30 bg-neon-green/10'
    : 'text-neon-blue border-neon-blue/30 bg-neon-blue/10';

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

const computeRoomMetrics = (devices) => {
  const temps = [];
  const hums = [];
  const lux = [];
  let motionActive = false;

  const switches = [];

  for (const dev of devices) {
    const attrs = dev.status?.attributes || {};

    const t = asNumber(attrs.temperature);
    if (t !== null) temps.push(t);

    const h = asNumber(attrs.humidity);
    if (h !== null) hums.push(h);

    const lx = asNumber(attrs.illuminance);
    if (lx !== null) lux.push(lx);

    if (attrs.motion === 'active') motionActive = true;

    if (typeof attrs.switch === 'string') {
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

const RoomPanel = ({ roomName, devices, connected }) => {
  const [busySwitches, setBusySwitches] = useState(() => new Set());
  const [busyActions, setBusyActions] = useState(() => new Set());

  const metrics = useMemo(() => computeRoomMetrics(devices), [devices]);

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
        commands: d.commands.filter((c) => allow.has(c)),
      }))
      .filter((d) => d.commands.length);
  }, [devices]);

  const toggleSwitch = async (switchId, currentState) => {
    const nextCommand = currentState === 'on' ? 'off' : 'on';

    setBusySwitches((prev) => new Set(prev).add(switchId));
    try {
      await sendDeviceCommand(switchId, nextCommand);
    } finally {
      // Allow next poll/push to reconcile state; just clear the spinner.
      setBusySwitches((prev) => {
        const next = new Set(prev);
        next.delete(switchId);
        return next;
      });
    }
  };

  const runAction = async (deviceId, command) => {
    const key = `${deviceId}:${command}`;
    setBusyActions((prev) => new Set(prev).add(key));
    try {
      if (command === 'toggle') {
        const device = supportedActions.find((d) => d.id === deviceId);
        const current = device?.attrs?.switch;
        if (current === 'on') {
          await sendDeviceCommand(deviceId, 'off');
        } else if (current === 'off') {
          await sendDeviceCommand(deviceId, 'on');
        } else {
          await sendDeviceCommand(deviceId, 'toggle');
        }
      } else {
        await sendDeviceCommand(deviceId, command);
      }
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
    devices.some((d) => d.status?.attributes?.motion);

  const headerGlow = metrics.motionActive
    ? 'border-primary/40 animate-glow-blue'
    : 'border-white/10';

  return (
    <section className={`glass-panel p-4 md:p-5 border ${headerGlow}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-extrabold tracking-wide text-white truncate">
            {roomName}
          </h2>
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
          />
          <MetricCard
            title="Humidity"
            value={metrics.humidity === null ? '—' : formatPercent(metrics.humidity)}
            sub={metrics.humidity === null ? 'No sensor' : 'Average'}
            icon={Droplets}
            accentClassName="border-white/10"
          />
          <MetricCard
            title="Illuminance"
            value={metrics.illuminance === null ? '—' : formatLux(metrics.illuminance)}
            sub={metrics.illuminance === null ? 'No sensor' : 'Average'}
            icon={Sun}
            accentClassName="border-white/10"
          />
        </div>
      ) : null}

      {metrics.switches.length ? (
        <div className="mt-4">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/45 font-semibold mb-3">
            Lights
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {metrics.switches.map((sw) => (
              <SwitchButton
                key={sw.id}
                label={sw.label}
                isOn={sw.state === 'on'}
                disabled={!connected}
                busy={busySwitches.has(sw.id)}
                onToggle={() => toggleSwitch(sw.id, sw.state)}
              />
            ))}
          </div>
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
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!metrics.switches.length && !hasEnv ? (
        <div className="mt-4 text-sm text-white/40">No supported devices in this room.</div>
      ) : null}
    </section>
  );
};

const EnvironmentPanel = ({ config, statuses, connected }) => {
  const rooms = useMemo(() => buildRooms(config, statuses), [config, statuses]);
  const now = useClock(1000);
  const { viewportRef, contentRef, scale } = useFitScale();

  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);

  const overall = useMemo(() => {
    const allDevices = (rooms || []).flatMap((r) => r.devices);
    return computeRoomMetrics(allDevices);
  }, [rooms]);

  const outsideSensors = useMemo(() => {
    const outsideDevices = pickOutsideDevices(rooms);
    return computeRoomMetrics(outsideDevices);
  }, [rooms]);

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
    const daily = weather?.daily || null;

    const currentTemp = current ? current.temperature_2m : null;
    const currentHumidity = current ? current.relative_humidity_2m : null;
    const apparentTemp = current ? current.apparent_temperature : null;
    const windSpeed = current ? current.wind_speed_10m : null;
    const windDir = current ? current.wind_direction_10m : null;
    const precipNow = current ? current.precipitation : null;
    const code = current ? current.weather_code : null;
    const condition = describeWeatherCode(code);

    const todayHigh = daily?.temperature_2m_max?.[0] ?? null;
    const todayLow = daily?.temperature_2m_min?.[0] ?? null;
    const precipProb = daily?.precipitation_probability_max?.[0] ?? null;
    const todayCode = daily?.weather_code?.[0] ?? null;
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
    <div ref={viewportRef} className="w-full h-full overflow-hidden p-4 pr-6 md:p-6 md:pr-8">
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
            />
            <MetricCard
              title="Outside"
              value={outsideDisplay.currentTemp !== null ? formatTemp(outsideDisplay.currentTemp) : formatTemp(outsideSensors.temperature)}
              sub={
                asText(outsideDisplay.condition)
                  ? `${outsideDisplay.condition}${outsideDisplay.currentHumidity !== null ? ` • ${formatPercent(outsideDisplay.currentHumidity)}` : ''}`
                  : (outsideSensors.humidity === null ? (weatherError ? `Weather offline (${weatherError})` : 'Weather loading…') : `Humidity ${formatPercent(outsideSensors.humidity)}`)
              }
              icon={Thermometer}
              accentClassName="border-white/10"
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
            />
            <MetricCard
              title="Home"
              value={connected ? 'ONLINE' : 'OFFLINE'}
              sub={overall.motionActive ? 'Motion active' : 'All clear'}
              icon={Activity}
              accentClassName={
                connected
                  ? (overall.motionActive ? 'border-primary/40 animate-glow-blue' : 'border-white/10')
                  : 'border-danger/30'
              }
              valueClassName={connected ? 'text-neon-green' : 'text-neon-red'}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <MetricCard
              title="Feels Like"
              value={outsideDisplay.apparentTemp !== null ? formatTemp(outsideDisplay.apparentTemp) : '—'}
              sub={asText(outsideDisplay.condition) || 'Outside'}
              icon={Thermometer}
              accentClassName="border-white/10"
            />
            <MetricCard
              title="Wind"
              value={outsideDisplay.windSpeed !== null ? formatSpeed(outsideDisplay.windSpeed) : '—'}
              sub={toCompass(outsideDisplay.windDir) || '—'}
              icon={Wind}
              accentClassName="border-white/10"
            />
            <MetricCard
              title="Rain"
              value={outsideDisplay.precipNow !== null ? formatInches(outsideDisplay.precipNow) : '—'}
              sub="Now"
              icon={CloudRain}
              accentClassName="border-white/10"
            />
            <MetricCard
              title="Outside RH"
              value={outsideDisplay.currentHumidity !== null ? formatPercent(outsideDisplay.currentHumidity) : '—'}
              sub="Relative humidity"
              icon={Droplets}
              accentClassName="border-white/10"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <MetricCard
              title="Avg Temp"
              value={formatTemp(overall.temperature)}
              sub={overall.temperature === null ? 'No sensors' : 'Whole home average'}
              icon={Thermometer}
              accentClassName="border-white/10"
            />
            <MetricCard
              title="Avg Humidity"
              value={overall.humidity === null ? '—' : formatPercent(overall.humidity)}
              sub={overall.humidity === null ? 'No sensors' : 'Whole home average'}
              icon={Droplets}
              accentClassName="border-white/10"
            />
            <MetricCard
              title="Avg Lux"
              value={overall.illuminance === null ? '—' : formatLux(overall.illuminance)}
              sub={overall.illuminance === null ? 'No sensors' : 'Whole home average'}
              icon={Sun}
              accentClassName="border-white/10"
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
