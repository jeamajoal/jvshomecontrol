import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import FloorPlan from './components/FloorPlan';
import { Wifi, WifiOff, Activity, Maximize, Minimize, Edit2, Check } from 'lucide-react';

// Connect to the same host that served the page, but on port 3000
const API_HOST = `http://${window.location.hostname}:3000`;
const socket = io(API_HOST);

function App() {
  const [sensors, setSensors] = useState({});
  const [config, setConfig] = useState({ rooms: [], sensors: [] });
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    // Initial fetch
    Promise.all([
      fetch(`${API_HOST}/api/config`).then(res => res.json()),
      fetch(`${API_HOST}/api/status`).then(res => res.json())
    ]).then(([configData, statusData]) => {
      setConfig(configData);
      setSensors(statusData);
      setDataLoaded(true);
    }).catch(err => {
      console.error(err);
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

  const handleLayoutSave = (changes) => {
    fetch(`${API_HOST}/api/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    }).catch(console.error);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className={`flex-none flex items-center justify-between p-3 border-b border-white/5 backdrop-blur-md z-20 ${isEditing ? 'bg-blue-900/30 border-blue-500/30' : 'bg-black/20'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)] ${isEditing ? 'bg-warning text-black animate-pulse' : 'bg-primary/20 border border-primary/50 text-primary'}`}>
            <Activity size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-white/90 leading-none">
              JVS Home Control
            </h1>
            <p className="text-[10px] text-gray-400 font-medium tracking-wider uppercase mt-1">
              A JVS Automation Solution
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Edit Toggle */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${isEditing ? 'bg-primary text-white shadow-lg shadow-blue-500/50' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
          >
            {isEditing ? <Check size={14} /> : <Edit2 size={14} />}
            <span>{isEditing ? 'Done' : 'Edit'}</span>
          </button>

          {isEditing && (
            <button
              onClick={() => {
                if (confirm('Reset all positions to default?')) {
                  fetch(`${API_HOST}/api/layout`, { method: 'DELETE' });
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
            >
              Reset
            </button>
          )}

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
          <FloorPlan
            config={config}
            sensors={sensors}
            isEditing={isEditing}
            onLayoutSave={handleLayoutSave}
          />
        )}
      </main>
    </div>
  );
}

export default App;
