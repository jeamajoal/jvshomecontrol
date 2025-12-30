import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Droplets, Edit3, Sun, Thermometer, X } from 'lucide-react';
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy';
import Draggable from 'react-draggable';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const API_HOST = `http://${window.location.hostname}:3000`;

const GRID_COLS = 12;
const GRID_MAX_ROWS = 24;
const GRID_ROW_HEIGHT = 36;

const ReactGridLayout = WidthProvider(GridLayout);

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
  return `${Math.round(num)} lx`;
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
      const SAFE_GUTTER_PX = 40;
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

const HeatmapPanel = ({ config, statuses }) => {
  const { viewportRef, contentRef, scale } = useFitScale();
  const [mode, setMode] = useState('temperature');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const rooms = config?.rooms || [];
  const sensors = config?.sensors || [];

  const roomTiles = useMemo(() => {
    const byRoomId = new Map();
    for (const room of rooms) {
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
        return { room, sensors: roomSensors, value: roomValue };
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
  }, [mode, rooms, sensors, statuses]);

  const classify = (value) => {
    const v = asNumber(value);
    if (v === null) return { colorClass: 'bg-white/10', ringClass: 'ring-white/10' };

    if (mode === 'temperature') {
      if (v < 68) return { colorClass: 'bg-neon-blue/25', ringClass: 'ring-neon-blue/30' };
      if (v < 74) return { colorClass: 'bg-neon-green/25', ringClass: 'ring-neon-green/30' };
      return { colorClass: 'bg-neon-red/25', ringClass: 'ring-neon-red/30' };
    }

    if (mode === 'humidity') {
      if (v < 35) return { colorClass: 'bg-neon-red/20', ringClass: 'ring-neon-red/30' };
      if (v < 55) return { colorClass: 'bg-neon-green/20', ringClass: 'ring-neon-green/30' };
      return { colorClass: 'bg-neon-blue/20', ringClass: 'ring-neon-blue/30' };
    }

    // illuminance
    if (v < 50) return { colorClass: 'bg-neon-blue/20', ringClass: 'ring-neon-blue/30' };
    if (v < 250) return { colorClass: 'bg-neon-green/20', ringClass: 'ring-neon-green/30' };
    return { colorClass: 'bg-neon-green/30', ringClass: 'ring-neon-green/40' };
  };

  const modeLabel =
    mode === 'temperature' ? 'Temperature' :
    mode === 'humidity' ? 'Humidity' :
    'Illuminance';

  const modeIcon =
    mode === 'temperature' ? Thermometer :
    mode === 'humidity' ? Droplets :
    Sun;

  const formatValue = (value) => {
    if (mode === 'temperature') return formatTemp(value);
    if (mode === 'humidity') return formatPercent(value);
    return formatLux(value);
  };

  // Optional: ping backend to ensure data is alive (keeps consistent with other pages)
  useEffect(() => {
    fetch(`${API_HOST}/api/status`).catch(() => undefined);
  }, []);

  const gridLayout = useMemo(() => {
    return roomTiles.map((t) => {
      const x = clamp(t.layout.x, 0, GRID_COLS - 1);
      const w = clamp(t.layout.w, 1, GRID_COLS - x);
      const y = clamp(t.layout.y, 0, GRID_MAX_ROWS - 1);
      const h = clamp(t.layout.h, 1, GRID_MAX_ROWS - y);
      return { i: String(t.room.id), x, y, w, h };
    });
  }, [roomTiles]);

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

  const RoomSensors = ({ roomId, sensors: roomSensors }) => {
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
    <div ref={viewportRef} className="w-full h-full overflow-hidden p-4 pr-6 md:p-6 md:pr-8">
      <div
        className="w-full h-full"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div ref={contentRef} className="w-full">
          <div className="glass-panel border border-white/10 p-4 md:p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                  Heatmap
                </div>
                <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
                  {modeLabel}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Schematic view uses persisted room + sensor positions (no PNG required).
                </div>
                {editMode ? (
                  <div className="mt-2 text-[11px] text-white/55">
                    Drag rooms to place. Resize corners. Drag sensor dots.
                  </div>
                ) : null}
                {saveError ? (
                  <div className="mt-2 text-[11px] text-neon-red">
                    Save failed: {saveError}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className={`rounded-xl border px-3 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                    editMode
                      ? 'border-neon-blue/40 bg-neon-blue/10 text-neon-blue'
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {editMode ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                    {editMode ? 'Done' : 'Edit'}
                  </span>
                </button>

                <div className="shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
                  {React.createElement(modeIcon, { className: 'w-6 h-6 text-neon-blue' })}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setMode('temperature')}
                className={`rounded-xl border px-3 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                  mode === 'temperature'
                    ? 'border-neon-blue/40 bg-neon-blue/10 text-neon-blue'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Temp
              </button>
              <button
                type="button"
                onClick={() => setMode('humidity')}
                className={`rounded-xl border px-3 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                  mode === 'humidity'
                    ? 'border-neon-blue/40 bg-neon-blue/10 text-neon-blue'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Humidity
              </button>
              <button
                type="button"
                onClick={() => setMode('illuminance')}
                className={`rounded-xl border px-3 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${
                  mode === 'illuminance'
                    ? 'border-neon-blue/40 bg-neon-blue/10 text-neon-blue'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Lux
              </button>
            </div>
          </div>

          <div className="mt-4 glass-panel border border-white/10 overflow-hidden">
            <div className="relative w-full h-[62vh] bg-black/30 p-4 md:p-5">
              <ReactGridLayout
                className="layout"
                cols={GRID_COLS}
                rowHeight={GRID_ROW_HEIGHT}
                maxRows={GRID_MAX_ROWS}
                margin={[12, 12]}
                containerPadding={[0, 0]}
                compactType={null}
                preventCollision
                isDraggable={editMode}
                isResizable={editMode}
                layout={gridLayout}
                onDragStop={(nextLayout, _oldItem, newItem) => {
                  const box = nextLayout.find((l) => l.i === newItem.i);
                  if (box) saveRoomBox(newItem.i, box);
                }}
                onResizeStop={(nextLayout, _oldItem, newItem) => {
                  const box = nextLayout.find((l) => l.i === newItem.i);
                  if (box) saveRoomBox(newItem.i, box);
                }}
              >
                {roomTiles.map((t) => {
                  const { colorClass, ringClass } = classify(t.value);
                  return (
                    <div
                      key={t.room.id}
                      className={`relative overflow-hidden rounded-2xl border bg-black/20 ${ringClass} ring-1 ${editMode ? 'border-neon-blue/30' : 'border-white/10'}`}
                    >
                      <div className={`absolute -inset-10 ${colorClass} blur-2xl`} />

                      <div className="relative p-3 md:p-4 h-full">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-white/55 font-semibold">
                              Room
                            </div>
                            <div className="mt-1 text-sm md:text-base font-extrabold text-white truncate">
                              {t.room.name}
                            </div>
                          </div>
                          <div className="shrink-0 px-2 py-1 rounded-lg border border-white/10 bg-black/40 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
                            {t.value === null ? '—' : formatValue(t.value)}
                          </div>
                        </div>

                        <RoomSensors roomId={t.room.id} sensors={t.sensors} />

                        {editMode ? (
                          <div className="absolute bottom-2 right-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                            {saving ? 'Saving…' : `${t.layout.x},${t.layout.y} ${t.layout.w}x${t.layout.h}`}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </ReactGridLayout>
            </div>

            <div className="p-4 md:p-5 border-t border-white/10">
              <div className="flex items-center justify-between gap-4">
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/45 font-semibold">
                  Rooms: {roomTiles.length}
                </div>
                <div className="text-xs text-white/45">
                  {editMode ? 'Edits save automatically.' : 'Tip: click Edit to move things.'}
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
