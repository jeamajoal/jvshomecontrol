import React, { useEffect, useMemo, useState } from 'react';
import { Cloud, CloudRain, Thermometer, Wind } from 'lucide-react';

import { getUiScheme } from '../uiScheme';

const API_HOST = `http://${window.location.hostname}:3000`;

const asNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
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

const emojiForWeatherCode = (code) => {
  const c = asNumber(code);
  if (c === null) return '❔';
  // Keep this intentionally simple (kiosk readability > precision).
  if (c === 0) return '☀️';
  if (c === 1) return '🌤️';
  if (c === 2) return '⛅';
  if (c === 3) return '☁️';
  if (c === 45 || c === 48) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(c)) return '🌦️';
  if ([61, 63, 65, 66, 67].includes(c)) return '🌧️';
  if ([80, 81, 82].includes(c)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(c)) return '🌨️';
  if (c === 95 || c === 96 || c === 99) return '⛈️';
  return '🌥️';
};

const formatTemp = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${num.toFixed(0)}°`;
};

const formatPercent = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)}%`;
};

const formatSpeed = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
  return `${Math.round(num)} mph`;
};

const formatTime = (iso) => {
  try {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

const formatDate = (iso) => {
  try {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: '2-digit' });
  } catch {
    return '—';
  }
};

const SectionHeader = ({ title, subtitle }) => (
  <div>
    <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
      Weather
    </div>
    <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
      {title}
    </div>
    {subtitle ? <div className="mt-1 text-xs text-white/45">{subtitle}</div> : null}
  </div>
);

const DividerTitle = ({ title }) => (
  <div className="text-sm md:text-base uppercase tracking-[0.2em] text-white/70 font-extrabold">
    {title}
  </div>
);

const MetricCard = ({ title, value, sub, icon: IconComponent, uiScheme }) => (
  <div className="glass-panel p-4 md:p-5 border border-white/10">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
          {title}
        </div>
        <div className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight text-white">
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-white/45 truncate">{sub}</div> : null}
      </div>

      <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
        {React.createElement(IconComponent, { className: `w-6 h-6 md:w-7 md:h-7 ${uiScheme?.metricIcon || 'text-neon-blue'}` })}
      </div>
    </div>
  </div>
);

const WeatherPanel = ({ uiScheme }) => {
  const resolvedUiScheme = useMemo(() => uiScheme || getUiScheme(), [uiScheme]);

  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`${API_HOST}/api/weather`);
        if (!res.ok) throw new Error(`weather ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        setWeather(data?.weather || null);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || 'weather error');
      }
    };

    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const current = weather?.current || null;
  const today = weather?.today || null;

  const todayLabel = useMemo(() => {
    const cond = describeWeatherCode(today?.weatherCode);
    const date = today?.date ? formatDate(today.date) : 'Today';
    return cond ? `${date} • ${cond}` : date;
  }, [today?.weatherCode, today?.date]);

  const hourly = useMemo(() => {
    const arr = Array.isArray(weather?.hourly) ? weather.hourly : [];
    return arr.slice(0, 24);
  }, [weather?.hourly]);

  const daily = useMemo(() => {
    const arr = Array.isArray(weather?.daily) ? weather.daily : [];
    return arr.slice(0, 7);
  }, [weather?.daily]);

  return (
    <div className="w-full h-full overflow-auto p-2 md:p-3">
      <div className="w-full">
        <div className="glass-panel border border-white/10 p-4 md:p-5">
          <SectionHeader
            title="Forecast"
            subtitle={weather?.location?.timezone ? `Timezone: ${weather.location.timezone}` : null}
          />

          {error ? (
            <div className="mt-3 text-[11px] text-neon-red break-words">Weather offline: {error}</div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <MetricCard
              title="Now"
              value={current?.temperature !== null && current?.temperature !== undefined ? formatTemp(current.temperature) : '—'}
              sub={describeWeatherCode(current?.weatherCode) || (current?.time ? formatTime(current.time) : '—')}
              icon={Thermometer}
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Feels Like"
              value={current?.apparentTemperature !== null && current?.apparentTemperature !== undefined ? formatTemp(current.apparentTemperature) : '—'}
              sub={current?.humidity !== null && current?.humidity !== undefined ? `Humidity ${formatPercent(current.humidity)}` : '—'}
              icon={Cloud}
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Wind"
              value={current?.windSpeed !== null && current?.windSpeed !== undefined ? formatSpeed(current.windSpeed) : '—'}
              sub="Current"
              icon={Wind}
              uiScheme={resolvedUiScheme}
            />
            <MetricCard
              title="Rain"
              value={current?.precipitation !== null && current?.precipitation !== undefined ? String(current.precipitation) : '—'}
              sub="Now"
              icon={CloudRain}
              uiScheme={resolvedUiScheme}
            />
          </div>

          <div className="mt-5">
            <DividerTitle title="Today" />
            <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <MetricCard
                title="Summary"
                value={describeWeatherCode(today?.weatherCode) || '—'}
                sub={today?.date ? formatDate(today.date) : null}
                icon={Cloud}
                uiScheme={resolvedUiScheme}
              />
              <MetricCard
                title="High"
                value={today?.temperatureMax !== null && today?.temperatureMax !== undefined ? formatTemp(today.temperatureMax) : '—'}
                sub={todayLabel}
                icon={Thermometer}
                uiScheme={resolvedUiScheme}
              />
              <MetricCard
                title="Low"
                value={today?.temperatureMin !== null && today?.temperatureMin !== undefined ? formatTemp(today.temperatureMin) : '—'}
                sub={todayLabel}
                icon={Thermometer}
                uiScheme={resolvedUiScheme}
              />
              <MetricCard
                title="Precip %"
                value={today?.precipitationProbabilityMax !== null && today?.precipitationProbabilityMax !== undefined ? formatPercent(today.precipitationProbabilityMax) : '—'}
                sub="Max probability"
                icon={CloudRain}
                uiScheme={resolvedUiScheme}
              />
            </div>
          </div>

          <div className="mt-5">
            <DividerTitle title="Hourly (next 24)" />
            <div className="mt-2" dir="rtl">
              {hourly.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3">
                  {hourly.map((h) => {
                    const desc = describeWeatherCode(h.weatherCode);
                    return (
                      <div
                        key={h.time}
                        dir="ltr"
                        title={desc || undefined}
                        className="rounded-2xl border border-white/10 bg-white/5 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[22px] leading-none">
                            {emojiForWeatherCode(h.weatherCode)}
                          </div>
                          <div className="text-[11px] font-extrabold text-white/85">
                            {formatTime(h.time)}
                          </div>
                        </div>
                        <div className="mt-2 text-2xl font-extrabold tracking-tight text-white">
                          {formatTemp(h.temperature)}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/60">
                          <div>{formatPercent(h.precipitationProbability)}</div>
                          <div>{formatSpeed(h.windSpeed)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-white/45">No hourly data.</div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <DividerTitle title="Daily" />
            <div className="mt-2" dir="rtl">
              {daily.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                  {daily.map((d) => {
                    const desc = describeWeatherCode(d.weatherCode);
                    return (
                      <div
                        key={d.date || String(d.weatherCode)}
                        dir="ltr"
                        title={desc || undefined}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[28px] md:text-[32px] leading-none">
                            {emojiForWeatherCode(d.weatherCode)}
                          </div>
                          <div className="text-sm md:text-base font-extrabold text-white/90">
                            {d.date ? formatDate(d.date) : '—'}
                          </div>
                        </div>
                        <div className="mt-3 text-base md:text-lg text-white/80">
                          <span className="font-extrabold text-white">H</span> {formatTemp(d.temperatureMax)}
                          <span className="mx-3 text-white/30">•</span>
                          <span className="font-extrabold text-white">L</span> {formatTemp(d.temperatureMin)}
                        </div>
                        <div className="mt-2 text-sm md:text-base font-bold text-white/70">
                          Precip {formatPercent(d.precipitationProbabilityMax)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-white/45">No daily data.</div>
              )}
            </div>
          </div>

          <div className="mt-4 text-[11px] text-white/40">
            Updates every ~5 minutes.
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherPanel;
