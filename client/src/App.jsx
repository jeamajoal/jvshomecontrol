import React, { useCallback, useEffect, useMemo, useState } from 'react';
import EnvironmentPanel from './components/EnvironmentPanel';
import HeatmapPanel from './components/HeatmapPanel';
import InteractionPanel from './components/InteractionPanel';
import ConfigPanel from './components/ConfigPanel';
import WeatherPanel from './components/WeatherPanel';
import ActivityPanel from './components/ActivityPanel';
import AboutPanel from './components/AboutPanel';
import EventsPanel from './components/EventsPanel';
import { Activity, Maximize, Minimize } from 'lucide-react';

import { getUiScheme } from './uiScheme';
import { API_HOST } from './apiHost';
import { AppStateProvider } from './AppStateProvider';

import { getToleranceColorStyle, getToleranceTextClass } from './toleranceColors';

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
  const [page, setPage] = useState(0); // 0=Home, 1=Climate, 2=Weather, 3=Activity, 4=Controls, 5=Settings, 6=Info, 7=Events (hidden)

  const PANEL_NAME_STORAGE_KEY = 'jvs.panelName';
  const [panelName, setPanelNameState] = useState(() => {
    try {
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
  }, []);

  const effectiveConfig = useMemo(() => {
    const base = config && typeof config === 'object' ? config : { rooms: [], sensors: [] };
    const ui = (base.ui && typeof base.ui === 'object') ? base.ui : {};
    const profiles = (ui.panelProfiles && typeof ui.panelProfiles === 'object') ? ui.panelProfiles : {};
    const profile = (panelName && profiles && typeof profiles === 'object' && profiles[panelName] && typeof profiles[panelName] === 'object')
      ? profiles[panelName]
      : null;

    const nextUi = {
      ...ui,
      ...(profile || {}),
      panelProfiles: ui.panelProfiles,
    };

    return {
      ...base,
      ui: nextUi,
    };
  }, [config, panelName]);

  const accentColorId = String(effectiveConfig?.ui?.accentColorId || 'neon-blue');
  const baseScheme = getUiScheme(accentColorId);

  const iconColorIdRaw = String(effectiveConfig?.ui?.iconColorId ?? '').trim();
  const iconColorClass = iconColorIdRaw && iconColorIdRaw !== 'none'
    ? (getToleranceTextClass(iconColorIdRaw) || baseScheme.metricIcon)
    : baseScheme.metricIcon;

  const uiScheme = useMemo(() => ({
    ...baseScheme,
    metricIcon: iconColorClass,
  }), [baseScheme, iconColorClass]);

  useEffect(() => {
    const resolveRgbTripletFromBgClass = (bgClass) => {
      const el = document.createElement('div');
      el.className = bgClass;
      el.style.position = 'absolute';
      el.style.left = '-99999px';
      el.style.top = '-99999px';
      el.style.width = '1px';
      el.style.height = '1px';
      try {
        document.body.appendChild(el);
      } catch {
        return null;
      }

      try {
        const color = window.getComputedStyle(el).backgroundColor;
        const m = String(color || '').match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (!m) return null;
        const r = Number(m[1]);
        const g = Number(m[2]);
        const b = Number(m[3]);
        if (![r, g, b].every((n) => Number.isFinite(n))) return null;
        return `${r} ${g} ${b}`;
      } catch {
        return null;
      } finally {
        try {
          el.remove();
        } catch {
          // ignore
        }
      }
    };

    try {
      const accentColorIdRaw = String(effectiveConfig?.ui?.accentColorId ?? '').trim();
      const resolvedAccentColorId = accentColorIdRaw || 'neon-blue';
      const accentStyle = getToleranceColorStyle(resolvedAccentColorId);
      const accentTokens = String(accentStyle?.swatch || '').split(/\s+/).filter(Boolean);
      const accentBgToken = accentTokens.find((t) => t.startsWith('bg-'));
      const accentTriplet = accentBgToken ? resolveRgbTripletFromBgClass(accentBgToken) : null;
      if (accentTriplet) {
        document.documentElement.style.setProperty('--accent-rgb', accentTriplet);
      }
    } catch {
      // ignore
    }

    try {
      const glowColorIdRaw = String(effectiveConfig?.ui?.glowColorId ?? '').trim();
      const shouldInherit = !glowColorIdRaw || glowColorIdRaw === 'none';

      if (shouldInherit) {
        document.documentElement.style.setProperty('--jvs-glow-rgb', `var(--accent-rgb)`);
        return;
      }

      const style = getToleranceColorStyle(glowColorIdRaw);
      const tokens = String(style?.swatch || '').split(/\s+/).filter(Boolean);
      const bgToken = tokens.find((t) => t.startsWith('bg-'));
      const triplet = bgToken ? resolveRgbTripletFromBgClass(bgToken) : null;
      if (triplet) {
        document.documentElement.style.setProperty('--jvs-glow-rgb', triplet);
      } else {
        document.documentElement.style.setProperty('--jvs-glow-rgb', `var(--accent-rgb)`);
      }
    } catch {
      // ignore
    }
  }, [effectiveConfig?.ui?.accentColorId, effectiveConfig?.ui?.glowColorId]);

  useEffect(() => {
    try {
      const opacityRaw = Number(effectiveConfig?.ui?.iconOpacityPct);
      const opacityPct = Number.isFinite(opacityRaw) ? Math.max(0, Math.min(100, Math.round(opacityRaw))) : 100;
      document.documentElement.style.setProperty('--jvs-icon-opacity', String(opacityPct / 100));

      const sizeRaw = Number(effectiveConfig?.ui?.iconSizePct);
      const sizePct = Number.isFinite(sizeRaw) ? Math.max(50, Math.min(200, Math.round(sizeRaw))) : 100;
      document.documentElement.style.setProperty('--jvs-icon-size-scale', String(sizePct / 100));
    } catch {
      // ignore
    }
  }, [effectiveConfig?.ui?.iconOpacityPct, effectiveConfig?.ui?.iconSizePct]);

  useEffect(() => {
    try {
      const raw = Number(effectiveConfig?.ui?.cardOpacityScalePct);
      const scalePct = Number.isFinite(raw) ? Math.max(0, Math.min(200, Math.round(raw))) : 100;
      const scale = scalePct / 100;
      const clamp01 = (n) => Math.max(0, Math.min(1, n));
      const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

      // Keep existing look at scalePct=100.
      document.documentElement.style.setProperty('--jvs-glass-panel-bg-opacity', String(clamp01(0.30 * scale)));
      document.documentElement.style.setProperty('--jvs-utility-panel-bg-opacity', String(clamp01(0.10 * scale)));
      document.documentElement.style.setProperty('--jvs-utility-group-bg-opacity', String(clamp01(0.20 * scale)));
      document.documentElement.style.setProperty('--jvs-accent-card-bg-opacity', String(clamp01(0.10 * scale)));

      const blurRaw = Number(effectiveConfig?.ui?.blurScalePct);
      const blurScalePct = Number.isFinite(blurRaw) ? Math.max(0, Math.min(200, Math.round(blurRaw))) : 100;
      const blurScale = blurScalePct / 100;

      const baseBlurPx = 24;
      const blurPx = clamp(baseBlurPx * blurScale, 0, baseBlurPx * 2);
      document.documentElement.style.setProperty('--jvs-glass-panel-blur-px', `${blurPx}px`);
      document.documentElement.style.setProperty('--jvs-utility-panel-blur-px', `${blurPx}px`);

      // Menu/header surfaces should also fade out so Home background can be full-screen.
      const baseMenuBlurPx = 12;
      const menuBlurPx = clamp(baseMenuBlurPx * blurScale, 0, baseMenuBlurPx * 2);
      document.documentElement.style.setProperty('--jvs-header-bg-opacity', String(clamp01(0.20 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-surface-bg-opacity', String(clamp01(0.20 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-row-bg-opacity', String(clamp01(0.10 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-select-bg-opacity', String(clamp01(0.10 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-select-strong-bg-opacity', String(clamp01(0.30 * scale)));
      document.documentElement.style.setProperty('--jvs-header-blur-px', `${menuBlurPx}px`);
      document.documentElement.style.setProperty('--jvs-menu-blur-px', `${menuBlurPx}px`);
    } catch {
      // ignore
    }
  }, [effectiveConfig?.ui?.cardOpacityScalePct, effectiveConfig?.ui?.blurScalePct]);

  useEffect(() => {
    try {
      const raw = Number(effectiveConfig?.ui?.secondaryTextOpacityPct);
      const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 45;
      const base = pct / 100;
      const strong = Math.max(0, Math.min(1, base + 0.10));
      document.documentElement.style.setProperty('--jvs-secondary-text-opacity', String(base));
      document.documentElement.style.setProperty('--jvs-secondary-text-strong-opacity', String(strong));
    } catch {
      // ignore
    }
  }, [effectiveConfig?.ui?.secondaryTextOpacityPct]);

  useEffect(() => {
    try {
      const raw = Number(effectiveConfig?.ui?.secondaryTextSizePct);
      const pct = Number.isFinite(raw) ? Math.max(50, Math.min(200, Math.round(raw))) : 100;
      const scale = pct / 100;
      document.documentElement.style.setProperty('--jvs-secondary-text-size-scale', String(scale));
    } catch {
      // ignore
    }
  }, [effectiveConfig?.ui?.secondaryTextSizePct]);

  useEffect(() => {
    try {
      const raw = Number(effectiveConfig?.ui?.primaryTextOpacityPct);
      const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 100;
      const base = pct / 100;
      const strong = Math.max(0, Math.min(1, base + 0.10));
      document.documentElement.style.setProperty('--jvs-primary-text-opacity', String(base));
      document.documentElement.style.setProperty('--jvs-primary-text-strong-opacity', String(strong));
    } catch {
      // ignore
    }
  }, [effectiveConfig?.ui?.primaryTextOpacityPct]);

  useEffect(() => {
    try {
      const raw = Number(effectiveConfig?.ui?.primaryTextSizePct);
      const pct = Number.isFinite(raw) ? Math.max(50, Math.min(200, Math.round(raw))) : 100;
      const scale = pct / 100;
      document.documentElement.style.setProperty('--jvs-primary-text-size-scale', String(scale));
    } catch {
      // ignore
    }
  }, [effectiveConfig?.ui?.primaryTextSizePct]);

  const pageLabel = page === 0
    ? 'Home'
    : page === 1
      ? 'Climate'
      : page === 2
        ? 'Weather'
        : page === 3
          ? 'Activity'
          : page === 4
            ? 'Controls'
            : page === 5
              ? 'Settings'
              : page === 7
                ? 'Events'
                : 'Info';

  const menuPage = page === 7 ? 5 : page;

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
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2">
          <div className="rounded-2xl border border-white/10 px-3 py-2 jvs-menu-surface">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${uiScheme.swatch} opacity-80`} />
              <select
                value={menuPage}
                onChange={(e) => setPage(Number(e.target.value))}
                className={`menu-select min-w-[180px] rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.18em] text-white/85 hover:bg-white/5 jvs-menu-select ${uiScheme.focusRing}`}
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
      <div className="md:hidden flex-none px-3 pb-3 border-b border-white/5 jvs-menu-row">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Menu</label>
          <select
            value={menuPage}
            onChange={(e) => {
              ensureFullscreen();
              setPage(Number(e.target.value));
            }}
            className="menu-select flex-1 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/85 outline-none focus:outline-none focus:ring-0 [-webkit-tap-highlight-color:transparent] jvs-menu-select-strong"
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
          <AppStateProvider value={{ config: effectiveConfig, statuses: sensors, connected, uiScheme, refreshNow, panelName, setPanelName }}>
            {(Array.isArray(effectiveConfig?.rooms) && effectiveConfig.rooms.length === 0) ? (
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
              <EnvironmentPanel config={effectiveConfig} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            ) : null}
            {page === 1 ? (
              <HeatmapPanel config={effectiveConfig} statuses={sensors} uiScheme={uiScheme} />
            ) : null}
            {page === 2 ? (
              <WeatherPanel uiScheme={uiScheme} />
            ) : null}
            {page === 3 ? (
              <ActivityPanel config={effectiveConfig} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            ) : null}
            {page === 4 ? (
              <InteractionPanel config={effectiveConfig} statuses={sensors} connected={connected} uiScheme={uiScheme} />
            ) : null}
            {page === 5 ? (
              <ConfigPanel
                config={effectiveConfig}
                statuses={sensors}
                connected={connected}
                uiScheme={uiScheme}
                onOpenEvents={() => setPage(7)}
              />
            ) : null}
            {page === 6 ? (
              <AboutPanel uiScheme={uiScheme} />
            ) : null}
            {page === 7 ? (
              <EventsPanel onBack={() => setPage(5)} />
            ) : null}
          </AppStateProvider>
        )}
      </main>
    </div>
  );
}

export default App;
