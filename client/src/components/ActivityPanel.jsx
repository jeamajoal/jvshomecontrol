import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DoorOpen, Footprints, Volume2, VolumeX } from 'lucide-react';

import { socket } from '../socket';
import { useAppState } from '../appState';
import { buildRoomsWithActivity } from '../deviceSelectors';
import { asText } from '../utils';

const SOUND_COOLDOWN_PER_SENSOR_MS = 12000;
const SOUND_COOLDOWN_GLOBAL_MS = 1500;

const getAlertSoundUrls = (config) => {
  const sounds = config?.ui?.alertSounds && typeof config.ui.alertSounds === 'object' ? config.ui.alertSounds : {};

  const normalize = (s) => {
    const v = asText(s);
    if (!v) return null;
    // Allow bare filenames like "dooropen.mp3" by treating them as "/sounds/<file>".
    if (/^(https?:)?\//i.test(v)) return v;
    return `/sounds/${v.replace(/^\.\/?/, '')}`;
  };

  return {
    motion: normalize(sounds.motion),
    doorOpen: normalize(sounds.doorOpen),
    doorClose: normalize(sounds.doorClose),
  };
};

// Room/device joins are centralized in ../deviceSelectors.

const tone = async (audioCtx, { freq = 440, durationMs = 120, gain = 0.08 } = {}) => {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.type = 'triangle';
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
  await tone(audioCtx, { freq: 220, durationMs: 90, gain: 0.085 });
  await tone(audioCtx, { freq: 180, durationMs: 90, gain: 0.085 });
};

const playDoorSound = async (audioCtx) => {
  // Simple “creak-ish” descending tone.
  await tone(audioCtx, { freq: 520, durationMs: 140, gain: 0.075 });
  await tone(audioCtx, { freq: 360, durationMs: 180, gain: 0.075 });
};

const playDoorCloseSound = async (audioCtx) => {
  // Short “click-ish” close.
  await tone(audioCtx, { freq: 280, durationMs: 70, gain: 0.08 });
  await tone(audioCtx, { freq: 220, durationMs: 70, gain: 0.07 });
};

const playBuffer = (audioCtx, buffer, { gain = 0.9 } = {}) => {
  const src = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(g);
  g.connect(audioCtx.destination);
  src.start();
};

const loadAudioBuffer = async (audioCtx, url) => {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to fetch sound: ${res.status}`);
  const data = await res.arrayBuffer();
  // decodeAudioData has both promise + callback forms depending on browser.
  const decoded = await new Promise((resolve, reject) => {
    const p = audioCtx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve).catch(reject);
  });
  return decoded;
};

const ActivityPanel = ({ config: configProp, statuses: statusesProp, uiScheme: uiSchemeProp }) => {
  const ctx = useAppState();
  const config = configProp ?? ctx?.config;
  const statuses = statusesProp ?? ctx?.statuses;
  const uiScheme = uiSchemeProp ?? ctx?.uiScheme;
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const audioCtxRef = useRef(null);
  const soundRef = useRef({ urls: null, buffers: { motion: null, doorOpen: null, doorClose: null } });

  const prevRef = useRef({ byId: new Map(), initialized: false });
  const lastPlayedRef = useRef({ perSensor: new Map(), globalAt: 0 });

  const rooms = useMemo(() => buildRoomsWithActivity(config, statuses), [config, statuses]);

  const cardScalePct = useMemo(() => {
    const raw = Number(config?.ui?.cardScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.cardScalePct]);

  const contentScale = useMemo(() => {
    const raw = Number(cardScalePct);
    if (!Number.isFinite(raw)) return 1;
    return Math.max(0.5, Math.min(2, raw / 100));
  }, [cardScalePct]);

  const activityBackground = useMemo(() => {
    const raw = (config?.ui?.homeBackground && typeof config.ui.homeBackground === 'object')
      ? config.ui.homeBackground
      : {};

    const enabled = raw.enabled === true;
    const url = (raw.url === null || raw.url === undefined) ? null : String(raw.url).trim();
    const opacityRaw = Number(raw.opacityPct);
    const opacityPct = Number.isFinite(opacityRaw)
      ? Math.max(0, Math.min(100, Math.round(opacityRaw)))
      : 35;

    if (!enabled || !url) return { enabled: false, url: null, opacityPct };
    return { enabled: true, url, opacityPct };
  }, [config?.ui?.homeBackground]);

  const [activityBackgroundImageError, setActivityBackgroundImageError] = useState(false);

  useEffect(() => {
    setActivityBackgroundImageError(false);
    if (!activityBackground.enabled || !activityBackground.url) return;

    const img = new Image();
    img.onerror = () => {
      setActivityBackgroundImageError(true);
    };
    img.src = activityBackground.url;

    return () => {
      img.onerror = null;
    };
  }, [activityBackground.enabled, activityBackground.url]);

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

  const ensureSoundBuffers = async (audioCtx) => {
    const urls = getAlertSoundUrls(config);
    const prevUrls = soundRef.current.urls;
    const sameUrls =
      prevUrls &&
      prevUrls.motion === urls.motion &&
      prevUrls.doorOpen === urls.doorOpen &&
      prevUrls.doorClose === urls.doorClose;

    if (!sameUrls) {
      soundRef.current.urls = urls;
      soundRef.current.buffers = { motion: null, doorOpen: null, doorClose: null };
    }

    const entries = [
      ['motion', urls.motion],
      ['doorOpen', urls.doorOpen],
      ['doorClose', urls.doorClose],
    ];

    await Promise.all(
      entries.map(async ([key, url]) => {
        if (!url) return;
        if (soundRef.current.buffers[key]) return;
        try {
          soundRef.current.buffers[key] = await loadAudioBuffer(audioCtx, url);
        } catch (e) {
          // Keep fallback tones if loading fails.
          console.warn('[Activity] Failed to load custom sound', key, url, e);
        }
      })
    );
  };

  // Track state transitions from polling refreshes (visual correctness + fallback audio).
  useEffect(() => {
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

    if (!alertsEnabled) {
      prev.byId = nextById;
      return;
    }

    const audioCtx = audioCtxRef.current;
    if (!audioCtx) {
      prev.byId = nextById;
      return;
    }

    // Keep contexts alive on browsers that suspend when backgrounded.
    ensureAudio().catch(() => undefined);

    for (const [id, nextState] of nextById.entries()) {
      const prevState = prev.byId.get(id) || {};

      const motionTriggered = prevState.motion !== 'active' && nextState.motion === 'active';
      const doorOpenTriggered = prevState.contact !== 'open' && nextState.contact === 'open';
      const doorCloseTriggered = prevState.contact === 'open' && nextState.contact === 'closed';

      let eventType = null;
      if (doorOpenTriggered) eventType = 'doorOpen';
      else if (doorCloseTriggered) eventType = 'doorClose';
      else if (motionTriggered) eventType = 'motion';
      if (!eventType) continue;

      const last = lastPlayedRef.current;
      const perKey = `${id}:${eventType}`;
      const lastAt = last.perSensor.get(perKey) || 0;
      const sinceKey = nowMs - lastAt;
      const sinceGlobal = nowMs - last.globalAt;

      // Rate limits: avoid spam if device bounces or status refresh repeats.
      if (sinceKey < SOUND_COOLDOWN_PER_SENSOR_MS) continue;
      if (sinceGlobal < SOUND_COOLDOWN_GLOBAL_MS) continue;

      last.perSensor.set(perKey, nowMs);
      last.globalAt = nowMs;

      const buffers = soundRef.current.buffers;
      if (eventType === 'motion') {
        if (buffers.motion) playBuffer(audioCtx, buffers.motion);
        else playMotionSound(audioCtx).catch(() => undefined);
      } else if (eventType === 'doorOpen') {
        if (buffers.doorOpen) playBuffer(audioCtx, buffers.doorOpen);
        else playDoorSound(audioCtx).catch(() => undefined);
      } else if (eventType === 'doorClose') {
        if (buffers.doorClose) playBuffer(audioCtx, buffers.doorClose);
        else playDoorCloseSound(audioCtx).catch(() => undefined);
      }
    }

    prev.byId = nextById;
  }, [alertsEnabled, rooms]);

  // Prefer realtime Maker postURL events for audio cues (more immediate than polling).
  useEffect(() => {
    const handler = async ({ events } = {}) => {
      if (!alertsEnabled) return;
      if (!Array.isArray(events) || !events.length) return;

      const audioCtx = await ensureAudio();
      if (!audioCtx) return;

      // Load custom sounds (if configured) before trying to play any.
      await ensureSoundBuffers(audioCtx);

      const nowMs = Date.now();

      for (const e of events) {
        const payload = e?.payload || {};
        const deviceId = payload?.deviceId ?? payload?.device_id ?? payload?.id;
        const name = asText(payload?.name) || asText(payload?.attribute) || asText(payload?.attributeName);
        const value = asText(payload?.value);

        const id = deviceId !== null && deviceId !== undefined ? String(deviceId) : '';
        if (!id) continue;

        const isDoorOpen = name && name.toLowerCase() === 'contact' && value && value.toLowerCase() === 'open';
        const isDoorClose = name && name.toLowerCase() === 'contact' && value && value.toLowerCase() === 'closed';
        const isMotion = name && name.toLowerCase() === 'motion' && value && value.toLowerCase() === 'active';
        if (!isDoorOpen && !isDoorClose && !isMotion) continue;

        const eventType = isDoorOpen ? 'doorOpen' : isDoorClose ? 'doorClose' : 'motion';

        const last = lastPlayedRef.current;
        const perKey = `${id}:${eventType}`;
        const lastAt = last.perSensor.get(perKey) || 0;
        const sinceKey = nowMs - lastAt;
        const sinceGlobal = nowMs - last.globalAt;

        if (sinceKey < SOUND_COOLDOWN_PER_SENSOR_MS) continue;
        if (sinceGlobal < SOUND_COOLDOWN_GLOBAL_MS) continue;

        last.perSensor.set(perKey, nowMs);
        last.globalAt = nowMs;

        const buffers = soundRef.current.buffers;
        if (eventType === 'motion') {
          if (buffers.motion) playBuffer(audioCtx, buffers.motion);
          else playMotionSound(audioCtx).catch(() => undefined);
        } else if (eventType === 'doorOpen') {
          if (buffers.doorOpen) playBuffer(audioCtx, buffers.doorOpen);
          else playDoorSound(audioCtx).catch(() => undefined);
        } else if (eventType === 'doorClose') {
          if (buffers.doorClose) playBuffer(audioCtx, buffers.doorClose);
          else playDoorCloseSound(audioCtx).catch(() => undefined);
        }
      }
    };

    socket.on('events_ingested', handler);
    return () => socket.off('events_ingested', handler);
  }, [alertsEnabled]);

  return (
    <div className="relative w-full h-full overflow-auto p-3 md:p-5">
      {activityBackground.enabled && activityBackground.url && !activityBackgroundImageError ? (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: `url(${JSON.stringify(String(activityBackground.url))})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: activityBackground.opacityPct / 100,
          }}
        />
      ) : null}

      <div
        className="relative z-10"
        style={{
          transform: `scale(${contentScale})`,
          transformOrigin: 'top left',
        }}
      >
      <div className="flex justify-end">
        <button
          type="button"
          title={alertsEnabled ? 'Alerts enabled' : 'Alerts quiet'}
          aria-label={alertsEnabled ? 'Disable alerts' : 'Enable alerts'}
          onClick={async () => {
            if (!alertsEnabled) {
              const ctx = await ensureAudio();
              if (!ctx) return;
              await ensureSoundBuffers(ctx);
              // Quick confirmation chirp so users know audio is working.
              if (soundRef.current.buffers.motion) playBuffer(ctx, soundRef.current.buffers.motion);
              else playMotionSound(ctx).catch(() => undefined);
              setAlertsEnabled(true);
              return;
            }
            setAlertsEnabled(false);
          }}
          className={`glass-panel rounded-xl border px-3 py-2 transition-colors active:scale-[0.99] ${alertsEnabled ? (uiScheme?.selectedCard || 'bg-white/10 border-white/20') : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
        >
          {alertsEnabled ? (
            <Volume2 className={`w-4 h-4 ${uiScheme?.selectedText || 'text-neon-blue'}`} />
          ) : (
            <VolumeX className="w-4 h-4 jvs-secondary-text text-white" />
          )}
        </button>
      </div>

      <div className="mt-4 max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
        {rooms.length ? (
          rooms.map((r) => {
            const motionActive = r.devices.filter((d) => d.motion === 'active').length;
            const doorOpen = r.devices.filter((d) => d.contact === 'open').length;

            const headerGlow = (motionActive || doorOpen)
              ? `${uiScheme?.selectedCard || 'border-primary/40'} ${uiScheme?.headerGlow || 'animate-glow-accent'}`
              : 'border-white/10';

            return (
              <section
                key={String(r.room?.id)}
                className={`glass-panel p-4 md:p-5 border ${headerGlow}`}
                aria-label={String(r.room?.name || r.room?.id)}
                title={String(r.room?.name || r.room?.id)}
              >
                <div
                  className="font-extrabold tracking-wide jvs-primary-text-strong text-white truncate text-center"
                  style={{ fontSize: 'calc(16px * var(--jvs-primary-text-size-scale, 1))' }}
                >
                  {String(r.room?.name || r.room?.id)}
                </div>
                <div className="w-full flex items-center justify-center gap-6 py-4">
                  <Footprints
                    className={`w-8 h-8 ${motionActive ? `animate-pulse ${uiScheme?.selectedText || 'text-neon-blue'}` : 'text-white/25'}`}
                    aria-label="Motion"
                    title="Motion"
                  />
                  <DoorOpen
                    className={`w-8 h-8 ${doorOpen ? `${uiScheme?.selectedText || 'text-neon-blue'}` : 'text-white/25'}`}
                    aria-label="Door"
                    title="Door"
                  />
                </div>
              </section>
            );
          })
        ) : (
          <div className="glass-panel p-8 border border-white/10 flex items-center justify-center gap-8">
            <Footprints className="w-10 h-10 text-white/20" aria-label="Motion" title="Motion" />
            <DoorOpen className="w-10 h-10 text-white/20" aria-label="Door" title="Door" />
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default ActivityPanel;
