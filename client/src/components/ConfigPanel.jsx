import React, { useEffect, useMemo, useRef, useState } from 'react';

const API_HOST = `http://${window.location.hostname}:3000`;

const useFitScale = () => {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl) return;

    const compute = () => {
      const SAFE_GUTTER_PX = 12;
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

async function saveAllowedDeviceIds(allowedDeviceIds) {
  const res = await fetch(`${API_HOST}/api/ui/allowed-device-ids`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowedDeviceIds }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Allowlist save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

const ConfigPanel = ({ config, statuses, connected }) => {
  const { viewportRef, contentRef, scale } = useFitScale();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const allowedControlIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.allowedDeviceIds) ? config.ui.allowedDeviceIds : [];
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.allowedDeviceIds]);

  const allowlistLocked = Boolean(config?.ui?.allowlistLocked);

  const allSwitchLikeDevices = useMemo(() => {
    const devices = (config?.sensors || [])
      .map((d) => {
        const st = statuses?.[d.id] || null;
        const attrs = st?.attributes || {};
        const commands = Array.isArray(st?.commands) ? st.commands : [];

        const isSwitchAttr = typeof attrs.switch === 'string' && (attrs.switch === 'on' || attrs.switch === 'off');
        const isSwitchCmd = commands.includes('on') || commands.includes('off') || commands.includes('toggle');
        if (!isSwitchAttr && !isSwitchCmd) return null;

        return {
          id: String(d.id),
          label: d.label || st?.label || String(d.id),
        };
      })
      .filter(Boolean);

    devices.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return devices;
  }, [config?.sensors, statuses]);

  const setAllowed = async (deviceId, nextAllowed) => {
    setError(null);
    setBusy(true);
    try {
      const next = new Set(Array.from(allowedControlIds));
      if (nextAllowed) next.add(String(deviceId));
      else next.delete(String(deviceId));
      await saveAllowedDeviceIds(Array.from(next));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={viewportRef} className="w-full h-full overflow-hidden p-2 md:p-3">
      <div
        className="w-full h-full"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div ref={contentRef} className="w-full">
          <div className="glass-panel border border-white/10 p-4 md:p-5">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Config
            </div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
              Dashboard Allowlist
            </div>
            <div className="mt-1 text-xs text-white/45">
              Tap to include/exclude devices from dashboard controls.
            </div>

            {allowlistLocked ? (
              <div className="mt-2 text-[11px] text-neon-red">
                Locked by server env var UI_ALLOWED_DEVICE_IDS.
              </div>
            ) : null}
            {error ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {error}</div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {allSwitchLikeDevices.length ? (
                allSwitchLikeDevices.map((d) => {
                  const isAllowed = allowedControlIds.has(String(d.id));
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={!connected || busy || allowlistLocked}
                      onClick={() => setAllowed(d.id, !isAllowed)}
                      className={`rounded-2xl border p-4 transition-colors active:scale-[0.99] ${
                        isAllowed
                          ? 'bg-neon-blue/10 border-neon-blue/30 text-neon-blue'
                          : 'bg-white/5 border-white/10 text-white/70'
                      } ${(!connected || busy || allowlistLocked) ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 text-left">
                          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold truncate">
                            {d.label}
                          </div>
                          <div className="mt-1 text-xs text-white/45 truncate">ID: {d.id}</div>
                        </div>
                        <div className="shrink-0 text-[11px] font-extrabold tracking-[0.2em] uppercase">
                          {isAllowed ? 'Allowed' : 'Hidden'}
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-sm text-white/45">No switch devices discovered.</div>
              )}
            </div>

            {!connected ? (
              <div className="mt-3 text-xs text-white/45">Server offline: editing disabled.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
