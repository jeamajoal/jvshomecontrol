import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Compass } from 'lucide-react';
import { MENU_PAGES, PAGE_LABELS } from '../pages';

/**
 * A discrete pill-style page navigation dropdown that replaces the
 * native `<select>` element. Matches the PanelSelector visual style
 * for a consistent, cohesive header.
 *
 * @param {{ page: number, setPage: (p: number) => void, className?: string, onNavigate?: () => void }} props
 */
export default function NavMenu({ page, setPage, className = '', onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const label = PAGE_LABELS[page] || 'Home';

  const select = (value) => {
    setPage(value);
    setOpen(false);
    if (onNavigate) onNavigate();
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Navigate to page — current: ${label}`}
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70 hover:bg-white/10 hover:text-white/90 transition-colors select-none"
      >
        <Compass size={13} className="opacity-60" />
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown size={12} className={`opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Pages"
          className="absolute left-0 top-full mt-1.5 z-50 min-w-[160px] max-w-[260px] max-h-[320px] overflow-y-auto rounded-xl border border-white/15 bg-black/90 backdrop-blur-xl shadow-2xl py-1"
        >
          {MENU_PAGES.map((p) => (
            <button
              key={p.value}
              role="option"
              aria-selected={p.value === page}
              onClick={() => select(p.value)}
              className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors truncate ${
                p.value === page
                  ? 'text-white bg-white/10'
                  : 'text-white/70 hover:bg-white/5 hover:text-white/90'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
