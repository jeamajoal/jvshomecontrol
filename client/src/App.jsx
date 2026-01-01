import React, { useCallback, useEffect, useState } from 'react';
import EnvironmentPanel from './components/EnvironmentPanel';
import HeatmapPanel from './components/HeatmapPanel';
import InteractionPanel from './components/InteractionPanel';
import ConfigPanel from './components/ConfigPanel';
import WeatherPanel from './components/WeatherPanel';
import ActivityPanel from './components/ActivityPanel';
import AboutPanel from './components/AboutPanel';
import { Activity, Maximize, Minimize } from 'lucide-react';

import { getUiScheme } from './uiScheme';
import { API_HOST } from './apiHost';

import { socket } from './socket';

function App() {
  const [sensors, setSensors] = useState({});
  const [config, setConfig] = useState({ rooms: [], sensors: [] });
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [autoFullscreenArmed, setAutoFullscreenArmed] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [page, setPage] = useState(0); // 0=Home, 1=Climate, 2=Weather, 3=Activity, 4=Controls, 5=Settings, 6=Info

  const colorSchemeId = String(config?.ui?.colorScheme || 'electric-blue');
  const uiScheme = getUiScheme(colorSchemeId);

  useEffect(() => {
    try {
      document.documentElement.style.setProperty('--accent-rgb', uiScheme.rgb);
    } catch {
      // ignore
    }
  }, [uiScheme.rgb]);

  const pageLabel = page === 0 ? 'Home' : page === 1 ? 'Climate' : page === 2 ? 'Weather' : page === 3 ? 'Activity' : page === 4 ? 'Controls' : page === 5 ? 'Settings' : 'Info';

  const refreshNow = useCallback(async () => {
    try {
      const [configRes, statusRes] = await Promise.all([
        fetch(`${API_HOST}/api/config`),
        fetch(`${API_HOST}/api/status`),
      ]);

      if (!configRes.ok) {
        const text = await configRes.text().catch(() => '');
        throw new Error(text || `Config fetch failed (${configRes.status})`);
      }
      if (!statusRes.ok) {
        const text = await statusRes.text().catch(() => '');
        throw new Error(text || `Status fetch failed (${statusRes.status})`);
      }

      const configData = await configRes.json();
      const statusData = await statusRes.json();
      setConfig(configData);
      setSensors(statusData);
      setLoadError(null);
      return true;
    } catch (err) {
      console.error(err);
      setLoadError(err?.message || String(err));
      return false;
    } finally {
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refreshNow().catch(() => undefined);

    socket.on('connect', () => {
      setConnected(true);
      // Important on mobile (and especially with slower polling): refresh immediately on reconnect.
      refreshNow().catch(() => undefined);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('config_update', (data) => setConfig(data));
    socket.on('device_refresh', (data) => setSensors(data));

    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('config_update');
      socket.off('device_refresh');
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [refreshNow]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(!!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const ensureFullscreen = useCallback(() => {
    if (!isMobile) return;
    if (!autoFullscreenArmed) return;
    if (document.fullscreenElement) return;

    try {
      document.documentElement.requestFullscreen();
      setAutoFullscreenArmed(false);
    } catch {
      // ignore (fullscreen may be blocked by browser)
      setAutoFullscreenArmed(false);
    }
  }, [isMobile, autoFullscreenArmed]);

  useEffect(() => {
    if (!isMobile) return;
    if (!autoFullscreenArmed) return;

    const onFirstGesture = () => {
      ensureFullscreen();
    };

    window.addEventListener('pointerdown', onFirstGesture, { passive: true, once: true });
    return () => {
      try {
        window.removeEventListener('pointerdown', onFirstGesture);
      } catch {
        // ignore
      }
    };
  }, [isMobile, autoFullscreenArmed, ensureFullscreen]);

  const toggleFullscreen = () => {
    if (isMobile) setAutoFullscreenArmed(false);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="h-[100dvh] w-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="relative flex-none flex items-center justify-between p-3 border-b border-white/5 backdrop-blur-md z-20 bg-black/20">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${uiScheme.headerGlow} ${uiScheme.headerIcon}`}>
            <Activity size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-white/90 leading-none">
              JVS Home Control
            </h1>
            <p className="text-[10px] text-gray-400 font-medium tracking-wider uppercase mt-1">
              {pageLabel}
            </p>
          </div>
        </div>

        {/* Desktop menu (compact) */}
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${uiScheme.swatch} opacity-80`} />
              <select
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
                className={`min-w-[180px] rounded-xl border border-white/10 bg-black/10 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.18em] text-white/85 hover:bg-white/5 ${uiScheme.focusRing}`}
              >
                <option value={0}>Home</option>
                <option value={1}>Climate</option>
                <option value={2}>Weather</option>
                <option value={3}>Activity</option>
                <option value={4}>Controls</option>
                <option value={5}>Settings</option>
                <option value={6}>Info</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Status</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ring-2 ${connected ? 'bg-success ring-success/30' : 'bg-danger ring-danger/30'}`}
            />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${connected ? 'text-neon-green' : 'text-neon-red'}`}>
              {connected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="w-px h-6 bg-white/10 mx-1" />

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* Mobile dropdown nav */}
      <div className="md:hidden flex-none px-3 pb-3 border-b border-white/5 bg-black/10">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Menu</label>
          <select
            value={page}
            onChange={(e) => {
              ensureFullscreen();
              setPage(Number(e.target.value));
            }}
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-white/85"
          >
            <option value={0}>Home</option>
            <option value={1}>Climate</option>
            <option value={2}>Weather</option>
            <option value={3}>Activity</option>
            <option value={4}>Controls</option>
            <option value={5}>Settings</option>
            <option value={6}>Info</option>
          </select>
        </div>
      </div>

      {/* Main Grid */}
      <main className="flex-1 min-h-0 w-full overflow-y-auto md:overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-black to-black">
        {!dataLoaded ? (
          <div className="flex items-center justify-center h-full text-gray-500 animate-pulse">LOADING SYSTEM...</div>
        ) : (
          <>
            {(Array.isArray(config?.rooms) && config.rooms.length === 0) ? (
              <div className="flex items-center justify-center h-full p-8">
                <div className="glass-panel border border-white/10 p-6 max-w-xl w-full text-center">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">No Data</div>
                  <div className="mt-2 text-xl font-extrabold text-white">Waiting for config…</div>
                  <div className="mt-2 text-sm text-white/50">
                    Backend: <span className={connected ? 'text-neon-green' : 'text-neon-red'}>{connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
                  </div>
                  {loadError ? (
                    <div className="mt-2 text-xs text-neon-red break-words">{loadError}</div>
                  ) : null}
                  <div className="mt-3 text-xs text-white/45">
                    Check <span className="text-white/70">{API_HOST}/api/config</span>
                  </div>
                </div>
              </div>
            ) : null}

            {page === 0 ? (
              <EnvironmentPanel config={config} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            ) : null}
            {page === 1 ? (
              <HeatmapPanel config={config} statuses={sensors} uiScheme={uiScheme} />
            ) : null}
            {page === 2 ? (
              <WeatherPanel uiScheme={uiScheme} />
            ) : null}
            {page === 3 ? (
              <ActivityPanel config={config} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            ) : null}
            {page === 4 ? (
              <InteractionPanel config={config} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            ) : null}
            {page === 5 ? (
              <ConfigPanel config={config} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            ) : null}
            {page === 6 ? (
              <AboutPanel uiScheme={uiScheme} />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
