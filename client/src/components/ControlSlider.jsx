import React, { useCallback, useRef, useState, useEffect } from 'react';

/**
 * Vertical fader-style slider component for adjusting a numeric value between a minimum and maximum.
 *
 * Renders a compact control with a value display, vertical track with fill, draggable thumb, and optional label; invokes callbacks during interaction.
 *
 * @param {object} props - Component props.
 * @param {number} [props.value=0] - Current value within the range.
 * @param {number} [props.min=0] - Minimum allowed value.
 * @param {number} [props.max=100] - Maximum allowed value.
 * @param {number} [props.step=1] - Increment step used when snapping the value.
 * @param {string} [props.label] - Optional text label shown beneath the track.
 * @param {string} [props.color='#FBBF24'] - Accent color used for the fill and active outlines.
 * @param {boolean} [props.disabled=false] - When true, disables pointer/touch interactions and applies disabled styling.
 * @param {(newValue:number) => void} [props.onChange] - Called continuously with the new value while the user is dragging.
 * @param {(finalValue:number) => void} [props.onChangeEnd] - Called once with the final value when the drag ends.
 * @param {string} [props.className=''] - Additional CSS class names applied to the root element.
 * @param {Object} [props.style] - Inline style overrides applied to the root element.
 * @returns {JSX.Element} The rendered control slider element.
 */
export default function ControlSlider({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  label,
  color = '#FBBF24',
  disabled = false,
  onChange,
  onChangeEnd,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const valueRef = useRef(value);
  const prevValueRef = useRef(undefined); // Start undefined so first value syncs

  // Sync external value when not dragging AND value actually changed from server
  useEffect(() => {
    // Sync if external value changed OR on first mount (prevValueRef is undefined)
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      if (!isDragging) {
        setLocalValue(value);
        valueRef.current = value;
      }
    }
  }, [value, isDragging]);

  // Calculate normalized position (0-1)
  const normalized = Math.max(0, Math.min(1, (localValue - min) / (max - min)));

  // Convert Y position to value
  const positionToValue = useCallback((clientY) => {
    const track = trackRef.current;
    if (!track) return valueRef.current;

    const rect = track.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const normalized = 1 - (relativeY / rect.height); // Invert for vertical
    const clamped = Math.max(0, Math.min(1, normalized));
    
    let newValue = min + clamped * (max - min);
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(min, Math.min(max, newValue));
    
    return newValue;
  }, [min, max, step]);

  // Handle drag start
  const handlePointerDown = useCallback((e) => {
    if (disabled) return;
    
    e.preventDefault();
    setIsDragging(true);

    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const newValue = positionToValue(clientY);
    setLocalValue(newValue);
    valueRef.current = newValue;
    onChange?.(newValue);

    // Capture pointer for smooth dragging
    if (e.pointerId !== undefined) {
      containerRef.current?.setPointerCapture(e.pointerId);
    }
  }, [disabled, positionToValue, onChange]);

  // Handle drag move
  const handlePointerMove = useCallback((e) => {
    if (!isDragging || disabled) return;
    
    e.preventDefault();
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const newValue = positionToValue(clientY);
    
    if (newValue !== valueRef.current) {
      setLocalValue(newValue);
      valueRef.current = newValue;
      onChange?.(newValue);
    }
  }, [isDragging, disabled, positionToValue, onChange]);

  // Handle drag end
  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return;
    
    setIsDragging(false);
    onChangeEnd?.(valueRef.current);

    if (e.pointerId !== undefined) {
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
  }, [isDragging, onChangeEnd]);

  // Handle touch events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchMove = (e) => {
      if (isDragging) {
        e.preventDefault();
        handlePointerMove(e);
      }
    };

    const onTouchEnd = (e) => {
      if (isDragging) {
        e.preventDefault();
        handlePointerUp(e);
      }
    };

    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  return (
    <div
      ref={containerRef}
      className={`control-slider ${className} ${disabled ? 'opacity-50' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        width: 48,
        height: 120,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        touchAction: 'none',
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handlePointerDown}
    >
      {/* Value display */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: isDragging ? color : 'rgba(255,255,255,0.8)',
          marginBottom: 4,
          minWidth: 32,
          textAlign: 'center',
          transition: 'color 150ms ease',
        }}
      >
        {Math.round(localValue)}%
      </div>

      {/* Track container */}
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          width: 24,
          flex: 1,
          borderRadius: 12,
          background: 'linear-gradient(to bottom, #1F2430, #121622)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
          cursor: disabled ? 'default' : 'grab',
          overflow: 'hidden',
        }}
      >
        {/* Fill bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${normalized * 100}%`,
            background: `linear-gradient(to top, ${color}, ${color}dd)`,
            borderRadius: 12,
            transition: isDragging ? 'none' : 'height 100ms ease-out',
            boxShadow: `0 0 12px ${color}66`,
          }}
        />

        {/* Track outline */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            border: '2px solid rgba(58,67,88,0.6)',
            pointerEvents: 'none',
          }}
        />

        {/* Thumb/fader cap */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: `${normalized * 100}%`,
            transform: 'translate(-50%, 50%)',
            width: 32,
            height: 16,
            borderRadius: 4,
            background: 'linear-gradient(to bottom, #4B5563, #374151)',
            border: `2px solid ${isDragging ? color : '#6B7280'}`,
            boxShadow: isDragging 
              ? `0 0 8px ${color}88, 0 2px 4px rgba(0,0,0,0.3)`
              : '0 2px 4px rgba(0,0,0,0.3)',
            cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
            transition: isDragging ? 'none' : 'bottom 100ms ease-out, border-color 150ms ease, box-shadow 150ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Grip lines */}
          <div style={{ display: 'flex', gap: 2, opacity: 0.6 }}>
            <div style={{ width: 2, height: 8, background: '#9CA3AF', borderRadius: 1 }} />
            <div style={{ width: 2, height: 8, background: '#9CA3AF', borderRadius: 1 }} />
            <div style={{ width: 2, height: 8, background: '#9CA3AF', borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* Label */}
      {label && (
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 4,
            textAlign: 'center',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}