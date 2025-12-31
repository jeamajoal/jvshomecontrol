import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import EnvironmentPanel from './components/EnvironmentPanel';
import HeatmapPanel from './components/HeatmapPanel';
import InteractionPanel from './components/InteractionPanel';
import ConfigPanel from './components/ConfigPanel';
import { Activity, Maximize, Minimize } from 'lucide-react';

// Connect to the same host that served the page, but on port 3000
const API_HOST = `http://${window.location.hostname}:3000`;
const socket = io(API_HOST);

function App() {
  const [sensors, setSensors] = useState({});
  const [config, setConfig] = useState({ rooms: [], sensors: [] });
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [page, setPage] = useState(0); // 0=Dashboard, 1=Heatmap, 2=Interactions, 3=Config

  const pageLabel = page === 0 ? 'Environment Panel' : page === 1 ? 'Heatmap' : page === 2 ? 'Interactions' : 'Config';

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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex-none flex items-center justify-between p-3 border-b border-white/5 backdrop-blur-md z-20 bg-black/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)] bg-primary/20 border border-primary/50 text-primary">
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setPage(0)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 0 ? 'bg-neon-blue/10 text-neon-blue' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Dash
            </button>
            <button
              type="button"
              onClick={() => setPage(1)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 1 ? 'bg-neon-blue/10 text-neon-blue' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Heat
            </button>
            <button
              type="button"
              onClick={() => setPage(2)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 2 ? 'bg-neon-blue/10 text-neon-blue' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Ctrl
            </button>
            <button
              type="button"
              onClick={() => setPage(3)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                page === 3 ? 'bg-neon-blue/10 text-neon-blue' : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              Config
            </button>
          </div>

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

      {/* Main Grid */}
      <main className="flex-1 w-full h-full overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-black to-black">
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
              <EnvironmentPanel config={config} statuses={sensors} connected={connected} />
            ) : null}
            {page === 1 ? (
              <HeatmapPanel config={config} statuses={sensors} />
            ) : null}
            {page === 2 ? (
              <InteractionPanel config={config} statuses={sensors} connected={connected} />
            ) : null}
            {page === 3 ? (
              <ConfigPanel config={config} statuses={sensors} connected={connected} />
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
