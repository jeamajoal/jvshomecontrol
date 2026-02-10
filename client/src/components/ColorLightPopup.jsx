import React, { useCallback, useState, useMemo } from 'react';
import { Palette, Sun, Thermometer, Droplets, Loader2 } from 'lucide-react';
import DevicePopupShell from './DevicePopupShell';
import ControlSlider from './ControlSlider';
import ColorWheel from './ColorWheel';

/**
 * ColorLightPopup
 *
 * Full-featured controller for RGB / CT / dimmer lights.
 * Renders whichever controls the device supports:
 *   - Brightness slider (setLevel)
 *   - Hue color wheel (setHue / setColor)
 *   - Saturation slider (setSaturation)
 *   - Color temperature slider (setColorTemperature)
 */
export default function ColorLightPopup({ open, onClose, device, control, onCommand, disabled, uiScheme }) {
  const [busy, setBusy] = useState(new Set());

  const attrs = device || {};
  const commands = Array.isArray(attrs.commands) ? attrs.commands : [];
  const cmdSet = useMemo(() => new Set(commands), [commands]);

  const level = Number(attrs.level ?? 0);
  const hue = Number(attrs.hue ?? 0);
  const saturation = Number(attrs.saturation ?? 100);
  const colorTemp = Number(attrs.colorTemperature ?? 4000);

  const hasLevel = cmdSet.has('setLevel');
  const hasHue = cmdSet.has('setHue') || cmdSet.has('setColor');
  const hasSat = cmdSet.has('setSaturation');
  const hasCT = cmdSet.has('setColorTemperature');

  const run = useCallback(async (cmd, args = []) => {
    if (!onCommand || !device?.id) return;
    setBusy((p) => new Set(p).add(cmd));
    try { await onCommand(device.id, cmd, args); }
    finally { setBusy((p) => { const n = new Set(p); n.delete(cmd); return n; }); }
  }, [onCommand, device?.id]);

  return (
    <DevicePopupShell title={control?.label || 'Light'} subtitle="Color Light" open={open} onClose={onClose} uiScheme={uiScheme}>
      {/* Color wheel */}
      {hasHue ? (
        <div className="mb-4 flex justify-center">
          <ColorWheel
            hue={hue}
            saturation={saturation}
            disabled={disabled}
            onChange={() => {}}
            onChangeEnd={(h) => run(cmdSet.has('setHue') ? 'setHue' : 'setColor', [h])}
          />
        </div>
      ) : null}

      <div className="space-y-4">
        {/* Brightness */}
        {hasLevel ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold inline-flex items-center gap-1.5">
                <Sun className="w-3 h-3" /> Brightness
              </span>
              <span className="text-xs font-bold tabular-nums text-white/70">{Math.round(level)}%</span>
            </div>
            <div className="flex justify-center">
              <ControlSlider
                value={level}
                min={0}
                max={100}
                step={1}
                color="#FBBF24"
                disabled={disabled}
                onChange={() => {}}
                onChangeEnd={(v) => run('setLevel', [Math.round(v)])}
              />
            </div>
          </div>
        ) : null}

        {/* Saturation */}
        {hasSat ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold inline-flex items-center gap-1.5">
                <Droplets className="w-3 h-3" /> Saturation
              </span>
              <span className="text-xs font-bold tabular-nums text-white/70">{Math.round(saturation)}%</span>
            </div>
            <div className="flex justify-center">
              <ControlSlider
                value={saturation}
                min={0}
                max={100}
                step={1}
                color="#EC4899"
                disabled={disabled}
                onChange={() => {}}
                onChangeEnd={(v) => run('setSaturation', [Math.round(v)])}
              />
            </div>
          </div>
        ) : null}

        {/* Color temperature */}
        {hasCT ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold inline-flex items-center gap-1.5">
                <Thermometer className="w-3 h-3" /> Color Temp
              </span>
              <span className="text-xs font-bold tabular-nums text-white/70">{Math.round(colorTemp)}K</span>
            </div>
            <div className="flex justify-center">
              <ControlSlider
                value={colorTemp}
                min={2700}
                max={6500}
                step={100}
                color="#F97316"
                disabled={disabled}
                onChange={() => {}}
                onChangeEnd={(v) => run('setColorTemperature', [Math.round(v)])}
              />
            </div>
          </div>
        ) : null}
      </div>
    </DevicePopupShell>
  );
}
