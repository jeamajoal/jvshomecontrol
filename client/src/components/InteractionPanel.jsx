import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Power, SlidersHorizontal,
} from 'lucide-react';

import { getUiScheme } from '../uiScheme';
import { API_HOST } from '../apiHost';
import { useAppState } from '../appState';
import { buildRoomsWithStatuses, getCtrlVisibleDeviceIdSet, getDeviceCommandAllowlist, getDeviceInfoMetricAllowlist } from '../deviceSelectors';
import { filterCommandSchemasByAllowlist, inferInternalDeviceType, inferControlIconIds, mapDeviceToControls, normalizeCommandSchemas } from '../deviceMapping';
import { getDeviceTypeIconSrc } from '../deviceIcons';
import { asNumber, asText, isSafeInfoMetricKey, isDisplayableInfoValue, formatInfoMetricLabel, formatInfoMetricValue, sortInfoMetricKeys } from '../utils';
import { useFitScale } from '../hooks/useLayout';
import DeviceInfoGrid from './DeviceInfoGrid';
import InlineSvg from './InlineSvg';
import InteractiveControlIcon from './InteractiveControlIcon';
import HlsPlayer from './HlsPlayer';

const CONTROLS_MASONRY_MIN_WIDTH_PX_DEFAULT = 360;
const CONTROLS_MASONRY_ROW_HEIGHT_PX_DEFAULT = 10;

async function sendDeviceCommand(deviceId, command, args = []) {
  const cleanedArgs = Array.isArray(args)
    ? args
      .filter((a) => a !== null && a !== undefined)
      .filter((a) => (typeof a === 'string') || (typeof a === 'number' && Number.isFinite(a)))
    : [];

  const res = await fetch(`${API_HOST}/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args: cleanedArgs }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Command failed (${res.status})`);
  }
}

/** Returns a Lucide icon component appropriate for the internal device type. */
const SwitchTile = ({
  label,
  iconSrc,
  controlIconIds,
  device,
  isOn,
  infoItems,
  disabled,
  busyOn,
  busyOff,
  busyToggle,
  canOn,
  canOff,
  canToggle,
  onOn,
  onOff,
  onToggle,
  onCommand,
  controlStyle,
  animationStyle,
  uiScheme,
}) => {
  const anyBusy = Boolean(busyOn || busyOff || busyToggle);
  const mode = (controlStyle === 'buttons' || controlStyle === 'switch' || controlStyle === 'auto') ? controlStyle : 'auto';
  const pulseOn = animationStyle === 'pulse' && isOn === true && !anyBusy;

  const handleToggle = () => {
    if (isOn === true && canOff) return onOff();
    if (isOn === false && canOn) return onOn();
    if (canToggle) return onToggle();
    if (isOn === true) return onOff();
    return onOn();
  };

  const subtitle = (typeof isOn === 'boolean') ? (isOn ? 'On' : 'Off') : 'Command only';

  // Interactive control icons take precedence over legacy SVG
  const hasControlIcons = Array.isArray(controlIconIds) && controlIconIds.length > 0;
  const hasInteractiveSvg = !hasControlIcons && Boolean(iconSrc);

  const handleSvgCommand = (rawCmd, args) => {
    const cmd = String(rawCmd || '').trim();
    if (!cmd) return;
    const lower = cmd.toLowerCase();
    if (lower === 'on' && canOn) return onOn();
    if (lower === 'off' && canOff) return onOff();
    if (lower === 'toggle' && canToggle) return onToggle();
    // For switch tiles, only allow standard power commands from SVG hotspots.
  };

  return (
    <div className={`w-full glass-panel border-0 shadow-none p-2 md:p-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 text-left">
          <div
            className="uppercase tracking-[0.2em] jvs-secondary-text-strong text-white font-semibold"
            style={{ fontSize: 'calc(11px * var(--jvs-secondary-text-size-scale, 1))' }}
          >
            <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
              <span className="truncate">{label}</span>
            </span>
          </div>
          <div
            className="mt-1 jvs-secondary-text text-white"
            style={{ fontSize: 'calc(12px * var(--jvs-secondary-text-size-scale, 1))' }}
          >
            {subtitle}
          </div>
        </div>
        {hasControlIcons || hasInteractiveSvg ? null : (
          <div className="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center">
            {anyBusy ? (
              <Loader2 className={`w-6 h-6 md:w-7 md:h-7 animate-spin jvs-icon ${uiScheme?.metricIcon || 'text-neon-blue'}`} />
            ) : (
              <Power className={`w-6 h-6 md:w-7 md:h-7 text-white/60 ${pulseOn ? 'animate-pulse' : ''}`} />
            )}
          </div>
        )}
      </div>

      <DeviceInfoGrid items={infoItems} compact />

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Interactive control icons - renders all assigned icons */}
        {hasControlIcons && device ? (
          <div className="w-full flex flex-wrap justify-center gap-2">
            {controlIconIds.map((iconId) => (
              <InteractiveControlIcon
                key={iconId}
                iconId={iconId}
                device={device}
                onCommand={onCommand}
                className="w-16 h-16"
                disabled={disabled || anyBusy}
              />
            ))}
          </div>
        ) : null}

        {hasInteractiveSvg ? (
          <button
            type="button"
            disabled={disabled || anyBusy}
            onClick={handleToggle}
            className="w-fit mx-auto inline-flex items-center justify-center bg-transparent p-0 active:scale-[0.99] disabled:opacity-100"
            aria-pressed={isOn === true ? 'true' : 'false'}
          >
            <InlineSvg
              src={iconSrc}
              rootClassName={isOn === true ? 'is-on' : ''}
              onCommand={handleSvgCommand}
              className="mx-auto w-[92px] h-[92px]"
              style={{ display: 'block' }}
              role="img"
              ariaLabel={`${label} ${isOn ? 'on' : 'off'}`}
            />
          </button>
        ) : null}

        {!hasControlIcons && !hasInteractiveSvg && mode === 'switch' ? (
          <button
            type="button"
            disabled={disabled || anyBusy}
            onClick={handleToggle}
            className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-3 transition-colors active:scale-[0.99] ${(disabled || anyBusy) ? 'opacity-50' : 'hover:bg-white/5'} ${
              isOn === true
                ? (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10')
                : 'text-white/70 border-white/10 bg-black/20'
            }`}
            aria-pressed={isOn === true ? 'true' : 'false'}
          >
            <div className="text-xs font-bold uppercase tracking-[0.18em]">
              {anyBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (isOn === true ? 'On' : 'Off')}
            </div>

            <div
              className={`relative w-14 h-8 rounded-full border transition-colors ${
                isOn === true
                  ? (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10')
                  : 'border-white/10 bg-black/30'
              } ${pulseOn ? 'animate-pulse' : ''}`}
            >
              <div
                className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white/70 transition-transform ${
                  isOn === true ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
        ) : null}

        {!hasControlIcons && !hasInteractiveSvg && mode !== 'switch' && canOn ? (
          <button
            type="button"
            disabled={disabled || busyOn}
            onClick={onOn}
            className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10'} ${(disabled || busyOn) ? 'opacity-50' : 'hover:bg-white/5'}`}
          >
            {busyOn ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'On'}
          </button>
        ) : null}

        {!hasControlIcons && !hasInteractiveSvg && mode !== 'switch' && canOff ? (
          <button
            type="button"
            disabled={disabled || busyOff}
            onClick={onOff}
            className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10'} ${(disabled || busyOff) ? 'opacity-50' : 'hover:bg-white/5'}`}
          >
            {busyOff ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Off'}
          </button>
        ) : null}

        {!hasControlIcons && !hasInteractiveSvg && mode !== 'switch' && !canOn && !canOff && canToggle ? (
          <button
            type="button"
            disabled={disabled || busyToggle}
            onClick={onToggle}
            className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10'} ${(disabled || busyToggle) ? 'opacity-50' : 'hover:bg-white/5'}`}
          >
            {busyToggle ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Toggle'}
          </button>
        ) : null}
      </div>
    </div>
  );
};

const LevelTile = ({ 
  label, 
  iconSrc, 
  controlIconIds,
  deviceId,
  device,
  isOn, 
  level, 
  infoItems, 
  disabled, 
  busy, 
  onToggle, 
  onSetLevel,
  onCommand,
  uiScheme,
}) => {
  const levelNum = asNumber(level);
  const displayLevel = levelNum === null ? 0 : Math.max(0, Math.min(100, Math.round(levelNum)));
  const [draft, setDraft] = useState(displayLevel);

  useEffect(() => {
    setDraft(displayLevel);
  }, [displayLevel]);

  // Use interactive control icons if configured
  const hasControlIcons = Array.isArray(controlIconIds) && controlIconIds.length > 0;

  return (
    <div className={`w-full glass-panel border-0 shadow-none p-2 md:p-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div
            className="uppercase tracking-[0.2em] jvs-secondary-text-strong text-white font-semibold truncate"
            style={{ fontSize: 'calc(11px * var(--jvs-secondary-text-size-scale, 1))' }}
          >
            {label}
          </div>
          {hasControlIcons ? (
            <div
              className="mt-1 jvs-secondary-text text-white"
              style={{ fontSize: 'calc(12px * var(--jvs-secondary-text-size-scale, 1))' }}
            >
              {isOn ? 'On' : 'Off'} · {displayLevel}%
            </div>
          ) : (
            <div className="mt-1 flex items-baseline gap-3">
              <div
                className={`font-extrabold tracking-tight jvs-primary-text-strong ${isOn ? (uiScheme?.selectedText || 'text-neon-blue') : 'text-white'}`}
                style={{ fontSize: 'calc(24px * var(--jvs-primary-text-size-scale, 1))' }}
              >
                {isOn ? 'ON' : 'OFF'}
              </div>
              <div
                className="jvs-secondary-text-strong text-white font-bold"
                style={{ fontSize: 'calc(14px * var(--jvs-secondary-text-size-scale, 1))' }}
              >
                {displayLevel}%
              </div>
            </div>
          )}
        </div>

        {!hasControlIcons && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={onToggle}
            className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${
              isOn ? (uiScheme?.actionButton || 'text-neon-blue border-neon-blue/30 bg-neon-blue/10') : 'text-white/60 border-white/10 bg-white/5'
            } ${(disabled || busy) ? 'opacity-50' : 'hover:bg-white/10'}`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Toggle'}
          </button>
        )}
      </div>

      <DeviceInfoGrid items={infoItems} compact />

      {/* Interactive control icons - replaces both icon and slider when configured */}
      {hasControlIcons && device ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2 items-end">
          {controlIconIds.map((iconId) => (
            <InteractiveControlIcon
              key={iconId}
              iconId={iconId}
              device={device}
              onCommand={onCommand}
              className="w-16 h-20"
              disabled={disabled || busy}
            />
          ))}
        </div>
      ) : null}

      {/* Legacy: static icon display */}
      {!hasControlIcons && iconSrc ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={onToggle}
          className="mt-3 w-fit mx-auto inline-flex items-center justify-center bg-transparent p-0 active:scale-[0.99] disabled:opacity-100"
          aria-pressed={isOn === true ? 'true' : 'false'}
        >
          <InlineSvg
            src={iconSrc}
            rootClassName={isOn === true ? 'is-on' : ''}
            onCommand={(rawCmd, args) => {
              const cmd = String(rawCmd || '').trim();
              if (!cmd) return;
              const lower = cmd.toLowerCase();
              if (lower === 'toggle') return onToggle();
            }}
            className="mx-auto w-[92px] h-[92px]"
            style={{ display: 'block' }}
            role="img"
            ariaLabel={`${label} ${isOn ? 'on' : 'off'}`}
          />
        </button>
      ) : null}

      {/* Slider - only show if not using interactive control icons */}
      {!hasControlIcons && (
        <div className="mt-4">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={draft}
            disabled={disabled || busy}
            onChange={(e) => setDraft(Number(e.target.value))}
            onMouseUp={() => onSetLevel(draft)}
            onTouchEnd={() => onSetLevel(draft)}
            className="w-full"
          />
          <div
            className="mt-2 uppercase tracking-[0.2em] jvs-secondary-text text-white"
            style={{ fontSize: 'calc(10px * var(--jvs-secondary-text-size-scale, 1))' }}
          >
            Slide and release to set level
          </div>
        </div>
      )}
    </div>
  );
};

const InteractionPanel = ({ config: configProp, statuses: statusesProp, connected: connectedProp, uiScheme: uiSchemeProp }) => {
  const { viewportRef, contentRef, scale } = useFitScale({ heightOnly: true });

  const ctx = useAppState();
  const config = configProp ?? ctx?.config;
  const statuses = statusesProp ?? ctx?.statuses;
  const connected = connectedProp ?? ctx?.connected;
  const uiScheme = uiSchemeProp ?? ctx?.uiScheme;
  const resolvedUiScheme = useMemo(
    () => uiScheme || getUiScheme(config?.ui?.accentColorId),
    [uiScheme, config?.ui?.accentColorId],
  );

  const switchControlStyle = useMemo(() => {
    const raw = String(config?.ui?.deviceControlStyles?.switch?.controlStyle ?? '').trim().toLowerCase();
    if (raw === 'auto' || raw === 'buttons' || raw === 'switch') return raw;
    return 'auto';
  }, [config?.ui?.deviceControlStyles?.switch?.controlStyle]);

  const switchAnimationStyle = useMemo(() => {
    const raw = String(config?.ui?.deviceControlStyles?.switch?.animationStyle ?? '').trim().toLowerCase();
    if (raw === 'none' || raw === 'pulse') return raw;
    return 'none';
  }, [config?.ui?.deviceControlStyles?.switch?.animationStyle]);

  // Per-device control icon assignments
  const deviceControlIcons = useMemo(() => {
    const map = config?.ui?.deviceControlIcons;
    return (map && typeof map === 'object') ? map : {};
  }, [config?.ui?.deviceControlIcons]);

  // Helper to get control icon IDs for a device (returns array)
  const getDeviceControlIconIds = useCallback((deviceId) => {
    const id = String(deviceId || '').trim();
    const val = deviceControlIcons[id];
    if (!val) return [];
    if (Array.isArray(val)) return val.map((v) => String(v || '').trim()).filter(Boolean);
    return [String(val || '').trim()].filter(Boolean);
  }, [deviceControlIcons]);

  const ctrlVisibleDeviceIds = useMemo(() => getCtrlVisibleDeviceIdSet(config), [config]);

  const rooms = useMemo(() => {
    return buildRoomsWithStatuses(config, statuses, { ignoreVisibleRooms: true, deviceIdSet: ctrlVisibleDeviceIds });
  }, [config, statuses, ctrlVisibleDeviceIds]);

  const cardScalePct = useMemo(() => {
    const raw = Number(config?.ui?.cardScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.cardScalePct]);

  const contentScale = useMemo(() => {
    const raw = Number(cardScalePct);
    if (!Number.isFinite(raw)) return 1;
    return Math.max(0.5, Math.min(2, raw / 100));
  }, [cardScalePct]);

  const controlsMinWidthPx = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMinWidthPx);
    if (!Number.isFinite(raw) || raw <= 0) return CONTROLS_MASONRY_MIN_WIDTH_PX_DEFAULT;
    return Math.max(240, Math.min(1200, Math.round(raw)));
  }, [config?.ui?.homeRoomMinWidthPx]);

  const controlsRowHeightPx = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMasonryRowHeightPx);
    if (!Number.isFinite(raw)) return CONTROLS_MASONRY_ROW_HEIGHT_PX_DEFAULT;
    return Math.max(4, Math.min(40, Math.round(raw)));
  }, [config?.ui?.homeRoomMasonryRowHeightPx]);

  const controlsBackground = useMemo(() => {
    const raw = (config?.ui?.homeBackground && typeof config.ui.homeBackground === 'object')
      ? config.ui.homeBackground
      : {};

    const enabled = raw.enabled === true;
    const url = (raw.url === null || raw.url === undefined) ? null : String(raw.url).trim();
    const opacityRaw = Number(raw.opacityPct);
    const opacityPct = Number.isFinite(opacityRaw)
      ? Math.max(0, Math.min(100, Math.round(opacityRaw)))
      : 35;

    if (!enabled || !url) return { enabled: false, url: null, opacityPct };
    return { enabled: true, url, opacityPct };
  }, [config?.ui?.homeBackground]);

  const [controlsBackgroundImageError, setControlsBackgroundImageError] = useState(false);

  useEffect(() => {
    setControlsBackgroundImageError(false);
    if (!controlsBackground.enabled || !controlsBackground.url) return;

    const img = new Image();
    img.onerror = () => {
      setControlsBackgroundImageError(true);
    };
    img.src = controlsBackground.url;

    return () => {
      img.onerror = null;
    };
  }, [controlsBackground.enabled, controlsBackground.url]);

  const controlsGridRef = useRef(null);
  const controlsTileElsByIdRef = useRef({});
  const [controlsRowSpansById, setControlsRowSpansById] = useState(() => ({}));

  useEffect(() => {
    const gridEl = controlsGridRef.current;
    if (!gridEl) return;

    const getGapPx = () => {
      const styles = window.getComputedStyle(gridEl);
      const raw = parseFloat(styles.rowGap || styles.gap || '0');
      return Number.isFinite(raw) ? raw : 0;
    };

    let rafId = 0;

    const compute = () => {
      const gapPx = getGapPx();
      const rowUnit = controlsRowHeightPx + gapPx;

      const next = {};
      const keys = Array.isArray(rooms) && rooms.length
        ? rooms.map((r) => String(r?.room?.id ?? '')).filter(Boolean)
        : ['__empty__'];

      for (const key of keys) {
        const el = controlsTileElsByIdRef.current[key];
        if (!el) continue;
        const h = el.offsetHeight || 0;
        const span = rowUnit > 0
          ? Math.max(1, Math.ceil((h + gapPx) / rowUnit))
          : 1;
        next[key] = span;
      }

      setControlsRowSpansById((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length !== nextKeys.length) return next;
        for (const k of nextKeys) {
          if (prev[k] !== next[k]) return next;
        }
        return prev;
      });
    };

    const schedule = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(compute);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(gridEl);

    const keys = Array.isArray(rooms) && rooms.length
      ? rooms.map((r) => String(r?.room?.id ?? '')).filter(Boolean)
      : ['__empty__'];
    for (const key of keys) {
      const el = controlsTileElsByIdRef.current[key];
      if (el) ro.observe(el);
    }

    window.addEventListener('resize', schedule);

    return () => {
      window.removeEventListener('resize', schedule);
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [rooms, controlsRowHeightPx]);

  const controlsCameraPreviewsEnabled = useMemo(
    () => config?.ui?.controlsCameraPreviewsEnabled === true,
    [config?.ui?.controlsCameraPreviewsEnabled],
  );

  const cameraPreviewRefreshSeconds = useMemo(() => {
    const raw = Number(config?.ui?.cameraPreviewRefreshSeconds);
    if (!Number.isFinite(raw)) return 10;
    return Math.max(2, Math.min(120, Math.round(raw)));
  }, [config?.ui?.cameraPreviewRefreshSeconds]);

  const cameras = useMemo(
    () => (Array.isArray(config?.ui?.cameras) ? config.ui.cameras : []),
    [config?.ui?.cameras],
  );

  const topCameraIds = useMemo(
    () => (Array.isArray(config?.ui?.topCameraIds) ? config.ui.topCameraIds.map((v) => String(v || '').trim()).filter(Boolean) : []),
    [config?.ui?.topCameraIds],
  );

  const topCameraSize = useMemo(() => {
    const raw = String(config?.ui?.topCameraSize ?? '').trim().toLowerCase();
    if (raw === 'xs' || raw === 'sm' || raw === 'md' || raw === 'lg') return raw;
    return 'md';
  }, [config?.ui?.topCameraSize]);

  const visibleCameraIds = useMemo(
    () => (Array.isArray(config?.ui?.visibleCameraIds) ? config.ui.visibleCameraIds : []),
    [config?.ui?.visibleCameraIds],
  );

  const [cameraBrokenIds, setCameraBrokenIds] = useState(() => new Set());

  const [cameraTick, setCameraTick] = useState(0);
  useEffect(() => {
    if (!controlsCameraPreviewsEnabled) return;
    const ms = Math.max(2, Math.min(120, Number(cameraPreviewRefreshSeconds) || 10)) * 1000;
    const compute = () => setCameraTick(ms > 0 ? Math.floor(Date.now() / ms) : 0);
    compute();
    const id = setInterval(compute, ms);
    return () => clearInterval(id);
  }, [controlsCameraPreviewsEnabled, cameraPreviewRefreshSeconds]);

  const topCameras = useMemo(() => {
    if (!controlsCameraPreviewsEnabled) return [];
    const ids = Array.isArray(topCameraIds) ? topCameraIds : [];
    if (!ids.length) return [];

    const allow = Array.isArray(visibleCameraIds)
      ? visibleCameraIds.map((v) => String(v || '').trim()).filter(Boolean)
      : [];
    const allowSet = new Set(allow);
    const allowAll = allowSet.size === 0;

    const list = Array.isArray(cameras) ? cameras : [];
    const byId = new Map(list.map((c) => [String(c?.id || '').trim(), c]));

    return ids
      .map((idRaw) => {
        const id = String(idRaw || '').trim();
        if (!id) return null;
        const c = byId.get(id);
        if (!c || typeof c !== 'object') return null;
        const cid = String(c.id || '').trim();
        if (!cid) return null;
        const label = String(c.label || cid).trim() || cid;
        const enabled = c.enabled !== false;
        const hasSnapshot = c.hasSnapshot === true;
        const hasEmbed = c.hasEmbed === true && typeof c.embedUrl === 'string' && c.embedUrl.trim();
        const embedUrl = hasEmbed ? String(c.embedUrl).trim() : '';
        const hasRtsp = c.hasRtsp === true;
        const hasAnyPreview = Boolean(hasEmbed || hasRtsp || hasSnapshot);

        if (!enabled || !hasAnyPreview) return null;
        if (!allowAll && !allowSet.has(cid)) return null;

        return {
          id: cid,
          label,
          hasSnapshot,
          hasEmbed,
          embedUrl,
          hasRtsp,
        };
      })
      .filter(Boolean);
  }, [cameras, controlsCameraPreviewsEnabled, topCameraIds, visibleCameraIds]);

  const [commandSchemasById, setCommandSchemasById] = useState(() => ({}));
  const [commandArgDrafts, setCommandArgDrafts] = useState(() => ({}));

  const deviceIdsNeedingSchemas = useMemo(() => {
    const ids = [];
    for (const bucket of (Array.isArray(rooms) ? rooms : [])) {
      for (const d of (Array.isArray(bucket?.devices) ? bucket.devices : [])) {
        const id = asText(d?.id);
        if (!id) continue;
        // Only fetch schemas if the device is already reporting commands.
        const commandsRaw = Array.isArray(d?.status?.commands) ? d.status.commands : [];
        if (!commandsRaw.length) continue;
        if (Object.prototype.hasOwnProperty.call(commandSchemasById, id)) continue;
        ids.push(id);
      }
    }
    return ids;
  }, [rooms, commandSchemasById]);

  useEffect(() => {
    if (!connected) return;
    if (!deviceIdsNeedingSchemas.length) return;

    let cancelled = false;

    const runFetches = async () => {
      for (const id of deviceIdsNeedingSchemas) {
        try {
          const res = await fetch(`${API_HOST}/api/devices/${encodeURIComponent(id)}/commands`);
          if (!res.ok) continue;
          const json = await res.json().catch(() => null);
          const schemas = normalizeCommandSchemas(json?.commands);
          if (cancelled) return;
          setCommandSchemasById((prev) => {
            if (Object.prototype.hasOwnProperty.call(prev, id)) return prev;
            return { ...prev, [id]: schemas };
          });
        } catch {
          // best-effort
        }
      }
    };

    runFetches();
    return () => { cancelled = true; };
  }, [connected, deviceIdsNeedingSchemas]);

  const topCameraGridClassName = useMemo(() => {
    if (topCameraSize === 'lg') return 'grid-cols-1';
    if (topCameraSize === 'sm') return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    if (topCameraSize === 'xs') return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    return 'grid-cols-1 md:grid-cols-2';
  }, [topCameraSize]);

  const [busy, setBusy] = useState(() => new Set());

  const run = async (deviceId, command, args = []) => {
    const key = `${deviceId}:${command}`;
    setBusy((prev) => new Set(prev).add(key));
    try {
      await sendDeviceCommand(deviceId, command, args);
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const finalScale = useMemo(() => {
    const s = Number(scale);
    const c = Number(contentScale);
    if (!Number.isFinite(s) || !Number.isFinite(c)) return 1;
    return s * c;
  }, [scale, contentScale]);

  // ── Auto-initialize media/TV devices on Controls page mount ─────────────
  // Some media players (e.g. Samsung, LG, Chromecast) require an `initialize`
  // command before they accept transport/volume commands.  We fire it once per
  // device when the panel first renders with a valid device list.
  const initializedRef = useRef(new Set());
  useEffect(() => {
    if (!connected) return;
    if (!rooms || !rooms.length) return;

    for (const { devices } of rooms) {
      for (const d of (devices || [])) {
        const id = String(d?.id || '').trim();
        if (!id || initializedRef.current.has(id)) continue;

        const cmds = Array.isArray(d.status?.commands) ? d.status.commands : [];
        if (!cmds.includes('initialize')) continue;

        // Only target media-like devices (AudioVolume, MediaTransport, MusicPlayer, etc.)
        const caps = Array.isArray(d.status?.capabilities) ? d.status.capabilities : [];
        const typeStr = String(d.type || '').toLowerCase();
        const isMedia = caps.some((c) =>
          /audiovol|mediatransport|musicplayer|speechsynth/i.test(String(c || '')),
        ) || /media|player|tv|chromecast|speaker|receiver|sonos|roku/i.test(typeStr);

        if (!isMedia) continue;

        initializedRef.current.add(id);
        sendDeviceCommand(id, 'initialize', []).catch(() => {
          // best-effort — don't block the UI
        });
      }
    }
  }, [connected, rooms]);

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-y-auto overflow-x-hidden p-4 md:p-6">
      {controlsBackground.enabled && controlsBackground.url && !controlsBackgroundImageError ? (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: `url(${JSON.stringify(String(controlsBackground.url))})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: controlsBackground.opacityPct / 100,
          }}
        />
      ) : null}

      <div
        className="relative z-10 h-full"
        style={{
          width: `${100 / finalScale}%`,
          transform: `scale(${finalScale})`,
          transformOrigin: 'top left',
        }}
      >
        <div ref={contentRef} className="w-full min-h-full">
          <div className="glass-panel border border-white/10 p-4 md:p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div
                  className="uppercase tracking-[0.2em] jvs-secondary-text-strong text-white font-semibold"
                  style={{ fontSize: 'calc(11px * var(--jvs-secondary-text-size-scale, 1))' }}
                >
                  Interactions
                </div>
                <div
                  className="mt-1 font-extrabold tracking-tight jvs-primary-text-strong text-white"
                  style={{ fontSize: 'calc(22px * var(--jvs-primary-text-size-scale, 1))' }}
                >
                  Device Controls
                </div>
                <div
                  className="mt-1 jvs-secondary-text text-white"
                  style={{ fontSize: 'calc(12px * var(--jvs-secondary-text-size-scale, 1))' }}
                >
                  Controls render based on device capabilities (switch / dimmer / commands).
                </div>
              </div>

              <button
                type="button"
                disabled={!connected}
                onClick={() => {
                  // Best-effort: ask the backend to run an immediate Hubitat sync.
                  fetch(`${API_HOST}/api/refresh`, { method: 'POST' }).catch(() => undefined);
                }}
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${resolvedUiScheme.actionButton} ${!connected ? 'opacity-50' : 'hover:bg-white/5'}`}
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Refresh
                </span>
              </button>
            </div>
          </div>

          {topCameras.length ? (
            <div className="mt-4 glass-panel border border-white/10 p-4 md:p-5">
              <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                Cameras
              </div>
              <div className={`mt-3 grid ${topCameraGridClassName} gap-3`}>
                {topCameras.map((cam) => {
                  const broken = cameraBrokenIds.has(cam.id);
                  const src = `${API_HOST}/api/cameras/${encodeURIComponent(cam.id)}/snapshot?t=${cameraTick}`;
                  return (
                    <div key={cam.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/80 truncate">
                        {cam.label || cam.id}
                      </div>
                      <div className="mt-2 overflow-hidden rounded-xl bg-black/30">
                        {cam.hasEmbed ? (
                          <iframe
                            src={cam.embedUrl}
                            title={cam.label || cam.id}
                            className="w-full aspect-video"
                            style={{ border: 0 }}
                            allow="autoplay; fullscreen"
                            referrerPolicy="no-referrer"
                          />
                        ) : cam.hasRtsp ? (
                          <HlsPlayer cameraId={cam.id} />
                        ) : (!broken ? (
                          <img
                            src={src}
                            alt={cam.label || cam.id}
                            className="w-full aspect-video object-cover"
                            onError={() => {
                              setCameraBrokenIds((prev) => {
                                const next = new Set(prev);
                                next.add(cam.id);
                                return next;
                              });
                            }}
                          />
                        ) : (
                          <div className="w-full aspect-video flex items-center justify-center text-xs text-white/45">
                            Snapshot unavailable
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div
            ref={controlsGridRef}
            className="mt-4 grid jvs-controls-grid jvs-controls-grid--masonry gap-4"
            style={{
              '--jvs-controls-min-width': `${controlsMinWidthPx}px`,
              '--jvs-controls-row-height': `${controlsRowHeightPx}px`,
            }}
          >
            {rooms.length ? (
              rooms.map(({ room, devices }) => {
                const controllables = devices
                  .map((d) => {
                    const attrs = d.status?.attributes || {};
                    const commandsRaw = Array.isArray(d.status?.commands) ? d.status.commands : [];
                    const perDevice = getDeviceCommandAllowlist(config, d.id);

                    const schemasRaw = Object.prototype.hasOwnProperty.call(commandSchemasById, String(d.id))
                      ? commandSchemasById[String(d.id)]
                      : null;

                    // If we have schema, filter by allowlist at the schema level.
                    const schemas = perDevice === null
                      ? normalizeCommandSchemas(schemasRaw || commandsRaw)
                      : filterCommandSchemasByAllowlist(schemasRaw || commandsRaw, perDevice);

                    const commands = schemas.map((s) => s.command);

                    const controls = mapDeviceToControls({
                      deviceId: d.id,
                      label: d.label,
                      hubitatType: d.type,
                      capabilities: d.status?.capabilities,
                      attributes: attrs,
                      state: d.status?.state,
                      commandSchemas: schemas,
                    });

                    const availableInfoMetricKeys = sortInfoMetricKeys(
                      Object.entries(attrs)
                        .filter(([key, value]) => isSafeInfoMetricKey(key) && isDisplayableInfoValue(value))
                        .map(([key]) => key),
                    );
                    const infoAllowlist = getDeviceInfoMetricAllowlist(config, d.id);
                    const infoKeys = Array.isArray(infoAllowlist)
                      ? availableInfoMetricKeys.filter((k) => infoAllowlist.includes(k))
                      : [];
                    const infoItems = infoKeys
                      .map((key) => {
                        const value = formatInfoMetricValue(attrs?.[key]);
                        if (value === null) return null;
                        return {
                          key,
                          label: formatInfoMetricLabel(key),
                          value,
                        };
                      })
                      .filter(Boolean);

                    const internalType = inferInternalDeviceType({
                      hubitatType: d.type,
                      capabilities: d.status?.capabilities,
                      attributes: attrs,
                      state: d.status?.state,
                      commandSchemas: schemas,
                    });

                    return {
                      id: d.id,
                      label: d.label,
                      attrs,
                      commands,
                      commandSchemas: schemas,
                      capabilities: d.status?.capabilities,
                      controls,
                      state: d.status?.state,
                      internalType,
                      infoItems,
                    };
                  })
                  // Include devices that have commands OR have info cards configured.
                  // Sensors without commands can still show info cards.
                  .filter((d) => d.commands.length || d.infoItems.length);

                if (!controllables.length) return null;

                return (
                  <section
                    key={room.id}
                    ref={(el) => {
                      const key = String(room.id);
                      if (!key) return;
                      if (el) controlsTileElsByIdRef.current[key] = el;
                      else delete controlsTileElsByIdRef.current[key];
                    }}
                    style={{
                      gridRowEnd: `span ${controlsRowSpansById[String(room.id)] || 1}`,
                    }}
                    className="glass-panel border-0 shadow-none p-2 md:p-3"
                  >
                    <div
                      className="uppercase tracking-[0.2em] jvs-secondary-text-strong text-white font-semibold"
                      style={{ fontSize: 'calc(11px * var(--jvs-secondary-text-size-scale, 1))' }}
                    >
                      Room
                    </div>
                    <h2
                      className="mt-1 font-extrabold tracking-wide jvs-primary-text-strong text-white truncate"
                      style={{ fontSize: 'calc(16px * var(--jvs-primary-text-size-scale, 1))' }}
                    >
                      {room.name}
                    </h2>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {controllables.map((d) => {
                        const level = d.attrs.level;
                        const hasLevel = d.commands.includes('setLevel') || asNumber(level) !== null;

                        const iconSrc = getDeviceTypeIconSrc(config, d.internalType);

                        const switchControl = Array.isArray(d.controls)
                          ? d.controls.find((c) => c && c.kind === 'switch')
                          : null;

                        const isOn = switchControl ? switchControl.isOn : false;
                        const canOn = switchControl ? switchControl.canOn : d.commands.includes('on');
                        const canOff = switchControl ? switchControl.canOff : d.commands.includes('off');
                        const canToggle = switchControl ? switchControl.canToggle : d.commands.includes('toggle');

                        // Per-device manual control icons, or auto-inferred fallback.
                        const manualIconIds = getDeviceControlIconIds(d.id);
                        const controlIconIds = manualIconIds.length > 0
                          ? manualIconIds
                          : inferControlIconIds({
                                capabilities: d.capabilities || [],
                                attributes: d.attrs,
                                commandSchemas: d.commandSchemas,
                              });

                        // Build device object for InteractiveControlIcon
                        const deviceObj = {
                          id: d.id,
                          label: d.label,
                          switch: isOn ? 'on' : 'off',
                          level: asNumber(level) ?? 0,
                          ...d.attrs,
                          commands: d.commands,
                        };

                        // ── Switch + dimmer tiles ──
                        if (switchControl && hasLevel && d.commands.includes('setLevel')) {
                          return (
                            <React.Fragment key={d.id}>
                              <LevelTile
                                label={d.label}
                                iconSrc={iconSrc}
                                controlIconIds={controlIconIds}
                                deviceId={d.id}
                                device={deviceObj}
                                isOn={isOn}
                                level={level}
                                infoItems={d.infoItems}
                                disabled={!connected}
                                busy={busy.has(`${d.id}:toggle`) || busy.has(`${d.id}:setLevel`) || busy.has(`${d.id}:on`) || busy.has(`${d.id}:off`)}
                                onToggle={() => {
                                  if (isOn && canOff) return run(d.id, 'off');
                                  if (!isOn && canOn) return run(d.id, 'on');
                                  if (canToggle) return run(d.id, 'toggle');
                                  return run(d.id, isOn ? 'off' : 'on');
                                }}
                                onSetLevel={(next) => {
                                  const n = Math.max(0, Math.min(100, Math.round(Number(next))));
                                  return run(d.id, 'setLevel', [n]);
                                }}
                                onCommand={(deviceId, command, args) => run(deviceId, command, args)}
                                uiScheme={resolvedUiScheme}
                              />
                            </React.Fragment>
                          );
                        }

                        if (switchControl) {
                          const onToggle = () => {
                            if (isOn && canOff) return run(d.id, 'off');
                            if (!isOn && canOn) return run(d.id, 'on');
                            if (canToggle) return run(d.id, 'toggle');
                            return run(d.id, isOn ? 'off' : 'on');
                          };

                          return (
                            <React.Fragment key={d.id}>
                              <SwitchTile
                                label={d.label}
                                iconSrc={iconSrc}
                                controlIconIds={controlIconIds}
                                device={deviceObj}
                                isOn={isOn}
                                infoItems={d.infoItems}
                                disabled={!connected}
                                busyOn={busy.has(`${d.id}:on`)}
                                busyOff={busy.has(`${d.id}:off`)}
                                busyToggle={busy.has(`${d.id}:toggle`)}
                                canOn={canOn}
                                canOff={canOff}
                                canToggle={canToggle}
                                onOn={() => run(d.id, 'on')}
                                onOff={() => run(d.id, 'off')}
                                onToggle={onToggle}
                                onCommand={(deviceId, command, args) => run(deviceId, command, args)}
                                controlStyle={switchControlStyle}
                                animationStyle={switchAnimationStyle}
                                uiScheme={resolvedUiScheme}
                              />
                            </React.Fragment>
                          );
                        }

                        // Fallback: show safe action buttons if present
                        // Controls previously showed only a hardcoded “safe” subset of commands.
                        // That caused allowlisted TV/media commands (e.g. volume/mode/select) to be hidden.
                        // Show all allowlisted commands; if a command needs parameters, render inline inputs.
                        const schemaList = Array.isArray(d.commandSchemas) ? d.commandSchemas : [];
                        if (!schemaList.length) {
                          // Sensor-only device: show info cards if configured
                          if (!d.infoItems.length) {
                            return (
                              <div key={d.id} className="opacity-80">
                                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                                  <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                                    {iconSrc ? (
                                      <img src={iconSrc} alt="" aria-hidden="true" className="w-4 h-4 shrink-0" />
                                    ) : null}
                                    <span className="truncate">{d.label}</span>
                                  </span>
                                </div>
                                <div className="mt-2 text-xs text-white/45">No commands available.</div>
                              </div>
                            );
                          }
                          return (
                            <div key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                              <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                                <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                                  {iconSrc ? (
                                    <img src={iconSrc} alt="" aria-hidden="true" className="w-4 h-4 shrink-0" />
                                  ) : null}
                                  <span className="truncate">{d.label}</span>
                                </span>
                              </div>
                              <DeviceInfoGrid items={d.infoItems} />
                            </div>
                          );
                        }

                        return (
                          <div key={d.id}>
                            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                              <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                                {iconSrc ? (
                                  <img src={iconSrc} alt="" aria-hidden="true" className="w-4 h-4 shrink-0" />
                                ) : null}
                                <span className="truncate">{d.label}</span>
                              </span>
                            </div>

                            <DeviceInfoGrid items={d.infoItems} />

                            {/* Interactive control icons for fallback devices (e.g. media players without switch) */}
                            {controlIconIds.length > 0 && (
                              <div className="mt-3 flex flex-wrap justify-center gap-2 items-end">
                                {controlIconIds.map((iconId) => (
                                  <InteractiveControlIcon
                                    key={iconId}
                                    iconId={iconId}
                                    device={deviceObj}
                                    onCommand={(deviceId, command, args) => run(deviceId, command, args)}
                                    className="w-16 h-20"
                                    disabled={!connected}
                                  />
                                ))}
                              </div>
                            )}

                            <div className="mt-2 flex flex-col gap-2">
                              {schemaList.map((schema) => {
                                const cmd = String(schema?.command || '').trim();
                                if (!cmd) return null;

                                const params = Array.isArray(schema?.parameters) ? schema.parameters : [];
                                const keyPrefix = `${d.id}:${cmd}`;
                                const isBusy = busy.has(keyPrefix);

                                const currentParamValues = (commandArgDrafts && typeof commandArgDrafts === 'object') ? commandArgDrafts[keyPrefix] : null;
                                const paramValues = (currentParamValues && typeof currentParamValues === 'object') ? currentParamValues : {};

                                const parseArg = (param, valueRaw) => {
                                  const t = String(param?.type || '').toLowerCase();
                                  const s = String(valueRaw ?? '').trim();
                                  if (!s) return null;

                                  // Basic type coercion. Maker API varies; keep it forgiving.
                                  if (t.includes('int') || t.includes('number') || t.includes('decimal') || t.includes('float') || t.includes('double')) {
                                    const n = Number(s);
                                    return Number.isFinite(n) ? n : s;
                                  }

                                  if (t.includes('bool')) {
                                    if (s.toLowerCase() === 'true') return true;
                                    if (s.toLowerCase() === 'false') return false;
                                  }

                                  return s;
                                };

                                const canRun = (() => {
                                  if (!connected || isBusy) return false;
                                  if (!params.length) return true;
                                  // Require all parameter fields to be filled (we don't have explicit required flags).
                                  return params.every((p, idx) => {
                                    const name = String(p?.name || `arg${idx}`).trim();
                                    const v = paramValues[name];
                                    return String(v ?? '').trim().length > 0;
                                  });
                                })();

                                const runWithArgs = () => {
                                  const args = params.map((p, idx) => {
                                    const name = String(p?.name || `arg${idx}`).trim();
                                    return parseArg(p, paramValues[name]);
                                  });
                                  return run(d.id, cmd, args);
                                };

                                return (
                                  <div key={cmd} className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={!canRun}
                                      onClick={() => (params.length ? runWithArgs() : run(d.id, cmd))}
                                      className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-colors active:scale-[0.99] ${resolvedUiScheme.actionButton} ${(!canRun) ? 'opacity-50' : 'hover:bg-white/5'}`}
                                    >
                                      {isBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : cmd}
                                    </button>

                                    {params.map((p, idx) => {
                                      const name = String(p?.name || `arg${idx}`).trim() || `arg${idx}`;
                                      const typeHint = String(p?.type || '').trim();
                                      const placeholder = typeHint ? `${name} (${typeHint})` : name;
                                      const value = String(paramValues[name] ?? '');
                                      return (
                                        <input
                                          key={`${cmd}:${name}`}
                                          value={value}
                                          onChange={(e) => {
                                            const next = e.target.value;
                                            setCommandArgDrafts((prev) => {
                                              const base = (prev && typeof prev === 'object') ? prev : {};
                                              const existing = (base[keyPrefix] && typeof base[keyPrefix] === 'object') ? base[keyPrefix] : {};
                                              return {
                                                ...base,
                                                [keyPrefix]: {
                                                  ...existing,
                                                  [name]: next,
                                                },
                                              };
                                            });
                                          }}
                                          disabled={!connected || isBusy}
                                          placeholder={placeholder}
                                          className="min-w-[140px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 placeholder:text-white/35"
                                        />
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            ) : (
              <div
                ref={(el) => {
                  if (el) controlsTileElsByIdRef.current.__empty__ = el;
                  else delete controlsTileElsByIdRef.current.__empty__;
                }}
                style={{
                  gridRowEnd: `span ${controlsRowSpansById.__empty__ || 1}`,
                }}
                className="glass-panel p-8 border border-white/10 text-center text-white/50"
              >
                <div className="text-sm uppercase tracking-[0.2em]">No data</div>
                <div className="mt-2 text-xl font-extrabold text-white">Waiting for devices…</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractionPanel;
