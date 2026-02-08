import React from 'react';

/**
 * Reusable grid of device info metric cards.
 *
 * Previously duplicated in InteractionPanel.jsx (compact variant) and
 * EnvironmentPanel.jsx (scaled variant with custom colour classes).
 * This unified version supports both use-cases via optional props.
 *
 * @param {{ items: Array, scale?: number, compact?: boolean,
 *           primaryTextColorClassName?: string,
 *           secondaryTextColorClassName?: string,
 *           tertiaryTextColorClassName?: string }} props
 */
const DeviceInfoGrid = ({
  items,
  scale = 1,
  compact = false,
  primaryTextColorClassName = '',
  secondaryTextColorClassName = '',
  tertiaryTextColorClassName = '',
}) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  if (compact) {
    // Interaction-panel style: single-column, slightly larger text
    return (
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {list.map((item) => (
          <div key={item.key} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div
              className={`text-[10px] uppercase tracking-[0.18em] jvs-secondary-text ${secondaryTextColorClassName}`.trim()}
              style={{ fontSize: `calc(10px * ${scale} * var(--jvs-secondary-text-size-scale, 1))` }}
            >
              {item.label}
            </div>
            <div
              className={`mt-1 text-xs font-semibold jvs-tertiary-text ${tertiaryTextColorClassName}`.trim()}
              style={{ fontSize: `calc(12px * ${scale} * var(--jvs-tertiary-text-size-scale, 1))` }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Environment-panel style: 2-col, tighter spacing
  return (
    <div className="mt-2 grid grid-cols-2 gap-1">
      {list.map((item) => (
        <div key={item.key} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
          <div
            className={`text-[9px] uppercase tracking-[0.12em] jvs-secondary-text ${secondaryTextColorClassName || 'text-white/60'}`.trim()}
            style={{ fontSize: `calc(9px * ${scale} * var(--jvs-secondary-text-size-scale, 1))` }}
          >
            {item.label}
          </div>
          <div
            className={`text-[11px] font-semibold jvs-tertiary-text ${tertiaryTextColorClassName || 'text-white/80'}`.trim()}
            style={{ fontSize: `calc(11px * ${scale} * var(--jvs-tertiary-text-size-scale, 1))` }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DeviceInfoGrid;
