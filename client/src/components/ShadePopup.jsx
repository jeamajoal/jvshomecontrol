import React, { useCallback, useState } from 'react';
import { Blinds, ArrowUp, ArrowDown, Square, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';

const PRESETS = [
  { pct: 0, label: 'Closed' },
  { pct: 25, label: '25%' },
  { pct: 50, label: 'Half' },
  { pct: 75, label: '75%' },
  { pct: 100, label: 'Open' },
];

export default function ShadePopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(false);

  const attrs = device || {};
  const position = Number(attrs.position ?? control?.position ?? 0);
  const shadeState = String(attrs.windowShade || control?.state || '').toLowerCase();

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    setBusy(true);
    try { await onCommand(device.id, cmd, args); }
    finally { setBusy(false); }
  }, [onCommand, device?.id]);

  return (
    <DevicePopupShell title={control?.label || 'Shade'} subtitle="Window Shade" open={open} onClose={onClose} uiScheme={uiScheme}>
      {/* Position indicator */}
      <div className="text-center mb-4">
        <Blinds className="w-10 h-10 mx-auto text-white/60" />
        <div className="mt-2 text-2xl font-black tabular-nums text-white">
          {busy ? <Loader2 className="w-5 h-5 animate-spin inline" /> : `${Math.round(position)}%`}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
          {shadeState || (position > 50 ? 'open' : position > 0 ? 'partially open' : 'closed')}
        </div>
      </div>

      {/* Position presets */}
      <div className="flex gap-1.5 mb-4">
        {PRESETS.map((p) => {
          const active = Math.abs(position - p.pct) < 3;
          return (
            <button
              key={p.pct}
              type="button"
              disabled={disabled || busy}
              onClick={() => run('setPosition', [p.pct])}
              className={`flex-1 rounded-xl border px-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40
                ${active ? 'text-amber-400 border-amber-400/40 bg-amber-400/10' : 'border-white/10 text-white/40 hover:bg-white/5'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Open / Close / Stop */}
      <div className="flex gap-2">
        {control?.canOpen !== false ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run('open')}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-white/60 hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <ArrowUp className="w-3.5 h-3.5" /> Open
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => run('stopPositionChange')}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-white/60 hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          <Square className="w-3 h-3" /> Stop
        </button>
        {control?.canClose !== false ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run('close')}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-white/60 hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <ArrowDown className="w-3.5 h-3.5" /> Close
          </button>
        ) : null}
      </div>
    </DevicePopupShell>
  );
}
