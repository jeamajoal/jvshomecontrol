import React, { useCallback, useId, useRef, useState, useEffect } from 'react';

/**
 * VolumeKnob - A rotary dial control like audio mixing consoles
 * 
 * Designed for volume, speed, or any 0-100 value. Drag around the knob to adjust.
 * Features a notched indicator and optional level marks.
 * 
 * Props:
 *   value       - Current value (0-100)
 *   min         - Minimum value (default 0)
 *   max         - Maximum value (default 100)
 *   step        - Step increment (default 1)
 *   label       - Optional label text
 *   color       - Accent color (default '#22D3EE' cyan)
 *   showMarks   - Show level marks around the dial (default true)
 *   disabled    - Disable interactions
 *   onChange    - Callback when value changes during drag
 *   onChangeEnd - Callback when drag ends (for sending command)
 *   className   - Additional CSS classes
 *   style       - Additional inline styles
 */
export default function VolumeKnob({
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  label,
  color = '#22D3EE',
  showMarks = true,
  disabled = false,
  onChange,
  onChangeEnd,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const uid = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const valueRef = useRef(value);
  const prevValueRef = useRef(undefined);
  const startAngleRef = useRef(0);
  const startValueRef = useRef(0);

  // Sync external value when not dragging AND value actually changed from server
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      if (!isDragging) {
        setLocalValue(value);
        valueRef.current = value;
      }
    }
  }, [value, isDragging]);

  // Calculate rotation angle (-135 to 135 degrees, 270 degree sweep)
  const normalized = Math.max(0, Math.min(1, (localValue - min) / (max - min)));
  const rotation = -135 + normalized * 270;

  // Convert pointer position to angle relative to center
  const getAngleFromEvent = useCallback((clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return 0;

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    
    return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  }, []);

  // Handle drag start
  const handlePointerDown = useCallback((e) => {
    if (disabled) return;
    
    e.preventDefault();
    setIsDragging(true);

    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    
    startAngleRef.current = getAngleFromEvent(clientX, clientY);
    startValueRef.current = valueRef.current;

    if (e.pointerId !== undefined) {
      containerRef.current?.setPointerCapture(e.pointerId);
    }
  }, [disabled, getAngleFromEvent]);

  // Handle drag move
  const handlePointerMove = useCallback((e) => {
    if (!isDragging || disabled) return;
    
    e.preventDefault();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    
    const currentAngle = getAngleFromEvent(clientX, clientY);
    let angleDelta = currentAngle - startAngleRef.current;
    
    // Handle wrap-around at 180/-180
    if (angleDelta > 180) angleDelta -= 360;
    if (angleDelta < -180) angleDelta += 360;
    
    // Convert angle change to value change (270 degrees = full range)
    const valueDelta = (angleDelta / 270) * (max - min);
    let newValue = startValueRef.current + valueDelta;
    
    // Clamp and step
    newValue = Math.round(newValue / step) * step;
    newValue = Math.max(min, Math.min(max, newValue));
    
    if (newValue !== valueRef.current) {
      setLocalValue(newValue);
      valueRef.current = newValue;
      onChange?.(newValue);
    }
  }, [isDragging, disabled, getAngleFromEvent, min, max, step, onChange]);

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

  // Generate tick marks
  const ticks = [];
  if (showMarks) {
    for (let i = 0; i <= 10; i++) {
      const tickAngle = -135 + (i / 10) * 270;
      const isMain = i % 5 === 0;
      const innerRadius = isMain ? 42 : 44;
      const outerRadius = 48;
      const rad = (tickAngle - 90) * (Math.PI / 180);
      
      ticks.push({
        x1: 50 + Math.cos(rad) * innerRadius,
        y1: 50 + Math.sin(rad) * innerRadius,
        x2: 50 + Math.cos(rad) * outerRadius,
        y2: 50 + Math.sin(rad) * outerRadius,
        isMain,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className={`volume-knob ${className} ${disabled ? 'opacity-50' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        width: 80,
        height: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        touchAction: 'none',
        cursor: disabled ? 'default' : 'grab',
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handlePointerDown}
    >
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', maxWidth: 80, maxHeight: 80 }}>
        <defs>
          <linearGradient id={`${uid}-knobGrad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4B5563"/>
            <stop offset="50%" stopColor="#374151"/>
            <stop offset="100%" stopColor="#1F2937"/>
          </linearGradient>
          <linearGradient id={`${uid}-knobHighlight`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)"/>
            <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </linearGradient>
          <filter id={`${uid}-knobShadow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.4)"/>
          </filter>
        </defs>

        {/* Background ring */}
        <circle cx="50" cy="50" r="48" fill="#121622"/>
        
        {/* Tick marks */}
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.isMain ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'}
            strokeWidth={tick.isMain ? 2 : 1}
            strokeLinecap="round"
          />
        ))}

        {/* Active arc (shows current level) */}
        <path
          d={describeArc(50, 50, 38, -135, rotation)}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 6px ${color}88)`,
            transition: isDragging ? 'none' : 'd 100ms ease-out',
          }}
        />

        {/* Knob body */}
        <circle
          cx="50"
          cy="50"
          r="32"
          fill={`url(#${uid}-knobGrad)`}
          filter={`url(#${uid}-knobShadow)`}
          style={{
            transition: 'transform 100ms ease',
          }}
        />
        
        {/* Knob highlight */}
        <ellipse
          cx="50"
          cy="42"
          rx="24"
          ry="16"
          fill={`url(#${uid}-knobHighlight)`}
        />

        {/* Knob edge ring */}
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="none"
          stroke={isDragging ? color : 'rgba(255,255,255,0.1)'}
          strokeWidth="1"
          style={{ transition: 'stroke 150ms ease' }}
        />

        {/* Indicator notch */}
        <g transform={`rotate(${rotation}, 50, 50)`}>
          <line
            x1="50"
            y1="22"
            x2="50"
            y2="30"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 4px ${color})`,
            }}
          />
        </g>

        {/* Center value display */}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          fill={isDragging ? color : 'rgba(255,255,255,0.9)'}
          style={{ transition: 'fill 150ms ease' }}
        >
          {Math.round(localValue)}
        </text>
      </svg>

      {/* Label */}
      {label && (
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 2,
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

// Helper to describe an SVG arc path
function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}
