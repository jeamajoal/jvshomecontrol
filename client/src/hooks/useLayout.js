import { useEffect, useRef, useState } from 'react';

/**
 * Measures the bounding-box of a DOM element via ResizeObserver.
 *
 * Previously duplicated in FloorPlan.jsx, HeatmapPanel.jsx and
 * InteractionPanel.jsx.
 *
 * @param {React.RefObject} ref - Ref attached to the element to observe.
 * @returns {{ width: number, height: number }}
 */
export const useResizeObserver = (ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
};

/**
 * Computes a scale factor so that `contentRef` fits inside `viewportRef`
 * without overflowing, capped at 1.15×.  On narrow viewports (< 768 px)
 * returns 1 to avoid double-scaling with responsive breakpoints.
 *
 * Previously duplicated in InteractionPanel.jsx and HeatmapPanel.jsx.
 *
 * @param {{ heightOnly?: boolean }} [opts]
 * @returns {{ viewportRef, contentRef, scale: number }}
 */
export const useFitScale = ({ heightOnly = false } = {}) => {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const viewportEl = viewportRef.current;
    const contentEl = contentRef.current;
    if (!viewportEl || !contentEl) return;

    const compute = () => {
      const isMdUp = typeof window !== 'undefined'
        ? window.matchMedia('(min-width: 768px)').matches
        : true;

      if (!isMdUp) {
        setScale(1);
        return;
      }

      const SAFE_GUTTER_PX = 16;
      const vw = Math.max((viewportEl.clientWidth || 1) - SAFE_GUTTER_PX, 1);
      const vh = Math.max((viewportEl.clientHeight || 1) - SAFE_GUTTER_PX, 1);
      const cw = Math.max(contentEl.scrollWidth, contentEl.clientWidth, 1);
      const ch = Math.max(contentEl.scrollHeight, contentEl.clientHeight, 1);

      const rawW = heightOnly ? Infinity : (vw / cw);
      const raw = Math.min(rawW, vh / ch) * 0.99;
      const next = Math.min(raw, 1.15);
      setScale((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(viewportEl);
    ro.observe(contentEl);
    window.addEventListener('resize', compute);

    return () => {
      window.removeEventListener('resize', compute);
      ro.disconnect();
    };
  }, [heightOnly]);

  return { viewportRef, contentRef, scale };
};
