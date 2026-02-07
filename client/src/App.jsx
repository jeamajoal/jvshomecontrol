import React, { useCallback, useEffect, useMemo, useState } from 'react';
import EnvironmentPanel from './components/EnvironmentPanel';
import HeatmapPanel from './components/HeatmapPanel';
import InteractionPanel from './components/InteractionPanel';
import ConfigPanel from './components/ConfigPanel';
import WeatherPanel from './components/WeatherPanel';
import ActivityPanel from './components/ActivityPanel';
import AboutPanel from './components/AboutPanel';
import EventsPanel from './components/EventsPanel';
import PanelSelector from './components/PanelSelector';
import NavMenu from './components/NavMenu';
import { Activity, Maximize, Minimize } from 'lucide-react';

import { getUiScheme } from './uiScheme';
import { API_HOST } from './apiHost';
import { AppStateProvider } from './AppStateProvider';
import { getToleranceTextClass } from './toleranceColors';
import { socket } from './socket';
import { PAGE, PAGE_LABELS } from './pages';
import { useCssCustomProperties } from './hooks/useCssCustomProperties';

function App() {
  const [sensors, setSensors] = useState({});
  const [config, setConfig] = useState({ rooms: [], sensors: [] });
  const [connected, setConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [autoFullscreenArmed, setAutoFullscreenArmed] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [hubitatHealth, setHubitatHealth] = useState(null);
  const [page, setPage] = useState(PAGE.HOME);

  const PANEL_NAME_STORAGE_KEY = 'jvs.panelName';
  const [panelName, setPanelNameState] = useState(() => {
    try {
      // URL parameter takes priority over localStorage
      const urlParams = new URLSearchParams(window.location.search);
      const urlPanel = (urlParams.get('panel') || '').trim();
      if (urlPanel) return urlPanel;
      return String(localStorage.getItem(PANEL_NAME_STORAGE_KEY) || '');
    } catch {
      return '';
    }
  });

  const setPanelName = useCallback((next) => {
    const v = String(next ?? '').trim();
    setPanelNameState(v);
    try {
      if (v) localStorage.setItem(PANEL_NAME_STORAGE_KEY, v);
      else localStorage.removeItem(PANEL_NAME_STORAGE_KEY);
    } catch {
      // ignore
    }
    // Keep URL in sync
    try {
      const url = new URL(window.location.href);
      if (v) {
        url.searchParams.set('panel', v);
      } else {
        url.searchParams.delete('panel');
      }
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  }, []);

  // ── Effective config (base + panel profile merge) ───────────────────────
  const effectiveConfig = useMemo(() => {
    const base = config && typeof config === 'object' ? config : { rooms: [], sensors: [] };
    const ui = (base.ui && typeof base.ui === 'object') ? base.ui : {};
    const profiles = (ui.panelProfiles && typeof ui.panelProfiles === 'object') ? ui.panelProfiles : {};
    const profile = (panelName && profiles[panelName] && typeof profiles[panelName] === 'object')
      ? profiles[panelName]
      : null;

    const mergeObj = (baseObj, profileObj) => ({
      ...((baseObj && typeof baseObj === 'object') ? baseObj : {}),
      ...((profileObj && typeof profileObj === 'object') ? profileObj : {}),
    });

    return {
      ...base,
      ui: {
        ...ui,
        ...(profile || {}),
        panelProfiles: ui.panelProfiles,
        deviceLabelOverrides: mergeObj(ui.deviceLabelOverrides, profile?.deviceLabelOverrides),
        deviceCommandAllowlist: mergeObj(ui.deviceCommandAllowlist, profile?.deviceCommandAllowlist),
        deviceHomeMetricAllowlist: mergeObj(ui.deviceHomeMetricAllowlist, profile?.deviceHomeMetricAllowlist),
        deviceInfoMetricAllowlist: mergeObj(ui.deviceInfoMetricAllowlist, profile?.deviceInfoMetricAllowlist),
      },
    };
  }, [config, panelName]);

  // ── UI scheme (accent + icon colour) ────────────────────────────────────
  const baseScheme = getUiScheme();
  const iconColorIdRaw = String(effectiveConfig?.ui?.iconColorId ?? '').trim();
  const iconColorClass = iconColorIdRaw && iconColorIdRaw !== 'none'
    ? (getToleranceTextClass(iconColorIdRaw) || baseScheme.metricIcon)
    : baseScheme.metricIcon;

  const uiScheme = useMemo(() => ({
    ...baseScheme,
    metricIcon: iconColorClass,
  }), [baseScheme, iconColorClass]);

  // ── CSS custom properties (single hook replaces 8 useEffects) ───────────
  useCssCustomProperties(effectiveConfig?.ui);

  // ── Derived page state ──────────────────────────────────────────────────
  const pageLabel = PAGE_LABELS[page] || 'Home';
  const menuPage = page === PAGE.EVENTS ? PAGE.SETTINGS : page;

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

  const roomsEmpty = Array.isArray(effectiveConfig?.rooms) && effectiveConfig.rooms.length === 0;

  useEffect(() => {
    if (!dataLoaded) return;
    if (!roomsEmpty) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_HOST}/api/hubitat/health`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setHubitatHealth(json);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataLoaded, roomsEmpty]);

  const hubitatConfigured = hubitatHealth?.configured === true;

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
    <AppStateProvider value={{ config: effectiveConfig, statuses: sensors, connected, uiScheme, refreshNow, panelName, setPanelName }}>
    <div className="h-[100dvh] w-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="relative flex-none flex items-center justify-between p-3 border-b border-white/5 z-20 jvs-header-bar">
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
        <nav className="hidden md:block absolute left-1/2 -translate-x-1/2" aria-label="Main navigation">
          <NavMenu page={menuPage} setPage={setPage} />
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40" aria-hidden="true">Status</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ring-2 ${connected ? 'bg-success ring-success/30' : 'bg-danger ring-danger/30'}`}
              aria-hidden="true"
            />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${connected ? 'text-neon-green' : 'text-neon-red'}`}>
              {connected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="w-px h-6 bg-white/10 mx-1" aria-hidden="true" />

          <PanelSelector />

          <div className="w-px h-6 bg-white/10 mx-1" aria-hidden="true" />

          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* Mobile dropdown nav */}
      <nav className="md:hidden flex-none px-3 pb-3 border-b border-white/5 jvs-menu-row" aria-label="Mobile navigation">
        <NavMenu page={menuPage} setPage={setPage} onNavigate={ensureFullscreen} />
      </nav>

      {/* Main Grid */}
      <main className="flex-1 min-h-0 w-full overflow-y-auto md:overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-black to-black">
        {!dataLoaded ? (
          <div className="flex flex-col items-center justify-center h-full gap-4" role="status" aria-live="polite">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <span className="text-sm text-gray-500 font-semibold tracking-widest uppercase">Loading System…</span>
          </div>
        ) : (
          <>
            {roomsEmpty ? (
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

                  {hubitatConfigured === false ? (
                    <div className="mt-4 text-left text-sm text-white/55">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">First install</div>
                      <div className="mt-2">
                        Hubitat isn’t configured. Set these environment variables for the server and restart it:
                      </div>
                      <div className="mt-2 text-xs text-white/70 space-y-1">
                        <div><span className="text-white/85 font-semibold">HUBITAT_HOST</span> (example: <span className="text-white/85">https://192.168.1.50</span>)</div>
                        <div><span className="text-white/85 font-semibold">HUBITAT_APP_ID</span></div>
                        <div><span className="text-white/85 font-semibold">HUBITAT_ACCESS_TOKEN</span></div>
                      </div>
                      <div className="mt-3 text-xs text-white/45">
                        Then verify: <span className="text-white/70">{API_HOST}/api/hubitat/health</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {page === PAGE.HOME && (
              <EnvironmentPanel config={effectiveConfig} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            )}
            {page === PAGE.CLIMATE && (
              <HeatmapPanel config={effectiveConfig} statuses={sensors} uiScheme={uiScheme} />
            )}
            {page === PAGE.WEATHER && (
              <WeatherPanel uiScheme={uiScheme} />
            )}
            {page === PAGE.ACTIVITY && (
              <ActivityPanel config={effectiveConfig} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            )}
            {page === PAGE.CONTROLS && (
              <InteractionPanel config={effectiveConfig} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            )}
            {page === PAGE.SETTINGS && (
              <ConfigPanel
                config={effectiveConfig}
                baseConfig={config}
                statuses={sensors}
                connected={connected}
                uiScheme={uiScheme}
                onOpenEvents={() => setPage(PAGE.EVENTS)}
              />
            )}
            {page === PAGE.INFO && (
              <AboutPanel uiScheme={uiScheme} />
            )}
            {page === PAGE.EVENTS && (
              <EventsPanel onBack={() => setPage(PAGE.SETTINGS)} />
            )}
          </>
        )}
      </main>
    </div>
    </AppStateProvider>
  );
}

export default App;
