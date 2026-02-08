import React, { useCallback, useState } from 'react';

/**
 * MediaTransport - TV/Media transport controls (play, pause, stop, skip)
 * 
 * A set of media control buttons styled like a modern remote control.
 * Clean, high-contrast design with prominent play button.
 * 
 * Props:
 *   isPlaying    - Current playing state
 *   isPaused     - Current paused state  
 *   disabled     - Disable interactions
 *   onCommand    - Callback: (command) => void
 *   commands     - Available commands from device
 *   className    - Additional CSS classes
 *   style        - Additional inline styles
 */
export default function MediaTransport({
  isPlaying = false,
  isPaused = false,
  disabled = false,
  onCommand,
  commands = [],
  className = '',
  style,
}) {
  const [pressedButton, setPressedButton] = useState(null);

  const handlePress = useCallback((command) => {
    if (disabled || !onCommand) return;
    
    setPressedButton(command);
    setTimeout(() => setPressedButton(null), 150);
    
    onCommand(command);
  }, [disabled, onCommand]);

  const isPressed = (cmd) => pressedButton === cmd;

  // Determine which buttons to show based on device commands
  const cmds = Array.isArray(commands) && commands.length ? commands : null;
  const hasPrev = !cmds || cmds.includes('previousTrack');
  const hasStop = !cmds || cmds.includes('stop');
  const hasPlay = !cmds || cmds.includes('play');
  const hasPause = !cmds || cmds.includes('pause');
  const hasNext = !cmds || cmds.includes('nextTrack');
  const hasPlayOrPause = hasPlay || hasPause;

  return (
    <div
      className={`media-transport ${className} ${disabled ? 'opacity-50' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 14px',
        background: 'linear-gradient(to bottom, #2D3444, #1F2430)',
        borderRadius: 30,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
        ...style,
      }}
    >
      {/* Previous/Rewind */}
      {hasPrev && (
      <button
        onClick={() => handlePress('previousTrack')}
        disabled={disabled}
        title="Previous"
        aria-label="Previous track"
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: 'none',
          background: isPressed('previousTrack') 
            ? 'rgba(255,255,255,0.2)' 
            : 'rgba(255,255,255,0.08)',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 100ms ease',
          transform: isPressed('previousTrack') ? 'scale(0.92)' : 'scale(1)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M6 6h2.5v12H6V6z" fill="#fff"/>
          <path d="M18 6v12l-9-6 9-6z" fill="#fff"/>
        </svg>
      </button>
      )}

      {/* Stop */}
      {hasStop && (
      <button
        onClick={() => handlePress('stop')}
        disabled={disabled}
        title="Stop"
        aria-label="Stop"
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: 'none',
          background: isPressed('stop') 
            ? 'rgba(255,255,255,0.2)' 
            : 'rgba(255,255,255,0.08)',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 100ms ease',
          transform: isPressed('stop') ? 'scale(0.92)' : 'scale(1)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="#fff"/>
        </svg>
      </button>
      )}

      {/* Play/Pause - Main button */}
      {hasPlayOrPause && (
      <button
        onClick={() => handlePress(isPlaying && hasPause ? 'pause' : 'play')}
        disabled={disabled}
        title={isPlaying ? 'Pause' : 'Play'}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          border: 'none',
          background: isPlaying
            ? 'linear-gradient(135deg, #22D3EE 0%, #0891B2 100%)'
            : isPressed('play') || isPressed('pause')
              ? 'linear-gradient(135deg, #4B82F6 0%, #2563EB 100%)'
              : 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
          boxShadow: isPlaying
            ? '0 0 24px rgba(34, 211, 238, 0.5), 0 4px 12px rgba(0,0,0,0.3)'
            : '0 4px 12px rgba(59, 130, 246, 0.3), 0 4px 8px rgba(0,0,0,0.2)',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 120ms ease',
          transform: isPressed('play') || isPressed('pause') ? 'scale(0.94)' : 'scale(1)',
        }}
      >
        {isPlaying ? (
          <svg width="24" height="24" viewBox="0 0 24 24">
            <rect x="6" y="5" width="4" height="14" rx="1" fill="#fff"/>
            <rect x="14" y="5" width="4" height="14" rx="1" fill="#fff"/>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7L8 5z" fill="#fff"/>
          </svg>
        )}
      </button>
      )}

      {/* Next/Forward */}
      {hasNext && (
      <button
        onClick={() => handlePress('nextTrack')}
        disabled={disabled}
        title="Next"
        aria-label="Next track"
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          border: 'none',
          background: isPressed('nextTrack') 
            ? 'rgba(255,255,255,0.2)' 
            : 'rgba(255,255,255,0.08)',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 100ms ease',
          transform: isPressed('nextTrack') ? 'scale(0.92)' : 'scale(1)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M6 6v12l9-6-9-6z" fill="#fff"/>
          <path d="M15.5 6h2.5v12h-2.5V6z" fill="#fff"/>
        </svg>
      </button>
      )}
    </div>
  );
}
