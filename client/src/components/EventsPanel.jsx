import React, { useEffect, useState } from 'react';

import { API_HOST } from '../apiHost';
import { socket } from '../socket';

const EventsPanel = ({ onBack }) => {
  const [eventsOpen, setEventsOpen] = useState(true);
  const [recentEvents, setRecentEvents] = useState([]);
  const [eventsError, setEventsError] = useState(null);

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

  return (
    <div className="w-full h-full overflow-auto utility-page">
      <div className="w-full">
        <div className="utility-panel p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                Events
              </div>
              <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Recent Posts
              </div>
              <div className="mt-1 text-xs text-white/45">
                Live view of what is POSTing to <span className="text-white/70">/api/events</span>. Stored in-memory only.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onBack?.()}
                className="rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-white/70 border-white/10 bg-black/20 hover:bg-white/10"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setEventsOpen((v) => !v)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-white/70 border-white/10 bg-black/20 ${eventsOpen ? 'bg-white/10' : 'hover:bg-white/10'}`}
              >
                {eventsOpen ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {eventsOpen ? (
            <div className="mt-4">
              {eventsError ? (
                <div className="text-[11px] text-neon-red break-words">Events error: {eventsError}</div>
              ) : null}
              <div className="utility-group overflow-hidden">
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

                <div className="max-h-[calc(100dvh-280px)] md:max-h-[520px] overflow-auto">
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

export default EventsPanel;
