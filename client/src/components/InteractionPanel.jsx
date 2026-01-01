import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Power, SlidersHorizontal } from 'lucide-react';

import { getUiScheme } from '../uiScheme';
import { API_HOST } from '../apiHost';

const asNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
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

async function sendDeviceCommand(deviceId, command, args = []) {
  const cleanedArgs = Array.isArray(args)
    ? args
      .filter((a) => a !== null && a !== undefined)
      .filter((a) => (typeof a === 'string') || (typeof a === 'number' && Number.isFinite(a)))
    : [];

  const res = await fetch(`${API_HOST}/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args: cleanedArgs }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Command failed (${res.status})`);
  }
}

const SwitchTile = ({ label, isOn, disabled, busy, onToggle, uiScheme }) => {
  const stateClass = isOn
    ? `${uiScheme?.selectedCard || 'bg-neon-blue/15 border-neon-blue/40'} ${uiScheme?.selectedText || 'text-neon-blue'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
    : 'bg-white/5 border-white/10 text-white/70';

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onToggle}
      className={`w-full rounded-2xl border p-4 md:p-5 transition-colors active:scale-[0.99] ${stateClass} ${disabled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 text-left">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] font-semibold truncate">{label}</div>
          <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight">{isOn ? 'ON' : 'OFF'}</div>
        </div>
        <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
          {busy ? (
            <Loader2 className={`w-6 h-6 md:w-7 md:h-7 animate-spin ${uiScheme?.metricIcon || 'text-neon-blue'}`} />
          ) : (
            <Power className={`w-6 h-6 md:w-7 md:h-7 ${isOn ? (uiScheme?.selectedText || 'text-neon-blue') : 'text-white/60'}`} />
          )}
        </div>
      </div>
    </button>
  );
};

const LevelTile = ({ label, isOn, level, disabled, busy, onToggle, onSetLevel, uiScheme }) => {
  const levelNum = asNumber(level);
  const displayLevel = levelNum === null ? 0 : Math.max(0, Math.min(100, Math.round(levelNum)));
  const [draft, setDraft] = useState(displayLevel);

  useEffect(() => {
    setDraft(displayLevel);
  }, [displayLevel]);

  return (
    <div className={`w-full rounded-2xl border p-4 md:p-5 bg-white/5 border-white/10 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold truncate">
            {label}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <div className={`text-2xl md:text-3xl font-extrabold tracking-tight ${isOn ? (uiScheme?.selectedText || 'text-neon-blue') : 'text-white/70'}`}>
              {isOn ? 'ON' : 'OFF'}
            </div>
            <div className="text-sm text-white/55 font-bold">{displayLevel}%</div>
          </div>
        </div>

        <button
          type="button"
          disabled={disabled || busy}
          onClick={onToggle}
          className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${
            isOn ? (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10') : 'text-white/60 border-white/10 bg-white/5'
          } ${(disabled || busy) ? 'opacity-50' : 'hover:bg-white/10'}`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Toggle'}
        </button>
      </div>

      <div className="mt-4">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={draft}
          disabled={disabled || busy}
          onChange={(e) => setDraft(Number(e.target.value))}
          onMouseUp={() => onSetLevel(draft)}
          onTouchEnd={() => onSetLevel(draft)}
          className="w-full"
        />
        <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">Slide and release to set level</div>
      </div>
    </div>
  );
};

const InteractionPanel = ({ config, statuses, connected, uiScheme }) => {
  const { viewportRef, contentRef, scale } = useFitScale();

  const resolvedUiScheme = useMemo(
    () => uiScheme || getUiScheme(config?.ui?.colorScheme),
    [uiScheme, config?.ui?.colorScheme],
  );

  const allowedControlIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.ctrlAllowedDeviceIds)
      ? config.ui.ctrlAllowedDeviceIds
      : (Array.isArray(config?.ui?.allowedDeviceIds) ? config.ui.allowedDeviceIds : []);
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.ctrlAllowedDeviceIds, config?.ui?.allowedDeviceIds]);

  const rooms = useMemo(() => {
    const byRoomId = new Map();
    for (const r of config?.rooms || []) byRoomId.set(r.id, { room: r, devices: [] });

    for (const dev of config?.sensors || []) {
      const bucket = byRoomId.get(dev.roomId);
      if (!bucket) continue;
      bucket.devices.push({ ...dev, status: statuses?.[dev.id] || null });
    }

    return Array.from(byRoomId.values()).filter((r) => r.devices.length > 0);
  }, [config, statuses]);

  const [busy, setBusy] = useState(() => new Set());

  const run = async (deviceId, command, args = []) => {
    const key = `${deviceId}:${command}`;
    setBusy((prev) => new Set(prev).add(key));
    try {
      await sendDeviceCommand(deviceId, command, args);
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div ref={viewportRef} className="w-full h-full overflow-auto md:overflow-hidden p-4 md:p-6">
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
                  Interactions
                </div>
                <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
                  Device Controls
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Controls render based on device capabilities (switch / dimmer / commands).
                </div>
              </div>

              <button
                type="button"
                disabled={!connected}
                onClick={() => {
                  // Best-effort: ask the backend to run an immediate Hubitat sync.
                  fetch(`${API_HOST}/api/refresh`, { method: 'POST' }).catch(() => undefined);
                }}
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${resolvedUiScheme.actionButton} ${!connected ? 'opacity-50' : 'hover:bg-white/5'}`}
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Refresh
                </span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {rooms.length ? (
              rooms.map(({ room, devices }) => {
                const controllables = devices
                  .map((d) => {
                    const attrs = d.status?.attributes || {};
                    const commands = Array.isArray(d.status?.commands) ? d.status.commands : [];
                    return {
                      id: d.id,
                      label: d.label,
                      attrs,
                      commands,
                    };
                  })
                  .filter((d) => allowedControlIds.has(String(d.id)))
                  .filter((d) => d.commands.length || typeof d.attrs.switch === 'string');

                if (!controllables.length) return null;

                return (
                  <section key={room.id} className="glass-panel p-4 md:p-5 border border-white/10">
                    <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                      Room
                    </div>
                    <h2 className="mt-1 text-base md:text-lg font-extrabold tracking-wide text-white truncate">
                      {room.name}
                    </h2>

                    <div className="mt-4 grid grid-cols-1 gap-3">
                      {controllables.map((d) => {
                        const sw = d.attrs.switch;
                        const level = d.attrs.level;
                        const isSwitch = typeof sw === 'string' && (sw === 'on' || sw === 'off');
                        const hasLevel = d.commands.includes('setLevel') || asNumber(level) !== null;
                        const canOn = d.commands.includes('on');
                        const canOff = d.commands.includes('off');
                        const canToggle = d.commands.includes('toggle');

                        const isOn = sw === 'on';

                        if (isSwitch && hasLevel) {
                          return (
                            <LevelTile
                              key={d.id}
                              label={d.label}
                              isOn={isOn}
                              level={level}
                              disabled={!connected}
                              busy={busy.has(`${d.id}:toggle`) || busy.has(`${d.id}:setLevel`) || busy.has(`${d.id}:on`) || busy.has(`${d.id}:off`)}
                              onToggle={() => {
                                if (isOn && canOff) return run(d.id, 'off');
                                if (!isOn && canOn) return run(d.id, 'on');
                                if (canToggle) return run(d.id, 'toggle');
                                return run(d.id, isOn ? 'off' : 'on');
                              }}
                              onSetLevel={(next) => {
                                const n = Math.max(0, Math.min(100, Math.round(Number(next))));
                                return run(d.id, 'setLevel', [n]);
                              }}
                              uiScheme={resolvedUiScheme}
                            />
                          );
                        }

                        if (isSwitch) {
                          return (
                            <SwitchTile
                              key={d.id}
                              label={d.label}
                              isOn={isOn}
                              disabled={!connected}
                              busy={busy.has(`${d.id}:on`) || busy.has(`${d.id}:off`) || busy.has(`${d.id}:toggle`)}
                              onToggle={() => {
                                if (isOn && canOff) return run(d.id, 'off');
                                if (!isOn && canOn) return run(d.id, 'on');
                                if (canToggle) return run(d.id, 'toggle');
                                return run(d.id, isOn ? 'off' : 'on');
                              }}
                              uiScheme={resolvedUiScheme}
                            />
                          );
                        }

                        // Fallback: show safe action buttons if present
                        const allow = new Set(['push', 'on', 'off']);
                        const actions = d.commands.filter((c) => allow.has(c));
                        if (!actions.length) return null;

                        return (
                          <div key={d.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 md:p-5">
                            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold truncate">
                              {d.label}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {actions.map((cmd) => (
                                <button
                                  key={cmd}
                                  type="button"
                                  disabled={!connected || busy.has(`${d.id}:${cmd}`)}
                                  onClick={() => run(d.id, cmd)}
                                  className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${resolvedUiScheme.actionButton} ${(!connected || busy.has(`${d.id}:${cmd}`)) ? 'opacity-50' : 'hover:bg-white/5'}`}
                                >
                                  {busy.has(`${d.id}:${cmd}`) ? <Loader2 className="w-4 h-4 animate-spin inline" /> : cmd}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
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

export default InteractionPanel;
