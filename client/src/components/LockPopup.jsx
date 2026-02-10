import React, { useCallback, useState } from 'react';
import { Lock, LockOpen, Shield, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';

/**
 * LockPopup
 *
 * Controller for smart locks. Shows lock state + lock/unlock buttons.
 */
export default function LockPopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(false);

  const attrs = device || {};
  const lockState = String(attrs.lock || '').toLowerCase();
  const isLocked = lockState === 'locked';
  const battery = attrs.battery !== undefined ? Number(attrs.battery) : null;

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    setBusy(true);
    try { await onCommand(device.id, cmd, args); }
    finally { setBusy(false); }
  }, [onCommand, device?.id]);

  return (
    <DevicePopupShell title={control?.label || 'Lock'} subtitle="Smart Lock" open={open} onClose={onClose} uiScheme={uiScheme}>
      {/* Lock state */}
      <div className="text-center mb-5">
        {isLocked ? (
          <Lock className="w-14 h-14 mx-auto text-green-400" />
        ) : (
          <LockOpen className="w-14 h-14 mx-auto text-amber-400" />
        )}
        <div className={`mt-2 text-sm font-bold uppercase tracking-wider ${isLocked ? 'text-green-400' : 'text-amber-400'}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (lockState || 'Unknown')}
        </div>
        {battery !== null ? (
          <div className="mt-1 text-[10px] text-white/40">Battery: {Math.round(battery)}%</div>
        ) : null}
      </div>

      {/* Lock / Unlock buttons */}
      <div className="flex gap-2">
        {control?.canLock !== false ? (
          <button
            type="button"
            disabled={disabled || busy || isLocked}
            onClick={() => run('lock')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40
              ${isLocked ? 'text-green-400 border-green-400/40 bg-green-400/10' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
          >
            <Lock className="w-4 h-4" /> Lock
          </button>
        ) : null}
        {control?.canUnlock !== false ? (
          <button
            type="button"
            disabled={disabled || busy || !isLocked}
            onClick={() => run('unlock')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40
              ${!isLocked ? 'text-amber-400 border-amber-400/40 bg-amber-400/10' : 'border-white/10 text-white/50 hover:bg-white/5'}`}
          >
            <LockOpen className="w-4 h-4" /> Unlock
          </button>
        ) : null}
      </div>
    </DevicePopupShell>
  );
}
