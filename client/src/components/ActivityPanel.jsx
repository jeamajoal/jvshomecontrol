import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity } from 'lucide-react';

const asText = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

const buildRoomsWithActivity = (config, statuses) => {
  const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
  const sensors = Array.isArray(config?.sensors) ? config.sensors : [];

  const byRoomId = new Map();
  for (const r of rooms) byRoomId.set(String(r.id), { room: r, devices: [] });

  const unassigned = [];

  for (const s of sensors) {
    const id = String(s?.id ?? '').trim();
    if (!id) continue;

    const st = statuses?.[id] || null;
    const attrs = st?.attributes && typeof st.attributes === 'object' ? st.attributes : {};

    const motion = asText(attrs.motion);
    const contact = asText(attrs.contact);

    const hasActivity = (motion === 'active' || motion === 'inactive') || (contact === 'open' || contact === 'closed');
    if (!hasActivity) continue;

    const entry = {
      id,
      label: String(s?.label || st?.label || id),
      motion,
      contact,
      lastUpdated: asText(st?.lastUpdated),
      roomId: String(s?.roomId ?? ''),
    };

    const bucket = byRoomId.get(entry.roomId);
    if (bucket) bucket.devices.push(entry);
    else unassigned.push(entry);
  }

  const result = Array.from(byRoomId.values())
    .map(({ room, devices }) => ({ room, devices }))
    .filter((r) => r.devices.length > 0)
    .sort((a, b) => String(a.room?.name || '').localeCompare(String(b.room?.name || '')));

  if (unassigned.length) {
    result.push({ room: { id: 'unassigned', name: 'Unassigned' }, devices: unassigned });
  }

  return result;
};

const tone = async (audioCtx, { freq = 440, durationMs = 120, gain = 0.05 } = {}) => {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;

  g.gain.value = 0;
  osc.connect(g);
  g.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.01);
  g.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);

  return new Promise((resolve) => {
    osc.onended = () => resolve();
  });
};

const playMotionSound = async (audioCtx) => {
  // Simple “footstep-ish” double tap.
  await tone(audioCtx, { freq: 220, durationMs: 90, gain: 0.05 });
  await tone(audioCtx, { freq: 180, durationMs: 90, gain: 0.05 });
};

const playDoorSound = async (audioCtx) => {
  // Simple “creak-ish” descending tone.
  await tone(audioCtx, { freq: 520, durationMs: 140, gain: 0.045 });
  await tone(audioCtx, { freq: 360, durationMs: 180, gain: 0.045 });
};

const ActivityPanel = ({ config, statuses, connected, uiScheme }) => {
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const audioCtxRef = useRef(null);

  const prevRef = useRef({ byId: new Map(), initialized: false });
  const lastPlayedRef = useRef({ perSensor: new Map(), globalAt: 0 });

  const rooms = useMemo(() => buildRoomsWithActivity(config, statuses), [config, statuses]);

  const summary = useMemo(() => {
    let motionActive = 0;
    let doorOpen = 0;

    for (const r of rooms) {
      for (const d of r.devices) {
        if (d.motion === 'active') motionActive += 1;
        if (d.contact === 'open') doorOpen += 1;
      }
    }

    return { motionActive, doorOpen };
  }, [rooms]);

  const ensureAudio = async () => {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }

    try {
      await audioCtxRef.current.resume();
    } catch {
      // ignore
    }

    return audioCtxRef.current;
  };

  useEffect(() => {
    if (!alertsEnabled) {
      // Still keep prev state in sync so enabling later doesn’t spam.
      prevRef.current.initialized = false;
      return;
    }

    const audioCtx = audioCtxRef.current;
    if (!audioCtx) return;

    const nowMs = Date.now();

    const nextById = new Map();

    for (const r of rooms) {
      for (const d of r.devices) {
        nextById.set(d.id, { motion: d.motion, contact: d.contact });
      }
    }

    const prev = prevRef.current;
    if (!prev.initialized) {
      prev.byId = nextById;
      prev.initialized = true;
      return;
    }

    for (const [id, nextState] of nextById.entries()) {
      const prevState = prev.byId.get(id) || {};

      const motionTriggered = prevState.motion !== 'active' && nextState.motion === 'active';
      const doorTriggered = prevState.contact !== 'open' && nextState.contact === 'open';

      if (!motionTriggered && !doorTriggered) continue;

      const last = lastPlayedRef.current;
      const perKey = `${id}:${doorTriggered ? 'door' : 'motion'}`;
      const lastAt = last.perSensor.get(perKey) || 0;
      const sinceKey = nowMs - lastAt;
      const sinceGlobal = nowMs - last.globalAt;

      // Rate limits: avoid spam if device bounces or status refresh repeats.
      if (sinceKey < 5000) continue;
      if (sinceGlobal < 600) continue;

      last.perSensor.set(perKey, nowMs);
      last.globalAt = nowMs;

      // Fire-and-forget sound.
      if (doorTriggered) {
        playDoorSound(audioCtx).catch(() => undefined);
      } else {
        playMotionSound(audioCtx).catch(() => undefined);
      }
    }

    prev.byId = nextById;
  }, [alertsEnabled, rooms]);

  return (
    <div className="w-full h-full overflow-auto p-3 md:p-5">
      <div className="glass-panel border border-white/10 p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">Activity</div>
            <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">Motion & Doors</div>
            <div className="mt-1 text-xs text-white/45">
              {connected ? 'Live status' : 'Offline'} • Motion active: {summary.motionActive} • Doors open: {summary.doorOpen}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (!alertsEnabled) {
                  const ctx = await ensureAudio();
                  if (!ctx) return;
                  setAlertsEnabled(true);
                  return;
                }
                setAlertsEnabled(false);
              }}
              className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${alertsEnabled ? (uiScheme?.selectedCard || 'bg-white/10 border-white/20') : (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10')}`}
            >
              <span className="inline-flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {alertsEnabled ? 'Alerts: On' : 'Alerts: Quiet'}
              </span>
            </button>
          </div>
        </div>

        {alertsEnabled ? (
          <div className="mt-3 text-xs text-white/45">
            Alerts enabled (rate-limited). Toggle back to Quiet to disable.
          </div>
        ) : (
          <div className="mt-3 text-xs text-white/45">
            Quiet by default. Tap “Alerts” once to enable sounds.
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {rooms.length ? (
          rooms.map((r) => {
            const motionActive = r.devices.filter((d) => d.motion === 'active').length;
            const doorOpen = r.devices.filter((d) => d.contact === 'open').length;

            const headerGlow = (motionActive || doorOpen)
              ? `${uiScheme?.selectedCard || 'border-primary/40'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
              : 'border-white/10';

            return (
              <section key={String(r.room?.id)} className={`glass-panel p-4 md:p-5 border ${headerGlow}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">Room</div>
                    <div className="mt-1 text-base md:text-lg font-extrabold tracking-wide text-white truncate">
                      {String(r.room?.name || r.room?.id)}
                    </div>
                    <div className="mt-2 text-xs text-white/45">
                      {motionActive ? `Motion: ${motionActive} active` : 'No motion'}
                      {' • '}
                      {doorOpen ? `Doors: ${doorOpen} open` : 'Doors closed'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  {r.devices
                    .slice()
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map((d) => {
                      const motionState = d.motion;
                      const contactState = d.contact;

                      const active = motionState === 'active' || contactState === 'open';

                      return (
                        <div
                          key={d.id}
                          className={`rounded-2xl border p-3 bg-black/20 ${active ? (uiScheme?.selectedCard || 'border-white/20 bg-white/10') : 'border-white/10'}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold truncate">
                                {d.label}
                              </div>
                              <div className="mt-1 text-sm font-bold text-white/85">
                                {motionState ? `Motion: ${motionState}` : ''}
                                {motionState && contactState ? ' • ' : ''}
                                {contactState ? `Door: ${contactState}` : ''}
                              </div>
                            </div>
                            <div className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/35">
                              {d.lastUpdated ? 'Updated' : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>
            );
          })
        ) : (
          <div className="glass-panel p-8 border border-white/10 text-center text-white/50">
            <div className="text-sm uppercase tracking-[0.2em]">No activity devices</div>
            <div className="mt-2 text-xl font-extrabold text-white">Add motion/contact sensors to rooms</div>
            <div className="mt-2 text-xs text-white/45">This page shows devices that report motion or contact (doors).</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPanel;
