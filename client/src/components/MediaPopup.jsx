import React, { useCallback, useState, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Square, Volume2, VolumeX, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';
import ControlSlider from './ControlSlider';

/**
 * MediaPopup
 *
 * Full-featured controller for media players / Chromecasts / speakers / TVs.
 * Shows transport controls, volume, track info.
 */
export default function MediaPopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(new Set());

  const attrs = device || {};
  const commands = Array.isArray(attrs.commands) ? attrs.commands : [];
  const cmdSet = useMemo(() => new Set(commands), [commands]);

  const transport = String(attrs.transportStatus || attrs.playbackStatus || attrs.status || '').toLowerCase();
  const isPlaying = transport === 'playing';
  const volume = Number(attrs.volume ?? 50);
  const muted = String(attrs.mute || '').toLowerCase() === 'muted';
  const track = String(attrs.trackDescription || attrs.trackData || '').trim();

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    setBusy((p) => new Set(p).add(cmd));
    try { await onCommand(device.id, cmd, args); }
    finally { setBusy((p) => { const n = new Set(p); n.delete(cmd); return n; }); }
  }, [onCommand, device?.id]);

  return (
    <DevicePopupShell title={control?.label || 'Media'} subtitle="Media Player" open={open} onClose={onClose} uiScheme={uiScheme}>
      {/* Track info */}
      {track ? (
        <div className="text-center mb-4 px-2">
          <div className="text-xs text-white/50 truncate">{track}</div>
        </div>
      ) : null}

      {/* Transport status */}
      <div className="text-center mb-4">
        <div className={`text-xs font-bold uppercase tracking-wider ${isPlaying ? 'text-green-400' : 'text-white/40'}`}>
          {transport || 'stopped'}
        </div>
      </div>

      {/* Transport buttons */}
      <div className="flex items-center justify-center gap-3 mb-5">
        {cmdSet.has('previousTrack') ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => run('previousTrack')}
            className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <SkipBack className="w-4 h-4" />
          </button>
        ) : null}

        {cmdSet.has('play') || cmdSet.has('pause') ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => run(isPlaying ? 'pause' : 'play')}
            className={`w-14 h-14 rounded-full border flex items-center justify-center transition-colors disabled:opacity-40
              ${isPlaying ? 'border-green-400/40 bg-green-400/10 text-green-400' : 'border-white/20 bg-white/5 text-white/70 hover:bg-white/10'}`}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </button>
        ) : null}

        {cmdSet.has('stop') ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => run('stop')}
            className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : null}

        {cmdSet.has('nextTrack') ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => run('nextTrack')}
            className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Volume */}
      {cmdSet.has('setVolume') ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold inline-flex items-center gap-1.5">
              {muted ? <VolumeX className="w-3 h-3 text-red-400" /> : <Volume2 className="w-3 h-3" />}
              Volume
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tabular-nums text-white/70">{Math.round(volume)}%</span>
              {(cmdSet.has('mute') || cmdSet.has('unmute')) ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => run(muted ? 'unmute' : 'mute')}
                  className={`rounded-lg px-2 py-0.5 text-[9px] font-bold uppercase border transition-colors disabled:opacity-40
                    ${muted ? 'text-red-400 border-red-400/30 bg-red-400/10' : 'text-white/40 border-white/10 hover:bg-white/5'}`}
                >
                  {muted ? 'Muted' : 'Mute'}
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex justify-center">
            <ControlSlider
              value={volume}
              min={0}
              max={100}
              step={1}
              color="#22D3EE"
              disabled={disabled}
              onChange={() => {}}
              onChangeEnd={(v) => run('setVolume', [Math.round(v)])}
            />
          </div>
        </div>
      ) : null}
    </DevicePopupShell>
  );
}
