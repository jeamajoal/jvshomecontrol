import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * DevicePopupShell
 *
 * A slide-up modal shell used by all device-specific popups.
 * Renders a backdrop + centered glass-panel card with a close button.
 */
export default function DevicePopupShell({ title, subtitle, open, onClose, children, uiScheme }) {
  const backdropRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      // Slight delay so CSS transition can kick in
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  const handleBackdrop = useCallback((e) => {
    if (e.target === backdropRef.current) onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div
        className={`glass-panel border border-white/15 rounded-2xl p-5 w-[340px] max-w-[90vw] max-h-[85vh] overflow-y-auto shadow-2xl transition-transform duration-200 ${visible ? 'translate-y-0 scale-100' : 'translate-y-8 scale-95'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {subtitle ? (
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-semibold">{subtitle}</div>
            ) : null}
            <h3 className="text-base font-extrabold tracking-tight text-white truncate">{title || 'Device'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
