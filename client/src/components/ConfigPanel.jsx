import React, { useEffect, useMemo, useState } from 'react';

const API_HOST = `http://${window.location.hostname}:3000`;

async function saveAllowlists(payload) {
  const res = await fetch(`${API_HOST}/api/ui/allowed-device-ids`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Allowlist save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function addManualRoom(name) {
  const res = await fetch(`${API_HOST}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Room add failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function deleteManualRoom(roomId) {
  const res = await fetch(`${API_HOST}/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Room delete failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function addLabel(text = 'Label') {
  const res = await fetch(`${API_HOST}/api/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Label add failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function updateLabel(labelId, text) {
  const res = await fetch(`${API_HOST}/api/labels/${encodeURIComponent(labelId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Label update failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function deleteLabel(labelId) {
  const res = await fetch(`${API_HOST}/api/labels/${encodeURIComponent(labelId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Label delete failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

const ConfigPanel = ({ config, statuses, connected }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [newRoomName, setNewRoomName] = useState('');
  const [labelDrafts, setLabelDrafts] = useState(() => ({}));

  const mainAllowedIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.mainAllowedDeviceIds)
      ? config.ui.mainAllowedDeviceIds
      : [];
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.mainAllowedDeviceIds]);

  const ctrlAllowedIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.ctrlAllowedDeviceIds)
      ? config.ui.ctrlAllowedDeviceIds
      : (Array.isArray(config?.ui?.allowedDeviceIds) ? config.ui.allowedDeviceIds : []);
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.ctrlAllowedDeviceIds, config?.ui?.allowedDeviceIds]);

  const mainLocked = Boolean(config?.ui?.mainAllowlistLocked);
  const ctrlLocked = Boolean(config?.ui?.ctrlAllowlistLocked);

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

  const manualRooms = useMemo(() => {
    const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
    return rooms
      .filter((r) => r?.manual === true)
      .map((r) => ({ id: String(r.id), name: String(r.name || r.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [config?.rooms]);

  const labels = useMemo(() => {
    const arr = Array.isArray(config?.labels) ? config.labels : [];
    return arr
      .map((l) => ({ id: String(l?.id || ''), text: String(l?.text ?? '') }))
      .filter((l) => l.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [config?.labels]);

  useEffect(() => {
    // Keep drafts in sync when labels update from server
    setLabelDrafts((prev) => {
      const next = { ...prev };
      for (const l of labels) {
        if (next[l.id] === undefined) next[l.id] = l.text;
      }
      // prune removed labels
      for (const k of Object.keys(next)) {
        if (!labels.some((l) => l.id === k)) delete next[k];
      }
      return next;
    });
  }, [labels]);

  const setAllowed = async (deviceId, list, nextAllowed) => {
    setError(null);
    setBusy(true);
    try {
      const nextMain = new Set(Array.from(mainAllowedIds));
      const nextCtrl = new Set(Array.from(ctrlAllowedIds));
      const target = list === 'main' ? nextMain : nextCtrl;
      if (nextAllowed) target.add(String(deviceId));
      else target.delete(String(deviceId));

      const payload = {};
      if (!mainLocked) payload.mainAllowedDeviceIds = Array.from(nextMain);
      if (!ctrlLocked) payload.ctrlAllowedDeviceIds = Array.from(nextCtrl);
      await saveAllowlists(payload);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full h-full overflow-auto p-2 md:p-3">
      <div className="w-full">
        <div className="glass-panel border border-white/10 p-4 md:p-5">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Config
            </div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
              Device Visibility
            </div>
            <div className="mt-1 text-xs text-white/45">
              Choose where each device appears: Main (Dash) and/or Ctrl (room controls).
            </div>

            {mainLocked ? (
              <div className="mt-2 text-[11px] text-neon-red">
                Main list locked by server env var UI_ALLOWED_MAIN_DEVICE_IDS.
              </div>
            ) : null}
            {ctrlLocked ? (
              <div className="mt-2 text-[11px] text-neon-red">
                Ctrl list locked by server env var UI_ALLOWED_CTRL_DEVICE_IDS (or legacy UI_ALLOWED_DEVICE_IDS).
              </div>
            ) : null}
            {error ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {error}</div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {allSwitchLikeDevices.length ? (
                allSwitchLikeDevices.map((d) => {
                  const isMain = mainAllowedIds.has(String(d.id));
                  const isCtrl = ctrlAllowedIds.has(String(d.id));
                  return (
                    <div
                      key={d.id}
                      className={`rounded-2xl border p-4 bg-white/5 border-white/10 ${!connected ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/80 truncate">
                            {d.label}
                          </div>
                          <div className="mt-1 text-xs text-white/45 truncate">ID: {d.id}</div>
                        </div>

                        <div className="shrink-0 flex items-center gap-4">
                          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-neon-blue"
                              disabled={!connected || busy || mainLocked}
                              checked={isMain}
                              onChange={(e) => setAllowed(d.id, 'main', e.target.checked)}
                            />
                            Main
                          </label>

                          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-neon-blue"
                              disabled={!connected || busy || ctrlLocked}
                              checked={isCtrl}
                              onChange={(e) => setAllowed(d.id, 'ctrl', e.target.checked)}
                            />
                            Ctrl
                          </label>
                        </div>
                      </div>
                    </div>
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

          <div className="mt-4 glass-panel border border-white/10 p-4 md:p-5">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Rooms
            </div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
              Manual Rooms
            </div>
            <div className="mt-1 text-xs text-white/45">
              Add/remove rooms that aren’t discovered from Hubitat. They can be placed/resized on the Heat dashboard.
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="New room name"
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/35"
                disabled={!connected || busy}
              />
              <button
                type="button"
                disabled={!connected || busy || !newRoomName.trim()}
                onClick={async () => {
                  setError(null);
                  setBusy(true);
                  try {
                    await addManualRoom(newRoomName.trim());
                    setNewRoomName('');
                  } catch (e) {
                    setError(e?.message || String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-neon-blue border-neon-blue/30 bg-neon-blue/10 ${(!connected || busy || !newRoomName.trim()) ? 'opacity-50' : 'hover:bg-white/5'}`}
              >
                Add
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {manualRooms.length ? (
                manualRooms.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/80 truncate">
                          {r.name}
                        </div>
                        <div className="mt-1 text-xs text-white/45 truncate">ID: {r.id}</div>
                      </div>
                      <button
                        type="button"
                        disabled={!connected || busy}
                        onClick={async () => {
                          setError(null);
                          setBusy(true);
                          try {
                            await deleteManualRoom(r.id);
                          } catch (e) {
                            setError(e?.message || String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-white/70 border-white/10 bg-black/20 ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/10'}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/45">No manual rooms.</div>
              )}
            </div>
          </div>

          <div className="mt-4 glass-panel border border-white/10 p-4 md:p-5">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Labels
            </div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
              Freeform Text
            </div>
            <div className="mt-1 text-xs text-white/45">
              Add labels here, then position/resize them on the Heat dashboard in Edit mode.
            </div>

            <div className="mt-4">
              <button
                type="button"
                disabled={!connected || busy}
                onClick={async () => {
                  setError(null);
                  setBusy(true);
                  try {
                    await addLabel('Label');
                  } catch (e) {
                    setError(e?.message || String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-neon-blue border-neon-blue/30 bg-neon-blue/10 ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/5'}`}
              >
                Add Label
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              {labels.length ? (
                labels.map((l) => (
                  <div key={l.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-semibold">
                      {l.id}
                    </div>
                    <textarea
                      value={labelDrafts[l.id] ?? l.text}
                      onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      rows={2}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/35"
                      disabled={!connected || busy}
                      placeholder="Label text"
                    />

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={!connected || busy || !String(labelDrafts[l.id] ?? '').trim()}
                        onClick={async () => {
                          setError(null);
                          setBusy(true);
                          try {
                            await updateLabel(l.id, String(labelDrafts[l.id] ?? '').trim());
                          } catch (e) {
                            setError(e?.message || String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-neon-blue border-neon-blue/30 bg-neon-blue/10 ${(!connected || busy || !String(labelDrafts[l.id] ?? '').trim()) ? 'opacity-50' : 'hover:bg-white/5'}`}
                      >
                        Save Text
                      </button>
                      <button
                        type="button"
                        disabled={!connected || busy}
                        onClick={async () => {
                          setError(null);
                          setBusy(true);
                          try {
                            await deleteLabel(l.id);
                          } catch (e) {
                            setError(e?.message || String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-white/70 border-white/10 bg-black/20 ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/10'}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/45">No labels yet.</div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
