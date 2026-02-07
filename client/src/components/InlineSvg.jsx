import React, { useEffect, useMemo, useState } from 'react';

function sanitizeSvg(svgText) {
  // Parse and sanitize to reduce risk of executing script from user-provided SVGs.
  // This is intentionally conservative.
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(svgText || ''), 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;

    // Remove risky elements.
    const toRemove = doc.querySelectorAll('script, foreignObject');
    toRemove.forEach((n) => n.remove());

    // Remove inline event handlers + javascript: hrefs.
    const all = doc.querySelectorAll('*');
    all.forEach((el) => {
      // Remove on* attributes
      for (const attr of Array.from(el.attributes || [])) {
        const name = String(attr.name || '').toLowerCase();
        const value = String(attr.value || '');
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }
        if ((name === 'href' || name === 'xlink:href') && /^\s*javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      }
    });

    const hasHotspots = !!doc.querySelector('[data-jvs-command], [data-command], [data-jvs-action]');
    return { markup: new XMLSerializer().serializeToString(svg), hasHotspots };
  } catch {
    return null;
  }
}

function ensureSvgViewportSizing(svgMarkup) {
  const text = String(svgMarkup || '');
  if (!text) return text;

  return text.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let a = String(attrs || '');

    // Always force width/height to 100% so the SVG fills its container
    // rather than rendering at a fixed pixel size offset to the top-left.
    a = a.replace(/\bwidth\s*=\s*("[^"]*"|'[^']*')/gi, '');
    a = a.replace(/\bheight\s*=\s*("[^"]*"|'[^']*')/gi, '');
    a += ' width="100%" height="100%"';

    if (!/\bpreserveAspectRatio\s*=\s*("[^"]*"|'[^']*')/i.test(a)) {
      a += ' preserveAspectRatio="xMidYMid meet"';
    }
    if (!/\bstyle\s*=\s*("[^"]*"|'[^']*')/i.test(a)) {
      a += ' style="display:block"';
    }

    // Inject a <style> so interactive elements capture clicks on their
    // entire bounding box — not just on visible fill/stroke edges.
    const interactiveStyle =
      '<style>[data-region],[data-jvs-command],[data-command],[data-jvs-action]{pointer-events:all;cursor:pointer}</style>';

    return `<svg${a}>${interactiveStyle}`;
  });
}

function mergeSvgRootClass(svgMarkup, classToAdd) {
  const cls = String(classToAdd || '').trim();
  if (!cls) return svgMarkup;

  // Add or merge class on the root <svg ...> tag.
  return String(svgMarkup).replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    const hasClass = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    if (hasClass) {
      const quote = hasClass[1];
      const existing = hasClass[2];
      const set = new Set(String(existing).split(/\s+/).map((s) => s.trim()).filter(Boolean));
      set.add(cls);
      const next = Array.from(set).join(' ');
      const nextAttrs = attrs.replace(/\bclass\s*=\s*(["'])(.*?)\1/i, ` class=${quote}${next}${quote}`);
      return `<svg${nextAttrs}>`;
    }
    return `<svg class="${cls}"${attrs}>`;
  });
}

function parseSvgArgs(value) {
  const raw = (value === null || value === undefined) ? '' : String(value).trim();
  if (!raw) return [];

  // JSON format: [1,2] or "string" or 123
  if (/^[\[{\"\d\-]/.test(raw)) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch {
      // fall through
    }
  }

  // Comma-separated format: a,b,c
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const num = Number(s);
      return Number.isFinite(num) && String(num) === s ? num : s;
    });
}

function findCommandTarget(startEl) {
  const el = startEl && startEl.nodeType === 1 ? startEl : null;
  if (!el || typeof el.closest !== 'function') return null;

  // Prefer explicit jvs attribute, but support a couple aliases for convenience.
  const target = el.closest('[data-jvs-command], [data-command], [data-jvs-action]');
  if (!target) return null;

  const cmd = (
    target.getAttribute('data-jvs-command')
    || target.getAttribute('data-command')
    || target.getAttribute('data-jvs-action')
    || ''
  ).trim();

  if (!cmd) return null;

  const argsRaw = target.getAttribute('data-jvs-args') || target.getAttribute('data-args');
  const args = parseSvgArgs(argsRaw);

  return { command: cmd, args, element: target };
}

export default function InlineSvg({
  src,
  rootClassName = '',
  className = '',
  style,
  title,
  onClick,
  onCommand,
  onMeta,
  disabled,
  tabIndex,
  role,
  ariaLabel,
}) {
  const url = typeof src === 'string' ? src.trim() : '';
  const [svgMarkup, setSvgMarkup] = useState(null);
  const [error, setError] = useState(null);
  const [hasHotspots, setHasHotspots] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!url) {
        setSvgMarkup(null);
        setError(null);
        return;
      }

      try {
        setError(null);
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `SVG fetch failed (${res.status})`);
        }
        const text = await res.text();
        const sanitized = sanitizeSvg(text);
        if (!sanitized || !sanitized.markup) throw new Error('Invalid SVG');
        const sized = ensureSvgViewportSizing(sanitized.markup);
        if (!cancelled) {
          setSvgMarkup(sized);
          setHasHotspots(!!sanitized.hasHotspots);
          if (typeof onMeta === 'function') onMeta({ hasHotspots: !!sanitized.hasHotspots, src: url });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || String(e));
          setSvgMarkup(null);
          setHasHotspots(false);
          if (typeof onMeta === 'function') onMeta({ hasHotspots: false, src: url, error: e?.message || String(e) });
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const mergedMarkup = useMemo(() => {
    if (!svgMarkup) return null;
    return mergeSvgRootClass(svgMarkup, rootClassName);
  }, [svgMarkup, rootClassName]);

  if (!url) return null;

  // If SVG fails to load, fail quietly (avoid breaking the control).
  if (!mergedMarkup) {
    return (
      <div
        className={className}
        style={style}
        title={title || (error || '')}
        aria-label={ariaLabel}
        role={role}
      />
    );
  }

  return (
    <div
      className={className}
      style={style}
      title={title}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onClick={disabled ? undefined : (e) => {
        if (disabled) return;

        if (typeof onCommand === 'function') {
          const hit = findCommandTarget(e.target);
          if (hit) {
            e.preventDefault();
            e.stopPropagation();
            onCommand(hit.command, hit.args, hit.element, e);
            return;
          }
        }

        if (typeof onClick === 'function') onClick(e);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: mergedMarkup }}
    />
  );
}
