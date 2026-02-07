/**
 * Page navigation constants.
 *
 * Replaces the magic numbers previously scattered through App.jsx.
 * Import these wherever you need to reference a page by name.
 */

export const PAGE = Object.freeze({
  HOME: 0,
  CLIMATE: 1,
  WEATHER: 2,
  ACTIVITY: 3,
  CONTROLS: 4,
  SETTINGS: 5,
  INFO: 6,
  EVENTS: 7,   // Hidden — accessible from Settings
});

/** Human-readable label for each page index. */
export const PAGE_LABELS = Object.freeze({
  [PAGE.HOME]: 'Home',
  [PAGE.CLIMATE]: 'Climate',
  [PAGE.WEATHER]: 'Weather',
  [PAGE.ACTIVITY]: 'Activity',
  [PAGE.CONTROLS]: 'Controls',
  [PAGE.SETTINGS]: 'Settings',
  [PAGE.INFO]: 'Info',
  [PAGE.EVENTS]: 'Events',
});

/** Pages shown in the navigation menu (Events is hidden). */
export const MENU_PAGES = Object.freeze([
  { value: PAGE.HOME, label: PAGE_LABELS[PAGE.HOME] },
  { value: PAGE.CLIMATE, label: PAGE_LABELS[PAGE.CLIMATE] },
  { value: PAGE.WEATHER, label: PAGE_LABELS[PAGE.WEATHER] },
  { value: PAGE.ACTIVITY, label: PAGE_LABELS[PAGE.ACTIVITY] },
  { value: PAGE.CONTROLS, label: PAGE_LABELS[PAGE.CONTROLS] },
  { value: PAGE.SETTINGS, label: PAGE_LABELS[PAGE.SETTINGS] },
  { value: PAGE.INFO, label: PAGE_LABELS[PAGE.INFO] },
]);
