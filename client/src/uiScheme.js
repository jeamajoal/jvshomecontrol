const ACCENT_TEXT = 'text-[rgb(var(--accent-rgb))]';
const ACCENT_BG_10 = 'bg-[rgb(var(--accent-rgb)_/_0.10)]';
const ACCENT_BG_20 = 'bg-[rgb(var(--accent-rgb)_/_0.20)]';
const ACCENT_BORDER_25 = 'border-[rgb(var(--accent-rgb)_/_0.25)]';
const ACCENT_BORDER_30 = 'border-[rgb(var(--accent-rgb)_/_0.30)]';
const ACCENT_BORDER_40 = 'border-[rgb(var(--accent-rgb)_/_0.40)]';
const ACCENT_RING_20 = 'ring-[rgb(var(--accent-rgb)_/_0.20)]';

export function getUiScheme() {
  return {
    tabActive: `${ACCENT_BG_10} ${ACCENT_TEXT}`,
    headerIcon: `${ACCENT_BG_20} ${ACCENT_BORDER_30} ${ACCENT_TEXT}`,
    headerGlow: 'animate-glow-accent',
    actionButton: `${ACCENT_TEXT} ${ACCENT_BORDER_30} ${ACCENT_BG_10}`,
    checkboxAccent: 'accent-[rgb(var(--accent-rgb))]',
    focusRing: `focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-rgb)_/_0.35)] focus:border-[rgb(var(--accent-rgb)_/_0.40)]`,
    selectedCard: ACCENT_BORDER_40,
    selectedText: ACCENT_TEXT,
    metricIcon: ACCENT_TEXT,
    editBorder: ACCENT_BORDER_25,
    editRing: ACCENT_RING_20,
  };
}
