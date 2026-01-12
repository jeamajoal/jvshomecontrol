import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, X } from 'lucide-react';
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy';
import Draggable from 'react-draggable';

import { getUiScheme } from '../uiScheme';
import { API_HOST } from '../apiHost';
import { useAppState } from '../appState';
import {
  normalizeToleranceColorId,
  getToleranceColorStyle,
} from '../toleranceColors';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const GRID_COLS = 12;
const GRID_MAX_ROWS = 24;
const GRID_ROW_HEIGHT = 36;

const ReactGridLayout = WidthProvider(GridLayout);

// NOTE: Tailwind class strings are referenced in ../toleranceColors.js.

const asNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

const asLayoutY = (value) => {
  const num = asNumber(value);
  // Server uses a large sentinel (e.g. 9999) to mean "unplaced".
  // Treat that as null so the editor can auto-place rooms from the top.
  if (num !== null && num >= 9000) return null;
  return num;
};

const formatTemp = (value) => {
  const num = asNumber(value);
  if (num === null) return '—';
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

    const SAFE_GUTTER_PX = 16;
      const vw = Math.max((viewportEl.clientWidth || 1) - SAFE_GUTTER_PX, 1);
      const vh = Math.max((viewportEl.clientHeight || 1) - SAFE_GUTTER_PX, 1);
      const cw = Math.max(contentEl.scrollWidth, contentEl.clientWidth, 1);
      const ch = Math.max(contentEl.scrollHeight, contentEl.clientHeight, 1);

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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const useResizeObserver = (ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
};

async function saveLayoutPatch(payload) {
  const res = await fetch(`${API_HOST}/api/layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Layout save failed (${res.status})`);
  }
}

const HeatmapPanel = ({ config: configProp, statuses: statusesProp, uiScheme: uiSchemeProp }) => {
  const ctx = useAppState();
  const config = configProp ?? ctx?.config;
  const statuses = statusesProp ?? ctx?.statuses;
  const uiScheme = uiSchemeProp ?? ctx?.uiScheme;

  const { viewportRef, contentRef, scale } = useFitScale();

  const [isMdUp, setIsMdUp] = useState(() => {
    try {
      return window.matchMedia('(min-width: 768px)').matches;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      const mq = window.matchMedia('(min-width: 768px)');
      const apply = () => setIsMdUp(!!mq.matches);
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    } catch {
      return () => undefined;
    }
  }, []);

  const resolvedUiScheme = useMemo(
    () => uiScheme || getUiScheme(config?.ui?.accentColorId),
    [uiScheme, config?.ui?.accentColorId],
  );

  const [mode, setMode] = useState('temperature');
  const [editMode, setEditMode] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const zoomOut = () => setMapZoom((z) => clamp(Math.round((z - 0.1) * 10) / 10, 0.5, 2.5));
  const zoomIn = () => setMapZoom((z) => clamp(Math.round((z + 0.1) * 10) / 10, 0.5, 2.5));
  const zoomReset = () => setMapZoom(1);

  const effectiveMapZoom = clamp(mapZoom, 0.5, 2.5);
  const mapZoomPct = Math.round(effectiveMapZoom * 100);

  const supportsZoom = useMemo(() => {
    try {
      return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom: 1');
    } catch {
      return false;
    }
  }, []);

  const rooms = config?.rooms || [];
  const sensors = config?.sensors || [];
  const labels = Array.isArray(config?.labels) ? config.labels : [];

  const visibleRoomIdSet = useMemo(() => {
    const ids = Array.isArray(config?.ui?.visibleRoomIds)
      ? config.ui.visibleRoomIds.map((v) => String(v || '').trim()).filter(Boolean)
      : [];
    // Empty list means "show all rooms".
    return ids.length ? new Set(ids) : null;
  }, [config?.ui?.visibleRoomIds]);

  const roomsForTiles = useMemo(() => {
    if (!visibleRoomIdSet) return rooms;
    return rooms.filter((r) => visibleRoomIdSet.has(String(r?.id || '').trim()));
  }, [rooms, visibleRoomIdSet]);

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

  const roomTiles = useMemo(() => {
    const byRoomId = new Map();
    for (const room of roomsForTiles) {
      byRoomId.set(room.id, { room, sensors: [] });
    }

    for (const sensor of sensors) {
      const bucket = byRoomId.get(sensor.roomId);
      if (!bucket) continue;

      const status = statuses?.[sensor.id];
      const attrs = status?.attributes || {};
      const x = sensor?.position?.x;
      const y = sensor?.position?.y;

      const temperature = asNumber(attrs.temperature);
      const humidity = asNumber(attrs.humidity);
      const illuminance = asNumber(attrs.illuminance);

      const value =
        mode === 'temperature' ? temperature :
        mode === 'humidity' ? humidity :
        illuminance;

      bucket.sensors.push({
        id: sensor.id,
        label: sensor.label,
        x: Number.isFinite(x) ? x : null,
        y: Number.isFinite(y) ? y : null,
        temperature,
        humidity,
        illuminance,
        value,
      });
    }

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    const tiles = Array.from(byRoomId.values())
      .map(({ room, sensors: roomSensors }) => {
        const values = roomSensors.map((s) => asNumber(s.value)).filter((n) => n !== null);
        const roomValue = avg(values);

        const temps = roomSensors.map((s) => asNumber(s.temperature)).filter((n) => n !== null);
        const hums = roomSensors.map((s) => asNumber(s.humidity)).filter((n) => n !== null);
        const luxs = roomSensors.map((s) => asNumber(s.illuminance)).filter((n) => n !== null);

        return {
          room,
          sensors: roomSensors,
          value: roomValue,
          metrics: {
            temperature: avg(temps),
            humidity: avg(hums),
            illuminance: avg(luxs),
          },
        };
      });

    // Ensure stable ordering even if y comes across as null
    tiles.sort((a, b) => {
      const ay = asLayoutY(a.room?.layout?.y);
      const by = asLayoutY(b.room?.layout?.y);
      const ax = asNumber(a.room?.layout?.x);
      const bx = asNumber(b.room?.layout?.x);
      const aKey = ay === null ? 1e9 : ay;
      const bKey = by === null ? 1e9 : by;
      if (aKey !== bKey) return aKey - bKey;
      const aXKey = ax === null ? 0 : ax;
      const bXKey = bx === null ? 0 : bx;
      if (aXKey !== bXKey) return aXKey - bXKey;
      return String(a.room?.name || '').localeCompare(String(b.room?.name || ''));
    });

    // Assign fallback y rows if missing
    let nextY = 0;
    return tiles.map((t) => {
      const x = asNumber(t.room?.layout?.x);
      const y = asLayoutY(t.room?.layout?.y);
      const w = asNumber(t.room?.layout?.w);
      const h = asNumber(t.room?.layout?.h);

      const nx = x === null ? 0 : Math.max(0, Math.floor(x));
      const ny = y === null ? nextY : Math.max(0, Math.floor(y));
      const nw = w === null ? 2 : Math.max(1, Math.floor(w));
      const nh = h === null ? 3 : Math.max(1, Math.floor(h));

      if (y === null) nextY += nh;

      return {
        ...t,
        layout: {
          x: clamp(nx, 0, GRID_COLS - 1),
          y: clamp(ny, 0, GRID_MAX_ROWS - 1),
          w: clamp(nw, 1, GRID_COLS),
          h: clamp(nh, 1, GRID_MAX_ROWS),
        },
      };
    });
  }, [mode, roomsForTiles, sensors, statuses]);

  const classify = (value) => {
    const v = asNumber(value);
    if (v === null) return { colorClass: 'bg-white/10', ringClass: 'ring-white/10' };

    if (mode === 'temperature') {
      const { cold, comfy, warm } = climateTolerances.temperatureF;
      const band = v < cold ? 'cold' : v < comfy ? 'comfy' : v < warm ? 'warm' : 'hot';
      const fallback = band === 'cold' ? 'neon-blue' : band === 'comfy' ? 'neon-green' : band === 'warm' ? 'warning' : 'neon-red';
      const colorId = normalizeToleranceColorId(climateToleranceColors?.temperatureF?.[band], fallback);
      const style = getToleranceColorStyle(colorId);
      return {
        colorClass: style.bgTemp,
        ringClass: style.ring30,
      };
    }

    if (mode === 'humidity') {
      const { dry, comfy, humid } = climateTolerances.humidityPct;
      const band = v < dry ? 'dry' : v < comfy ? 'comfy' : v < humid ? 'humid' : 'veryHumid';
      const fallback = band === 'dry' ? 'neon-blue' : band === 'comfy' ? 'neon-green' : band === 'humid' ? 'warning' : 'neon-red';
      const colorId = normalizeToleranceColorId(climateToleranceColors?.humidityPct?.[band], fallback);
      const style = getToleranceColorStyle(colorId);
      return {
        colorClass: style.bgHum,
        ringClass: style.ring30,
      };
    }

    // illuminance
    const { dark, dim, bright } = climateTolerances.illuminanceLux;
    const band = v < dark ? 'dark' : v < dim ? 'dim' : v < bright ? 'bright' : 'veryBright';
    const fallback = band === 'dark' ? 'neon-blue' : band === 'dim' ? 'neon-green' : band === 'bright' ? 'warning' : 'neon-green';
    const colorId = normalizeToleranceColorId(climateToleranceColors?.illuminanceLux?.[band], fallback);
    const style = getToleranceColorStyle(colorId);
    if (band === 'veryBright') {
      return {
        colorClass: style.bgLuxStrong,
        ringClass: style.ring40,
      };
    }
    return {
      colorClass: style.bgHum,
      ringClass: style.ring30,
    };
  };

  const modeLabel =
    mode === 'temperature' ? 'Temperature' :
    mode === 'humidity' ? 'Humidity' :
    'Illuminance';

  const gridLayout = useMemo(() => {
    const roomLayout = roomTiles.map((t) => {
      const x = clamp(t.layout.x, 0, GRID_COLS - 1);
      const w = clamp(t.layout.w, 1, GRID_COLS - x);
      const y = clamp(t.layout.y, 0, GRID_MAX_ROWS - 1);
      const h = clamp(t.layout.h, 1, GRID_MAX_ROWS - y);
      return { i: String(t.room.id), x, y, w, h };
    });

    // Labels use the same grid (drag/resize in edit mode)
    const labelLayout = labels
      .map((l) => {
        const id = String(l?.id || '').trim();
        if (!id) return null;
        const layout = l?.layout || {};
        const x = asNumber(layout.x);
        const y = asLayoutY(layout.y);
        const w = asNumber(layout.w);
        const h = asNumber(layout.h);

        return {
          i: `label:${id}`,
          x: clamp(x === null ? 0 : Math.max(0, Math.floor(x)), 0, GRID_COLS - 1),
          y: clamp(y === null ? 0 : Math.max(0, Math.floor(y)), 0, GRID_MAX_ROWS - 1),
          w: clamp(w === null ? 2 : Math.max(1, Math.floor(w)), 1, GRID_COLS),
          h: clamp(h === null ? 1 : Math.max(1, Math.floor(h)), 1, GRID_MAX_ROWS),
        };
      })
      .filter(Boolean);

    return [...roomLayout, ...labelLayout];
  }, [roomTiles, labels]);

  const saveRoomBox = async (roomId, box) => {
    setSaving(true);
    setSaveError(null);
    try {
      const x = clamp(Math.floor(box.x), 0, GRID_COLS - 1);
      const y = clamp(Math.floor(box.y), 0, GRID_MAX_ROWS - 1);
      const w = clamp(Math.floor(box.w), 1, GRID_COLS - x);
      const h = clamp(Math.floor(box.h), 1, GRID_MAX_ROWS - y);
      await saveLayoutPatch({ rooms: { [roomId]: { x, y, w, h } } });
    } catch (e) {
      setSaveError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveLabelBox = async (labelId, box) => {
    setSaving(true);
    setSaveError(null);
    try {
      const x = clamp(Math.floor(box.x), 0, GRID_COLS - 1);
      const y = clamp(Math.floor(box.y), 0, GRID_MAX_ROWS - 1);
      const w = clamp(Math.floor(box.w), 1, GRID_COLS - x);
      const h = clamp(Math.floor(box.h), 1, GRID_MAX_ROWS - y);
      await saveLayoutPatch({ labels: { [labelId]: { x, y, w, h } } });
    } catch (e) {
      setSaveError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const RoomSensors = ({ sensors: roomSensors }) => {
    const ref = useRef(null);
    const { width, height } = useResizeObserver(ref);
    const w = Math.max(1, width);
    const h = Math.max(1, height);

    const saveSensorPos = async (sensorId, px, py) => {
      const x = clamp(px / w, 0, 1);
      const y = clamp(py / h, 0, 1);
      setSaving(true);
      setSaveError(null);
      try {
        await saveLayoutPatch({ sensors: { [sensorId]: { x, y } } });
      } catch (e) {
        setSaveError(e?.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div ref={ref} className="relative mt-3 w-full h-full min-h-[70px]">
        {roomSensors
          .filter((s) => s.value !== null)
          .slice(0, 8)
          .map((s) => {
            const { colorClass: dotColor } = classify(s.value);
            const x = Number.isFinite(s.x) ? s.x : 0.5;
            const y = Number.isFinite(s.y) ? s.y : 0.5;

            const px = x * w;
            const py = y * h;

            if (!editMode) {
              return (
                <div
                  key={s.id}
                  className="absolute"
                  style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full ${dotColor} blur-xl`} />
                </div>
              );
            }

            return (
              <Draggable
                key={s.id}
                bounds="parent"
                position={{ x: px, y: py }}
                onStop={(_, data) => saveSensorPos(String(s.id), data.x, data.y)}
              >
                <div
                  className="absolute left-0 top-0"
                  style={{ transform: 'translate(-50%, -50%)' }}
                  title={s.label}
                >
                  <div className={`w-5 h-5 rounded-full ${dotColor} ring-2 ring-white/20 border border-white/10`} />
                </div>
              </Draggable>
            );
          })}
      </div>
    );
  };

  return (
    <div ref={viewportRef} className="w-full h-full overflow-auto md:overflow-hidden p-4 md:p-6">
      <style>{`
        /* Make the react-grid-layout resize handle visible and touch-friendly in edit mode */
        .jvs-heatmap-grid .react-resizable-handle {
          width: 28px;
          height: 28px;
          z-index: 50;
          opacity: 0.95;
        }
        .jvs-heatmap-grid .react-resizable-handle-se {
          right: 6px;
          bottom: 6px;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 10px;
        }
        .jvs-heatmap-grid .react-resizable-handle-se:after {
          /* Overwrite the default tiny corner marker */
          content: '';
          position: absolute;
          right: 8px;
          bottom: 8px;
          width: 10px;
          height: 10px;
          border-right: 2px solid rgba(255, 255, 255, 0.65);
          border-bottom: 2px solid rgba(255, 255, 255, 0.65);
        }
      `}</style>
      <div
        className="w-full h-full"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div ref={contentRef} className="w-full">
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <aside className="glass-panel border border-white/10 p-3 md:p-4 w-full md:w-48 md:shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                    Heatmap
                  </div>
                  <div className="mt-1 text-base md:text-lg font-extrabold tracking-wide text-white truncate">
                    {modeLabel}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className={`md:hidden rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    editMode
                      ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.selectedText}`
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {editMode ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                    {editMode ? 'Done' : 'Edit'}
                  </span>
                </button>
              </div>
              {saveError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">
                  Save failed: {saveError}
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-3 md:grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('temperature')}
                  className={`rounded-xl border px-3 py-2 md:py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    mode === 'temperature'
                      ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.selectedText}`
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Temp
                </button>
                <button
                  type="button"
                  onClick={() => setMode('humidity')}
                  className={`rounded-xl border px-3 py-2 md:py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    mode === 'humidity'
                      ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.selectedText}`
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Humidity
                </button>
                <button
                  type="button"
                  onClick={() => setMode('illuminance')}
                  className={`rounded-xl border px-3 py-2 md:py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    mode === 'illuminance'
                      ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.selectedText}`
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Lux
                </button>
              </div>

              <div className="mt-3 hidden md:block">
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className={`w-full rounded-xl border px-3 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    editMode
                      ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.selectedText}`
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {editMode ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                    {editMode ? 'Done' : 'Edit'}
                  </span>
                </button>
              </div>

              {editMode ? (
                <div className="mt-3 text-[11px] text-white/55">
                  Drag rooms and sensor dots. Resize rooms using the bottom-right corner.
                </div>
              ) : null}

              <div className="mt-4">
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/45 font-semibold">
                  Zoom
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={zoomOut}
                    className="rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors"
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={zoomReset}
                    className="rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors"
                    aria-label="Reset zoom"
                    title="Reset zoom"
                  >
                    {mapZoomPct}%
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    className="rounded-xl border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
              </div>
            </aside>

            <div className="flex-1 min-w-0">
              <div className="glass-panel border border-white/10 overflow-auto md:overflow-hidden touch-pan-x touch-pan-y">
                <div
                  className="relative w-full min-w-[960px] md:min-w-0 h-[76vh] md:h-[82vh] bg-black/30 p-2 md:p-4"
                  style={supportsZoom ? { zoom: effectiveMapZoom } : { transform: `scale(${effectiveMapZoom})`, transformOrigin: 'top left' }}
                >
                  <ReactGridLayout
                    className="layout jvs-heatmap-grid"
                    cols={GRID_COLS}
                    rowHeight={isMdUp ? GRID_ROW_HEIGHT : 44}
                    maxRows={GRID_MAX_ROWS}
                    margin={isMdUp ? [12, 12] : [8, 8]}
                    containerPadding={[0, 0]}
                    compactType={null}
                    preventCollision
                    isDraggable={editMode}
                    isResizable={editMode}
                    resizeHandles={['se']}
                    draggableCancel=".react-resizable-handle"
                    layout={gridLayout}
                    onDragStop={(nextLayout, _oldItem, newItem) => {
                      const box = nextLayout.find((l) => l.i === newItem.i);
                      if (!box) return;
                      if (String(newItem.i).startsWith('label:')) {
                        const id = String(newItem.i).slice('label:'.length);
                        return saveLabelBox(id, box);
                      }
                      return saveRoomBox(newItem.i, box);
                    }}
                    onResizeStop={(nextLayout, _oldItem, newItem) => {
                      const box = nextLayout.find((l) => l.i === newItem.i);
                      if (!box) return;
                      if (String(newItem.i).startsWith('label:')) {
                        const id = String(newItem.i).slice('label:'.length);
                        return saveLabelBox(id, box);
                      }
                      return saveRoomBox(newItem.i, box);
                    }}
                  >
                    {roomTiles.map((t) => {
                      const { colorClass, ringClass } = classify(t.value);
                      return (
                        <div
                          key={t.room.id}
                          className={`relative overflow-hidden rounded-2xl border bg-black/20 ${ringClass} ring-1 ${editMode ? resolvedUiScheme.editBorder : 'border-white/10'}`}
                        >
                          <div className={`absolute -inset-10 ${colorClass} blur-2xl`} />

                          <div className="relative p-3 md:p-4 h-full">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.2em] text-white/55 font-semibold">
                                Room
                              </div>
                              <div className="mt-1 text-sm md:text-base font-extrabold text-white truncate">
                                {t.room.name}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                                {[
                                  { key: 'temperature', label: 'T', value: t.metrics?.temperature, active: mode === 'temperature' },
                                  { key: 'humidity', label: 'H', value: t.metrics?.humidity, active: mode === 'humidity' },
                                  { key: 'illuminance', label: 'L', value: t.metrics?.illuminance, active: mode === 'illuminance' },
                                ].map(({ key, label, value, active }) => (
                                  <div
                                    key={key}
                                    className={`px-2 py-1 rounded-lg border bg-black/40 text-[10px] font-bold uppercase tracking-[0.16em] ${active ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.selectedText}` : 'border-white/10 text-white/75'}`}
                                    title={key}
                                  >
                                    {label} {value === null || value === undefined ? '—' : (
                                      key === 'temperature' ? formatTemp(value) :
                                      key === 'humidity' ? formatPercent(value) :
                                      formatLux(value)
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <RoomSensors roomId={t.room.id} sensors={t.sensors} />

                            {editMode ? (
                              <div className="absolute bottom-2 left-2 text-[10px] uppercase tracking-[0.2em] text-white/40 z-10">
                                {saving ? 'Saving…' : `${t.layout.x},${t.layout.y} ${t.layout.w}x${t.layout.h}`}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {labels
                      .map((l) => {
                        const id = String(l?.id || '').trim();
                        if (!id) return null;
                        const text = String(l?.text ?? '').trim();
                        if (!text) return null;
                        return (
                          <div
                            key={`label:${id}`}
                            className={`relative overflow-hidden rounded-2xl border bg-black/20 ring-1 ${editMode ? `${resolvedUiScheme.editBorder} ${resolvedUiScheme.editRing}` : 'border-white/10 ring-white/10'}`}
                          >
                            <div className="relative p-3 md:p-4 h-full">
                              <div className="text-sm md:text-base font-bold text-white/90 whitespace-pre-wrap break-words">
                                {text}
                              </div>
                              {editMode ? (
                                <div className="absolute bottom-2 left-2 text-[10px] uppercase tracking-[0.2em] text-white/40 z-10">
                                  {saving ? 'Saving…' : 'Label'}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                      .filter(Boolean)}
                  </ReactGridLayout>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatmapPanel;
