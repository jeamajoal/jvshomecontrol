import React, { useCallback, useMemo, useState } from 'react';
import { Thermometer, Flame, Snowflake, Wind, Power, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';

const MODES = [
  { id: 'heat', label: 'Heat', Icon: Flame, color: 'text-orange-400 border-orange-400/40 bg-orange-400/10' },
  { id: 'cool', label: 'Cool', Icon: Snowflake, color: 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10' },
  { id: 'auto', label: 'Auto', Icon: Thermometer, color: 'text-green-400 border-green-400/40 bg-green-400/10' },
  { id: 'emergency heat', label: 'Emrg Heat', Icon: Flame, color: 'text-red-400 border-red-400/40 bg-red-400/10' },
  { id: 'off', label: 'Off', Icon: Power, color: 'text-white/50 border-white/20 bg-white/5' },
];

const FAN_MODES = [
  { id: 'auto', label: 'Auto' },
  { id: 'on', label: 'On' },
  { id: 'circulate', label: 'Circulate' },
];

const OP_STATE_LABELS = {
  heating: { label: 'Heating', color: 'text-orange-400' },
  cooling: { label: 'Cooling', color: 'text-cyan-400' },
  idle: { label: 'Idle', color: 'text-white/50' },
  'pending heat': { label: 'Pending Heat', color: 'text-orange-300' },
  'pending cool': { label: 'Pending Cool', color: 'text-cyan-300' },
  'fan only': { label: 'Fan Only', color: 'text-green-400' },
};

function SetpointAdjuster({ label, value, color, onUp, onDown, disabled, busy }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-xs uppercase tracking-wider text-white/50 font-semibold">{label}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={onDown}
          className="w-8 h-8 rounded-lg border border-white/15 text-white/70 hover:bg-white/10 flex items-center justify-center text-lg font-bold transition-colors disabled:opacity-40"
        >
          −
        </button>
        <span className={`text-lg font-extrabold tabular-nums min-w-[3ch] text-center ${color}`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : Math.round(value)}°
        </span>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={onUp}
          className="w-8 h-8 rounded-lg border border-white/15 text-white/70 hover:bg-white/10 flex items-center justify-center text-lg font-bold transition-colors disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function ThermostatPopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(new Set());

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    const key = `${cmd}:${JSON.stringify(args)}`;
    setBusy((p) => new Set(p).add(key));
    try { await onCommand(device.id, cmd, args); }
    finally {
      setBusy((p) => { const n = new Set(p); n.delete(key); return n; });
    }
  }, [onCommand, device?.id]);

  const mode = control?.thermostatMode || 'off';
  const fanMode = control?.thermostatFanMode || 'auto';
  const opState = control?.thermostatOperatingState || 'idle';
  const temp = control?.temperature;
  const heat = control?.heatingSetpoint;
  const cool = control?.coolingSetpoint;
  const humidity = control?.humidity;

  const opInfo = OP_STATE_LABELS[opState] || { label: opState, color: 'text-white/50' };

  return (
    <DevicePopupShell title={control?.label || 'Thermostat'} subtitle="Thermostat" open={open} onClose={onClose} uiScheme={uiScheme}>
      {/* Current temperature */}
      <div className="text-center mb-4">
        <div className="text-4xl font-black tabular-nums text-white">
          {temp !== null && temp !== undefined ? `${Math.round(temp)}°` : '—'}
        </div>
        {humidity !== null && humidity !== undefined ? (
          <div className="text-xs text-white/40 mt-1">{Math.round(humidity)}% humidity</div>
        ) : null}
        <div className={`text-xs mt-1 font-semibold uppercase tracking-wider ${opInfo.color}`}>
          {opInfo.label}
        </div>
      </div>

      {/* Setpoints */}
      <div className="space-y-2 mb-4">
        {control?.canSetHeating && heat !== null && heat !== undefined ? (
          <SetpointAdjuster
            label="Heat to"
            value={heat}
            color="text-orange-400"
            disabled={disabled}
            busy={busy.size > 0}
            onUp={() => run('setHeatingSetpoint', [Math.round(heat) + 1])}
            onDown={() => run('setHeatingSetpoint', [Math.round(heat) - 1])}
          />
        ) : null}
        {control?.canSetCooling && cool !== null && cool !== undefined ? (
          <SetpointAdjuster
            label="Cool to"
            value={cool}
            color="text-cyan-400"
            disabled={disabled}
            busy={busy.size > 0}
            onUp={() => run('setCoolingSetpoint', [Math.round(cool) + 1])}
            onDown={() => run('setCoolingSetpoint', [Math.round(cool) - 1])}
          />
        ) : null}
      </div>

      {/* Mode selector */}
      {control?.canSetMode ? (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-2">Mode</div>
          <div className="grid grid-cols-3 gap-1.5">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled || busy.size > 0}
                  onClick={() => run('setThermostatMode', [m.id])}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40
                    ${active ? m.color : 'border-white/10 text-white/40 hover:bg-white/5'}`}
                >
                  <m.Icon className="w-4 h-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Fan mode */}
      {control?.canSetFanMode ? (
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-2">
            <span className="inline-flex items-center gap-1.5"><Wind className="w-3 h-3" /> Fan</span>
          </div>
          <div className="flex gap-1.5">
            {FAN_MODES.map((fm) => {
              const active = fanMode === fm.id;
              return (
                <button
                  key={fm.id}
                  type="button"
                  disabled={disabled || busy.size > 0}
                  onClick={() => run('setThermostatFanMode', [fm.id])}
                  className={`flex-1 rounded-xl border px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40
                    ${active ? 'text-green-400 border-green-400/40 bg-green-400/10' : 'border-white/10 text-white/40 hover:bg-white/5'}`}
                >
                  {fm.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </DevicePopupShell>
  );
}
