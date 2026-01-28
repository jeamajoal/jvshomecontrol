import React, { useCallback, useRef, useState, useEffect } from 'react';

/**
 * ColorWheel - A circular color picker for selecting hue values
 * 
 * Shows the full color spectrum in a ring, with a draggable thumb indicator.
 * Designed for RGB/HSB capable lights.
 * 
 * Props:
 *   hue         - Current hue value (0-100, maps to 0-360 degrees)
 *   saturation  - Current saturation for preview (0-100)
 *   disabled    - Disable interactions
 *   onChange    - Callback when hue changes during drag
 *   onChangeEnd - Callback when drag ends (for sending command)
 *   className   - Additional CSS classes
 *   style       - Additional inline styles
 */
export default function ColorWheel({
  hue = 0,
  saturation = 100,
  disabled = false,
  onChange,
  onChangeEnd,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localHue, setLocalHue] = useState(hue);
  const hueRef = useRef(hue);
  const prevHueRef = useRef(undefined); // Start undefined so first value syncs

  // Sync external hue when not dragging AND hue actually changed from server
  useEffect(() => {
    // Sync if external hue changed OR on first mount (prevHueRef is undefined)
    if (prevHueRef.current !== hue) {
      prevHueRef.current = hue;
      if (!isDragging) {
        setLocalHue(hue);
        hueRef.current = hue;
      }
    }
  }, [hue, isDragging]);

  // Convert position to hue angle
  const positionToHue = useCallback((clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return hueRef.current;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    
    // Calculate angle in radians, then convert to degrees
    let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    // Normalize to 0-360 (with 0 at the top)
    angle = (angle + 90 + 360) % 360;
    
    // Convert to 0-100 scale (Hubitat hue range)
    const hueValue = Math.round((angle / 360) * 100);
    return Math.max(0, Math.min(100, hueValue));
  }, []);

  // Handle drag start
  const handlePointerDown = useCallback((e) => {
    if (disabled) return;
    
    e.preventDefault();
    setIsDragging(true);

    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const newHue = positionToHue(clientX, clientY);
    
    setLocalHue(newHue);
    hueRef.current = newHue;
    onChange?.(newHue);

    if (e.pointerId !== undefined) {
      containerRef.current?.setPointerCapture(e.pointerId);
    }
  }, [disabled, positionToHue, onChange]);

  // Handle drag move
  const handlePointerMove = useCallback((e) => {
    if (!isDragging || disabled) return;
    
    e.preventDefault();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const newHue = positionToHue(clientX, clientY);
    
    if (newHue !== hueRef.current) {
      setLocalHue(newHue);
      hueRef.current = newHue;
      onChange?.(newHue);
    }
  }, [isDragging, disabled, positionToHue, onChange]);

  // Handle drag end
  const handlePointerUp = useCallback((e) => {
    if (!isDragging) return;
    
    setIsDragging(false);
    onChangeEnd?.(hueRef.current);

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

  // Calculate thumb position
  const angleDeg = (localHue / 100) * 360 - 90; // -90 to start at top
  const angleRad = (angleDeg * Math.PI) / 180;
  const radius = 32; // Distance from center to thumb
  const thumbX = 40 + Math.cos(angleRad) * radius;
  const thumbY = 40 + Math.sin(angleRad) * radius;

  // Convert hue to CSS color
  const hueColor = `hsl(${(localHue / 100) * 360}, ${saturation}%, 50%)`;

  return (
    <div
      ref={containerRef}
      className={`color-wheel ${className} ${disabled ? 'opacity-50' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        width: 80,
        height: 80,
        userSelect: 'none',
        touchAction: 'none',
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handlePointerDown}
    >
      <svg viewBox="0 0 80 80" style={{ width: '100%', height: '100%' }}>
        <defs>
          {/* Conical gradient simulated with segments */}
          <linearGradient id="colorWheelGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(0, 100%, 50%)" />
            <stop offset="100%" stopColor="hsl(60, 100%, 50%)" />
          </linearGradient>
          
          {/* Use conic gradient for modern browsers */}
          <style>{`
            .color-ring {
              fill: none;
              stroke-width: 10;
              stroke: conic-gradient(from 0deg, 
                hsl(0, 100%, 50%), 
                hsl(60, 100%, 50%), 
                hsl(120, 100%, 50%), 
                hsl(180, 100%, 50%), 
                hsl(240, 100%, 50%), 
                hsl(300, 100%, 50%), 
                hsl(360, 100%, 50%)
              );
            }
          `}</style>
        </defs>

        {/* Background */}
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="linear-gradient(to bottom, #1F2430, #121622)"
          style={{ fill: 'url(#bgGrad)' }}
        />
        <defs>
          <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F2430"/>
            <stop offset="100%" stopColor="#121622"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r="36" fill="url(#bgGrad)"/>

        {/* Color ring - using arc segments to simulate conical gradient */}
        {Array.from({ length: 36 }, (_, i) => {
          const startAngle = (i * 10 - 90) * (Math.PI / 180);
          const endAngle = ((i + 1) * 10 - 90) * (Math.PI / 180);
          const innerRadius = 28;
          const outerRadius = 38;
          
          const x1 = 40 + Math.cos(startAngle) * outerRadius;
          const y1 = 40 + Math.sin(startAngle) * outerRadius;
          const x2 = 40 + Math.cos(endAngle) * outerRadius;
          const y2 = 40 + Math.sin(endAngle) * outerRadius;
          const x3 = 40 + Math.cos(endAngle) * innerRadius;
          const y3 = 40 + Math.sin(endAngle) * innerRadius;
          const x4 = 40 + Math.cos(startAngle) * innerRadius;
          const y4 = 40 + Math.sin(startAngle) * innerRadius;

          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 0 0 ${x4} ${y4} Z`}
              fill={`hsl(${i * 10}, 100%, 50%)`}
              style={{ transition: 'opacity 150ms' }}
            />
          );
        })}

        {/* Inner circle (current color preview) */}
        <circle
          cx="40"
          cy="40"
          r="22"
          fill={hueColor}
          style={{
            transition: isDragging ? 'none' : 'fill 100ms ease-out',
            filter: `drop-shadow(0 0 8px ${hueColor}66)`,
          }}
        />
        <circle
          cx="40"
          cy="40"
          r="22"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />

        {/* Thumb indicator */}
        <circle
          cx={thumbX}
          cy={thumbY}
          r={isDragging ? 8 : 6}
          fill="white"
          stroke={hueColor}
          strokeWidth="3"
          style={{
            filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.3)) drop-shadow(0 0 4px ${hueColor}88)`,
            transition: isDragging ? 'none' : 'cx 100ms ease-out, cy 100ms ease-out, r 150ms ease',
          }}
        />

        {/* Outer ring highlight */}
        <circle
          cx="40"
          cy="40"
          r="38"
          fill="none"
          stroke={isDragging ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}
          strokeWidth="1"
          style={{ transition: 'stroke 150ms ease' }}
        />
      </svg>

      {/* Hue value display */}
      <div
        style={{
          position: 'absolute',
          bottom: -16,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.6)',
          textAlign: 'center',
        }}
      >
        {Math.round(localHue)}%
      </div>
    </div>
  );
}
