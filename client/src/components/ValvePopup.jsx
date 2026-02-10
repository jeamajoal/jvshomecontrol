import React, { useCallback, useState } from 'react';
import { Droplets, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';

/**
 * ValvePopup
 *
 * Controller for water valves.
 */
export default function ValvePopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(false);

  const attrs = device || {};
  const valveState = String(attrs.valve || '').toLowerCase();
  const isOpen = valveState === 'open';

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    setBusy(true);
    try { await onCommand(device.id, cmd, args); }
    finally { setBusy(false); }
  }, [onCommand, device?.id]);

  return (
    <DevicePopupShell title={control?.label || 'Valve'} subtitle="Water Valve" open={open} onClose={onClose} uiScheme={uiScheme}>
      <div className="text-center mb-5">
        <Droplets className={`w-14 h-14 mx-auto ${isOpen ? 'text-cyan-400' : 'text-white/30'}`} />
        <div className={`mt-2 text-sm font-bold uppercase tracking-wider ${isOpen ? 'text-cyan-400' : 'text-white/40'}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (valveState || 'Unknown')}
        </div>
      </div>

      <div className="flex gap-2">
        {control?.canOpen !== false ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run('open')}
            className={`flex-1 rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40
              ${isOpen ? 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
          >
            Open
          </button>
        ) : null}
        {control?.canClose !== false ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run('close')}
            className={`flex-1 rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40
              ${!isOpen ? 'text-green-400 border-green-400/40 bg-green-400/10' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
          >
            Close
          </button>
        ) : null}
      </div>
    </DevicePopupShell>
  );
}
