import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InlineSvg from './InlineSvg';
import ControlSlider from './ControlSlider';
import ColorWheel from './ColorWheel';
import VolumeKnob from './VolumeKnob';
import MediaTransport from './MediaTransport';

/**
 * InteractiveControlIcon
 * 
 * Renders an interactive control using either React components or SVG.
 * The manifest can specify `reactComponent` to use a React component,
 * or `useSvg: true` to force SVG rendering even for slider/knob types.
 * Users can create custom SVG controls that will be used as fallback.
 * 
 * Props:
 *   iconId         - The control icon ID (e.g., 'dimmer-paddle')
 *   device         - The device object with attributes and commands
 *   onCommand      - Callback: (deviceId, command, args) => void
 *   className      - Optional CSS class for the wrapper
 *   style          - Optional inline styles
 *   disabled       - Disable all interactions
 */
export default function InteractiveControlIcon({
  iconId,
  device,
  onCommand,
  className = '',
  style,
  disabled = false,
}) {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  
  const containerRef = useRef(null);
  const draggingRef = useRef(null);

  // Fetch the manifest for this control icon
  useEffect(() => {
    if (!iconId) {
      setManifest(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/control-icons/${encodeURIComponent(iconId)}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load control icon: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (!data.ok || !data.icon) throw new Error('Invalid control icon response');
        setManifest(data.icon);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.message || String(err));
        setManifest(null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [iconId]);

  // Build CSS classes based on device state and manifest bindings
  const stateClasses = useMemo(() => {
    if (!manifest?.stateBindings || !device) return '';
    
    const classes = [];
    
    for (const [key, binding] of Object.entries(manifest.stateBindings)) {
      const value = device[binding.attribute];
      
      if (binding.type === 'boolean' && binding.cssClass) {
        if (value === binding.onValue) {
          classes.push(binding.cssClass.on || 'is-on');
        } else if (value === binding.offValue) {
          classes.push(binding.cssClass.off || 'is-off');
        }
      }
    }
    
    return classes.join(' ');
  }, [manifest, device]);

  // Build CSS variables for numeric state values
  const stateStyles = useMemo(() => {
    if (!manifest?.stateBindings || !device) return {};
    
    const vars = {};
    
    for (const [key, binding] of Object.entries(manifest.stateBindings)) {
      if (binding.type === 'number' && binding.cssVariable) {
        const value = Number(device[binding.attribute]) || 0;
        const min = binding.min ?? 0;
        const max = binding.max ?? 100;
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
        vars[binding.cssVariable] = normalized;
        vars[`${binding.cssVariable}-raw`] = value;
      }
    }
    
    return vars;
  }, [manifest, device]);

  // Handle click/tap on SVG regions
  const handleRegionClick = useCallback((e) => {
    if (disabled || !manifest?.regions || !device || !onCommand) return;
    
    const target = e.target?.closest?.('[data-region]');
    if (!target) return;
    
    const regionId = target.getAttribute('data-region');
    const region = manifest.regions.find(r => r.id === regionId);
    if (!region) return;
    
    // Don't handle slider regions with click - they use drag
    if (region.action === 'slider') return;
    
    e.preventDefault();
    e.stopPropagation();

    // Visual press feedback
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 150);
    
    if (region.action === 'command') {
      onCommand(device.id, region.command, []);
    } else if (region.action === 'toggle') {
      // Resolve current state value with fallbacks for common attribute aliases
      let currentValue = device[region.stateAttribute];
      if (currentValue === undefined || currentValue === null) {
        const fallbacks = {
          playbackStatus: ['transportStatus', 'status'],
          transportStatus: ['playbackStatus', 'status'],
        };
        const alts = fallbacks[region.stateAttribute];
        if (alts) {
          for (const alt of alts) {
            if (device[alt] !== undefined && device[alt] !== null) {
              currentValue = device[alt];
              break;
            }
          }
        }
      }
      const commands = region.toggleCommands || ['on', 'off'];
      const nextCmd = currentValue === region.onValue ? commands[1] : commands[0];
      onCommand(device.id, nextCmd, []);
    } else if (region.action === 'increment') {
      const current = Number(device[region.stateAttribute]) || 0;
      const step = region.step || 10;
      const max = region.max ?? 100;
      const next = Math.min(max, current + step);
      onCommand(device.id, region.command, [next]);
    } else if (region.action === 'decrement') {
      const current = Number(device[region.stateAttribute]) || 0;
      const step = region.step || 10;
      const min = region.min ?? 0;
      const next = Math.max(min, current - step);
      onCommand(device.id, region.command, [next]);
    }
  }, [disabled, manifest, device, onCommand]);

  // Handle slider drag interactions
  const handleSliderStart = useCallback((e, region) => {
    if (disabled || !device || !onCommand) return;
    
    const sliderEl = e.target?.closest?.('[data-region]');
    if (!sliderEl) return;
    
    e.preventDefault();
    
    const rect = sliderEl.getBoundingClientRect();
    draggingRef.current = {
      region,
      rect,
      startY: e.clientY || e.touches?.[0]?.clientY || 0,
      startX: e.clientX || e.touches?.[0]?.clientX || 0,
    };
    
    document.addEventListener('mousemove', handleSliderMove);
    document.addEventListener('mouseup', handleSliderEnd);
    document.addEventListener('touchmove', handleSliderMove, { passive: false });
    document.addEventListener('touchend', handleSliderEnd);
  }, [disabled, device, onCommand]);

  const handleSliderMove = useCallback((e) => {
    if (!draggingRef.current || !device || !onCommand) return;
    
    e.preventDefault();
    
    const { region, rect } = draggingRef.current;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    
    let normalized;
    if (region.orientation === 'vertical') {
      const relativeY = clientY - rect.top;
      normalized = 1 - (relativeY / rect.height); // Invert for vertical
      if (region.invert) normalized = 1 - normalized;
    } else {
      const relativeX = clientX - rect.left;
      normalized = relativeX / rect.width;
      if (region.invert) normalized = 1 - normalized;
    }
    
    normalized = Math.max(0, Math.min(1, normalized));
    
    const min = region.min ?? 0;
    const max = region.max ?? 100;
    const step = region.step ?? 1;
    
    let value = min + normalized * (max - min);
    value = Math.round(value / step) * step;
    value = Math.max(min, Math.min(max, value));
    
    // Debounce the command (only send on end, or throttled)
    draggingRef.current.pendingValue = value;
  }, [device, onCommand]);

  const handleSliderEnd = useCallback(() => {
    if (!draggingRef.current) return;
    
    const { region, pendingValue } = draggingRef.current;
    
    document.removeEventListener('mousemove', handleSliderMove);
    document.removeEventListener('mouseup', handleSliderEnd);
    document.removeEventListener('touchmove', handleSliderMove);
    document.removeEventListener('touchend', handleSliderEnd);
    
    if (pendingValue !== undefined && device && onCommand) {
      onCommand(device.id, region.command, [pendingValue]);
    }
    
    draggingRef.current = null;
  }, [device, onCommand, handleSliderMove]);

  // Wire up pointer events on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !manifest?.regions) return;

    const sliderRegions = manifest.regions.filter(r => r.action === 'slider');
    
    const onPointerDown = (e) => {
      const target = e.target?.closest?.('[data-region]');
      if (!target) return;
      
      const regionId = target.getAttribute('data-region');
      const region = sliderRegions.find(r => r.id === regionId);
      if (region) {
        handleSliderStart(e, region);
      }
    };

    container.addEventListener('mousedown', onPointerDown);
    container.addEventListener('touchstart', onPointerDown, { passive: false });

    return () => {
      container.removeEventListener('mousedown', onPointerDown);
      container.removeEventListener('touchstart', onPointerDown);
    };
  }, [manifest, handleSliderStart]);

  // Update SVG element positions based on level state
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !manifest?.stateBindings || !device) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    for (const [key, binding] of Object.entries(manifest.stateBindings)) {
      if (binding.type !== 'number' || !binding.elements) continue;

      const value = Number(device[binding.attribute]) || 0;
      const min = binding.min ?? 0;
      const max = binding.max ?? 100;
      const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));

      for (const [stateKey, config] of Object.entries(binding.elements)) {
        const el = svg.querySelector(`[data-state="${stateKey}"]`);
        if (!el) continue;

        if (config.transform === 'scaleY' && config.origin === 'bottom') {
          // Scale from bottom - used for fill bar
          // Need to recalculate y and height for the fill
          const track = svg.querySelector('.slider-track');
          if (track) {
            const trackY = parseFloat(track.getAttribute('y')) || 36;
            const trackH = parseFloat(track.getAttribute('height')) || 100;
            const fillH = trackH * normalized;
            const fillY = trackY + (trackH - fillH);
            el.setAttribute('y', fillY);
            el.setAttribute('height', Math.max(0, fillH));
          }
        } else if (config.transform === 'translateY') {
          // Translate vertically - used for thumb
          const track = svg.querySelector('.slider-track');
          if (track) {
            const trackY = parseFloat(track.getAttribute('y')) || 36;
            const trackH = parseFloat(track.getAttribute('height')) || 100;
            const thumbRadius = parseFloat(el.getAttribute('r')) || 10;
            const range = trackH - thumbRadius * 2;
            const offset = config.invert
              ? trackY + thumbRadius + (1 - normalized) * range
              : trackY + thumbRadius + normalized * range;
            el.setAttribute('cy', offset);
          }
        }
      }
    }
  }, [manifest, device]);

  // Also update grip lines with thumb
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !manifest?.stateBindings || !device) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    const thumb = svg.querySelector('[data-state="level-thumb"]');
    const grip = svg.querySelector('[data-state="level-grip"]');
    if (!thumb || !grip) return;

    const cy = parseFloat(thumb.getAttribute('cy')) || 86;
    const lines = grip.querySelectorAll('line');
    lines.forEach((line, i) => {
      const baseOffset = i === 0 ? -2 : 2;
      line.setAttribute('y1', cy + baseOffset);
      line.setAttribute('y2', cy + baseOffset);
    });
  }, [manifest, device]);

  // Check if manifest specifies to use SVG instead of React component
  const forceSvg = manifest?.useSvg === true;

  // Determine control type from manifest
  const isSliderIcon = useMemo(() => {
    if (!manifest || forceSvg) return false;
    return manifest.regions?.some(r => r.action === 'slider');
  }, [manifest, forceSvg]);

  const isColorWheelIcon = useMemo(() => {
    if (!manifest || forceSvg) return false;
    return manifest.regions?.some(r => r.action === 'radial');
  }, [manifest, forceSvg]);

  const isKnobIcon = useMemo(() => {
    if (!manifest || forceSvg) return false;
    return manifest.regions?.some(r => r.action === 'knob') || manifest.reactComponent === 'VolumeKnob';
  }, [manifest, forceSvg]);

  const isMediaTransport = useMemo(() => {
    if (!manifest || forceSvg) return false;
    return manifest.regions?.some(r => r.action === 'transport') || manifest.reactComponent === 'MediaTransport';
  }, [manifest, forceSvg]);

  // Get slider configuration from manifest
  const sliderConfig = useMemo(() => {
    if (!manifest || !isSliderIcon) return null;
    const region = manifest.regions?.find(r => r.action === 'slider');
    if (!region) return null;
    
    // Determine color based on icon type
    let color = '#FBBF24'; // default golden
    if (manifest.id?.includes('temp')) color = '#F97316'; // orange for color temp
    if (manifest.id?.includes('saturation')) color = '#EC4899'; // pink for saturation
    
    return {
      command: region.command,
      attribute: region.stateAttribute || 'level',
      min: region.min ?? 0,
      max: region.max ?? 100,
      step: region.step ?? 1,
      color,
    };
  }, [manifest, isSliderIcon]);

  // Get color wheel configuration from manifest
  const colorWheelConfig = useMemo(() => {
    if (!manifest || !isColorWheelIcon) return null;
    const region = manifest.regions?.find(r => r.action === 'radial');
    if (!region) return null;
    
    return {
      command: region.command,
      attribute: region.stateAttribute || 'hue',
      min: region.min ?? 0,
      max: region.max ?? 100,
    };
  }, [manifest, isColorWheelIcon]);

  // Get knob configuration from manifest
  const knobConfig = useMemo(() => {
    if (!manifest || !isKnobIcon) return null;
    const region = manifest.regions?.find(r => r.action === 'knob');
    if (!region) return null;
    
    return {
      command: region.command,
      attribute: region.stateAttribute || 'volume',
      min: region.min ?? 0,
      max: region.max ?? 100,
      step: region.step ?? 1,
      color: '#22D3EE', // cyan for volume
    };
  }, [manifest, isKnobIcon]);

  // Handle slider value change (during drag - for live preview if needed)
  const handleSliderChange = useCallback((value) => {
    // Optional: could send live updates during drag
  }, []);

  // Handle slider value change end (send command)
  const handleSliderChangeEnd = useCallback((value) => {
    if (!device || !onCommand || !sliderConfig) return;
    onCommand(device.id, sliderConfig.command, [value]);
  }, [device, onCommand, sliderConfig]);

  // Handle color wheel hue change (during drag)
  const handleColorWheelChange = useCallback((hue) => {
    // Optional: could send live updates during drag
  }, []);

  // Handle color wheel hue change end (send command)
  const handleColorWheelChangeEnd = useCallback((hue) => {
    if (!device || !onCommand || !colorWheelConfig) return;
    onCommand(device.id, colorWheelConfig.command, [hue]);
  }, [device, onCommand, colorWheelConfig]);

  // Handle knob value change end (send command)
  const handleKnobChangeEnd = useCallback((value) => {
    if (!device || !onCommand || !knobConfig) return;
    onCommand(device.id, knobConfig.command, [value]);
  }, [device, onCommand, knobConfig]);

  // Handle media transport command
  const handleTransportCommand = useCallback((command) => {
    if (!device || !onCommand) return;
    onCommand(device.id, command, []);
  }, [device, onCommand]);

  if (!iconId) return null;

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center`} style={style}>
        <div className="animate-pulse bg-white/10 rounded w-full h-full" />
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div
        className={`${className} flex items-center justify-center text-xs text-red-400/50`}
        style={style}
        title={error || 'Unknown control icon'}
      >
        <span>⚠</span>
      </div>
    );
  }

  // Render React slider component for slider icons
  // Sliders use their own sizing (w-10 h-24) for proper fader proportions
  if (isSliderIcon && sliderConfig) {
    const currentValue = Number(device?.[sliderConfig.attribute]) || 0;
    return (
      <ControlSlider
        value={currentValue}
        min={sliderConfig.min}
        max={sliderConfig.max}
        step={sliderConfig.step}
        color={sliderConfig.color}
        disabled={disabled}
        onChange={handleSliderChange}
        onChangeEnd={handleSliderChangeEnd}
        style={style}
      />
    );
  }

  // Render React color wheel component for color wheel icons
  // Color wheels use their own sizing (w-20 h-20) for proper circle display
  if (isColorWheelIcon && colorWheelConfig) {
    const currentHue = Number(device?.[colorWheelConfig.attribute]) || 0;
    const currentSaturation = Number(device?.saturation) || 100;
    return (
      <ColorWheel
        hue={currentHue}
        saturation={currentSaturation}
        disabled={disabled}
        onChange={handleColorWheelChange}
        onChangeEnd={handleColorWheelChangeEnd}
        style={style}
      />
    );
  }

  // Render React volume knob component
  // Knobs use their own sizing (w-20 h-24) for proper dial display
  if (isKnobIcon && knobConfig) {
    const currentValue = Number(device?.[knobConfig.attribute]) || 0;
    return (
      <VolumeKnob
        value={currentValue}
        min={knobConfig.min}
        max={knobConfig.max}
        step={knobConfig.step}
        color={knobConfig.color}
        disabled={disabled}
        onChangeEnd={handleKnobChangeEnd}
        style={style}
      />
    );
  }

  // Render React media transport component
  // Transport uses its own sizing for proper button layout
  if (isMediaTransport) {
    const playbackStatus = device?.transportStatus || device?.playbackStatus || device?.status || '';
    const isPlaying = playbackStatus === 'playing';
    const isPaused = playbackStatus === 'paused';
    return (
      <MediaTransport
        isPlaying={isPlaying}
        isPaused={isPaused}
        disabled={disabled}
        onCommand={handleTransportCommand}
        commands={device?.commands || []}
        style={style}
      />
    );
  }

  // If no SVG URL (React-only component that didn't match any type), render nothing
  if (!manifest.svgUrl) {
    return (
      <div
        className={`${className} flex items-center justify-center text-xs text-yellow-400/50`}
        style={style}
        title={`Unknown React component: ${manifest.reactComponent || 'none'}`}
      >
        <span>?</span>
      </div>
    );
  }

  // Render SVG-based control for toggle buttons and other types
  return (
    <div
      ref={containerRef}
      className={`interactive-control-icon ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''} ${isPressed ? 'is-pressed' : ''}`}
      style={{ 
        ...style, 
        '--level': stateStyles['--level'] || 0,
        transform: isPressed ? 'scale(0.92)' : 'scale(1)',
        transition: 'transform 100ms ease-out',
      }}
      onClick={handleRegionClick}
    >
      <InlineSvg
        src={manifest.svgUrl}
        rootClassName={stateClasses}
        className="w-full h-full"
        disabled={disabled}
      />
    </div>
  );
}
