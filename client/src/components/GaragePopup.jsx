import React, { useCallback, useState } from 'react';
import { DoorOpen, DoorClosed, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';

/**
 * GaragePopup
 *
 * Controller for garage doors. Shows door state + open/close buttons.
 */
export default function GaragePopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(false);

  const attrs = device || {};
  const doorState = String(attrs.door || control?.state || '').toLowerCase();
  const isOpen = doorState === 'open' || doorState === 'opening';

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    setBusy(true);
    try { await onCommand(device.id, cmd, args); }
    finally { setBusy(false); }
  }, [onCommand, device?.id]);

  const stateLabel = {
    open: 'Open',
    closed: 'Closed',
    opening: 'Opening…',
    closing: 'Closing…',
  };

  return (
    <DevicePopupShell title={control?.label || 'Garage Door'} subtitle="Garage" open={open} onClose={onClose} uiScheme={uiScheme}>
      {/* Door state */}
      <div className="text-center mb-5">
        {isOpen ? (
          <DoorOpen className="w-14 h-14 mx-auto text-amber-400" />
        ) : (
          <DoorClosed className="w-14 h-14 mx-auto text-green-400" />
        )}
        <div className={`mt-2 text-sm font-bold uppercase tracking-wider ${isOpen ? 'text-amber-400' : 'text-green-400'}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (stateLabel[doorState] || doorState || 'Unknown')}
        </div>
      </div>

      {/* Open / Close */}
      <div className="flex gap-2">
        {control?.canOpen !== false ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run('open')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40
              ${isOpen ? 'text-amber-400 border-amber-400/40 bg-amber-400/10' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
          >
            <DoorOpen className="w-4 h-4" /> Open
          </button>
        ) : null}
        {control?.canClose !== false ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => run('close')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40
              ${!isOpen ? 'text-green-400 border-green-400/40 bg-green-400/10' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
          >
            <DoorClosed className="w-4 h-4" /> Close
          </button>
        ) : null}
      </div>
    </DevicePopupShell>
  );
}
