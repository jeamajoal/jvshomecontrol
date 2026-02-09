import { useEffect } from 'react';
import { getToleranceColorStyle } from '../toleranceColors';
import { clamp, clamp01 } from '../utils';

/**
 * Resolve a Tailwind `bg-*` class to an RGB triplet string ("r g b").
 *
 * Creates a temporary DOM element, applies the class, reads the
 * computed background-color, and immediately removes the element.
 */
function resolveRgbTripletFromBgClass(bgClass) {
  const el = document.createElement('div');
  el.className = bgClass;
  Object.assign(el.style, {
    position: 'absolute',
    left: '-99999px',
    top: '-99999px',
    width: '1px',
    height: '1px',
  });

  try {
    document.body.appendChild(el);
  } catch {
    return null;
  }

  try {
    const color = window.getComputedStyle(el).backgroundColor;
    const m = String(color || '').match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if (![r, g, b].every((n) => Number.isFinite(n))) return null;
    return `${r} ${g} ${b}`;
  } catch {
    return null;
  } finally {
    try { el.remove(); } catch { /* ignore */ }
  }
}

/**
 * Resolve a tolerance color ID to an RGB triplet.
 */
function resolveColorIdToTriplet(colorId) {
  if (!colorId || colorId === 'none') return null;
  const style = getToleranceColorStyle(colorId);
  const tokens = String(style?.swatch || '').split(/\s+/).filter(Boolean);
  const bgToken = tokens.find((t) => t.startsWith('bg-'));
  return bgToken ? resolveRgbTripletFromBgClass(bgToken) : null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read a config value as a clamped integer percentage. */
function pct(value, min, max, fallback) {
  const raw = Number(value);
  const n = Number.isFinite(raw) ? Math.round(raw) : fallback;
  return Math.max(min, Math.min(max, n));
}

// ── The Hook ────────────────────────────────────────────────────────────────

/**
 * Synchronises all UI-configurable CSS custom properties with the
 * current effective config.
 *
 * This replaces the eight nearly-identical `useEffect` blocks that
 * were previously inlined in App.jsx, making the main component
 * significantly shorter and easier to maintain.
 *
 * @param {object} ui  - `effectiveConfig.ui` (or `{}`)
 */
export function useCssCustomProperties(ui) {
  const safeUi = ui && typeof ui === 'object' ? ui : {};

  // ── Accent & Glow colours ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const accentId = String(safeUi.accentColorId ?? '').trim() || 'neon-blue';
      const accentTriplet = resolveColorIdToTriplet(accentId);
      if (accentTriplet) {
        document.documentElement.style.setProperty('--accent-rgb', accentTriplet);
      }
    } catch { /* ignore */ }

    try {
      const glowId = String(safeUi.glowColorId ?? '').trim();
      if (!glowId || glowId === 'none') {
        document.documentElement.style.setProperty('--jvs-glow-rgb', 'var(--accent-rgb)');
      } else {
        const triplet = resolveColorIdToTriplet(glowId);
        document.documentElement.style.setProperty(
          '--jvs-glow-rgb',
          triplet || 'var(--accent-rgb)',
        );
      }
    } catch { /* ignore */ }

    try {
      const glowOpacity = pct(safeUi.glowOpacityPct, 0, 100, 100) / 100;
      document.documentElement.style.setProperty('--jvs-glow-opacity', String(glowOpacity));

      const glowSize = pct(safeUi.glowSizePct, 50, 200, 100) / 100;
      document.documentElement.style.setProperty('--jvs-glow-size-scale', String(glowSize));
    } catch { /* ignore */ }
  }, [safeUi.accentColorId, safeUi.glowColorId, safeUi.glowOpacityPct, safeUi.glowSizePct]);

  // ── Icon opacity & size ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const opacity = pct(safeUi.iconOpacityPct, 0, 100, 100) / 100;
      document.documentElement.style.setProperty('--jvs-icon-opacity', String(opacity));

      const size = pct(safeUi.iconSizePct, 50, 200, 100) / 100;
      document.documentElement.style.setProperty('--jvs-icon-size-scale', String(size));
    } catch { /* ignore */ }
  }, [safeUi.iconOpacityPct, safeUi.iconSizePct]);

  // ── Card opacity & blur ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const scale = pct(safeUi.cardOpacityScalePct, 0, 200, 100) / 100;

      document.documentElement.style.setProperty('--jvs-glass-panel-bg-opacity', String(clamp01(0.30 * scale)));
      document.documentElement.style.setProperty('--jvs-accent-card-bg-opacity', String(clamp01(0.10 * scale)));

      const blurScale = pct(safeUi.blurScalePct, 0, 200, 100) / 100;
      const baseBlurPx = 24;
      const blurPx = clamp(baseBlurPx * blurScale, 0, baseBlurPx * 2);
      document.documentElement.style.setProperty('--jvs-glass-panel-blur-px', `${blurPx}px`);

      const baseMenuBlurPx = 12;
      const menuBlurPx = clamp(baseMenuBlurPx * blurScale, 0, baseMenuBlurPx * 2);
      document.documentElement.style.setProperty('--jvs-header-bg-opacity', String(clamp01(0.20 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-surface-bg-opacity', String(clamp01(0.20 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-row-bg-opacity', String(clamp01(0.10 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-select-bg-opacity', String(clamp01(0.10 * scale)));
      document.documentElement.style.setProperty('--jvs-menu-select-strong-bg-opacity', String(clamp01(0.30 * scale)));
      document.documentElement.style.setProperty('--jvs-header-blur-px', `${menuBlurPx}px`);
      document.documentElement.style.setProperty('--jvs-menu-blur-px', `${menuBlurPx}px`);
    } catch { /* ignore */ }
  }, [safeUi.cardOpacityScalePct, safeUi.blurScalePct]);

  // ── Text tiers (primary / secondary / tertiary) ─────────────────────────
  useTextTier(safeUi.primaryTextOpacityPct, safeUi.primaryTextSizePct, 'primary', 100, 100);
  useTextTier(safeUi.secondaryTextOpacityPct, safeUi.secondaryTextSizePct, 'secondary', 45, 100);
  useTextTier(safeUi.tertiaryTextOpacityPct, safeUi.tertiaryTextSizePct, 'tertiary', 70, 100);
}

/**
 * Internal helper — sets the CSS custom properties for a single text tier.
 *
 * Each tier has: --jvs-<tier>-text-opacity, --jvs-<tier>-text-strong-opacity,
 *                --jvs-<tier>-text-size-scale
 */
function useTextTier(opacityPctRaw, sizePctRaw, tier, defaultOpacity, defaultSize) {
  useEffect(() => {
    try {
      const base = pct(opacityPctRaw, 0, 100, defaultOpacity) / 100;
      const strong = clamp01(base + 0.10);
      document.documentElement.style.setProperty(`--jvs-${tier}-text-opacity`, String(base));
      document.documentElement.style.setProperty(`--jvs-${tier}-text-strong-opacity`, String(strong));
    } catch { /* ignore */ }
  }, [opacityPctRaw, tier, defaultOpacity]);

  useEffect(() => {
    try {
      const scale = pct(sizePctRaw, 50, 200, defaultSize) / 100;
      document.documentElement.style.setProperty(`--jvs-${tier}-text-size-scale`, String(scale));
    } catch { /* ignore */ }
  }, [sizePctRaw, tier, defaultSize]);
}
