import React, { useCallback, useState } from 'react';
import { Fan, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';

const SPEEDS = [
  { id: 'off', label: 'Off' },
  { id: 'low', label: 'Low' },
  { id: 'medium-low', label: 'Med-Lo' },
  { id: 'medium', label: 'Med' },
  { id: 'medium-high', label: 'Med-Hi' },
  { id: 'high', label: 'High' },
  { id: 'auto', label: 'Auto' },
];

export default function FanSpeedPopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(false);

  const attrs = device || {};
  const currentSpeed = String(attrs.speed || control?.speed || '').toLowerCase();
  const hasSetSpeed = control?.commands?.includes?.('setSpeed') || attrs.commands?.includes?.('setSpeed') || true;
  const hasCycleSpeed = attrs.commands?.includes?.('cycleSpeed');

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    setBusy(true);
    try { await onCommand(device.id, cmd, args); }
    finally { setBusy(false); }
  }, [onCommand, device?.id]);

  return (
    <DevicePopupShell title={control?.label || 'Fan'} subtitle="Fan Speed" open={open} onClose={onClose} uiScheme={uiScheme}>
      {/* Current speed indicator */}
      <div className="text-center mb-4">
        <Fan className={`w-10 h-10 mx-auto ${currentSpeed !== 'off' ? 'text-cyan-400 animate-spin' : 'text-white/30'}`} style={currentSpeed !== 'off' ? { animationDuration: '2s' } : undefined} />
        <div className="mt-2 text-sm font-bold uppercase tracking-wider text-white/70">
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (currentSpeed || 'Unknown')}
        </div>
      </div>

      {/* Speed buttons */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {SPEEDS.map((s) => {
          const active = currentSpeed === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled || busy}
              onClick={() => run('setSpeed', [s.id])}
              className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40
                ${active ? 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 text-white/40 hover:bg-white/5'}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Cycle speed button */}
      {hasCycleSpeed ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => run('cycleSpeed')}
          className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/50 hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          Cycle Speed
        </button>
      ) : null}
    </DevicePopupShell>
  );
}
