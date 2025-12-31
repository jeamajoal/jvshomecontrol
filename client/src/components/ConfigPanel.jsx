import React, { useEffect, useMemo, useState } from 'react';

import { API_HOST, socket } from '../socket';

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

async function saveColorScheme(colorScheme) {
  const res = await fetch(`${API_HOST}/api/ui/color-scheme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ colorScheme }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Color scheme save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

const UI_COLOR_SCHEMES = {
  'electric-blue': {
    actionButton: 'text-neon-blue border-neon-blue/30 bg-neon-blue/10',
    checkboxAccent: 'accent-neon-blue',
    swatch: 'bg-neon-blue',
  },
  'classic-blue': {
    actionButton: 'text-primary border-primary/30 bg-primary/10',
    checkboxAccent: 'accent-primary',
    swatch: 'bg-primary',
  },
  emerald: {
    actionButton: 'text-success border-success/30 bg-success/10',
    checkboxAccent: 'accent-success',
    swatch: 'bg-success',
  },
  amber: {
    actionButton: 'text-warning border-warning/30 bg-warning/10',
    checkboxAccent: 'accent-warning',
    swatch: 'bg-warning',
  },
  'neon-green': {
    actionButton: 'text-neon-green border-neon-green/30 bg-neon-green/10',
    checkboxAccent: 'accent-neon-green',
    swatch: 'bg-neon-green',
  },
  'neon-red': {
    actionButton: 'text-neon-red border-neon-red/30 bg-neon-red/10',
    checkboxAccent: 'accent-neon-red',
    swatch: 'bg-neon-red',
  },
};

const COLOR_SCHEME_CHOICES = [
  { id: 'classic-blue', label: 'Classic Blue', vibe: 'Classy' },
  { id: 'emerald', label: 'Emerald', vibe: 'Classy' },
  { id: 'amber', label: 'Amber', vibe: 'Classy' },
  { id: 'electric-blue', label: 'Electric Blue', vibe: 'Wild' },
  { id: 'neon-green', label: 'Neon Green', vibe: 'Wild' },
  { id: 'neon-red', label: 'Neon Red', vibe: 'Wild' },
];

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

  const [eventsOpen, setEventsOpen] = useState(false);
  const [recentEvents, setRecentEvents] = useState([]);
  const [eventsError, setEventsError] = useState(null);

  const colorSchemeId = String(config?.ui?.colorScheme || 'electric-blue');
  const scheme = UI_COLOR_SCHEMES[colorSchemeId] || UI_COLOR_SCHEMES['electric-blue'];

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

  useEffect(() => {
    if (!eventsOpen) return;

    let cancelled = false;
    const limit = 50;

    const fetchRecent = async () => {
      try {
        setEventsError(null);
        const res = await fetch(`${API_HOST}/api/events?limit=${limit}`);
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(txt || `Events fetch failed (${res.status})`);
        }
        const data = await res.json().catch(() => ({}));
        const events = Array.isArray(data?.events) ? data.events : [];
        if (!cancelled) setRecentEvents(events.slice(0, limit));
      } catch (e) {
        if (!cancelled) setEventsError(e?.message || String(e));
      }
    };

    const onIngest = (msg) => {
      const events = Array.isArray(msg?.events) ? msg.events : (msg ? [msg] : []);
      if (!events.length) return;
      setRecentEvents((prev) => {
        const next = [...events.reverse(), ...prev];
        return next.slice(0, limit);
      });
    };

    fetchRecent();
    socket.on('events_ingested', onIngest);
    return () => {
      cancelled = true;
      socket.off('events_ingested', onIngest);
    };
  }, [eventsOpen]);

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
              Choose where each device appears: Main and/or Interact.
            </div>

            {mainLocked ? (
              <div className="mt-2 text-[11px] text-neon-red">
                Main list locked by server env var UI_ALLOWED_MAIN_DEVICE_IDS.
              </div>
            ) : null}
            {ctrlLocked ? (
              <div className="mt-2 text-[11px] text-neon-red">
                Interact list locked by server env var UI_ALLOWED_CTRL_DEVICE_IDS (or legacy UI_ALLOWED_DEVICE_IDS).
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
                              className={`h-5 w-5 ${scheme.checkboxAccent}`}
                              disabled={!connected || busy || mainLocked}
                              checked={isMain}
                              onChange={(e) => setAllowed(d.id, 'main', e.target.checked)}
                            />
                            Main
                          </label>

                          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                            <input
                              type="checkbox"
                              className={`h-5 w-5 ${scheme.checkboxAccent}`}
                              disabled={!connected || busy || ctrlLocked}
                              checked={isCtrl}
                              onChange={(e) => setAllowed(d.id, 'ctrl', e.target.checked)}
                            />
                            Interact
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
              Appearance
            </div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
              Color Scheme
            </div>
            <div className="mt-1 text-xs text-white/45">
              Pick a single accent color for the UI.
            </div>

            {error ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {error}</div>
            ) : null}

            <div className="mt-4">
              {['Classy', 'Wild'].map((vibe) => (
                <div key={vibe} className={vibe === 'Wild' ? 'mt-4' : ''}>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">
                    {vibe}
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {COLOR_SCHEME_CHOICES.filter((c) => c.vibe === vibe).map((choice) => {
                      const isSelected = choice.id === colorSchemeId;
                      const choiceScheme = UI_COLOR_SCHEMES[choice.id] || UI_COLOR_SCHEMES['electric-blue'];
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          disabled={!connected || busy}
                          onClick={async () => {
                            setError(null);
                            setBusy(true);
                            try {
                              await saveColorScheme(choice.id);
                            } catch (e) {
                              setError(e?.message || String(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className={`rounded-xl border px-3 py-3 text-left transition-colors ${isSelected ? 'border-white/30 bg-white/10' : 'border-white/10 bg-black/20 hover:bg-white/5'} ${(!connected || busy) ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-3.5 w-3.5 rounded-full ${choiceScheme.swatch}`} />
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 truncate">
                                {choice.label}
                              </div>
                              {isSelected ? (
                                <div className="mt-1 text-[10px] text-white/40">Selected</div>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 glass-panel border border-white/10 p-4 md:p-5">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Rooms
            </div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
              Manual Rooms
            </div>
            <div className="mt-1 text-xs text-white/45">
              Add/remove rooms that aren’t discovered from Hubitat. They can be placed/resized on the Environment page.
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="New room name"
                className={`flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/35 ${scheme.focusRing}`}
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
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy || !newRoomName.trim()) ? 'opacity-50' : 'hover:bg-white/5'}`}
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
              Add labels here, then position/resize them on the Environment page in Edit mode.
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
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/5'}`}
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
                      className={`mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/35 ${scheme.focusRing}`}
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
                        className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy || !String(labelDrafts[l.id] ?? '').trim()) ? 'opacity-50' : 'hover:bg-white/5'}`}
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

          <div className="mt-4 glass-panel border border-white/10 p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                  Events
                </div>
                <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
                  Recent Posts
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Live view of what is POSTing to <span className="text-white/70">/api/events</span>. Stored in-memory only.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEventsOpen((v) => !v)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-white/70 border-white/10 bg-black/20 ${eventsOpen ? 'bg-white/10' : 'hover:bg-white/10'}`}
              >
                {eventsOpen ? 'Hide' : 'Show'}
              </button>
            </div>

            {eventsOpen ? (
              <div className="mt-4">
                {eventsError ? (
                  <div className="text-[11px] text-neon-red break-words">Events error: {eventsError}</div>
                ) : null}
                <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/10 bg-white/5">
                    <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/60">
                      Last {recentEvents.length} events
                    </div>
                    <button
                      type="button"
                      onClick={() => setRecentEvents([])}
                      className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55 hover:text-white/80"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-[260px] overflow-auto">
                    {recentEvents.length ? (
                      recentEvents.map((ev, idx) => (
                        <div key={`${ev?.receivedAt || 'no-ts'}:${idx}`} className="px-4 py-2 border-b border-white/5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] text-white/70 truncate">
                              {String(ev?.payload?.displayName || ev?.payload?.name || ev?.payload?.device || 'event')}
                            </div>
                            <div className="text-[10px] text-white/35 shrink-0">
                              {String(ev?.receivedAt || '')}
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-white/45 break-words">
                            {ev?.payload ? JSON.stringify(ev.payload) : ''}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-sm text-white/45">No events received yet.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
