import React, { useEffect, useState } from 'react';
import EnvironmentPanel from './components/EnvironmentPanel';
import HeatmapPanel from './components/HeatmapPanel';
import InteractionPanel from './components/InteractionPanel';
import ConfigPanel from './components/ConfigPanel';
import WeatherPanel from './components/WeatherPanel';
import ActivityPanel from './components/ActivityPanel';
import AboutPanel from './components/AboutPanel';
import { Activity, Maximize, Minimize } from 'lucide-react';

import { getUiScheme } from './uiScheme';

import { API_HOST, socket } from './socket';

function App() {
  const [sensors, setSensors] = useState({});
  const [config, setConfig] = useState({ rooms: [], sensors: [] });
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [autoFullscreenArmed, setAutoFullscreenArmed] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [page, setPage] = useState(0); // 0=Home, 1=Map, 2=Weather, 3=Activity, 4=Controls, 5=Settings, 6=Info

  const colorSchemeId = String(config?.ui?.colorScheme || 'electric-blue');
  const uiScheme = getUiScheme(colorSchemeId);

  useEffect(() => {
    try {
      document.documentElement.style.setProperty('--accent-rgb', uiScheme.rgb);
    } catch {
      // ignore
    }
  }, [uiScheme.rgb]);

  const pageLabel = page === 0 ? 'Home' : page === 1 ? 'Map' : page === 2 ? 'Weather' : page === 3 ? 'Activity' : page === 4 ? 'Controls' : page === 5 ? 'Settings' : 'Info';

  useEffect(() => {
    // Initial fetch
    Promise.all([
      fetch(`${API_HOST}/api/config`).then(res => res.json()),
      fetch(`${API_HOST}/api/status`).then(res => res.json())
    ]).then(([configData, statusData]) => {
      setConfig(configData);
      setSensors(statusData);
      setDataLoaded(true);
      setLoadError(null);
    }).catch(err => {
      console.error(err);
      setLoadError(err?.message || String(err));
      // Even on error, mark loaded so we don't show blank screen forever
      setDataLoaded(true);
    });

    socket.on('connect', () => setConnected(true));
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
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(!!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const ensureFullscreen = () => {
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
  };

  const toggleFullscreen = () => {
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

        {/* Desktop tabs */}
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 max-w-[70vw] md:max-w-none">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1 overflow-x-auto whitespace-nowrap">
            <button
              type="button"
              onClick={() => setPage(0)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 0 ? uiScheme.tabActive : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => setPage(1)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 1 ? uiScheme.tabActive : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Map
            </button>
            <button
              type="button"
              onClick={() => setPage(2)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 2 ? uiScheme.tabActive : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Weather
            </button>
            <button
              type="button"
              onClick={() => setPage(3)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 3 ? uiScheme.tabActive : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Activity
            </button>
            <button
              type="button"
              onClick={() => setPage(4)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 4 ? uiScheme.tabActive : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Controls
            </button>
            <button
              type="button"
              onClick={() => setPage(5)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 5 ? uiScheme.tabActive : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setPage(6)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 6 ? uiScheme.tabActive : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Info
            </button>
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
            <option value={1}>Map</option>
            <option value={2}>Weather</option>
            <option value={3}>Activity</option>
            <option value={4}>Controls</option>
            <option value={5}>Settings</option>
            <option value={6}>Info</option>
          </select>

          {!isFullscreen ? (
            <button
              type="button"
              onClick={() => {
                ensureFullscreen();
                toggleFullscreen();
              }}
              className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${uiScheme.actionButton}`}
            >
              Fullscreen
            </button>
          ) : null}
        </div>
        {!isFullscreen ? (
          <div className="mt-1 text-[11px] text-white/45">
            Fullscreen can’t be forced by the browser; tap once to enable.
          </div>
        ) : null}
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
                    Check <span className="text-white/70">http://{window.location.hostname}:3000/api/config</span>
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
