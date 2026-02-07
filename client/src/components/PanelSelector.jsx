import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid } from 'lucide-react';
import { useAppState } from '../appState';

/**
 * A discrete panel profile selector that appears in the App header.
 *
 * Renders as a compact pill/button showing the active panel name.
 * Clicking it opens a dropdown with all available panel profiles
 * for quick switching. Hidden when no profiles are configured.
 */
export default function PanelSelector() {
  const ctx = useAppState();
  const config = ctx?.config;
  const panelName = String(ctx?.panelName ?? '').trim();
  const setPanelName = ctx?.setPanelName;

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const profiles = (config?.ui?.panelProfiles && typeof config.ui.panelProfiles === 'object')
    ? config.ui.panelProfiles
    : {};
  const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));

  // Don't render if there are no profiles
  if (!names.length) return null;

  const userPanels = names.filter((n) => !profiles[n]?._preset);
  const presetPanels = names.filter((n) => profiles[n]?._preset);

  const select = (name) => {
    if (setPanelName) setPanelName(name);
    setOpen(false);

    // Sync URL without triggering a page reload
    try {
      const url = new URL(window.location.href);
      if (name) {
        url.searchParams.set('panel', name);
      } else {
        url.searchParams.delete('panel');
      }
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Panel profile: ${panelName || 'Default'}`}
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70 hover:bg-white/10 hover:text-white/90 transition-colors select-none"
      >
        <LayoutGrid size={13} className="opacity-60" />
        <span className="max-w-[120px] truncate">{panelName || 'Default'}</span>
        <ChevronDown size={12} className={`opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Panel profiles"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] max-w-[260px] max-h-[320px] overflow-y-auto rounded-xl border border-white/15 bg-black/90 backdrop-blur-xl shadow-2xl py-1"
        >
          {userPanels.length > 0 ? (
            <>
              <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">
                Your Panels
              </div>
              {userPanels.map((name) => (
                <button
                  key={name}
                  role="option"
                  aria-selected={name === panelName}
                  onClick={() => select(name)}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors truncate ${
                    name === panelName
                      ? 'text-white bg-white/10'
                      : 'text-white/70 hover:bg-white/5 hover:text-white/90'
                  }`}
                >
                  {name}
                </button>
              ))}
            </>
          ) : null}

          {presetPanels.length > 0 ? (
            <>
              <div className={`px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35 ${userPanels.length > 0 ? 'border-t border-white/10 mt-1' : ''}`}>
                Presets
              </div>
              {presetPanels.map((name) => (
                <button
                  key={name}
                  role="option"
                  aria-selected={name === panelName}
                  onClick={() => select(name)}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors truncate ${
                    name === panelName
                      ? 'text-white bg-white/10'
                      : 'text-white/70 hover:bg-white/5 hover:text-white/90'
                  }`}
                >
                  {name}
                  <span className="ml-1 text-[9px] text-white/30">(preset)</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
