import React, { useEffect, useMemo, useRef, useState } from 'react';

import { API_HOST } from '../apiHost';
import { useAppState } from '../appState';
import {
  TOLERANCE_COLOR_CHOICES,
  normalizeToleranceColorId,
} from '../toleranceColors';
import { getUiScheme } from '../uiScheme';
import { INTERNAL_DEVICE_TYPES } from '../deviceMapping';

const HOME_TOP_ROW_CARD_IDS = ['time', 'outside', 'inside', 'home'];

async function saveAllowlists(payload) {
  const res = await fetch(`${API_HOST}/api/ui/allowed-device-ids`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Allowlist save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveVisibleRoomIds(visibleRoomIds, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/visible-room-ids`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visibleRoomIds: Array.isArray(visibleRoomIds) ? visibleRoomIds : [],
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Visible rooms save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveHomeVisibleDeviceIds(homeVisibleDeviceIds, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/home-visible-device-ids`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      homeVisibleDeviceIds: Array.isArray(homeVisibleDeviceIds) ? homeVisibleDeviceIds : [],
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Home visible devices save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveCtrlVisibleDeviceIds(ctrlVisibleDeviceIds, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/ctrl-visible-device-ids`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ctrlVisibleDeviceIds: Array.isArray(ctrlVisibleDeviceIds) ? ctrlVisibleDeviceIds : [],
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Controls visible devices save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveDeviceOverrides(payload) {
  const res = await fetch(`${API_HOST}/api/ui/device-overrides`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Device override save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveDeviceControlStyles(deviceControlStyles) {
  const res = await fetch(`${API_HOST}/api/ui/device-control-styles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceControlStyles: deviceControlStyles || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Device control styles save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveDeviceTypeIcons(deviceTypeIcons) {
  const res = await fetch(`${API_HOST}/api/ui/device-type-icons`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceTypeIcons: deviceTypeIcons || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Device type icons save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveDeviceControlIcons(deviceControlIcons) {
  const res = await fetch(`${API_HOST}/api/ui/device-control-icons`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceControlIcons: deviceControlIcons || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Device control icons save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveAccentColorId(accentColorId, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/accent-color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accentColorId,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Accent color save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function createPanelProfile(name, seedFromPanelName) {
  const res = await fetch(`${API_HOST}/api/ui/panels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      ...(seedFromPanelName ? { seedFromPanelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Panel create failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function fetchSoundFiles() {
  const res = await fetch(`${API_HOST}/api/sounds`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Sounds fetch failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const files = Array.isArray(data?.files) ? data.files : [];
  return files.map((v) => String(v)).filter(Boolean);
}

async function fetchDeviceIconsIndex() {
  const res = await fetch(`${API_HOST}/api/device-icons`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Device icons fetch failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const byType = (data?.byType && typeof data.byType === 'object') ? data.byType : {};
  const out = {};
  for (const [k, v] of Object.entries(byType)) {
    const files = Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
    out[String(k)] = files;
  }
  return { rootUrl: typeof data?.rootUrl === 'string' ? data.rootUrl : '/device-icons', byType: out };
}

async function fetchControlIconsIndex() {
  const res = await fetch(`${API_HOST}/api/control-icons`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Control icons fetch failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const icons = Array.isArray(data?.icons) ? data.icons : [];
  return { rootUrl: data?.rootUrl || '/control-icons', icons };
}

async function fetchOpenMeteoConfig() {
  const res = await fetch(`${API_HOST}/api/weather/open-meteo-config`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Open-Meteo config fetch failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveOpenMeteoConfig(openMeteo) {
  const res = await fetch(`${API_HOST}/api/weather/open-meteo-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openMeteo: openMeteo || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Open-Meteo config save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveAlertSounds(alertSounds) {
  const res = await fetch(`${API_HOST}/api/ui/alert-sounds`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertSounds: alertSounds || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Alert sounds save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveClimateTolerances(climateTolerances) {
  const res = await fetch(`${API_HOST}/api/ui/climate-tolerances`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ climateTolerances: climateTolerances || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Climate tolerances save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveClimateToleranceColors(climateToleranceColors) {
  const res = await fetch(`${API_HOST}/api/ui/climate-tolerance-colors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ climateToleranceColors: climateToleranceColors || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Climate tolerance colors save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveColorizeHomeValues(payload) {
  const next = payload && typeof payload === 'object' ? payload : {};
  const res = await fetch(`${API_HOST}/api/ui/colorize-home-values`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      colorizeHomeValues: !!next.colorizeHomeValues,
      ...(next.colorizeHomeValuesOpacityPct === undefined
        ? {}
        : { colorizeHomeValuesOpacityPct: next.colorizeHomeValuesOpacityPct }),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Colorize Home values save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveCardOpacityScalePct(cardOpacityScalePct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/card-opacity-scale`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cardOpacityScalePct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Card opacity save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveBlurScalePct(blurScalePct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/blur-scale`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blurScalePct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Blur save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveSecondaryTextOpacityPct(secondaryTextOpacityPct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/secondary-text-opacity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secondaryTextOpacityPct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Secondary text save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveSecondaryTextSizePct(secondaryTextSizePct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/secondary-text-size`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secondaryTextSizePct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Secondary text size save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveSecondaryTextColorId(secondaryTextColorId, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/secondary-text-color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secondaryTextColorId: secondaryTextColorId || null,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Secondary text color save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function savePrimaryTextOpacityPct(primaryTextOpacityPct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/primary-text-opacity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primaryTextOpacityPct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Primary text save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function savePrimaryTextSizePct(primaryTextSizePct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/primary-text-size`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primaryTextSizePct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Primary text size save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function savePrimaryTextColorId(primaryTextColorId, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/primary-text-color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primaryTextColorId: primaryTextColorId || null,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Primary text color save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveTertiaryTextOpacityPct(tertiaryTextOpacityPct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/tertiary-text-opacity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tertiaryTextOpacityPct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Tertiary text save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveTertiaryTextSizePct(tertiaryTextSizePct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/tertiary-text-size`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tertiaryTextSizePct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Tertiary text size save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveTertiaryTextColorId(tertiaryTextColorId, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/tertiary-text-color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tertiaryTextColorId: tertiaryTextColorId || null,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Tertiary text color save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveGlowColorId(glowColorId, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/glow-color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      glowColorId: glowColorId || null,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Glow color save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveIconColorId(iconColorId, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/icon-color`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      iconColorId: iconColorId || null,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Icon color save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveIconOpacityPct(iconOpacityPct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/icon-opacity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      iconOpacityPct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Icon opacity save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveIconSizePct(iconSizePct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/icon-size`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      iconSizePct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Icon size save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveCardScalePct(cardScalePct, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/card-scale`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cardScalePct,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Card spacing save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveHomeTopRow(payload, panelName) {
  const hasPayload = payload && typeof payload === 'object';
  const res = await fetch(`${API_HOST}/api/ui/home-top-row`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(hasPayload && Object.prototype.hasOwnProperty.call(payload, 'homeTopRowEnabled') ? { homeTopRowEnabled: payload.homeTopRowEnabled === true } : {}),
      ...(hasPayload && Object.prototype.hasOwnProperty.call(payload, 'homeTopRowScalePct') ? { homeTopRowScalePct: payload.homeTopRowScalePct } : {}),
      ...(hasPayload && Object.prototype.hasOwnProperty.call(payload, 'homeTopRowCards') ? { homeTopRowCards: Array.isArray(payload.homeTopRowCards) ? payload.homeTopRowCards : [] } : {}),
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Home top row save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveHomeRoomColumnsXl(homeRoomColumnsXl, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/home-room-columns-xl`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      homeRoomColumnsXl,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Home columns save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveHomeRoomLayout(payload, panelName) {
  const next = payload && typeof payload === 'object' ? payload : {};
  const res = await fetch(`${API_HOST}/api/ui/home-room-layout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(Object.prototype.hasOwnProperty.call(next, 'homeRoomLayoutMode') ? { homeRoomLayoutMode: next.homeRoomLayoutMode } : {}),
      ...(Object.prototype.hasOwnProperty.call(next, 'homeRoomMasonryRowHeightPx') ? { homeRoomMasonryRowHeightPx: next.homeRoomMasonryRowHeightPx } : {}),
      ...(Object.prototype.hasOwnProperty.call(next, 'homeRoomMinWidthPx') ? { homeRoomMinWidthPx: next.homeRoomMinWidthPx } : {}),
      ...(Object.prototype.hasOwnProperty.call(next, 'homeRoomTiles') ? { homeRoomTiles: next.homeRoomTiles || {} } : {}),
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Home room layout save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveHomeRoomMetricColumns(homeRoomMetricColumns, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/home-room-metric-columns`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      homeRoomMetricColumns,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Home metric columns save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveHomeRoomMetricKeys(homeRoomMetricKeys, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/home-room-metric-keys`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      homeRoomMetricKeys: Array.isArray(homeRoomMetricKeys) ? homeRoomMetricKeys : [],
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Home metric cards save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveCameraPreviews(payload, panelName) {
  const next = payload && typeof payload === 'object' ? payload : {};
  const res = await fetch(`${API_HOST}/api/ui/camera-previews`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      homeCameraPreviewsEnabled: next.homeCameraPreviewsEnabled === true,
      controlsCameraPreviewsEnabled: next.controlsCameraPreviewsEnabled === true,
      cameraPreviewRefreshSeconds: next.cameraPreviewRefreshSeconds,
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Camera preview save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function fetchUiCameras() {
  const res = await fetch(`${API_HOST}/api/ui/cameras`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Camera registry fetch failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const cams = Array.isArray(data?.cameras) ? data.cameras : [];
  return cams;
}

async function createUiCamera(camera) {
  const res = await fetch(`${API_HOST}/api/ui/cameras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ camera: camera || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Camera create failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function updateUiCamera(cameraId, camera) {
  const res = await fetch(`${API_HOST}/api/ui/cameras/${encodeURIComponent(cameraId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ camera: camera || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Camera update failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function deleteUiCamera(cameraId) {
  const res = await fetch(`${API_HOST}/api/ui/cameras/${encodeURIComponent(cameraId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Camera delete failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function saveSensorIndicatorColors(sensorIndicatorColors) {
  const res = await fetch(`${API_HOST}/api/ui/sensor-indicator-colors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sensorIndicatorColors: sensorIndicatorColors || {} }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Sensor indicator colors save failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

const toleranceSwatchClass = (id) => {
  const hit = TOLERANCE_COLOR_CHOICES.find((c) => c.id === id);
  return hit?.swatch || 'bg-white/20';
};

async function addManualRoom(name) {
  const res = await fetch(`${API_HOST}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Room add failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function deleteManualRoom(roomId) {
  const res = await fetch(`${API_HOST}/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Room delete failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function addLabel(text = 'Label') {
  const res = await fetch(`${API_HOST}/api/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Label add failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function updateLabel(labelId, text) {
  const res = await fetch(`${API_HOST}/api/labels/${encodeURIComponent(labelId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Label update failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

async function deleteLabel(labelId) {
  const res = await fetch(`${API_HOST}/api/labels/${encodeURIComponent(labelId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Label delete failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

function useAsyncSave(saveFn) {
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState(null);

  const run = async (payload) => {
    setStatus('saving');
    setError(null);
    try {
      const res = await saveFn(payload);
      setStatus('saved');
      return res;
    } catch (e) {
      setStatus('error');
      setError(e?.message || String(e));
      throw e;
    }
  };

  return { status, error, run, setError, setStatus };
}

const statusText = (status) => {
  if (status === 'saving') return 'Saving…';
  if (status === 'saved') return 'Saved';
  if (status === 'error') return 'Save failed';
  return '';
};

const asNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

// Keep in sync with server RTSP redaction to preserve credentials when editing.
const RTSP_REDACTED_PLACEHOLDER = '***';
const RTSP_REDACTED_PATTERN = new RegExp(`:\\/\\/[^/]*${RTSP_REDACTED_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@`, 'i');

const ConfigPanel = ({
  config: configProp,
  baseConfig: baseConfigProp,
  statuses: statusesProp,
  connected: connectedProp,
  onOpenEvents,
}) => {
  const ctx = useAppState();
  const config = configProp ?? ctx?.config;
  const baseConfig = baseConfigProp ?? configProp ?? ctx?.config;
  const statuses = statusesProp ?? ctx?.statuses;
  const connected = connectedProp ?? ctx?.connected;

  const selectedPanelName = String(ctx?.panelName ?? '').trim();
  const selectedPanelProfile = useMemo(() => {
    if (!selectedPanelName) return null;
    const raw = (config?.ui?.panelProfiles && typeof config.ui.panelProfiles === 'object')
      ? config.ui.panelProfiles
      : {};
    const hit = raw[selectedPanelName];
    return (hit && typeof hit === 'object') ? hit : null;
  }, [config?.ui?.panelProfiles, selectedPanelName]);
  const isPresetSelected = Boolean(selectedPanelProfile?._preset);
  const panelNames = useMemo(() => {
    const raw = (config?.ui?.panelProfiles && typeof config.ui.panelProfiles === 'object') ? config.ui.panelProfiles : {};
    return Object.keys(raw).sort((a, b) => a.localeCompare(b));
  }, [config?.ui?.panelProfiles]);
  const [newPanelName, setNewPanelName] = useState('');
  const [panelCreateError, setPanelCreateError] = useState(null);
  const [panelCreateStatus, setPanelCreateStatus] = useState('idle'); // idle | creating

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Ref to always have latest config for async click handlers (avoid stale closures)
  const configRef = useRef(config);
  configRef.current = config;

  const [soundFiles, setSoundFiles] = useState([]);
  const [soundFilesError, setSoundFilesError] = useState(null);
  const [deviceIconsIndex, setDeviceIconsIndex] = useState(() => ({ rootUrl: '/device-icons', byType: {} }));
  const [deviceIconsError, setDeviceIconsError] = useState(null);
  const [controlIconsIndex, setControlIconsIndex] = useState(() => ({ rootUrl: '/control-icons', icons: [] }));
  const [controlIconsError, setControlIconsError] = useState(null);
  // Local optimistic state for control icon assignments (survives async save delays)
  const [localIconAssignments, setLocalIconAssignments] = useState(() => ({}));
  const localIconAssignmentsRef = useRef(localIconAssignments);
  localIconAssignmentsRef.current = localIconAssignments;
  const [localIconAssignmentsInited, setLocalIconAssignmentsInited] = useState(false);
  const [openMeteoDraft, setOpenMeteoDraft] = useState(() => ({ lat: '', lon: '', timezone: 'auto' }));
  const [openMeteoDirty, setOpenMeteoDirty] = useState(false);
  const [openMeteoError, setOpenMeteoError] = useState(null);
  const [openMeteoEnvOverrides, setOpenMeteoEnvOverrides] = useState(() => ({ lat: false, lon: false, timezone: false }));

  const [uiCameras, setUiCameras] = useState([]);
  const [uiCamerasStatus, setUiCamerasStatus] = useState('idle'); // idle | loading
  const [uiCamerasError, setUiCamerasError] = useState(null);
  const [cameraFormMode, setCameraFormMode] = useState('create'); // create | edit
  const [cameraFormId, setCameraFormId] = useState('');
  const [cameraForm, setCameraForm] = useState(() => ({
    id: '',
    label: '',
    enabled: true,
    defaultRoomId: '',
    snapshotUrl: '',
    snapshotUsername: '',
    snapshotPassword: '',
    snapshotUpdatePassword: false,
    snapshotHadPassword: false,
    embedUrl: '',
    rtspUrl: '',
  }));
  const [cameraFormError, setCameraFormError] = useState(null);

  const [activeTab, setActiveTab] = useState('display');

  // Sync local icon assignments from server config on initial load
  useEffect(() => {
    if (localIconAssignmentsInited) return;
    const serverAssignments = (config?.ui?.deviceControlIcons && typeof config.ui.deviceControlIcons === 'object')
      ? config.ui.deviceControlIcons
      : {};
    if (Object.keys(serverAssignments).length > 0 || config?.ui) {
      setLocalIconAssignments(serverAssignments);
      setLocalIconAssignmentsInited(true);
    }
  }, [config?.ui?.deviceControlIcons, config?.ui, localIconAssignmentsInited]);

  useEffect(() => {
    // Panel profile selection is only relevant on non-Global tabs.
    // If no profile is selected, pick the first available profile.
    if (activeTab === 'display' || activeTab === 'deviceOptions') return;
    if (selectedPanelName) return;
    if (!panelNames.length) return;
    if (ctx?.setPanelName) ctx.setPanelName(panelNames[0]);
  }, [activeTab, selectedPanelName, panelNames, ctx]);

  const TABS = [
    { id: 'display', label: 'Global Options' },
    { id: 'deviceOptions', label: 'Device Options' },
    { id: 'appearance', label: 'Panel Options' },
    { id: 'climate', label: 'Climate' },
    { id: 'events', label: 'Events' },
  ];

  useEffect(() => {
    // Back-compat for older builds that left the settings UI on removed tabs.
    if (activeTab === 'sounds' || activeTab === 'cameras') {
      setActiveTab('display');
    } else if (activeTab === 'devices') {
      setActiveTab('deviceOptions');
    }
  }, [activeTab]);

  const accentColorId = String(config?.ui?.accentColorId || 'neon-blue');
  const scheme = getUiScheme(accentColorId);

  const deviceIconTypes = useMemo(() => {
    const seeded = [
      INTERNAL_DEVICE_TYPES.SWITCH,
      INTERNAL_DEVICE_TYPES.DIMMER,
      INTERNAL_DEVICE_TYPES.MEDIA_PLAYER,
      INTERNAL_DEVICE_TYPES.BUTTON,
      INTERNAL_DEVICE_TYPES.SENSOR,
      INTERNAL_DEVICE_TYPES.UNKNOWN,
    ];
    const byType = (deviceIconsIndex && typeof deviceIconsIndex === 'object' && deviceIconsIndex.byType && typeof deviceIconsIndex.byType === 'object')
      ? deviceIconsIndex.byType
      : {};
    const discovered = Object.keys(byType).map((v) => String(v));
    const observed = Array.isArray(config?.ui?.deviceTypesObserved)
      ? config.ui.deviceTypesObserved.map((v) => String(v))
      : [];
    return Array.from(new Set([...seeded, ...discovered, ...observed])).sort((a, b) => a.localeCompare(b));
  }, [deviceIconsIndex]);

  const homeVisibleSave = useAsyncSave((payload) => {
    const ids = payload && typeof payload === 'object' ? payload.homeVisibleDeviceIds : [];
    const panelName = payload && typeof payload === 'object' ? payload.panelName : null;
    return saveHomeVisibleDeviceIds(ids, panelName);
  });
  const ctrlVisibleSave = useAsyncSave((payload) => {
    const ids = payload && typeof payload === 'object' ? payload.ctrlVisibleDeviceIds : [];
    const panelName = payload && typeof payload === 'object' ? payload.panelName : null;
    return saveCtrlVisibleDeviceIds(ids, panelName);
  });
  const allowlistSave = useAsyncSave((payload) => {
    const main = payload && typeof payload === 'object' && Array.isArray(payload.mainAllowedDeviceIds) 
      ? payload.mainAllowedDeviceIds 
      : null;
    const ctrl = payload && typeof payload === 'object' && Array.isArray(payload.ctrlAllowedDeviceIds) 
      ? payload.ctrlAllowedDeviceIds 
      : null;
    const panelName = payload && typeof payload === 'object' ? payload.panelName : null;
    
    const body = {
      ...(panelName ? { panelName } : {}),
      ...(main !== null ? { mainAllowedDeviceIds: main } : {}),
      ...(ctrl !== null ? { ctrlAllowedDeviceIds: ctrl } : {}),
    };
    
    return saveAllowlists(body);
  });
  const visibleRoomsSave = useAsyncSave((payload) => {
    const ids = payload && typeof payload === 'object' ? payload.visibleRoomIds : [];
    const panelName = payload && typeof payload === 'object' ? payload.panelName : null;
    return saveVisibleRoomIds(ids, panelName);
  });
  const globalVisibleRoomsSave = useAsyncSave((payload) => {
    const ids = payload && typeof payload === 'object' ? payload.visibleRoomIds : [];
    return saveVisibleRoomIds(ids, null);
  });
  const accentColorSave = useAsyncSave((nextAccentColorId) => saveAccentColorId(nextAccentColorId, selectedPanelName || null));
  const alertSoundsSave = useAsyncSave(saveAlertSounds);
  const homeValueSave = useAsyncSave(saveColorizeHomeValues);
  const cardOpacitySave = useAsyncSave((cardOpacityScalePct) => saveCardOpacityScalePct(cardOpacityScalePct, selectedPanelName || null));
  const blurScaleSave = useAsyncSave((blurScalePct) => saveBlurScalePct(blurScalePct, selectedPanelName || null));
  const secondaryTextOpacitySave = useAsyncSave((secondaryTextOpacityPct) => saveSecondaryTextOpacityPct(secondaryTextOpacityPct, selectedPanelName || null));
  const secondaryTextSizeSave = useAsyncSave((secondaryTextSizePct) => saveSecondaryTextSizePct(secondaryTextSizePct, selectedPanelName || null));
  const secondaryTextColorSave = useAsyncSave((secondaryTextColorId) => saveSecondaryTextColorId(secondaryTextColorId, selectedPanelName || null));
  const primaryTextOpacitySave = useAsyncSave((primaryTextOpacityPct) => savePrimaryTextOpacityPct(primaryTextOpacityPct, selectedPanelName || null));
  const primaryTextSizeSave = useAsyncSave((primaryTextSizePct) => savePrimaryTextSizePct(primaryTextSizePct, selectedPanelName || null));
  const primaryTextColorSave = useAsyncSave((primaryTextColorId) => savePrimaryTextColorId(primaryTextColorId, selectedPanelName || null));
  const tertiaryTextOpacitySave = useAsyncSave((tertiaryTextOpacityPct) => saveTertiaryTextOpacityPct(tertiaryTextOpacityPct, selectedPanelName || null));
  const tertiaryTextSizeSave = useAsyncSave((tertiaryTextSizePct) => saveTertiaryTextSizePct(tertiaryTextSizePct, selectedPanelName || null));
  const tertiaryTextColorSave = useAsyncSave((tertiaryTextColorId) => saveTertiaryTextColorId(tertiaryTextColorId, selectedPanelName || null));
  const glowColorSave = useAsyncSave((glowColorId) => saveGlowColorId(glowColorId, selectedPanelName || null));
  const iconColorSave = useAsyncSave((iconColorId) => saveIconColorId(iconColorId, selectedPanelName || null));
  const iconOpacitySave = useAsyncSave((iconOpacityPct) => saveIconOpacityPct(iconOpacityPct, selectedPanelName || null));
  const iconSizeSave = useAsyncSave((iconSizePct) => saveIconSizePct(iconSizePct, selectedPanelName || null));
  const cardScaleSave = useAsyncSave((cardScalePct) => saveCardScalePct(cardScalePct, selectedPanelName || null));
  const deviceControlStylesSave = useAsyncSave((deviceControlStyles) => saveDeviceControlStyles(deviceControlStyles));
  const deviceTypeIconsSave = useAsyncSave((deviceTypeIcons) => saveDeviceTypeIcons(deviceTypeIcons));
  const deviceControlIconsSave = useAsyncSave((deviceControlIcons) => saveDeviceControlIcons(deviceControlIcons));
  const homeTopRowSave = useAsyncSave((payload) => saveHomeTopRow(payload, selectedPanelName || null));
  const homeRoomColsSave = useAsyncSave((homeRoomColumnsXl) => saveHomeRoomColumnsXl(homeRoomColumnsXl, selectedPanelName || null));
  const homeRoomLayoutSave = useAsyncSave((payload) => saveHomeRoomLayout(payload, selectedPanelName || null));
  const homeRoomMetricColsSave = useAsyncSave((homeRoomMetricColumns) => saveHomeRoomMetricColumns(homeRoomMetricColumns, selectedPanelName || null));
  const homeRoomMetricKeysSave = useAsyncSave((homeRoomMetricKeys) => saveHomeRoomMetricKeys(homeRoomMetricKeys, selectedPanelName || null));
  const cameraPreviewsSave = useAsyncSave((payload) => saveCameraPreviews(payload, selectedPanelName || null));
  const sensorColorsSave = useAsyncSave(saveSensorIndicatorColors);
  const climateTolSave = useAsyncSave(saveClimateTolerances);
  const climateColorsSave = useAsyncSave(saveClimateToleranceColors);

  // Global display defaults (always saved without panelName)
  const globalCardOpacitySave = useAsyncSave((cardOpacityScalePct) => saveCardOpacityScalePct(cardOpacityScalePct, null));
  const globalBlurScaleSave = useAsyncSave((blurScalePct) => saveBlurScalePct(blurScalePct, null));
  const globalSecondaryTextOpacitySave = useAsyncSave((secondaryTextOpacityPct) => saveSecondaryTextOpacityPct(secondaryTextOpacityPct, null));
  const globalPrimaryTextOpacitySave = useAsyncSave((primaryTextOpacityPct) => savePrimaryTextOpacityPct(primaryTextOpacityPct, null));
  const globalPrimaryTextSizeSave = useAsyncSave((primaryTextSizePct) => savePrimaryTextSizePct(primaryTextSizePct, null));
  const globalSecondaryTextSizeSave = useAsyncSave((secondaryTextSizePct) => saveSecondaryTextSizePct(secondaryTextSizePct, null));
  const globalTertiaryTextOpacitySave = useAsyncSave((tertiaryTextOpacityPct) => saveTertiaryTextOpacityPct(tertiaryTextOpacityPct, null));
  const globalTertiaryTextSizeSave = useAsyncSave((tertiaryTextSizePct) => saveTertiaryTextSizePct(tertiaryTextSizePct, null));
  const globalIconSizeSave = useAsyncSave((iconSizePct) => saveIconSizePct(iconSizePct, null));
  const globalCardScaleSave = useAsyncSave((cardScalePct) => saveCardScalePct(cardScalePct, null));
  const globalHomeRoomColsSave = useAsyncSave((homeRoomColumnsXl) => saveHomeRoomColumnsXl(homeRoomColumnsXl, null));
  const openMeteoSave = useAsyncSave(async (openMeteo) => {
    const res = await saveOpenMeteoConfig(openMeteo);
    const overrides = (res?.overriddenByEnv && typeof res.overriddenByEnv === 'object') ? res.overriddenByEnv : {};
    setOpenMeteoEnvOverrides({
      lat: overrides.lat === true,
      lon: overrides.lon === true,
      timezone: overrides.timezone === true,
    });
    return res;
  });

  const alertSounds = useMemo(() => {
    const raw = (config?.ui?.alertSounds && typeof config.ui.alertSounds === 'object') ? config.ui.alertSounds : {};
    return {
      motion: typeof raw.motion === 'string' ? raw.motion : '',
      doorOpen: typeof raw.doorOpen === 'string' ? raw.doorOpen : '',
      doorClose: typeof raw.doorClose === 'string' ? raw.doorClose : '',
    };
  }, [config?.ui?.alertSounds]);

  const climateTolerances = useMemo(() => {
    const raw = (config?.ui?.climateTolerances && typeof config.ui.climateTolerances === 'object')
      ? config.ui.climateTolerances
      : {};

    const t = (raw.temperatureF && typeof raw.temperatureF === 'object') ? raw.temperatureF : {};
    const h = (raw.humidityPct && typeof raw.humidityPct === 'object') ? raw.humidityPct : {};
    const l = (raw.illuminanceLux && typeof raw.illuminanceLux === 'object') ? raw.illuminanceLux : {};

    return {
      temperatureF: {
        cold: Number.isFinite(Number(t.cold)) ? Number(t.cold) : 68,
        comfy: Number.isFinite(Number(t.comfy)) ? Number(t.comfy) : 72,
        warm: Number.isFinite(Number(t.warm)) ? Number(t.warm) : 74,
      },
      humidityPct: {
        dry: Number.isFinite(Number(h.dry)) ? Number(h.dry) : 35,
        comfy: Number.isFinite(Number(h.comfy)) ? Number(h.comfy) : 55,
        humid: Number.isFinite(Number(h.humid)) ? Number(h.humid) : 65,
      },
      illuminanceLux: {
        dark: Number.isFinite(Number(l.dark)) ? Number(l.dark) : 50,
        dim: Number.isFinite(Number(l.dim)) ? Number(l.dim) : 250,
        bright: Number.isFinite(Number(l.bright)) ? Number(l.bright) : 600,
      },
    };
  }, [config?.ui?.climateTolerances]);

  const climateToleranceColors = useMemo(() => {
    const raw = (config?.ui?.climateToleranceColors && typeof config.ui.climateToleranceColors === 'object')
      ? config.ui.climateToleranceColors
      : {};

    const t = (raw.temperatureF && typeof raw.temperatureF === 'object') ? raw.temperatureF : {};
    const h = (raw.humidityPct && typeof raw.humidityPct === 'object') ? raw.humidityPct : {};
    const l = (raw.illuminanceLux && typeof raw.illuminanceLux === 'object') ? raw.illuminanceLux : {};

    return {
      temperatureF: {
        cold: normalizeToleranceColorId(t.cold, 'neon-blue'),
        comfy: normalizeToleranceColorId(t.comfy, 'neon-green'),
        warm: normalizeToleranceColorId(t.warm, 'warning'),
        hot: normalizeToleranceColorId(t.hot, 'neon-red'),
      },
      humidityPct: {
        dry: normalizeToleranceColorId(h.dry, 'neon-blue'),
        comfy: normalizeToleranceColorId(h.comfy, 'neon-green'),
        humid: normalizeToleranceColorId(h.humid, 'warning'),
        veryHumid: normalizeToleranceColorId(h.veryHumid, 'neon-red'),
      },
      illuminanceLux: {
        dark: normalizeToleranceColorId(l.dark, 'neon-blue'),
        dim: normalizeToleranceColorId(l.dim, 'neon-green'),
        bright: normalizeToleranceColorId(l.bright, 'warning'),
        veryBright: normalizeToleranceColorId(l.veryBright, 'neon-green'),
      },
    };
  }, [config?.ui?.climateToleranceColors]);

  const sensorIndicatorColors = useMemo(() => {
    const raw = (config?.ui?.sensorIndicatorColors && typeof config.ui.sensorIndicatorColors === 'object')
      ? config.ui.sensorIndicatorColors
      : {};

    return {
      motion: normalizeToleranceColorId(raw.motion, 'warning'),
      door: normalizeToleranceColorId(raw.door, 'neon-red'),
      smoke: normalizeToleranceColorId(raw.smoke, 'neon-red'),
      co: normalizeToleranceColorId(raw.co, 'neon-red'),
      water: normalizeToleranceColorId(raw.water, 'neon-blue'),
      presence: normalizeToleranceColorId(raw.presence, 'neon-green'),
    };
  }, [config?.ui?.sensorIndicatorColors]);

  const [climateDraft, setClimateDraft] = useState(() => ({
    temperatureF: { cold: '68', comfy: '72', warm: '74' },
    humidityPct: { dry: '35', comfy: '55', humid: '65' },
    illuminanceLux: { dark: '50', dim: '250', bright: '600' },
  }));
  const [climateDirty, setClimateDirty] = useState(false);
  const [climateError, setClimateError] = useState(null);
  const [climateColorsDraft, setClimateColorsDraft] = useState(() => ({
    temperatureF: { cold: 'neon-blue', comfy: 'neon-green', warm: 'warning', hot: 'neon-red' },
    humidityPct: { dry: 'neon-blue', comfy: 'neon-green', humid: 'warning', veryHumid: 'neon-red' },
    illuminanceLux: { dark: 'neon-blue', dim: 'neon-green', bright: 'warning', veryBright: 'neon-green' },
  }));
  const [climateColorsDirty, setClimateColorsDirty] = useState(false);
  const [climateColorsError, setClimateColorsError] = useState(null);
  const [homeValueColorError, setHomeValueColorError] = useState(null);

  const homeValueOpacityFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.colorizeHomeValuesOpacityPct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [config?.ui?.colorizeHomeValuesOpacityPct]);

  const [homeValueOpacityDraft, setHomeValueOpacityDraft] = useState(() => 100);
  const [homeValueOpacityDirty, setHomeValueOpacityDirty] = useState(false);

  const cardOpacityScaleFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.cardOpacityScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(200, Math.round(raw)));
  }, [config?.ui?.cardOpacityScalePct]);

  const globalCardOpacityScaleFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.cardOpacityScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(200, Math.round(raw)));
  }, [baseConfig?.ui?.cardOpacityScalePct]);

  const blurScaleFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.blurScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(200, Math.round(raw)));
  }, [config?.ui?.blurScalePct]);

  const globalBlurScaleFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.blurScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(200, Math.round(raw)));
  }, [baseConfig?.ui?.blurScalePct]);

  const secondaryTextOpacityFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.secondaryTextOpacityPct);
    if (!Number.isFinite(raw)) return 45;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [config?.ui?.secondaryTextOpacityPct]);

  const globalSecondaryTextOpacityFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.secondaryTextOpacityPct);
    if (!Number.isFinite(raw)) return 45;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [baseConfig?.ui?.secondaryTextOpacityPct]);

  const secondaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.secondaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.secondaryTextSizePct]);

  const globalSecondaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.secondaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [baseConfig?.ui?.secondaryTextSizePct]);

  const secondaryTextColorFromConfig = useMemo(() => {
    const raw = String(config?.ui?.secondaryTextColorId ?? '').trim();
    if (!raw) return '';
    if (TOLERANCE_COLOR_CHOICES.some((c) => c.id === raw)) return raw;
    return '';
  }, [config?.ui?.secondaryTextColorId]);

  const primaryTextOpacityFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.primaryTextOpacityPct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [config?.ui?.primaryTextOpacityPct]);

  const globalPrimaryTextOpacityFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.primaryTextOpacityPct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [baseConfig?.ui?.primaryTextOpacityPct]);

  const primaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.primaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.primaryTextSizePct]);

  const globalPrimaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.primaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [baseConfig?.ui?.primaryTextSizePct]);

  const primaryTextColorFromConfig = useMemo(() => {
    const raw = String(config?.ui?.primaryTextColorId ?? '').trim();
    if (!raw) return '';
    if (TOLERANCE_COLOR_CHOICES.some((c) => c.id === raw)) return raw;
    return '';
  }, [config?.ui?.primaryTextColorId]);

  const tertiaryTextOpacityFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.tertiaryTextOpacityPct);
    if (!Number.isFinite(raw)) return 70;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [config?.ui?.tertiaryTextOpacityPct]);

  const globalTertiaryTextOpacityFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.tertiaryTextOpacityPct);
    if (!Number.isFinite(raw)) return 70;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [baseConfig?.ui?.tertiaryTextOpacityPct]);

  const tertiaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.tertiaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.tertiaryTextSizePct]);

  const globalTertiaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.tertiaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [baseConfig?.ui?.tertiaryTextSizePct]);

  const tertiaryTextColorFromConfig = useMemo(() => {
    const raw = String(config?.ui?.tertiaryTextColorId ?? '').trim();
    if (!raw) return '';
    if (TOLERANCE_COLOR_CHOICES.some((c) => c.id === raw)) return raw;
    return '';
  }, [config?.ui?.tertiaryTextColorId]);

  const glowColorFromConfig = useMemo(() => {
    const raw = String(config?.ui?.glowColorId ?? '').trim();
    if (!raw) return '';
    if (TOLERANCE_COLOR_CHOICES.some((c) => c.id === raw)) return raw;
    return '';
  }, [config?.ui?.glowColorId]);

  const iconColorFromConfig = useMemo(() => {
    const raw = String(config?.ui?.iconColorId ?? '').trim();
    if (!raw) return '';
    if (TOLERANCE_COLOR_CHOICES.some((c) => c.id === raw)) return raw;
    return '';
  }, [config?.ui?.iconColorId]);

  const iconOpacityFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.iconOpacityPct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [config?.ui?.iconOpacityPct]);

  const iconSizeFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.iconSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.iconSizePct]);

  const globalIconSizeFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.iconSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [baseConfig?.ui?.iconSizePct]);

  const cardScaleFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.cardScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.cardScalePct]);

  const globalCardScaleFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.cardScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [baseConfig?.ui?.cardScalePct]);

  const globalSwitchControlStyleFromConfig = useMemo(() => {
    const raw = String(baseConfig?.ui?.deviceControlStyles?.switch?.controlStyle ?? '').trim().toLowerCase();
    if (raw === 'auto' || raw === 'buttons' || raw === 'switch') return raw;
    return 'auto';
  }, [baseConfig?.ui?.deviceControlStyles?.switch?.controlStyle]);

  const globalSwitchAnimationStyleFromConfig = useMemo(() => {
    const raw = String(baseConfig?.ui?.deviceControlStyles?.switch?.animationStyle ?? '').trim().toLowerCase();
    if (raw === 'none' || raw === 'pulse') return raw;
    return 'none';
  }, [baseConfig?.ui?.deviceControlStyles?.switch?.animationStyle]);

  const homeTopRowEnabledFromConfig = config?.ui?.homeTopRowEnabled !== false;

  const homeTopRowScaleFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.homeTopRowScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(120, Math.round(raw)));
  }, [config?.ui?.homeTopRowScalePct]);

  const homeTopRowCardsFromConfig = useMemo(() => {
    const uiObj = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
    const hasCards = Object.prototype.hasOwnProperty.call(uiObj, 'homeTopRowCards');
    const raw = hasCards
      ? (Array.isArray(uiObj.homeTopRowCards) ? uiObj.homeTopRowCards : [])
      : HOME_TOP_ROW_CARD_IDS;
    const allowed = new Set(HOME_TOP_ROW_CARD_IDS);
    const cards = raw
      .map((v) => String(v || '').trim())
      .filter((v) => v && allowed.has(v));
    const uniq = Array.from(new Set(cards));
    if (hasCards) return uniq;
    return uniq.length ? uniq : HOME_TOP_ROW_CARD_IDS;
  }, [config?.ui?.homeTopRowCards]);

  const homeRoomColumnsXlFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomColumnsXl);
    if (!Number.isFinite(raw)) return 3;
    return Math.max(1, Math.min(6, Math.round(raw)));
  }, [config?.ui?.homeRoomColumnsXl]);

  const homeRoomLayoutModeFromConfig = useMemo(() => {
    const raw = String(config?.ui?.homeRoomLayoutMode ?? '').trim().toLowerCase();
    return raw === 'masonry' ? 'masonry' : 'grid';
  }, [config?.ui?.homeRoomLayoutMode]);

  const homeRoomMasonryRowHeightPxFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMasonryRowHeightPx);
    if (!Number.isFinite(raw)) return 10;
    return Math.max(4, Math.min(40, Math.round(raw)));
  }, [config?.ui?.homeRoomMasonryRowHeightPx]);

  const homeRoomMinWidthPxFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMinWidthPx);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(1200, Math.round(raw)));
  }, [config?.ui?.homeRoomMinWidthPx]);

  const homeRoomTilesFromConfig = useMemo(() => {
    const raw = (config?.ui?.homeRoomTiles && typeof config.ui.homeRoomTiles === 'object')
      ? config.ui.homeRoomTiles
      : {};
    return raw;
  }, [config?.ui?.homeRoomTiles]);

  const globalHomeRoomColumnsXlFromConfig = useMemo(() => {
    const raw = Number(baseConfig?.ui?.homeRoomColumnsXl);
    if (!Number.isFinite(raw)) return 3;
    return Math.max(1, Math.min(6, Math.round(raw)));
  }, [baseConfig?.ui?.homeRoomColumnsXl]);

  const homeRoomMetricColumnsFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomMetricColumns);
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(3, Math.round(raw)));
  }, [config?.ui?.homeRoomMetricColumns]);

  const homeRoomMetricKeysFromConfig = useMemo(() => {
    const allowed = new Set(['temperature', 'humidity', 'illuminance']);
    const raw = Array.isArray(config?.ui?.homeRoomMetricKeys)
      ? config.ui.homeRoomMetricKeys
      : ['temperature', 'humidity', 'illuminance'];
    return Array.from(new Set(raw.map((v) => String(v || '').trim()).filter((v) => allowed.has(v))));
  }, [config?.ui?.homeRoomMetricKeys]);

  const homeCameraPreviewsEnabledFromConfig = useMemo(
    () => config?.ui?.homeCameraPreviewsEnabled === true,
    [config?.ui?.homeCameraPreviewsEnabled],
  );
  const controlsCameraPreviewsEnabledFromConfig = useMemo(
    () => config?.ui?.controlsCameraPreviewsEnabled === true,
    [config?.ui?.controlsCameraPreviewsEnabled],
  );
  const cameraPreviewRefreshSecondsFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.cameraPreviewRefreshSeconds);
    if (!Number.isFinite(raw)) return 10;
    return Math.max(2, Math.min(120, Math.round(raw)));
  }, [config?.ui?.cameraPreviewRefreshSeconds]);

  const [cardOpacityScaleDraft, setCardOpacityScaleDraft] = useState(() => 100);
  const [cardOpacityScaleDirty, setCardOpacityScaleDirty] = useState(false);
  const [cardOpacityScaleError, setCardOpacityScaleError] = useState(null);

  const [globalCardOpacityScaleDraft, setGlobalCardOpacityScaleDraft] = useState(() => 100);
  const [globalCardOpacityScaleDirty, setGlobalCardOpacityScaleDirty] = useState(false);
  const [globalCardOpacityScaleError, setGlobalCardOpacityScaleError] = useState(null);

  const [blurScaleDraft, setBlurScaleDraft] = useState(() => 100);
  const [blurScaleDirty, setBlurScaleDirty] = useState(false);
  const [blurScaleError, setBlurScaleError] = useState(null);

  const [globalBlurScaleDraft, setGlobalBlurScaleDraft] = useState(() => 100);
  const [globalBlurScaleDirty, setGlobalBlurScaleDirty] = useState(false);
  const [globalBlurScaleError, setGlobalBlurScaleError] = useState(null);

  const [secondaryTextOpacityDraft, setSecondaryTextOpacityDraft] = useState(() => 45);
  const [secondaryTextOpacityDirty, setSecondaryTextOpacityDirty] = useState(false);
  const [secondaryTextOpacityError, setSecondaryTextOpacityError] = useState(null);

  const [globalSecondaryTextOpacityDraft, setGlobalSecondaryTextOpacityDraft] = useState(() => 45);
  const [globalSecondaryTextOpacityDirty, setGlobalSecondaryTextOpacityDirty] = useState(false);
  const [globalSecondaryTextOpacityError, setGlobalSecondaryTextOpacityError] = useState(null);

  const [secondaryTextSizeDraft, setSecondaryTextSizeDraft] = useState(() => 100);
  const [secondaryTextSizeDirty, setSecondaryTextSizeDirty] = useState(false);
  const [secondaryTextSizeError, setSecondaryTextSizeError] = useState(null);

  const [globalSecondaryTextSizeDraft, setGlobalSecondaryTextSizeDraft] = useState(() => 100);
  const [globalSecondaryTextSizeDirty, setGlobalSecondaryTextSizeDirty] = useState(false);
  const [globalSecondaryTextSizeError, setGlobalSecondaryTextSizeError] = useState(null);

  const [secondaryTextColorDraft, setSecondaryTextColorDraft] = useState(() => '');
  const [secondaryTextColorDirty, setSecondaryTextColorDirty] = useState(false);
  const [secondaryTextColorError, setSecondaryTextColorError] = useState(null);

  const [primaryTextOpacityDraft, setPrimaryTextOpacityDraft] = useState(() => 100);
  const [primaryTextOpacityDirty, setPrimaryTextOpacityDirty] = useState(false);
  const [primaryTextOpacityError, setPrimaryTextOpacityError] = useState(null);

  const [globalPrimaryTextOpacityDraft, setGlobalPrimaryTextOpacityDraft] = useState(() => 100);
  const [globalPrimaryTextOpacityDirty, setGlobalPrimaryTextOpacityDirty] = useState(false);
  const [globalPrimaryTextOpacityError, setGlobalPrimaryTextOpacityError] = useState(null);

  const [primaryTextSizeDraft, setPrimaryTextSizeDraft] = useState(() => 100);
  const [primaryTextSizeDirty, setPrimaryTextSizeDirty] = useState(false);
  const [primaryTextSizeError, setPrimaryTextSizeError] = useState(null);

  const [globalPrimaryTextSizeDraft, setGlobalPrimaryTextSizeDraft] = useState(() => 100);
  const [globalPrimaryTextSizeDirty, setGlobalPrimaryTextSizeDirty] = useState(false);
  const [globalPrimaryTextSizeError, setGlobalPrimaryTextSizeError] = useState(null);

  const [primaryTextColorDraft, setPrimaryTextColorDraft] = useState(() => '');
  const [primaryTextColorDirty, setPrimaryTextColorDirty] = useState(false);
  const [primaryTextColorError, setPrimaryTextColorError] = useState(null);

  const [tertiaryTextOpacityDraft, setTertiaryTextOpacityDraft] = useState(() => 70);
  const [tertiaryTextOpacityDirty, setTertiaryTextOpacityDirty] = useState(false);
  const [tertiaryTextOpacityError, setTertiaryTextOpacityError] = useState(null);

  const [globalTertiaryTextOpacityDraft, setGlobalTertiaryTextOpacityDraft] = useState(() => 70);
  const [globalTertiaryTextOpacityDirty, setGlobalTertiaryTextOpacityDirty] = useState(false);
  const [globalTertiaryTextOpacityError, setGlobalTertiaryTextOpacityError] = useState(null);

  const [tertiaryTextSizeDraft, setTertiaryTextSizeDraft] = useState(() => 100);
  const [tertiaryTextSizeDirty, setTertiaryTextSizeDirty] = useState(false);
  const [tertiaryTextSizeError, setTertiaryTextSizeError] = useState(null);

  const [globalTertiaryTextSizeDraft, setGlobalTertiaryTextSizeDraft] = useState(() => 100);
  const [globalTertiaryTextSizeDirty, setGlobalTertiaryTextSizeDirty] = useState(false);
  const [globalTertiaryTextSizeError, setGlobalTertiaryTextSizeError] = useState(null);

  const [tertiaryTextColorDraft, setTertiaryTextColorDraft] = useState(() => '');
  const [tertiaryTextColorDirty, setTertiaryTextColorDirty] = useState(false);
  const [tertiaryTextColorError, setTertiaryTextColorError] = useState(null);

  const [glowColorDraft, setGlowColorDraft] = useState(() => '');
  const [glowColorDirty, setGlowColorDirty] = useState(false);
  const [glowColorError, setGlowColorError] = useState(null);

  const [iconColorDraft, setIconColorDraft] = useState(() => '');
  const [iconColorDirty, setIconColorDirty] = useState(false);
  const [iconColorError, setIconColorError] = useState(null);

  const [iconOpacityDraft, setIconOpacityDraft] = useState(() => 100);
  const [iconOpacityDirty, setIconOpacityDirty] = useState(false);
  const [iconOpacityError, setIconOpacityError] = useState(null);

  const [iconSizeDraft, setIconSizeDraft] = useState(() => 100);
  const [iconSizeDirty, setIconSizeDirty] = useState(false);
  const [iconSizeError, setIconSizeError] = useState(null);

  const [globalIconSizeDraft, setGlobalIconSizeDraft] = useState(() => 100);
  const [globalIconSizeDirty, setGlobalIconSizeDirty] = useState(false);
  const [globalIconSizeError, setGlobalIconSizeError] = useState(null);

  const [cardScaleDraft, setCardScaleDraft] = useState(() => 100);
  const [cardScaleDirty, setCardScaleDirty] = useState(false);
  const [cardScaleError, setCardScaleError] = useState(null);

  const [globalCardScaleDraft, setGlobalCardScaleDraft] = useState(() => 100);
  const [globalCardScaleDirty, setGlobalCardScaleDirty] = useState(false);
  const [globalCardScaleError, setGlobalCardScaleError] = useState(null);

  const [globalSwitchControlStyleDraft, setGlobalSwitchControlStyleDraft] = useState(() => 'auto');
  const [globalSwitchControlStyleDirty, setGlobalSwitchControlStyleDirty] = useState(false);
  const [globalSwitchControlStyleError, setGlobalSwitchControlStyleError] = useState(null);

  const [globalSwitchAnimationStyleDraft, setGlobalSwitchAnimationStyleDraft] = useState(() => 'none');
  const [globalSwitchAnimationStyleDirty, setGlobalSwitchAnimationStyleDirty] = useState(false);
  const [globalSwitchAnimationStyleError, setGlobalSwitchAnimationStyleError] = useState(null);

  const [homeTopRowDraft, setHomeTopRowDraft] = useState(() => ({
    enabled: true,
    scalePct: 100,
    cards: HOME_TOP_ROW_CARD_IDS,
  }));
  const [homeTopRowDirty, setHomeTopRowDirty] = useState(false);
  const [homeTopRowError, setHomeTopRowError] = useState(null);

  const [homeRoomColumnsXlDraft, setHomeRoomColumnsXlDraft] = useState(() => 3);
  const [homeRoomColumnsXlDirty, setHomeRoomColumnsXlDirty] = useState(false);
  const [homeRoomColumnsXlError, setHomeRoomColumnsXlError] = useState(null);

  const [homeRoomMinWidthPxDraft, setHomeRoomMinWidthPxDraft] = useState(() => 0);
  const [homeRoomLayoutModeDraft, setHomeRoomLayoutModeDraft] = useState(() => 'grid');
  const [homeRoomMasonryRowHeightPxDraft, setHomeRoomMasonryRowHeightPxDraft] = useState(() => 10);
  const [homeRoomTilesDraft, setHomeRoomTilesDraft] = useState(() => ({}));
  const [homeRoomLayoutDirty, setHomeRoomLayoutDirty] = useState(false);
  const [homeRoomLayoutError, setHomeRoomLayoutError] = useState(null);

  const [globalHomeRoomColumnsXlDraft, setGlobalHomeRoomColumnsXlDraft] = useState(() => 3);
  const [globalHomeRoomColumnsXlDirty, setGlobalHomeRoomColumnsXlDirty] = useState(false);
  const [globalHomeRoomColumnsXlError, setGlobalHomeRoomColumnsXlError] = useState(null);

  const [homeRoomMetricColumnsDraft, setHomeRoomMetricColumnsDraft] = useState(() => 0);
  const [homeRoomMetricColumnsDirty, setHomeRoomMetricColumnsDirty] = useState(false);
  const [homeRoomMetricColumnsError, setHomeRoomMetricColumnsError] = useState(null);

  const [homeRoomMetricKeysDraft, setHomeRoomMetricKeysDraft] = useState(() => (['temperature', 'humidity', 'illuminance']));
  const [homeRoomMetricKeysDirty, setHomeRoomMetricKeysDirty] = useState(false);
  const [homeRoomMetricKeysError, setHomeRoomMetricKeysError] = useState(null);

  const [cameraPreviewsDraft, setCameraPreviewsDraft] = useState(() => ({
    homeCameraPreviewsEnabled: false,
    controlsCameraPreviewsEnabled: false,
    cameraPreviewRefreshSeconds: 10,
  }));
  const [cameraPreviewsDirty, setCameraPreviewsDirty] = useState(false);
  const [cameraPreviewsError, setCameraPreviewsError] = useState(null);

  const [sensorColorsDraft, setSensorColorsDraft] = useState(() => ({ motion: 'warning', door: 'neon-red', smoke: 'neon-red', co: 'neon-red', water: 'neon-blue', presence: 'neon-green' }));
  const [sensorColorsDirty, setSensorColorsDirty] = useState(false);
  const [sensorColorsError, setSensorColorsError] = useState(null);

  const colorizeHomeValues = Boolean(config?.ui?.colorizeHomeValues);

  useEffect(() => {
    if (homeValueOpacityDirty) return;
    setHomeValueOpacityDraft(homeValueOpacityFromConfig);
  }, [homeValueOpacityDirty, homeValueOpacityFromConfig]);

  // When switching profiles, ensure the camera preview editor reflects the selected profile.
  useEffect(() => {
    setCameraPreviewsError(null);
    setCameraPreviewsDirty(false);
    setCameraPreviewsDraft({
      homeCameraPreviewsEnabled: homeCameraPreviewsEnabledFromConfig,
      controlsCameraPreviewsEnabled: controlsCameraPreviewsEnabledFromConfig,
      cameraPreviewRefreshSeconds: cameraPreviewRefreshSecondsFromConfig,
    });
  }, [selectedPanelName]);

  useEffect(() => {
    setHomeTopRowError(null);
    setHomeTopRowDirty(false);
    setHomeTopRowDraft({
      enabled: homeTopRowEnabledFromConfig,
      scalePct: homeTopRowScaleFromConfig,
      cards: homeTopRowCardsFromConfig,
    });
  }, [selectedPanelName, homeTopRowEnabledFromConfig, homeTopRowScaleFromConfig, homeTopRowCardsFromConfig]);

  useEffect(() => {
    // When switching profiles, reset the editor to the selected profile's saved values.
    setHomeRoomLayoutError(null);
    setHomeRoomLayoutDirty(false);
    setHomeRoomLayoutModeDraft(homeRoomLayoutModeFromConfig);
    setHomeRoomMasonryRowHeightPxDraft(homeRoomMasonryRowHeightPxFromConfig);
    setHomeRoomMinWidthPxDraft(homeRoomMinWidthPxFromConfig);
    setHomeRoomTilesDraft(homeRoomTilesFromConfig);
  }, [selectedPanelName]);

  useEffect(() => {
    // Keep drafts in sync with config refreshes, but never clobber in-progress edits.
    if (homeRoomLayoutDirty) return;
    setHomeRoomLayoutModeDraft(homeRoomLayoutModeFromConfig);
    setHomeRoomMasonryRowHeightPxDraft(homeRoomMasonryRowHeightPxFromConfig);
    setHomeRoomMinWidthPxDraft(homeRoomMinWidthPxFromConfig);
    setHomeRoomTilesDraft(homeRoomTilesFromConfig);
  }, [homeRoomLayoutDirty, homeRoomLayoutModeFromConfig, homeRoomMasonryRowHeightPxFromConfig, homeRoomMinWidthPxFromConfig, homeRoomTilesFromConfig]);

  useEffect(() => {
    if (cardOpacityScaleDirty) return;
    setCardOpacityScaleDraft(cardOpacityScaleFromConfig);
  }, [cardOpacityScaleDirty, cardOpacityScaleFromConfig]);

  useEffect(() => {
    if (globalCardOpacityScaleDirty) return;
    setGlobalCardOpacityScaleDraft(globalCardOpacityScaleFromConfig);
  }, [globalCardOpacityScaleDirty, globalCardOpacityScaleFromConfig]);

  useEffect(() => {
    if (blurScaleDirty) return;
    setBlurScaleDraft(blurScaleFromConfig);
  }, [blurScaleDirty, blurScaleFromConfig]);

  useEffect(() => {
    if (globalBlurScaleDirty) return;
    setGlobalBlurScaleDraft(globalBlurScaleFromConfig);
  }, [globalBlurScaleDirty, globalBlurScaleFromConfig]);

  useEffect(() => {
    if (secondaryTextOpacityDirty) return;
    setSecondaryTextOpacityDraft(secondaryTextOpacityFromConfig);
  }, [secondaryTextOpacityDirty, secondaryTextOpacityFromConfig]);

  useEffect(() => {
    if (globalSecondaryTextOpacityDirty) return;
    setGlobalSecondaryTextOpacityDraft(globalSecondaryTextOpacityFromConfig);
  }, [globalSecondaryTextOpacityDirty, globalSecondaryTextOpacityFromConfig]);

  useEffect(() => {
    if (secondaryTextSizeDirty) return;
    setSecondaryTextSizeDraft(secondaryTextSizeFromConfig);
  }, [secondaryTextSizeDirty, secondaryTextSizeFromConfig]);

  useEffect(() => {
    if (globalSecondaryTextSizeDirty) return;
    setGlobalSecondaryTextSizeDraft(globalSecondaryTextSizeFromConfig);
  }, [globalSecondaryTextSizeDirty, globalSecondaryTextSizeFromConfig]);

  useEffect(() => {
    if (secondaryTextColorDirty) return;
    setSecondaryTextColorDraft(secondaryTextColorFromConfig);
  }, [secondaryTextColorDirty, secondaryTextColorFromConfig]);

  useEffect(() => {
    if (primaryTextOpacityDirty) return;
    setPrimaryTextOpacityDraft(primaryTextOpacityFromConfig);
  }, [primaryTextOpacityDirty, primaryTextOpacityFromConfig]);

  useEffect(() => {
    if (globalPrimaryTextOpacityDirty) return;
    setGlobalPrimaryTextOpacityDraft(globalPrimaryTextOpacityFromConfig);
  }, [globalPrimaryTextOpacityDirty, globalPrimaryTextOpacityFromConfig]);

  useEffect(() => {
    if (primaryTextSizeDirty) return;
    setPrimaryTextSizeDraft(primaryTextSizeFromConfig);
  }, [primaryTextSizeDirty, primaryTextSizeFromConfig]);

  useEffect(() => {
    if (globalPrimaryTextSizeDirty) return;
    setGlobalPrimaryTextSizeDraft(globalPrimaryTextSizeFromConfig);
  }, [globalPrimaryTextSizeDirty, globalPrimaryTextSizeFromConfig]);

  useEffect(() => {
    if (primaryTextColorDirty) return;
    setPrimaryTextColorDraft(primaryTextColorFromConfig);
  }, [primaryTextColorDirty, primaryTextColorFromConfig]);

  useEffect(() => {
    if (tertiaryTextOpacityDirty) return;
    setTertiaryTextOpacityDraft(tertiaryTextOpacityFromConfig);
  }, [tertiaryTextOpacityDirty, tertiaryTextOpacityFromConfig]);

  useEffect(() => {
    if (globalTertiaryTextOpacityDirty) return;
    setGlobalTertiaryTextOpacityDraft(globalTertiaryTextOpacityFromConfig);
  }, [globalTertiaryTextOpacityDirty, globalTertiaryTextOpacityFromConfig]);

  useEffect(() => {
    if (tertiaryTextSizeDirty) return;
    setTertiaryTextSizeDraft(tertiaryTextSizeFromConfig);
  }, [tertiaryTextSizeDirty, tertiaryTextSizeFromConfig]);

  useEffect(() => {
    if (globalTertiaryTextSizeDirty) return;
    setGlobalTertiaryTextSizeDraft(globalTertiaryTextSizeFromConfig);
  }, [globalTertiaryTextSizeDirty, globalTertiaryTextSizeFromConfig]);

  useEffect(() => {
    if (tertiaryTextColorDirty) return;
    setTertiaryTextColorDraft(tertiaryTextColorFromConfig);
  }, [tertiaryTextColorDirty, tertiaryTextColorFromConfig]);

  useEffect(() => {
    if (glowColorDirty) return;
    setGlowColorDraft(glowColorFromConfig);
  }, [glowColorDirty, glowColorFromConfig]);

  useEffect(() => {
    if (iconColorDirty) return;
    setIconColorDraft(iconColorFromConfig);
  }, [iconColorDirty, iconColorFromConfig]);

  useEffect(() => {
    if (iconOpacityDirty) return;
    setIconOpacityDraft(iconOpacityFromConfig);
  }, [iconOpacityDirty, iconOpacityFromConfig]);

  useEffect(() => {
    if (iconSizeDirty) return;
    setIconSizeDraft(iconSizeFromConfig);
  }, [iconSizeDirty, iconSizeFromConfig]);

  useEffect(() => {
    if (globalIconSizeDirty) return;
    setGlobalIconSizeDraft(globalIconSizeFromConfig);
  }, [globalIconSizeDirty, globalIconSizeFromConfig]);

  useEffect(() => {
    if (cardScaleDirty) return;
    setCardScaleDraft(cardScaleFromConfig);
  }, [cardScaleDirty, cardScaleFromConfig]);

  useEffect(() => {
    if (globalCardScaleDirty) return;
    setGlobalCardScaleDraft(globalCardScaleFromConfig);
  }, [globalCardScaleDirty, globalCardScaleFromConfig]);

  useEffect(() => {
    if (globalSwitchControlStyleDirty) return;
    setGlobalSwitchControlStyleDraft(globalSwitchControlStyleFromConfig);
  }, [globalSwitchControlStyleDirty, globalSwitchControlStyleFromConfig]);

  useEffect(() => {
    if (globalSwitchAnimationStyleDirty) return;
    setGlobalSwitchAnimationStyleDraft(globalSwitchAnimationStyleFromConfig);
  }, [globalSwitchAnimationStyleDirty, globalSwitchAnimationStyleFromConfig]);

  useEffect(() => {
    if (homeTopRowDirty) return;
    setHomeTopRowDraft({
      enabled: homeTopRowEnabledFromConfig,
      scalePct: homeTopRowScaleFromConfig,
      cards: homeTopRowCardsFromConfig,
    });
  }, [homeTopRowDirty, homeTopRowEnabledFromConfig, homeTopRowScaleFromConfig, homeTopRowCardsFromConfig]);

  useEffect(() => {
    if (homeRoomColumnsXlDirty) return;
    setHomeRoomColumnsXlDraft(homeRoomColumnsXlFromConfig);
  }, [homeRoomColumnsXlDirty, homeRoomColumnsXlFromConfig]);

  useEffect(() => {
    if (globalHomeRoomColumnsXlDirty) return;
    setGlobalHomeRoomColumnsXlDraft(globalHomeRoomColumnsXlFromConfig);
  }, [globalHomeRoomColumnsXlDirty, globalHomeRoomColumnsXlFromConfig]);

  useEffect(() => {
    if (homeRoomMetricColumnsDirty) return;
    setHomeRoomMetricColumnsDraft(homeRoomMetricColumnsFromConfig);
  }, [homeRoomMetricColumnsDirty, homeRoomMetricColumnsFromConfig]);

  useEffect(() => {
    if (homeRoomMetricKeysDirty) return;
    setHomeRoomMetricKeysDraft(homeRoomMetricKeysFromConfig);
  }, [homeRoomMetricKeysDirty, homeRoomMetricKeysFromConfig]);

  useEffect(() => {
    if (cameraPreviewsDirty) return;
    setCameraPreviewsDraft({
      homeCameraPreviewsEnabled: homeCameraPreviewsEnabledFromConfig,
      controlsCameraPreviewsEnabled: controlsCameraPreviewsEnabledFromConfig,
      cameraPreviewRefreshSeconds: cameraPreviewRefreshSecondsFromConfig,
    });
  }, [
    cameraPreviewsDirty,
    homeCameraPreviewsEnabledFromConfig,
    controlsCameraPreviewsEnabledFromConfig,
    cameraPreviewRefreshSecondsFromConfig,
  ]);

  useEffect(() => {
    if (climateDirty) return;
    setClimateDraft({
      temperatureF: {
        cold: String(climateTolerances.temperatureF.cold ?? ''),
        comfy: String(climateTolerances.temperatureF.comfy ?? ''),
        warm: String(climateTolerances.temperatureF.warm ?? ''),
      },
      humidityPct: {
        dry: String(climateTolerances.humidityPct.dry ?? ''),
        comfy: String(climateTolerances.humidityPct.comfy ?? ''),
        humid: String(climateTolerances.humidityPct.humid ?? ''),
      },
      illuminanceLux: {
        dark: String(climateTolerances.illuminanceLux.dark ?? ''),
        dim: String(climateTolerances.illuminanceLux.dim ?? ''),
        bright: String(climateTolerances.illuminanceLux.bright ?? ''),
      },
    });
  }, [climateDirty, climateTolerances]);

  useEffect(() => {
    if (climateColorsDirty) return;
    setClimateColorsDraft(climateToleranceColors);
  }, [climateColorsDirty, climateToleranceColors]);

  useEffect(() => {
    if (sensorColorsDirty) return;
    setSensorColorsDraft(sensorIndicatorColors);
  }, [sensorColorsDirty, sensorIndicatorColors]);

  // Autosave: Home value opacity.
  useEffect(() => {
    if (!connected) return;
    if (!homeValueOpacityDirty) return;

    const t = setTimeout(async () => {
      setHomeValueColorError(null);
      try {
        await homeValueSave.run({
          colorizeHomeValues,
          colorizeHomeValuesOpacityPct: homeValueOpacityDraft,
        });
        setHomeValueOpacityDirty(false);
      } catch (err) {
        setHomeValueColorError(err?.message || String(err));
      }
    }, 600);

    return () => clearTimeout(t);
  }, [connected, homeValueOpacityDirty, homeValueOpacityDraft, colorizeHomeValues]);

  // Autosave: Card opacity scale.
  useEffect(() => {
    if (!connected) return;
    if (!cardOpacityScaleDirty) return;

    const t = setTimeout(async () => {
      setCardOpacityScaleError(null);
      try {
        await cardOpacitySave.run(cardOpacityScaleDraft);
        setCardOpacityScaleDirty(false);
      } catch (err) {
        setCardOpacityScaleError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, cardOpacityScaleDirty, cardOpacityScaleDraft]);

  // Autosave: Global card opacity scale.
  useEffect(() => {
    if (!connected) return;
    if (!globalCardOpacityScaleDirty) return;

    const t = setTimeout(async () => {
      setGlobalCardOpacityScaleError(null);
      try {
        await globalCardOpacitySave.run(globalCardOpacityScaleDraft);
        setGlobalCardOpacityScaleDirty(false);
      } catch (err) {
        setGlobalCardOpacityScaleError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalCardOpacityScaleDirty, globalCardOpacityScaleDraft]);

  // Autosave: Blur scale.
  useEffect(() => {
    if (!connected) return;
    if (!blurScaleDirty) return;

    const t = setTimeout(async () => {
      setBlurScaleError(null);
      try {
        await blurScaleSave.run(blurScaleDraft);
        setBlurScaleDirty(false);
      } catch (err) {
        setBlurScaleError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, blurScaleDirty, blurScaleDraft]);

  // Autosave: Global blur scale.
  useEffect(() => {
    if (!connected) return;
    if (!globalBlurScaleDirty) return;

    const t = setTimeout(async () => {
      setGlobalBlurScaleError(null);
      try {
        await globalBlurScaleSave.run(globalBlurScaleDraft);
        setGlobalBlurScaleDirty(false);
      } catch (err) {
        setGlobalBlurScaleError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalBlurScaleDirty, globalBlurScaleDraft]);

  // Autosave: Secondary text opacity.
  useEffect(() => {
    if (!connected) return;
    if (!secondaryTextOpacityDirty) return;

    const t = setTimeout(async () => {
      setSecondaryTextOpacityError(null);
      try {
        await secondaryTextOpacitySave.run(secondaryTextOpacityDraft);
        setSecondaryTextOpacityDirty(false);
      } catch (err) {
        setSecondaryTextOpacityError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, secondaryTextOpacityDirty, secondaryTextOpacityDraft]);

  // Autosave: Global secondary text opacity.
  useEffect(() => {
    if (!connected) return;
    if (!globalSecondaryTextOpacityDirty) return;

    const t = setTimeout(async () => {
      setGlobalSecondaryTextOpacityError(null);
      try {
        await globalSecondaryTextOpacitySave.run(globalSecondaryTextOpacityDraft);
        setGlobalSecondaryTextOpacityDirty(false);
      } catch (err) {
        setGlobalSecondaryTextOpacityError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalSecondaryTextOpacityDirty, globalSecondaryTextOpacityDraft]);

  // Autosave: Secondary text size.
  useEffect(() => {
    if (!connected) return;
    if (!secondaryTextSizeDirty) return;

    const t = setTimeout(async () => {
      setSecondaryTextSizeError(null);
      try {
        await secondaryTextSizeSave.run(secondaryTextSizeDraft);
        setSecondaryTextSizeDirty(false);
      } catch (err) {
        setSecondaryTextSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, secondaryTextSizeDirty, secondaryTextSizeDraft]);

  // Autosave: Global secondary text size.
  useEffect(() => {
    if (!connected) return;
    if (!globalSecondaryTextSizeDirty) return;

    const t = setTimeout(async () => {
      setGlobalSecondaryTextSizeError(null);
      try {
        await globalSecondaryTextSizeSave.run(globalSecondaryTextSizeDraft);
        setGlobalSecondaryTextSizeDirty(false);
      } catch (err) {
        setGlobalSecondaryTextSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalSecondaryTextSizeDirty, globalSecondaryTextSizeDraft]);

  // Autosave: Secondary text color.
  useEffect(() => {
    if (!connected) return;
    if (!secondaryTextColorDirty) return;

    const t = setTimeout(async () => {
      setSecondaryTextColorError(null);
      try {
        await secondaryTextColorSave.run(secondaryTextColorDraft || null);
        setSecondaryTextColorDirty(false);
      } catch (err) {
        setSecondaryTextColorError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, secondaryTextColorDirty, secondaryTextColorDraft]);

  // Autosave: Primary text opacity.
  useEffect(() => {
    if (!connected) return;
    if (!primaryTextOpacityDirty) return;

    const t = setTimeout(async () => {
      setPrimaryTextOpacityError(null);
      try {
        await primaryTextOpacitySave.run(primaryTextOpacityDraft);
        setPrimaryTextOpacityDirty(false);
      } catch (err) {
        setPrimaryTextOpacityError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, primaryTextOpacityDirty, primaryTextOpacityDraft]);

  // Autosave: Global primary text opacity.
  useEffect(() => {
    if (!connected) return;
    if (!globalPrimaryTextOpacityDirty) return;

    const t = setTimeout(async () => {
      setGlobalPrimaryTextOpacityError(null);
      try {
        await globalPrimaryTextOpacitySave.run(globalPrimaryTextOpacityDraft);
        setGlobalPrimaryTextOpacityDirty(false);
      } catch (err) {
        setGlobalPrimaryTextOpacityError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalPrimaryTextOpacityDirty, globalPrimaryTextOpacityDraft]);

  // Autosave: Primary text size.
  useEffect(() => {
    if (!connected) return;
    if (!primaryTextSizeDirty) return;

    const t = setTimeout(async () => {
      setPrimaryTextSizeError(null);
      try {
        await primaryTextSizeSave.run(primaryTextSizeDraft);
        setPrimaryTextSizeDirty(false);
      } catch (err) {
        setPrimaryTextSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, primaryTextSizeDirty, primaryTextSizeDraft]);

  // Autosave: Global primary text size.
  useEffect(() => {
    if (!connected) return;
    if (!globalPrimaryTextSizeDirty) return;

    const t = setTimeout(async () => {
      setGlobalPrimaryTextSizeError(null);
      try {
        await globalPrimaryTextSizeSave.run(globalPrimaryTextSizeDraft);
        setGlobalPrimaryTextSizeDirty(false);
      } catch (err) {
        setGlobalPrimaryTextSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalPrimaryTextSizeDirty, globalPrimaryTextSizeDraft]);

  // Autosave: Primary text color.
  useEffect(() => {
    if (!connected) return;
    if (!primaryTextColorDirty) return;

    const t = setTimeout(async () => {
      setPrimaryTextColorError(null);
      try {
        await primaryTextColorSave.run(primaryTextColorDraft || null);
        setPrimaryTextColorDirty(false);
      } catch (err) {
        setPrimaryTextColorError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, primaryTextColorDirty, primaryTextColorDraft]);

  // Autosave: Tertiary text opacity.
  useEffect(() => {
    if (!connected) return;
    if (!tertiaryTextOpacityDirty) return;

    const t = setTimeout(async () => {
      setTertiaryTextOpacityError(null);
      try {
        await tertiaryTextOpacitySave.run(tertiaryTextOpacityDraft);
        setTertiaryTextOpacityDirty(false);
      } catch (err) {
        setTertiaryTextOpacityError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, tertiaryTextOpacityDirty, tertiaryTextOpacityDraft]);

  // Autosave: Global tertiary text opacity.
  useEffect(() => {
    if (!connected) return;
    if (!globalTertiaryTextOpacityDirty) return;

    const t = setTimeout(async () => {
      setGlobalTertiaryTextOpacityError(null);
      try {
        await globalTertiaryTextOpacitySave.run(globalTertiaryTextOpacityDraft);
        setGlobalTertiaryTextOpacityDirty(false);
      } catch (err) {
        setGlobalTertiaryTextOpacityError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalTertiaryTextOpacityDirty, globalTertiaryTextOpacityDraft]);

  // Autosave: Tertiary text size.
  useEffect(() => {
    if (!connected) return;
    if (!tertiaryTextSizeDirty) return;

    const t = setTimeout(async () => {
      setTertiaryTextSizeError(null);
      try {
        await tertiaryTextSizeSave.run(tertiaryTextSizeDraft);
        setTertiaryTextSizeDirty(false);
      } catch (err) {
        setTertiaryTextSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, tertiaryTextSizeDirty, tertiaryTextSizeDraft]);

  // Autosave: Global tertiary text size.
  useEffect(() => {
    if (!connected) return;
    if (!globalTertiaryTextSizeDirty) return;

    const t = setTimeout(async () => {
      setGlobalTertiaryTextSizeError(null);
      try {
        await globalTertiaryTextSizeSave.run(globalTertiaryTextSizeDraft);
        setGlobalTertiaryTextSizeDirty(false);
      } catch (err) {
        setGlobalTertiaryTextSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalTertiaryTextSizeDirty, globalTertiaryTextSizeDraft]);

  // Autosave: Tertiary text color.
  useEffect(() => {
    if (!connected) return;
    if (!tertiaryTextColorDirty) return;

    const t = setTimeout(async () => {
      setTertiaryTextColorError(null);
      try {
        await tertiaryTextColorSave.run(tertiaryTextColorDraft || null);
        setTertiaryTextColorDirty(false);
      } catch (err) {
        setTertiaryTextColorError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, tertiaryTextColorDirty, tertiaryTextColorDraft]);

  // Autosave: Glow color.
  useEffect(() => {
    if (!connected) return;
    if (!glowColorDirty) return;

    const t = setTimeout(async () => {
      setGlowColorError(null);
      try {
        await glowColorSave.run(glowColorDraft || null);
        setGlowColorDirty(false);
      } catch (err) {
        setGlowColorError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, glowColorDirty, glowColorDraft]);

  // Autosave: Icon color.
  useEffect(() => {
    if (!connected) return;
    if (!iconColorDirty) return;

    const t = setTimeout(async () => {
      setIconColorError(null);
      try {
        await iconColorSave.run(iconColorDraft || null);
        setIconColorDirty(false);
      } catch (err) {
        setIconColorError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, iconColorDirty, iconColorDraft]);

  // Autosave: Icon opacity.
  useEffect(() => {
    if (!connected) return;
    if (!iconOpacityDirty) return;

    const t = setTimeout(async () => {
      setIconOpacityError(null);
      try {
        await iconOpacitySave.run(iconOpacityDraft);
        setIconOpacityDirty(false);
      } catch (err) {
        setIconOpacityError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, iconOpacityDirty, iconOpacityDraft]);

  // Autosave: Icon size.
  useEffect(() => {
    if (!connected) return;
    if (!iconSizeDirty) return;

    const t = setTimeout(async () => {
      setIconSizeError(null);
      try {
        await iconSizeSave.run(iconSizeDraft);
        setIconSizeDirty(false);
      } catch (err) {
        setIconSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, iconSizeDirty, iconSizeDraft]);

  // Autosave: Global icon size.
  useEffect(() => {
    if (!connected) return;
    if (!globalIconSizeDirty) return;

    const t = setTimeout(async () => {
      setGlobalIconSizeError(null);
      try {
        await globalIconSizeSave.run(globalIconSizeDraft);
        setGlobalIconSizeDirty(false);
      } catch (err) {
        setGlobalIconSizeError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalIconSizeDirty, globalIconSizeDraft]);

  // Autosave: Card scale.
  useEffect(() => {
    if (!connected) return;
    if (!cardScaleDirty) return;

    const t = setTimeout(async () => {
      setCardScaleError(null);
      try {
        await cardScaleSave.run(cardScaleDraft);
        setCardScaleDirty(false);
      } catch (err) {
        setCardScaleError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, cardScaleDirty, cardScaleDraft]);

  // Autosave: Global card scale.
  useEffect(() => {
    if (!connected) return;
    if (!globalCardScaleDirty) return;

    const t = setTimeout(async () => {
      setGlobalCardScaleError(null);
      try {
        await globalCardScaleSave.run(globalCardScaleDraft);
        setGlobalCardScaleDirty(false);
      } catch (err) {
        setGlobalCardScaleError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalCardScaleDirty, globalCardScaleDraft]);

  // Autosave: Global switch control styles.
  useEffect(() => {
    if (!connected) return;
    if (!globalSwitchControlStyleDirty && !globalSwitchAnimationStyleDirty) return;

    const t = setTimeout(async () => {
      setGlobalSwitchControlStyleError(null);
      setGlobalSwitchAnimationStyleError(null);
      try {
        await deviceControlStylesSave.run({
          switch: {
            controlStyle: globalSwitchControlStyleDraft,
            animationStyle: globalSwitchAnimationStyleDraft,
          },
        });
        setGlobalSwitchControlStyleDirty(false);
        setGlobalSwitchAnimationStyleDirty(false);
      } catch (err) {
        const msg = err?.message || String(err);
        setGlobalSwitchControlStyleError(msg);
        setGlobalSwitchAnimationStyleError(msg);
      }
    }, 650);

    return () => clearTimeout(t);
  }, [
    connected,
    globalSwitchControlStyleDirty,
    globalSwitchAnimationStyleDirty,
    globalSwitchControlStyleDraft,
    globalSwitchAnimationStyleDraft,
  ]);

  // Autosave: Home top row.
  useEffect(() => {
    if (!connected) return;
    if (!homeTopRowDirty) return;

    const t = setTimeout(async () => {
      setHomeTopRowError(null);
      try {
        const scaleRaw = Number(homeTopRowDraft.scalePct);
        const homeTopRowScalePct = Number.isFinite(scaleRaw)
          ? Math.max(50, Math.min(120, Math.round(scaleRaw)))
          : 100;

        const allowed = new Set(HOME_TOP_ROW_CARD_IDS);
        const cards = Array.from(new Set(
          (Array.isArray(homeTopRowDraft.cards) ? homeTopRowDraft.cards : [])
            .map((c) => String(c || '').trim())
            .filter((c) => c && allowed.has(c)),
        ));

        await homeTopRowSave.run({
          homeTopRowEnabled: homeTopRowDraft.enabled === true,
          homeTopRowScalePct,
          homeTopRowCards: cards,
        });
        setHomeTopRowDirty(false);
      } catch (err) {
        setHomeTopRowError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, homeTopRowDirty, homeTopRowDraft, homeTopRowSave]);

  // Autosave: Home room columns (XL).
  useEffect(() => {
    if (!connected) return;
    if (!homeRoomColumnsXlDirty) return;

    const t = setTimeout(async () => {
      setHomeRoomColumnsXlError(null);
      try {
        await homeRoomColsSave.run(homeRoomColumnsXlDraft);
        setHomeRoomColumnsXlDirty(false);
      } catch (err) {
        setHomeRoomColumnsXlError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, homeRoomColumnsXlDirty, homeRoomColumnsXlDraft]);

  // Autosave: Global home room columns (XL).
  useEffect(() => {
    if (!connected) return;
    if (!globalHomeRoomColumnsXlDirty) return;

    const t = setTimeout(async () => {
      setGlobalHomeRoomColumnsXlError(null);
      try {
        await globalHomeRoomColsSave.run(globalHomeRoomColumnsXlDraft);
        setGlobalHomeRoomColumnsXlDirty(false);
      } catch (err) {
        setGlobalHomeRoomColumnsXlError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, globalHomeRoomColumnsXlDirty, globalHomeRoomColumnsXlDraft]);

  // Autosave: Home room metric columns.
  useEffect(() => {
    if (!connected) return;
    if (!homeRoomMetricColumnsDirty) return;

    const t = setTimeout(async () => {
      setHomeRoomMetricColumnsError(null);
      try {
        await homeRoomMetricColsSave.run(homeRoomMetricColumnsDraft);
        setHomeRoomMetricColumnsDirty(false);
      } catch (err) {
        setHomeRoomMetricColumnsError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, homeRoomMetricColumnsDirty, homeRoomMetricColumnsDraft]);

  // Autosave: Home room metric card selection.
  useEffect(() => {
    if (!connected) return;
    if (!homeRoomMetricKeysDirty) return;

    const t = setTimeout(async () => {
      setHomeRoomMetricKeysError(null);
      try {
        await homeRoomMetricKeysSave.run(homeRoomMetricKeysDraft);
        setHomeRoomMetricKeysDirty(false);
      } catch (err) {
        setHomeRoomMetricKeysError(err?.message || String(err));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, homeRoomMetricKeysDirty, homeRoomMetricKeysDraft]);


  // Autosave: Camera previews.
  useEffect(() => {
    if (!connected) return;
    if (!cameraPreviewsDirty) return;

    const t = setTimeout(async () => {
      setCameraPreviewsError(null);
      try {
        const refreshRaw = Number(cameraPreviewsDraft.cameraPreviewRefreshSeconds);
        const cameraPreviewRefreshSeconds = Number.isFinite(refreshRaw)
          ? Math.max(2, Math.min(120, Math.round(refreshRaw)))
          : 10;

        await cameraPreviewsSave.run({
          homeCameraPreviewsEnabled: cameraPreviewsDraft.homeCameraPreviewsEnabled === true,
          controlsCameraPreviewsEnabled: cameraPreviewsDraft.controlsCameraPreviewsEnabled === true,
          cameraPreviewRefreshSeconds,
        });
        setCameraPreviewsDirty(false);
      } catch (e) {
        setCameraPreviewsError(e?.message || String(e));
      }
    }, 650);

    return () => clearTimeout(t);
  }, [connected, cameraPreviewsDirty, cameraPreviewsDraft]);


  // Autosave: Home sensor indicator colors.
  useEffect(() => {
    if (!connected) return;
    if (!sensorColorsDirty) return;

    const t = setTimeout(async () => {
      setSensorColorsError(null);
      try {
        await sensorColorsSave.run({ ...sensorColorsDraft });
        setSensorColorsDirty(false);
      } catch (e) {
        setSensorColorsError(e?.message || String(e));
      }
    }, 500);

    return () => clearTimeout(t);
  }, [connected, sensorColorsDirty, sensorColorsDraft]);

  // Autosave: Open-Meteo config.
  useEffect(() => {
    if (!connected) return;
    if (!openMeteoDirty) return;

    const t = setTimeout(async () => {
      setOpenMeteoError(null);
      try {
        await openMeteoSave.run({
          lat: String(openMeteoDraft.lat || '').trim(),
          lon: String(openMeteoDraft.lon || '').trim(),
          timezone: String(openMeteoDraft.timezone || '').trim() || 'auto',
        });
        setOpenMeteoDirty(false);
      } catch (e) {
        setOpenMeteoError(e?.message || String(e));
      }
    }, 700);

    return () => clearTimeout(t);
  }, [connected, openMeteoDirty, openMeteoDraft, openMeteoSave]);

  const toFinite = (value) => {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s.length) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const inc3 = (a, b, c) => (a < b) && (b < c);

  // Autosave: Climate tolerances.
  useEffect(() => {
    if (!connected) return;
    if (!climateDirty) return;

    const t = setTimeout(async () => {
      const tRaw = climateDraft.temperatureF;
      const hRaw = climateDraft.humidityPct;
      const lRaw = climateDraft.illuminanceLux;

      const tVals = { cold: toFinite(tRaw.cold), comfy: toFinite(tRaw.comfy), warm: toFinite(tRaw.warm) };
      const hVals = { dry: toFinite(hRaw.dry), comfy: toFinite(hRaw.comfy), humid: toFinite(hRaw.humid) };
      const lVals = { dark: toFinite(lRaw.dark), dim: toFinite(lRaw.dim), bright: toFinite(lRaw.bright) };

      if (tVals.cold === null || tVals.comfy === null || tVals.warm === null
        || hVals.dry === null || hVals.comfy === null || hVals.humid === null
        || lVals.dark === null || lVals.dim === null || lVals.bright === null) {
        setClimateError('All tolerance thresholds must be valid numbers.');
        return;
      }
      if (!inc3(tVals.cold, tVals.comfy, tVals.warm)) {
        setClimateError('Temperature thresholds must be increasing (cold < comfy < warm).');
        return;
      }
      if (!inc3(hVals.dry, hVals.comfy, hVals.humid)) {
        setClimateError('Humidity thresholds must be increasing (dry < comfy < humid).');
        return;
      }
      if (!inc3(lVals.dark, lVals.dim, lVals.bright)) {
        setClimateError('Illuminance thresholds must be increasing (dark < dim < bright).');
        return;
      }

      setClimateError(null);
      try {
        await climateTolSave.run({
          temperatureF: { cold: tVals.cold, comfy: tVals.comfy, warm: tVals.warm },
          humidityPct: { dry: hVals.dry, comfy: hVals.comfy, humid: hVals.humid },
          illuminanceLux: { dark: lVals.dark, dim: lVals.dim, bright: lVals.bright },
        });
        setClimateDirty(false);
      } catch (e) {
        setClimateError(e?.message || String(e));
      }
    }, 700);

    return () => clearTimeout(t);
  }, [connected, climateDirty, climateDraft]);

  // Autosave: Climate tolerance colors.
  useEffect(() => {
    if (!connected) return;
    if (!climateColorsDirty) return;

    const t = setTimeout(async () => {
      setClimateColorsError(null);
      try {
        await climateColorsSave.run({
          temperatureF: { ...climateColorsDraft.temperatureF },
          humidityPct: { ...climateColorsDraft.humidityPct },
          illuminanceLux: { ...climateColorsDraft.illuminanceLux },
        });
        setClimateColorsDirty(false);
      } catch (e) {
        setClimateColorsError(e?.message || String(e));
      }
    }, 500);

    return () => clearTimeout(t);
  }, [connected, climateColorsDirty, climateColorsDraft]);

  const queueLabelAutosave = (labelId, text) => {
    const id = String(labelId);
    const trimmed = String(text ?? '').trim();
    const timers = labelSaveTimersRef.current;
    if (timers.has(id)) clearTimeout(timers.get(id));

    if (!connected) {
      setLabelSaveState((prev) => ({ ...prev, [id]: { status: 'idle', error: null } }));
      return;
    }

    if (!trimmed.length) {
      setLabelSaveState((prev) => ({ ...prev, [id]: { status: 'idle', error: 'Text is empty (not saved).' } }));
      return;
    }

    setLabelSaveState((prev) => ({ ...prev, [id]: { status: 'saving', error: null } }));
    const t = setTimeout(async () => {
      try {
        await updateLabel(id, trimmed);
        setLabelSaveState((prev) => ({ ...prev, [id]: { status: 'saved', error: null } }));
      } catch (e) {
        setLabelSaveState((prev) => ({ ...prev, [id]: { status: 'error', error: e?.message || String(e) } }));
      }
    }, 650);

    timers.set(id, t);
  };

  useEffect(() => {
    return () => {
      const timers = labelSaveTimersRef.current;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      const timers = deviceOverrideTimersRef.current;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);


  const [newRoomName, setNewRoomName] = useState('');
  const [labelDrafts, setLabelDrafts] = useState(() => ({}));

  const [deviceOverrideDrafts, setDeviceOverrideDrafts] = useState(() => ({}));
  const [deviceOverrideSaveState, setDeviceOverrideSaveState] = useState(() => ({}));
  const deviceOverrideTimersRef = useRef(new Map());
  const [selectedDeviceIdForEdit, setSelectedDeviceIdForEdit] = useState('');
  // Commands are discovered per-device. Missing per-device allowlist means "allow all".
  const UI_HOME_METRICS = useMemo(() => (['temperature', 'humidity', 'illuminance', 'motion', 'contact', 'door']), []);
  const UI_INFO_METRIC_PRIORITY = useMemo(() => ([
    'temperature',
    'humidity',
    'illuminance',
    'battery',
    'motion',
    'contact',
    'door',
    'lock',
    'presence',
    'switch',
    'level',
    'volume',
    'mute',
    'position',
    'power',
    'energy',
    'speed',
  ]), []);

  const isSafeInfoMetricKey = (key) => typeof key === 'string' && key.length <= 64 && /^[A-Za-z0-9_]+$/.test(key);

  const isDisplayableInfoValue = (value) => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) {
      return value.some((v) => ['string', 'number', 'boolean'].includes(typeof v));
    }
    if (typeof value === 'object') return false;
    return ['string', 'number', 'boolean'].includes(typeof value);
  };

  const formatInfoMetricLabel = (key) => {
    const s = String(key || '').trim();
    if (!s) return '';
    const upper = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
    return upper.replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const sortInfoMetricKeys = (keys) => {
    const priority = new Map(UI_INFO_METRIC_PRIORITY.map((k, i) => [k, i]));
    return [...keys].sort((a, b) => {
      const ia = priority.has(a) ? priority.get(a) : 999;
      const ib = priority.has(b) ? priority.get(b) : 999;
      if (ia !== ib) return ia - ib;
      return String(a).localeCompare(String(b));
    });
  };

  const [labelSaveState, setLabelSaveState] = useState(() => ({}));
  const labelSaveTimersRef = useRef(new Map());

  const homeVisibleDeviceIds = useMemo(() => {
    const uiObj = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
    const hasKey = Object.prototype.hasOwnProperty.call(uiObj, 'homeVisibleDeviceIds');
    if (!hasKey) return null;
    const ids = Array.isArray(uiObj.homeVisibleDeviceIds) ? uiObj.homeVisibleDeviceIds : [];
    const cleaned = ids.map((v) => String(v || '').trim()).filter(Boolean);
    return new Set(cleaned);
  }, [config?.ui]);

  const ctrlVisibleDeviceIds = useMemo(() => {
    const uiObj = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
    const hasKey = Object.prototype.hasOwnProperty.call(uiObj, 'ctrlVisibleDeviceIds');
    if (!hasKey) return null;
    const ids = Array.isArray(uiObj.ctrlVisibleDeviceIds) ? uiObj.ctrlVisibleDeviceIds : [];
    const cleaned = ids.map((v) => String(v || '').trim()).filter(Boolean);
    return new Set(cleaned);
  }, [config?.ui]);

  // Availability is a server-enforced global safety boundary. Even if panel profiles can override UI settings,
  // the allowlists must always reflect the *global* server config.
  const allowlistConfig = baseConfig ?? config;

  const mainAllowedDeviceIds = useMemo(() => {
    const ids = Array.isArray(allowlistConfig?.ui?.mainAllowedDeviceIds) ? allowlistConfig.ui.mainAllowedDeviceIds : [];
    const cleaned = ids.map((v) => String(v || '').trim()).filter(Boolean);
    return new Set(cleaned);
  }, [allowlistConfig?.ui?.mainAllowedDeviceIds]);

  const ctrlAllowedDeviceIds = useMemo(() => {
    const ids = Array.isArray(allowlistConfig?.ui?.ctrlAllowedDeviceIds) ? allowlistConfig.ui.ctrlAllowedDeviceIds : [];
    const cleaned = ids.map((v) => String(v || '').trim()).filter(Boolean);
    return new Set(cleaned);
  }, [allowlistConfig?.ui?.ctrlAllowedDeviceIds]);

  const [optimisticGlobalAllowedDeviceIds, setOptimisticGlobalAllowedDeviceIds] = useState(null);

  useEffect(() => {
    if (!(optimisticGlobalAllowedDeviceIds instanceof Set)) return;

    // Clear optimistic overrides once the server-provided allowlists match the optimistic set.
    // (Avoid clearing on mere reference churn of the merged config.)
    const serverSet = new Set([
      ...Array.from(mainAllowedDeviceIds),
      ...Array.from(ctrlAllowedDeviceIds),
    ].map((v) => String(v)));

    if (serverSet.size !== optimisticGlobalAllowedDeviceIds.size) return;
    for (const v of serverSet) {
      if (!optimisticGlobalAllowedDeviceIds.has(v)) return;
    }

    setOptimisticGlobalAllowedDeviceIds(null);
  }, [optimisticGlobalAllowedDeviceIds, mainAllowedDeviceIds, ctrlAllowedDeviceIds]);

  const effectiveGlobalAllowedDeviceIds = useMemo(() => {
    if (optimisticGlobalAllowedDeviceIds instanceof Set) return optimisticGlobalAllowedDeviceIds;
    return new Set([
      ...Array.from(mainAllowedDeviceIds),
      ...Array.from(ctrlAllowedDeviceIds),
    ].map((v) => String(v)));
  }, [optimisticGlobalAllowedDeviceIds, mainAllowedDeviceIds, ctrlAllowedDeviceIds]);

  const mainAllowlistLocked = Boolean(allowlistConfig?.ui?.mainAllowlistLocked);
  const ctrlAllowlistLocked = Boolean(allowlistConfig?.ui?.ctrlAllowlistLocked);
  const globalAvailabilityLocked = Boolean(mainAllowlistLocked || ctrlAllowlistLocked);

  const discoveredDevices = useMemo(() => {
    const raw = Array.isArray(config?.ui?.discoveredDevices) ? config.ui.discoveredDevices : null;
    if (!raw) return null;

    const devices = raw
      .map((d) => {
        const id = String(d?.id || '').trim();
        if (!id) return null;

        const label = String(d?.label || id);
        const source = String(d?.source || '').trim();

        return {
          id,
          label,
          source,
        };
      })
      .filter(Boolean);

    devices.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return devices;
  }, [config?.ui?.discoveredDevices]);

  const allDevices = useMemo(() => {
    const devices = (config?.sensors || [])
      .map((d) => {
        const id = String(d?.id || '').trim();
        if (!id) return null;

        const st = statuses?.[id] || null;
        const commands = Array.isArray(st?.commands) ? st.commands : [];
        const capabilities = Array.isArray(d?.capabilities) ? d.capabilities.map((c) => String(c || '').trim()).filter(Boolean) : [];
        const source = String(d?.source || '').trim();

        return {
          id,
          label: String(d?.label || st?.label || id),
          commands: Array.from(new Set(commands.map((c) => String(c || '').trim()).filter(Boolean))),
          capabilities,
          source,
        };
      })
      .filter(Boolean);

    devices.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return devices;
  }, [config?.sensors, statuses]);

  const allDeviceIds = useMemo(() => {
    return allDevices.map((x) => String(x.id));
  }, [allDevices]);

  const availabilityDevices = useMemo(() => {
    // Prefer full discovered device catalog for Global Availability UI.
    // Fall back to the currently-available device list if server doesn't provide it.
    return discoveredDevices || allDevices;
  }, [discoveredDevices, allDevices]);

  useEffect(() => {
    if (!selectedDeviceIdForEdit) return;
    if (!allDevices.some((d) => String(d?.id) === String(selectedDeviceIdForEdit))) {
      setSelectedDeviceIdForEdit('');
    }
  }, [allDevices, selectedDeviceIdForEdit]);


  const effectiveDeviceLabelOverrides = useMemo(() => {
    // When a panel profile is selected, use its overrides; otherwise use global
    if (selectedPanelName && selectedPanelProfile) {
      const v = selectedPanelProfile.deviceLabelOverrides;
      return (v && typeof v === 'object') ? v : {};
    }
    const v = config?.ui?.deviceLabelOverrides;
    return (v && typeof v === 'object') ? v : {};
  }, [config?.ui?.deviceLabelOverrides, selectedPanelName, selectedPanelProfile]);

  const effectiveDeviceCommandAllowlist = useMemo(() => {
    // When a panel profile is selected, use its allowlist; otherwise use global
    if (selectedPanelName && selectedPanelProfile) {
      const v = selectedPanelProfile.deviceCommandAllowlist;
      return (v && typeof v === 'object') ? v : {};
    }
    const v = config?.ui?.deviceCommandAllowlist;
    return (v && typeof v === 'object') ? v : {};
  }, [config?.ui?.deviceCommandAllowlist, selectedPanelName, selectedPanelProfile]);

  const effectiveDeviceHomeMetricAllowlist = useMemo(() => {
    // When a panel profile is selected, use its allowlist; otherwise use global
    if (selectedPanelName && selectedPanelProfile) {
      const v = selectedPanelProfile.deviceHomeMetricAllowlist;
      return (v && typeof v === 'object') ? v : {};
    }
    const v = config?.ui?.deviceHomeMetricAllowlist;
    return (v && typeof v === 'object') ? v : {};
  }, [config?.ui?.deviceHomeMetricAllowlist, selectedPanelName, selectedPanelProfile]);

  const effectiveDeviceInfoMetricAllowlist = useMemo(() => {
    // When a panel profile is selected, use its allowlist; otherwise use global
    if (selectedPanelName && selectedPanelProfile) {
      const v = selectedPanelProfile.deviceInfoMetricAllowlist;
      return (v && typeof v === 'object') ? v : {};
    }
    const v = config?.ui?.deviceInfoMetricAllowlist;
    return (v && typeof v === 'object') ? v : {};
  }, [config?.ui?.deviceInfoMetricAllowlist, selectedPanelName, selectedPanelProfile]);

  useEffect(() => {
    setDeviceOverrideDrafts((prev) => {
      const next = { ...prev };
      for (const d of allDevices) {
        const id = String(d?.id || '').trim();
        if (!id) continue;

        const existing = next[id];
        const label = String(effectiveDeviceLabelOverrides?.[id] ?? '');
        const cmds = effectiveDeviceCommandAllowlist?.[id];
        // Missing allowlist => inherit (allow all). Explicit empty array => allow none.
        const normalizedCmds = Array.isArray(cmds) ? cmds.map((c) => String(c)) : null;
        const hm = effectiveDeviceHomeMetricAllowlist?.[id];
        const normalizedHomeMetrics = Array.isArray(hm) ? hm.map((c) => String(c)) : null;
        const im = effectiveDeviceInfoMetricAllowlist?.[id];
        const normalizedInfoMetrics = Array.isArray(im) ? im.map((c) => String(c)) : null;

        if (!existing) {
          next[id] = { label, commands: normalizedCmds, homeMetrics: normalizedHomeMetrics, infoMetrics: normalizedInfoMetrics };
        } else {
          // Only fill in missing keys to avoid clobbering in-progress edits.
          if (existing.label === undefined) existing.label = label;
          if (existing.commands === undefined) existing.commands = normalizedCmds;
          if (existing.homeMetrics === undefined) existing.homeMetrics = normalizedHomeMetrics;
          if (existing.infoMetrics === undefined) existing.infoMetrics = normalizedInfoMetrics;
        }
      }

      for (const k of Object.keys(next)) {
        if (!allDevices.some((d) => String(d?.id) === k)) delete next[k];
      }
      return next;
    });
  }, [allDevices, effectiveDeviceLabelOverrides, effectiveDeviceCommandAllowlist, effectiveDeviceHomeMetricAllowlist, effectiveDeviceInfoMetricAllowlist]);

  // When switching profiles, reset per-device override drafts to reflect the newly selected profile.
  // (Must live after the related useMemos to avoid TDZ errors.)
  const prevSelectedPanelNameRef = useRef(selectedPanelName);
  useEffect(() => {
    // Only do full reset when panel name actually changes
    const panelChanged = prevSelectedPanelNameRef.current !== selectedPanelName;
    prevSelectedPanelNameRef.current = selectedPanelName;

    if (!panelChanged) return;

    const timers = deviceOverrideTimersRef.current;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();

    setDeviceOverrideSaveState({});
    setDeviceOverrideDrafts(() => {
      const next = {};
      for (const d of allDevices) {
        const id = String(d?.id || '').trim();
        if (!id) continue;
        const label = String(effectiveDeviceLabelOverrides?.[id] ?? '');
        const cmds = effectiveDeviceCommandAllowlist?.[id];
        const hm = effectiveDeviceHomeMetricAllowlist?.[id];
        const im = effectiveDeviceInfoMetricAllowlist?.[id];
        next[id] = {
          label,
          // Missing allowlist => inherit (allow all). Explicit empty array => allow none.
          commands: Array.isArray(cmds) ? cmds.map((c) => String(c)) : null,
          homeMetrics: Array.isArray(hm) ? hm.map((c) => String(c)) : null,
          infoMetrics: Array.isArray(im) ? im.map((c) => String(c)) : null,
        };
      }
      return next;
    });
  }, [selectedPanelName, allDevices, effectiveDeviceLabelOverrides, effectiveDeviceCommandAllowlist, effectiveDeviceHomeMetricAllowlist, effectiveDeviceInfoMetricAllowlist]);

  const manualRooms = useMemo(() => {
    const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
    return rooms
      .filter((r) => r?.manual === true)
      .map((r) => ({ id: String(r.id), name: String(r.name || r.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [config?.rooms]);

  const labels = useMemo(() => {
    const arr = Array.isArray(config?.labels) ? config.labels : [];
    return arr
      .map((l) => ({ id: String(l?.id || ''), text: String(l?.text ?? '') }))
      .filter((l) => l.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [config?.labels]);

  const visibleRoomIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.visibleRoomIds) ? config.ui.visibleRoomIds : [];
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.visibleRoomIds]);

  const globalVisibleRoomIds = useMemo(() => {
    const ids = Array.isArray(baseConfig?.ui?.visibleRoomIds) ? baseConfig.ui.visibleRoomIds : [];
    return new Set(ids.map((v) => String(v)));
  }, [baseConfig?.ui?.visibleRoomIds]);

  const allRoomsForVisibility = useMemo(() => {
    const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
    const out = rooms
      .map((r) => ({ id: String(r?.id || '').trim(), name: String(r?.name || r?.id || '').trim() }))
      .filter((r) => r.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [config?.rooms]);

  const toggleVisibleRoom = async (roomId, nextVisible) => {
    const id = String(roomId || '').trim();
    if (!id) return;
    setError(null);
    try {
      const next = new Set(Array.from(visibleRoomIds));
      if (nextVisible) next.add(id);
      else next.delete(id);

      // Empty list means "show all rooms".
      const arr = Array.from(next);
      await visibleRoomsSave.run({
        visibleRoomIds: arr,
        ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const toggleGlobalVisibleRoom = async (roomId, nextVisible) => {
    const id = String(roomId || '').trim();
    if (!id) return;
    setError(null);
    try {
      const next = new Set(Array.from(globalVisibleRoomIds));
      if (nextVisible) next.add(id);
      else next.delete(id);

      // Empty list means "show all rooms".
      const arr = Array.from(next);
      await globalVisibleRoomsSave.run({
        visibleRoomIds: arr,
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    // Keep drafts in sync when labels update from server
    setLabelDrafts((prev) => {
      const next = { ...prev };
      for (const l of labels) {
        if (next[l.id] === undefined) next[l.id] = l.text;
      }
      // prune removed labels
      for (const k of Object.keys(next)) {
        if (!labels.some((l) => l.id === k)) delete next[k];
      }
      return next;
    });
  }, [labels]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setSoundFilesError(null);
        const files = await fetchSoundFiles();
        if (!cancelled) setSoundFiles(files);
      } catch (e) {
        if (!cancelled) setSoundFilesError(e?.message || String(e));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setDeviceIconsError(null);
        const idx = await fetchDeviceIconsIndex();
        if (!cancelled) setDeviceIconsIndex(idx);
      } catch (e) {
        if (!cancelled) setDeviceIconsError(e?.message || String(e));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setControlIconsError(null);
        const idx = await fetchControlIconsIndex();
        if (!cancelled) setControlIconsIndex(idx);
      } catch (e) {
        if (!cancelled) setControlIconsError(e?.message || String(e));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Cameras are global settings; load them when Global Options is open.
    if (activeTab !== 'display') return;

    let cancelled = false;
    setUiCamerasError(null);
    setUiCamerasStatus('loading');
    fetchUiCameras()
      .then((cams) => {
        if (cancelled) return;
        setUiCameras(Array.isArray(cams) ? cams : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setUiCamerasError(e?.message || String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setUiCamerasStatus('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    let mounted = true;
    fetchOpenMeteoConfig()
      .then((data) => {
        if (!mounted) return;
        const open = (data?.openMeteo && typeof data.openMeteo === 'object') ? data.openMeteo : {};
        const overrides = (data?.overriddenByEnv && typeof data.overriddenByEnv === 'object') ? data.overriddenByEnv : {};
        setOpenMeteoEnvOverrides({
          lat: overrides.lat === true,
          lon: overrides.lon === true,
          timezone: overrides.timezone === true,
        });
        if (!openMeteoDirty) {
          setOpenMeteoDraft({
            lat: String(open.lat ?? ''),
            lon: String(open.lon ?? ''),
            timezone: String(open.timezone ?? 'auto') || 'auto',
          });
        }
      })
      .catch((e) => {
        if (!mounted) return;
        setOpenMeteoError(e?.message || String(e));
      });

    return () => {
      mounted = false;
    };
  }, [openMeteoDirty]);

  const queueDeviceLabelAutosave = (deviceId, text) => {
    const id = String(deviceId || '').trim();
    const trimmed = String(text ?? '').trim();
    const timers = deviceOverrideTimersRef.current;
    const key = `${id}:label`;
    if (!id) return;
    if (timers.has(key)) clearTimeout(timers.get(key));

    if (!connected) {
      setDeviceOverrideSaveState((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), label: { status: 'idle', error: null } },
      }));
      return;
    }

    setDeviceOverrideSaveState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), label: { status: 'saving', error: null } },
    }));

    const t = setTimeout(async () => {
      try {
        await saveDeviceOverrides({
          deviceId: id,
          label: trimmed ? trimmed : null,
          ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
        });
        setDeviceOverrideSaveState((prev) => ({
          ...prev,
          [id]: { ...(prev[id] || {}), label: { status: 'saved', error: null } },
        }));
      } catch (e) {
        setDeviceOverrideSaveState((prev) => ({
          ...prev,
          [id]: { ...(prev[id] || {}), label: { status: 'error', error: e?.message || String(e) } },
        }));
      }
    }, 650);

    timers.set(key, t);
  };

  const toggleDeviceCommand = async (device, command, nextAllowed) => {
    const id = String(device?.id || '').trim();
    const cmd = String(command || '').trim();
    if (!id || !cmd) return;

    const available = Array.isArray(device?.commands) ? device.commands : [];
    if (!available.includes(cmd)) return;

    const draft = (deviceOverrideDrafts && deviceOverrideDrafts[id] && typeof deviceOverrideDrafts[id] === 'object')
      ? deviceOverrideDrafts[id]
      : {};
    const hasExplicit = Object.prototype.hasOwnProperty.call(draft, 'commands');
    const existingArr = hasExplicit ? draft.commands : undefined;

    // Missing allowlist => inherit (allow all commands). Empty array => allow none.
    const baseSet = Array.isArray(existingArr)
      ? new Set(existingArr.map((c) => String(c)))
      : new Set(available.map((c) => String(c)));

    if (nextAllowed) baseSet.add(cmd);
    else baseSet.delete(cmd);

    const nextArr = available
      .map((c) => String(c || '').trim())
      .filter(Boolean)
      .filter((c) => baseSet.has(c));

    const isAll = nextArr.length === available.length;
    const payloadCommands = isAll ? null : nextArr;

    setDeviceOverrideDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), commands: payloadCommands },
    }));

    if (!connected) return;

    setDeviceOverrideSaveState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), commands: { status: 'saving', error: null } },
    }));
    try {
      await saveDeviceOverrides({
        deviceId: id,
        commands: payloadCommands,
        ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
      });
      setDeviceOverrideSaveState((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), commands: { status: 'saved', error: null } },
      }));
    } catch (e) {
      setDeviceOverrideSaveState((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), commands: { status: 'error', error: e?.message || String(e) } },
      }));
    }
  };

  const toggleHomeMetric = async (device, metricKey, nextAllowed) => {
    const id = String(device?.id || '').trim();
    const key = String(metricKey || '').trim();
    if (!id || !key) return;

    const caps = Array.isArray(device?.capabilities) ? device.capabilities : [];
    const attrs = statuses?.[id]?.attributes || {};

    const available = (() => {
      const out = new Set();
      if (caps.includes('TemperatureMeasurement') || asNumber(attrs.temperature) !== null) out.add('temperature');
      if (caps.includes('RelativeHumidityMeasurement') || asNumber(attrs.humidity) !== null) out.add('humidity');
      if (caps.includes('IlluminanceMeasurement') || asNumber(attrs.illuminance) !== null) out.add('illuminance');
      if (caps.includes('MotionSensor') || typeof attrs.motion === 'string') out.add('motion');
      if (caps.includes('ContactSensor') || typeof attrs.contact === 'string') out.add('contact');
      if (caps.includes('GarageDoorControl') || typeof attrs.door === 'string') out.add('door');
      return Array.from(out);
    })();

    if (!available.includes(key)) return;

    const existingArr = deviceOverrideDrafts?.[id]?.homeMetrics;
    const baseSet = Array.isArray(existingArr)
      ? new Set(existingArr.map((c) => String(c)))
      : new Set(available);

    if (nextAllowed) baseSet.add(key);
    else baseSet.delete(key);

    const nextArr = UI_HOME_METRICS.filter((k) => available.includes(k) && baseSet.has(k));
    const isAll = nextArr.length === available.length;

    setDeviceOverrideDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), homeMetrics: isAll ? null : nextArr },
    }));

    if (!connected) return;

    setDeviceOverrideSaveState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), homeMetrics: { status: 'saving', error: null } },
    }));
    try {
      await saveDeviceOverrides({
        deviceId: id,
        homeMetrics: isAll ? null : nextArr,
        ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
      });
      setDeviceOverrideSaveState((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), homeMetrics: { status: 'saved', error: null } },
      }));
    } catch (e) {
      setDeviceOverrideSaveState((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), homeMetrics: { status: 'error', error: e?.message || String(e) } },
      }));
    }
  };

  const getAvailableInfoMetrics = (device) => {
    const id = String(device?.id || '').trim();
    if (!id) return [];
    const attrs = statuses?.[id]?.attributes || {};
    const keys = Object.entries(attrs)
      .filter(([key, value]) => isSafeInfoMetricKey(key) && isDisplayableInfoValue(value))
      .map(([key]) => key);
    return sortInfoMetricKeys(Array.from(new Set(keys)));
  };

  const toggleInfoMetric = async (device, metricKey, nextAllowed) => {
    const id = String(device?.id || '').trim();
    const key = String(metricKey || '').trim();
    if (!id || !key) return;

    const available = getAvailableInfoMetrics(device);
    if (!available.includes(key)) return;

    const existingArr = deviceOverrideDrafts?.[id]?.infoMetrics;
    const baseSet = Array.isArray(existingArr)
      ? new Set(existingArr.map((c) => String(c)))
      : new Set();

    if (nextAllowed) baseSet.add(key);
    else baseSet.delete(key);

    const nextArr = available.filter((k) => baseSet.has(k));

    setDeviceOverrideDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), infoMetrics: nextArr },
    }));

    if (!connected) return;

    setDeviceOverrideSaveState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), infoMetrics: { status: 'saving', error: null } },
    }));
    try {
      await saveDeviceOverrides({
        deviceId: id,
        infoMetrics: nextArr,
        ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
      });
      setDeviceOverrideSaveState((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), infoMetrics: { status: 'saved', error: null } },
      }));
    } catch (e) {
      setDeviceOverrideSaveState((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), infoMetrics: { status: 'error', error: e?.message || String(e) } },
      }));
    }
  };

  const setHomeVisible = async (deviceId, nextVisible, allDeviceIds) => {
    const id = String(deviceId || '').trim();
    if (!id) return;

    setError(null);
    try {
      // Update homeVisibleDeviceIds (panel-aware visibility)
      const visibleBase = homeVisibleDeviceIds
        ? new Set(Array.from(homeVisibleDeviceIds))
        : new Set(Array.isArray(allDeviceIds) ? allDeviceIds.map((v) => String(v)) : []);

      if (nextVisible) visibleBase.add(id);
      else visibleBase.delete(id);

      // Persist exactly what the user selected; empty means "show none".
      const nextVisibleArr = Array.from(visibleBase);

      // Save visibility only (availability is global and managed in Display → Global Defaults).
      await homeVisibleSave.run({
        homeVisibleDeviceIds: nextVisibleArr,
        ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const setCtrlVisible = async (deviceId, nextVisible, allDeviceIds) => {
    const id = String(deviceId || '').trim();
    if (!id) return;

    setError(null);
    try {
      const visibleBase = ctrlVisibleDeviceIds
        ? new Set(Array.from(ctrlVisibleDeviceIds))
        : new Set(Array.isArray(allDeviceIds) ? allDeviceIds.map((v) => String(v)) : []);

      if (nextVisible) visibleBase.add(id);
      else visibleBase.delete(id);

      // Persist exactly what the user selected; empty means "show none".
      const nextVisibleArr = Array.from(visibleBase);

      await ctrlVisibleSave.run({
        ctrlVisibleDeviceIds: nextVisibleArr,
        ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
      });
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  const setGlobalAvailable = async (deviceId, nextAllowed) => {
    const id = String(deviceId || '').trim();
    if (!id) return;
    setError(null);

    const previousOverride = optimisticGlobalAllowedDeviceIds instanceof Set
      ? new Set(Array.from(optimisticGlobalAllowedDeviceIds))
      : null;

    try {
      const base = new Set(Array.from(effectiveGlobalAllowedDeviceIds).map((v) => String(v)));
      if (nextAllowed) base.add(id);
      else base.delete(id);

      // Optimistically update UI immediately; server will eventually confirm via config_update/refresh.
      setOptimisticGlobalAllowedDeviceIds(new Set(Array.from(base)));

      const next = Array.from(base);
      // Global availability should default to allow on both Home + Controls.
      await allowlistSave.run({ mainAllowedDeviceIds: next, ctrlAllowedDeviceIds: next });

      // Kick a refresh to reduce time-to-consistency when the server doesn't push instantly.
      if (ctx?.refreshNow) ctx.refreshNow();
    } catch (e) {
      setOptimisticGlobalAllowedDeviceIds(previousOverride);
      setError(e?.message || String(e));
    }
  };

  const createPanel = async () => {
    setPanelCreateError(null);
    const name = String(newPanelName || '').trim();
    if (!name) return;

    setPanelCreateStatus('creating');
    try {
      const res = await createPanelProfile(name, selectedPanelName);
      const created = String(res?.name ?? name).trim() || name;
      if (ctx?.setPanelName) ctx.setPanelName(created);
      setNewPanelName('');
      return res;
    } catch (e) {
      setPanelCreateError(e?.message || String(e));
      throw e;
    } finally {
      setPanelCreateStatus('idle');
    }
  };

  return (
    <div className="w-full h-full flex flex-col utility-page">
      {/* Sticky header with tabs */}
      <div className="shrink-0 sticky top-0 z-20 bg-black/80 backdrop-blur-xl -mx-3 md:-mx-4 px-3 md:px-4 pt-0 pb-3 md:pb-4 border-b border-white/10">
        <div className="utility-panel p-3 md:p-4">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
            Settings
          </div>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {TABS.map((t) => {
              const selected = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${selected ? 'border-white/30 bg-white/10 text-white' : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/5'}`}
                  aria-current={selected ? 'page' : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab !== 'display' ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Panel Profile
                </label>
                <select
                  value={selectedPanelName}
                  onChange={(e) => {
                    const next = String(e.target.value || '').trim();
                    if (ctx?.setPanelName) ctx.setPanelName(next);
                  }}
                  className="mt-1 menu-select w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/85 outline-none focus:outline-none focus:ring-0 jvs-menu-select"
                >
                  <optgroup label="Panel profiles">
                    {panelNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </optgroup>
                </select>
                <div
                  className="mt-1 jvs-secondary-text text-white/60"
                  style={{ fontSize: 'calc(11px * var(--jvs-secondary-text-size-scale, 1))' }}
                >
                  {selectedPanelName ? 'Panel-specific overrides enabled.' : ''}
                </div>
                {isPresetSelected ? (
                  <div
                    className="mt-1 jvs-secondary-text text-white/60"
                    style={{ fontSize: 'calc(11px * var(--jvs-secondary-text-size-scale, 1))' }}
                  >
                    This is a shipped preset (read-only). Pick a preset you like, enter a new panel name, then click Create — the new panel profile starts from this preset.
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-6">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40">
                  New Panel Name
                </label>
                <input
                  value={newPanelName}
                  onChange={(e) => setNewPanelName(e.target.value)}
                  placeholder="e.g. Kitchen Panel"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/85 placeholder:text-white/30"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => createPanel().catch(() => undefined)}
                  disabled={panelCreateStatus === 'creating' || !String(newPanelName || '').trim()}
                  className={`w-full rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${panelCreateStatus === 'creating' ? 'border-white/10 bg-black/20 text-white/40' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}
                >
                  {panelCreateStatus === 'creating' ? 'Creating…' : 'Create'}
                </button>
              </div>

              {panelCreateError ? (
                <div className="md:col-span-12 text-[11px] text-neon-red break-words">
                  Panel create failed: {panelCreateError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto">
        <div className="w-full pt-4">

        {activeTab === 'appearance' ? (
          <div className="utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Panel Options
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Device Visibility
            </div>
            <div className="mt-1 text-xs text-white/45">
              Choose which devices appear on the Home and Controls screens for this panel profile. If you uncheck all devices for a screen, none will show.
            </div>

            {isPresetSelected ? (
              <div
                className="mt-2 jvs-secondary-text text-white/60"
                style={{ fontSize: 'calc(12px * var(--jvs-secondary-text-size-scale, 1))' }}
              >
                Presets are read-only. Create a new panel profile (above) to customize device visibility and overrides.
              </div>
            ) : null}

            {error ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {error}</div>
            ) : null}

            <div className="mt-2 text-xs text-white/45">
              {[statusText(homeVisibleSave.status), statusText(ctrlVisibleSave.status)].filter(Boolean).join(' · ')}
              {allDevices.length ? (
                <>
                  {' · '}Home: {homeVisibleDeviceIds === null ? `All (${allDevices.length})` : `${homeVisibleDeviceIds.size} selected`}
                  {' · '}Controls: {ctrlVisibleDeviceIds === null ? `All (${allDevices.length})` : `${ctrlVisibleDeviceIds.size} selected`}
                </>
              ) : null}
            </div>

            {!allDevices.length ? (
              <div className="mt-3 text-sm text-white/45">No devices discovered.</div>
            ) : (
              <div className={`mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 ${isPresetSelected ? 'opacity-50 pointer-events-none' : ''}`} aria-disabled={isPresetSelected ? 'true' : 'false'}>
                {allDevices.map((d) => {
                  const isHome = homeVisibleDeviceIds ? homeVisibleDeviceIds.has(String(d.id)) : true;
                  const isCtrl = ctrlVisibleDeviceIds ? ctrlVisibleDeviceIds.has(String(d.id)) : true;
                  const src = String(d?.source || '').trim();
                  const display = src ? `${d.label} (${src})` : d.label;

                  return (
                    <div key={d.id} className={`flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 ${!connected ? 'opacity-50' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white/85 truncate">{display}</div>
                        <div className="mt-1 text-[11px] text-white/45 truncate">ID: {d.id}</div>
                      </div>

                      <div className="shrink-0 flex items-center gap-3">
                        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                          <input
                            type="checkbox"
                            className={`h-5 w-5 ${scheme.checkboxAccent}`}
                            disabled={!connected || homeVisibleSave.status === 'saving' || isPresetSelected}
                            checked={isHome}
                            onChange={(e) => setHomeVisible(d.id, e.target.checked, allDeviceIds)}
                          />
                          Home
                        </label>

                        <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                          <input
                            type="checkbox"
                            className={`h-5 w-5 ${scheme.checkboxAccent}`}
                            disabled={!connected || ctrlVisibleSave.status === 'saving' || isPresetSelected}
                            checked={isCtrl}
                            onChange={(e) => setCtrlVisible(d.id, e.target.checked, allDeviceIds)}
                          />
                          Controls
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={`mt-4 ${isPresetSelected ? 'opacity-50 pointer-events-none' : ''}`} aria-disabled={isPresetSelected ? 'true' : 'false'}>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                <label
                  htmlFor="device-override-select"
                  className="block text-[10px] font-bold uppercase tracking-widest text-white/40"
                >
                  Device
                </label>
                <select
                  id="device-override-select"
                  value={selectedDeviceIdForEdit}
                  onChange={(e) => setSelectedDeviceIdForEdit(String(e.target.value || '').trim())}
                  className="mt-1 menu-select w-full rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white/85 outline-none focus:outline-none focus:ring-0 jvs-menu-select"
                >
                  <option value="">Select a device…</option>
                  {allDevices.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-white/45">
                  Pick the device you want to edit overrides for.
                </div>
              </div>

              {!allDevices.length ? null : !selectedDeviceIdForEdit ? (
                <div className="mt-3 text-sm text-white/45">Choose a device to edit its overrides.</div>
              ) : (() => {
                const d = allDevices.find((x) => String(x.id) === String(selectedDeviceIdForEdit));
                if (!d) return null;

                const draft = (deviceOverrideDrafts && deviceOverrideDrafts[d.id] && typeof deviceOverrideDrafts[d.id] === 'object')
                  ? deviceOverrideDrafts[d.id]
                  : {};
                const displayNameDraft = String(draft.label ?? '');
                const hasCommandsOverride = Object.prototype.hasOwnProperty.call(draft, 'commands');
                const explicitCommands = hasCommandsOverride
                  ? (draft.commands === null
                    ? null
                    : (Array.isArray(draft.commands) ? draft.commands.map((c) => String(c)) : []))
                  : null;
                const explicitHomeMetrics = Array.isArray(draft.homeMetrics) ? draft.homeMetrics.map((c) => String(c)) : null;
                const explicitInfoMetrics = Array.isArray(draft.infoMetrics) ? draft.infoMetrics.map((c) => String(c)) : null;
                const availableAllowedCommands = Array.isArray(d.commands)
                  ? Array.from(new Set(d.commands.map((c) => String(c || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
                  : [];

                const attrs = statuses?.[String(d.id)]?.attributes || {};
                const availableHomeMetrics = (() => {
                  const out = new Set();
                  const caps = Array.isArray(d?.capabilities) ? d.capabilities : [];
                  if (caps.includes('TemperatureMeasurement') || asNumber(attrs.temperature) !== null) out.add('temperature');
                  if (caps.includes('RelativeHumidityMeasurement') || asNumber(attrs.humidity) !== null) out.add('humidity');
                  if (caps.includes('IlluminanceMeasurement') || asNumber(attrs.illuminance) !== null) out.add('illuminance');
                  if (caps.includes('MotionSensor') || typeof attrs.motion === 'string') out.add('motion');
                  if (caps.includes('ContactSensor') || typeof attrs.contact === 'string') out.add('contact');
                  if (caps.includes('GarageDoorControl') || typeof attrs.door === 'string') out.add('door');
                  return Array.from(out);
                })();

                const availableInfoMetrics = getAvailableInfoMetrics(d);

                const labelSave = deviceOverrideSaveState?.[d.id]?.label || null;
                const cmdSave = deviceOverrideSaveState?.[d.id]?.commands || null;
                const homeMetricsSave = deviceOverrideSaveState?.[d.id]?.homeMetrics || null;
                const infoMetricsSave = deviceOverrideSaveState?.[d.id]?.infoMetrics || null;
                const isInheritHomeMetrics = explicitHomeMetrics === null;
                const isInheritInfoMetrics = explicitInfoMetrics === null;
                const isInheritCommands = explicitCommands === null;

                return (
                  <div className={`mt-3 rounded-2xl border p-4 bg-white/5 border-white/10 ${!connected ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/80 truncate">
                            {d.label}
                          </div>
                          <div className="mt-1 text-xs text-white/45 truncate">ID: {d.id}</div>
                        </div>

                        <div className="shrink-0" />
                      </div>

                      <div className="mt-4 border-t border-white/10 pt-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                          Overrides
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          Display name, Home metrics, info cards, and which commands show on this panel.
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                              Home Metrics
                            </div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                              {homeMetricsSave?.status === 'saving'
                                ? 'Saving…'
                                : (homeMetricsSave?.status === 'saved'
                                  ? 'Saved'
                                  : (homeMetricsSave?.status === 'error'
                                    ? 'Error'
                                    : (isInheritHomeMetrics ? 'Inherit' : 'Custom')))}
                            </div>
                          </div>

                          {availableHomeMetrics.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {UI_HOME_METRICS.filter((k) => availableHomeMetrics.includes(k)).map((k) => {
                                const checked = isInheritHomeMetrics ? true : explicitHomeMetrics.includes(k);
                                const label = k === 'temperature' ? 'Temp'
                                  : k === 'humidity' ? 'Humidity'
                                  : k === 'illuminance' ? 'Lux'
                                  : k === 'motion' ? 'Motion'
                                  : k === 'contact' ? 'Contact'
                                  : 'Door';
                                return (
                                  <label key={k} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!connected || busy}
                                      onChange={(e) => toggleHomeMetric(d, k, Boolean(e.target.checked))}
                                    />
                                    <span className="text-xs font-semibold text-white/80">{label}</span>
                                  </label>
                                );
                              })}

                              <button
                                type="button"
                                disabled={!connected || busy || isInheritHomeMetrics}
                                onClick={async () => {
                                  setDeviceOverrideDrafts((prev) => ({
                                    ...prev,
                                    [d.id]: { ...(prev[d.id] || {}), homeMetrics: null },
                                  }));
                                  if (!connected) return;
                                  setDeviceOverrideSaveState((prev) => ({
                                    ...prev,
                                    [d.id]: { ...(prev[d.id] || {}), homeMetrics: { status: 'saving', error: null } },
                                  }));
                                  try {
                                    await saveDeviceOverrides({
                                      deviceId: String(d.id),
                                      homeMetrics: null,
                                      ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
                                    });
                                    setDeviceOverrideSaveState((prev) => ({
                                      ...prev,
                                      [d.id]: { ...(prev[d.id] || {}), homeMetrics: { status: 'saved', error: null } },
                                    }));
                                  } catch (e) {
                                    setDeviceOverrideSaveState((prev) => ({
                                      ...prev,
                                      [d.id]: { ...(prev[d.id] || {}), homeMetrics: { status: 'error', error: e?.message || String(e) } },
                                    }));
                                  }
                                }}
                                className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy || isInheritHomeMetrics) ? 'opacity-50' : 'hover:bg-white/5'}`}
                              >
                                Reset
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-white/45">No supported Home metrics found for this device.</div>
                          )}

                          {homeMetricsSave?.status === 'error' ? (
                            <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {homeMetricsSave.error}</div>
                          ) : null}
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                              Info Cards
                            </div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                              {infoMetricsSave?.status === 'saving'
                                ? 'Saving…'
                                : (infoMetricsSave?.status === 'saved'
                                  ? 'Saved'
                                  : (infoMetricsSave?.status === 'error'
                                    ? 'Error'
                                    : (isInheritInfoMetrics
                                      ? 'Default'
                                      : (explicitInfoMetrics.length ? 'Selected' : 'None'))))}
                            </div>
                          </div>

                          {availableInfoMetrics.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {availableInfoMetrics.map((k) => {
                                const checked = isInheritInfoMetrics ? false : explicitInfoMetrics.includes(k);
                                return (
                                  <label key={k} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!connected || busy}
                                      onChange={(e) => toggleInfoMetric(d, k, Boolean(e.target.checked))}
                                    />
                                    <span className="text-xs font-semibold text-white/80">{formatInfoMetricLabel(k)}</span>
                                  </label>
                                );
                              })}

                              <button
                                type="button"
                                disabled={!connected || busy || isInheritInfoMetrics}
                                onClick={async () => {
                                  setDeviceOverrideDrafts((prev) => ({
                                    ...prev,
                                    [d.id]: { ...(prev[d.id] || {}), infoMetrics: null },
                                  }));
                                  if (!connected) return;
                                  setDeviceOverrideSaveState((prev) => ({
                                    ...prev,
                                    [d.id]: { ...(prev[d.id] || {}), infoMetrics: { status: 'saving', error: null } },
                                  }));
                                  try {
                                    await saveDeviceOverrides({
                                      deviceId: String(d.id),
                                      infoMetrics: null,
                                      ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
                                    });
                                    setDeviceOverrideSaveState((prev) => ({
                                      ...prev,
                                      [d.id]: { ...(prev[d.id] || {}), infoMetrics: { status: 'saved', error: null } },
                                    }));
                                  } catch (e) {
                                    setDeviceOverrideSaveState((prev) => ({
                                      ...prev,
                                      [d.id]: { ...(prev[d.id] || {}), infoMetrics: { status: 'error', error: e?.message || String(e) } },
                                    }));
                                  }
                                }}
                                className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy || isInheritInfoMetrics) ? 'opacity-50' : 'hover:bg-white/5'}`}
                              >
                                Reset
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-white/45">No attributes available for info cards.</div>
                          )}

                          {infoMetricsSave?.status === 'error' ? (
                            <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {infoMetricsSave.error}</div>
                          ) : null}
                        </div>

                        <label className="mt-3 block">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                            <span>Display Name</span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                              {labelSave?.status === 'saving'
                                ? 'Saving…'
                                : (labelSave?.status === 'saved'
                                  ? 'Saved'
                                  : (labelSave?.status === 'error' ? 'Error' : ''))}
                            </span>
                          </div>
                          <input
                            value={displayNameDraft}
                            onChange={(e) => {
                              const next = String(e.target.value);
                              setDeviceOverrideDrafts((prev) => ({
                                ...prev,
                                [d.id]: { ...(prev[d.id] || {}), label: next },
                              }));
                              queueDeviceLabelAutosave(d.id, next);
                            }}
                            placeholder="(inherit)"
                            className={`mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/35 ${scheme.focusRing}`}
                            disabled={!connected || busy}
                          />
                          {labelSave?.status === 'error' ? (
                            <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {labelSave.error}</div>
                          ) : null}
                        </label>

                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                              Commands
                            </div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                              {cmdSave?.status === 'saving'
                                ? 'Saving…'
                                : (cmdSave?.status === 'saved'
                                  ? 'Saved'
                                  : (cmdSave?.status === 'error'
                                    ? 'Error'
                                    : (isInheritCommands ? 'All' : (explicitCommands.length ? 'Selected' : 'None'))))}
                            </div>
                          </div>

                          {availableAllowedCommands.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {availableAllowedCommands.map((cmd) => {
                                const checked = isInheritCommands ? true : explicitCommands.includes(cmd);
                                const label = cmd === 'setLevel' ? 'Level' : cmd;
                                return (
                                  <label key={cmd} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!connected || busy}
                                      onChange={(e) => toggleDeviceCommand(d, cmd, Boolean(e.target.checked))}
                                    />
                                    <span className="text-xs font-semibold text-white/80">{label}</span>
                                  </label>
                                );
                              })}

                              <button
                                type="button"
                                disabled={!connected || busy || isInheritCommands}
                                onClick={async () => {
                                  setDeviceOverrideDrafts((prev) => ({
                                    ...prev,
                                    [d.id]: { ...(prev[d.id] || {}), commands: null },
                                  }));
                                  if (!connected) return;
                                  setDeviceOverrideSaveState((prev) => ({
                                    ...prev,
                                    [d.id]: { ...(prev[d.id] || {}), commands: { status: 'saving', error: null } },
                                  }));
                                  try {
                                    await saveDeviceOverrides({
                                      deviceId: String(d.id),
                                      commands: null,
                                      ...(selectedPanelName ? { panelName: selectedPanelName } : {}),
                                    });
                                    setDeviceOverrideSaveState((prev) => ({
                                      ...prev,
                                      [d.id]: { ...(prev[d.id] || {}), commands: { status: 'saved', error: null } },
                                    }));
                                  } catch (e) {
                                    setDeviceOverrideSaveState((prev) => ({
                                      ...prev,
                                      [d.id]: { ...(prev[d.id] || {}), commands: { status: 'error', error: e?.message || String(e) } },
                                    }));
                                  }
                                }}
                                className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy || isInheritCommands) ? 'opacity-50' : 'hover:bg-white/5'}`}
                              >
                                Reset
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-white/45">No supported commands found for this device.</div>
                          )}

                          {cmdSave?.status === 'error' ? (
                            <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {cmdSave.error}</div>
                          ) : null}
                        </div>
                      </div>
                  </div>
                );
              })()}
            </div>

            {!connected ? (
              <div className="mt-3 text-xs text-white/45">Server offline: editing disabled.</div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'display' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Global Options
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Global Options
            </div>
            <div className="mt-1 text-xs text-white/45">
              Tune size/spacing for this device. Panel profiles can override these.
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Global Device Availability
              </div>
              <div className="mt-1 text-xs text-white/45">
                Server-enforced allowlists. If a device is not allowed here, controls will be blocked everywhere.
              </div>

              {globalAvailabilityLocked ? (
                <div className="mt-3 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                  {mainAllowlistLocked && ctrlAllowlistLocked
                    ? 'Availability is locked by environment variables. Contact your administrator to make changes.'
                    : mainAllowlistLocked
                    ? 'Home allowlist is locked by environment variables. Availability edits would need to update Home too, so editing is disabled.'
                    : 'Controls allowlist is locked by environment variables. Availability edits would need to update Controls too, so editing is disabled.'}
                </div>
              ) : null}

              <div className="mt-3 text-xs text-white/45">
                {statusText(allowlistSave.status)}
                {availabilityDevices.length ? (
                  <>
                    {' · '}
                    {availabilityDevices.reduce((acc, d) => {
                      const id = String(d?.id || '').trim();
                      if (!id) return acc;
                      return effectiveGlobalAllowedDeviceIds.has(id) ? (acc + 1) : acc;
                    }, 0)} available
                  </>
                ) : null}
              </div>

              {!availabilityDevices.length ? (
                <div className="mt-3 text-sm text-white/45">No devices discovered.</div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {availabilityDevices.map((d) => {
                    const isAvailable = effectiveGlobalAllowedDeviceIds.has(String(d.id));
                    const src = String(d?.source || '').trim();
                    const display = src ? `${d.label} (${src})` : d.label;

                    return (
                      <div key={d.id} className={`flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 ${!connected ? 'opacity-50' : ''}`}>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white/85 truncate">{display}</div>
                          <div className="mt-1 text-[11px] text-white/45 truncate">ID: {d.id}</div>
                        </div>

                        <div className="shrink-0 flex items-center gap-3">
                          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                            <input
                              type="checkbox"
                              className={`h-5 w-5 ${scheme.checkboxAccent}`}
                              disabled={!connected || allowlistSave.status === 'saving' || globalAvailabilityLocked}
                              checked={isAvailable}
                              onChange={(e) => setGlobalAvailable(d.id, e.target.checked)}
                            />
                            Available
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Activity Alert Sounds
              </div>
              <div className="mt-1 text-xs text-white/45">
                Pick which server-hosted sound file plays for each Activity event.
              </div>

              {soundFilesError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Sounds unavailable: {soundFilesError}</div>
              ) : null}

              {alertSoundsSave.error ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {alertSoundsSave.error}</div>
              ) : null}

              <div className="mt-2 text-xs text-white/45">
                {statusText(alertSoundsSave.status)}
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { key: 'motion', label: 'Motion' },
                  { key: 'doorOpen', label: 'Door Open' },
                  { key: 'doorClose', label: 'Door Close' },
                ].map(({ key, label }) => (
                  <label key={key} className="block">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">{label}</div>
                    <select
                      value={alertSounds[key] || ''}
                      disabled={!connected || busy || alertSoundsSave.status === 'saving'}
                      onChange={async (e) => {
                        const value = String(e.target.value || '');
                        const next = {
                          ...alertSounds,
                          [key]: value,
                        };

                        alertSoundsSave.setError(null);
                        try {
                          await alertSoundsSave.run({
                            motion: next.motion || null,
                            doorOpen: next.doorOpen || null,
                            doorClose: next.doorClose || null,
                          });
                        } catch {
                          // handled by controller
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    >
                      <option value="">Built-in</option>
                      {soundFiles.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {!connected ? (
                <div className="mt-3 text-xs text-white/45">Server offline: editing disabled.</div>
              ) : null}
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Weather (Open-Meteo)
              </div>
              <div className="mt-1 text-xs text-white/45">
                Set the location used for the weather card. Accepts decimal or DMS (e.g. 35°29'44.9"N).
              </div>

              {(openMeteoEnvOverrides.lat || openMeteoEnvOverrides.lon || openMeteoEnvOverrides.timezone) ? (
                <div className="mt-2 text-xs text-warning">
                  Note: OPEN_METEO_* environment variables are set and will override these fields.
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Latitude</div>
                  <input
                    type="text"
                    value={openMeteoDraft.lat}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      setOpenMeteoDirty(true);
                      setOpenMeteoDraft((prev) => ({ ...prev, lat: String(e.target.value) }));
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    placeholder={'35.4958 or 35°29\'44.9"N'}
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Longitude</div>
                  <input
                    type="text"
                    value={openMeteoDraft.lon}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      setOpenMeteoDirty(true);
                      setOpenMeteoDraft((prev) => ({ ...prev, lon: String(e.target.value) }));
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    placeholder={'-86.0816 or 86°04\'53.8"W'}
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Timezone</div>
                  <input
                    type="text"
                    value={openMeteoDraft.timezone}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      setOpenMeteoDirty(true);
                      setOpenMeteoDraft((prev) => ({ ...prev, timezone: String(e.target.value) }));
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    placeholder="auto or America/Chicago"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${openMeteoDraft.lat || ''},${openMeteoDraft.lon || ''}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline text-white/70 hover:text-white"
                >
                  Open Google Maps to pick coordinates
                </a>

                <div className="text-xs text-white/45">
                  {openMeteoDirty ? 'Pending changes…' : 'Saved'}
                  {openMeteoSave.status !== 'idle' ? (
                    <span className="ml-2">({statusText(openMeteoSave.status)})</span>
                  ) : null}
                </div>
              </div>

              {openMeteoError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">{openMeteoError}</div>
              ) : null}
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Display Settings
              </div>
              <div className="mt-1 text-xs text-white/45">
                Applies when a panel profile does not specify a value.
              </div>

              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Card transparency
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline card/panel background opacity scale. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={1}
                        value={globalCardOpacityScaleDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                          setGlobalCardOpacityScaleError(null);
                          setGlobalCardOpacityScaleDirty(true);
                          setGlobalCardOpacityScaleDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={globalCardOpacityScaleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                      setGlobalCardOpacityScaleError(null);
                      setGlobalCardOpacityScaleDirty(true);
                      setGlobalCardOpacityScaleDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalCardOpacityScaleDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalCardOpacitySave.status)}
                    </div>
                  </div>

                  {globalCardOpacityScaleError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalCardOpacityScaleError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Blur
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline background blur on cards/panels. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={1}
                        value={globalBlurScaleDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                          setGlobalBlurScaleError(null);
                          setGlobalBlurScaleDirty(true);
                          setGlobalBlurScaleDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={globalBlurScaleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                      setGlobalBlurScaleError(null);
                      setGlobalBlurScaleDirty(true);
                      setGlobalBlurScaleDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalBlurScaleDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalBlurScaleSave.status)}
                    </div>
                  </div>

                  {globalBlurScaleError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalBlurScaleError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Primary text opacity
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline transparency for primary text. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={globalPrimaryTextOpacityDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                          setGlobalPrimaryTextOpacityError(null);
                          setGlobalPrimaryTextOpacityDirty(true);
                          setGlobalPrimaryTextOpacityDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={globalPrimaryTextOpacityDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                      setGlobalPrimaryTextOpacityError(null);
                      setGlobalPrimaryTextOpacityDirty(true);
                      setGlobalPrimaryTextOpacityDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalPrimaryTextOpacityDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalPrimaryTextOpacitySave.status)}
                    </div>
                  </div>

                  {globalPrimaryTextOpacityError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalPrimaryTextOpacityError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Secondary text opacity
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline transparency for secondary text. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={globalSecondaryTextOpacityDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 45;
                          setGlobalSecondaryTextOpacityError(null);
                          setGlobalSecondaryTextOpacityDirty(true);
                          setGlobalSecondaryTextOpacityDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={globalSecondaryTextOpacityDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 45;
                      setGlobalSecondaryTextOpacityError(null);
                      setGlobalSecondaryTextOpacityDirty(true);
                      setGlobalSecondaryTextOpacityDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalSecondaryTextOpacityDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalSecondaryTextOpacitySave.status)}
                    </div>
                  </div>

                  {globalSecondaryTextOpacityError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalSecondaryTextOpacityError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Primary text size
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline scale for primary text. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={200}
                        step={1}
                        value={globalPrimaryTextSizeDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                          setGlobalPrimaryTextSizeError(null);
                          setGlobalPrimaryTextSizeDirty(true);
                          setGlobalPrimaryTextSizeDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={globalPrimaryTextSizeDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                      setGlobalPrimaryTextSizeError(null);
                      setGlobalPrimaryTextSizeDirty(true);
                      setGlobalPrimaryTextSizeDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalPrimaryTextSizeDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalPrimaryTextSizeSave.status)}
                    </div>
                  </div>

                  {globalPrimaryTextSizeError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalPrimaryTextSizeError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Secondary text size
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline scale for secondary text. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={200}
                        step={1}
                        value={globalSecondaryTextSizeDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                          setGlobalSecondaryTextSizeError(null);
                          setGlobalSecondaryTextSizeDirty(true);
                          setGlobalSecondaryTextSizeDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={globalSecondaryTextSizeDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                      setGlobalSecondaryTextSizeError(null);
                      setGlobalSecondaryTextSizeDirty(true);
                      setGlobalSecondaryTextSizeDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalSecondaryTextSizeDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalSecondaryTextSizeSave.status)}
                    </div>
                  </div>

                  {globalSecondaryTextSizeError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalSecondaryTextSizeError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Tertiary text opacity (Info Cards)
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline transparency for info card values. 70% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={globalTertiaryTextOpacityDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 70;
                          setGlobalTertiaryTextOpacityError(null);
                          setGlobalTertiaryTextOpacityDirty(true);
                          setGlobalTertiaryTextOpacityDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={globalTertiaryTextOpacityDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 70;
                      setGlobalTertiaryTextOpacityError(null);
                      setGlobalTertiaryTextOpacityDirty(true);
                      setGlobalTertiaryTextOpacityDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalTertiaryTextOpacityDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalTertiaryTextOpacitySave.status)}
                    </div>
                  </div>

                  {globalTertiaryTextOpacityError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalTertiaryTextOpacityError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Tertiary text size (Info Cards)
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline scale for info card values. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={200}
                        step={1}
                        value={globalTertiaryTextSizeDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                          setGlobalTertiaryTextSizeError(null);
                          setGlobalTertiaryTextSizeDirty(true);
                          setGlobalTertiaryTextSizeDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={globalTertiaryTextSizeDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                      setGlobalTertiaryTextSizeError(null);
                      setGlobalTertiaryTextSizeDirty(true);
                      setGlobalTertiaryTextSizeDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalTertiaryTextSizeDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalTertiaryTextSizeSave.status)}
                    </div>
                  </div>

                  {globalTertiaryTextSizeError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalTertiaryTextSizeError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Icon size
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline scale for metric icons. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={200}
                        step={1}
                        value={globalIconSizeDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                          setGlobalIconSizeError(null);
                          setGlobalIconSizeDirty(true);
                          setGlobalIconSizeDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={globalIconSizeDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                      setGlobalIconSizeError(null);
                      setGlobalIconSizeDirty(true);
                      setGlobalIconSizeDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalIconSizeDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalIconSizeSave.status)}
                    </div>
                  </div>

                  {globalIconSizeError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalIconSizeError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Card spacing
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline Home card padding/spacing. 100% = default.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={200}
                        step={1}
                        value={globalCardScaleDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                          setGlobalCardScaleError(null);
                          setGlobalCardScaleDirty(true);
                          setGlobalCardScaleDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">%</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={globalCardScaleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                      setGlobalCardScaleError(null);
                      setGlobalCardScaleDirty(true);
                      setGlobalCardScaleDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalCardScaleDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalCardScaleSave.status)}
                    </div>
                  </div>

                  {globalCardScaleError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalCardScaleError}</div>
                  ) : null}
                </div>

                <div className="utility-group p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                        Home columns (wide screens)
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        Baseline room cards per row on XL screens.
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={6}
                        step={1}
                        value={globalHomeRoomColumnsXlDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 3;
                          setGlobalHomeRoomColumnsXlError(null);
                          setGlobalHomeRoomColumnsXlDirty(true);
                          setGlobalHomeRoomColumnsXlDraft(next);
                        }}
                        className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                      <div className="text-xs text-white/45">cols</div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={6}
                    step={1}
                    value={globalHomeRoomColumnsXlDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 3;
                      setGlobalHomeRoomColumnsXlError(null);
                      setGlobalHomeRoomColumnsXlDirty(true);
                      setGlobalHomeRoomColumnsXlDraft(next);
                    }}
                    className="mt-3 w-full"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {globalHomeRoomColumnsXlDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="text-xs text-white/45">
                      {statusText(globalHomeRoomColsSave.status)}
                    </div>
                  </div>

                  {globalHomeRoomColumnsXlError ? (
                    <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalHomeRoomColumnsXlError}</div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                Global
              </div>
              <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Rooms & Labels
              </div>
              <div className="mt-1 text-xs text-white/45">
                These apply to all profiles and affect both Home and Climate views.
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Manual Rooms</div>
              <div className="mt-1 text-xs text-white/45">
                Add/remove rooms that aren't discovered from Hubitat. Rooms can be placed/resized on the Climate page.
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="New room name"
                  className={`flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/35 ${scheme.focusRing}`}
                  disabled={!connected || busy}
                />
                <button
                  type="button"
                  disabled={!connected || busy || !newRoomName.trim()}
                  onClick={async () => {
                    setError(null);
                    setBusy(true);
                    try {
                      await addManualRoom(newRoomName.trim());
                      setNewRoomName('');
                    } catch (e) {
                      setError(e?.message || String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy || !newRoomName.trim()) ? 'opacity-50' : 'hover:bg-white/5'}`}
                >
                  Add
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {manualRooms.length ? (
                  manualRooms.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/80 truncate">
                            {r.name}
                          </div>
                          <div className="mt-1 text-xs text-white/45 truncate">ID: {r.id}</div>
                        </div>

                        <button
                          type="button"
                          disabled={!connected || busy}
                          onClick={async () => {
                            setError(null);
                            setBusy(true);
                            try {
                              await deleteManualRoom(r.id);
                            } catch (e) {
                              setError(e?.message || String(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-white/70 border-white/10 bg-black/20 ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/10'}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-white/45">No manual rooms.</div>
                )}
              </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Visible Rooms (Global Default)</div>
              <div className="mt-1 text-xs text-white/45">
                Choose which rooms appear by default. Panels can still override this per profile. If none are selected, all rooms are shown.
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                {allRoomsForVisibility.map((r) => {
                  const checked = globalVisibleRoomIds.has(r.id);
                  return (
                    <label key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!connected || busy || globalVisibleRoomsSave.status === 'saving'}
                        onChange={(e) => toggleGlobalVisibleRoom(r.id, Boolean(e.target.checked))}
                      />
                      <div className="min-w-0">
                        <div className="text-sm text-white/80 truncate">{r.name}</div>
                        <div className="text-[11px] text-white/45 truncate">{r.id}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {globalVisibleRoomIds.size ? `${globalVisibleRoomIds.size} selected` : 'All rooms'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(globalVisibleRoomsSave.status)}
                </div>
              </div>

              {globalVisibleRoomsSave.error ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {globalVisibleRoomsSave.error}</div>
              ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Freeform Text Labels</div>
              <div className="mt-1 text-xs text-white/45">
                Add labels here, then position/resize them on the Climate page in Edit mode.
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  disabled={!connected || busy}
                  onClick={async () => {
                    setError(null);
                    setBusy(true);
                    try {
                      await addLabel('Label');
                    } catch (e) {
                      setError(e?.message || String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/5'}`}
                >
                  Add Label
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                {labels.length ? (
                  labels.map((l) => (
                    <div key={l.id} className="utility-group p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/45 font-semibold">
                        {l.id}
                      </div>
                      <textarea
                        value={labelDrafts[l.id] ?? l.text}
                        onChange={(e) => {
                          const next = e.target.value;
                          setLabelDrafts((prev) => ({ ...prev, [l.id]: next }));
                          queueLabelAutosave(l.id, next);
                        }}
                        rows={2}
                        className={`mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 placeholder:text-white/35 ${scheme.focusRing}`}
                        disabled={!connected || busy}
                        placeholder="Label text"
                      />

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-xs text-white/45">
                          {statusText(labelSaveState[l.id]?.status) || 'Idle'}
                        </div>
                        {labelSaveState[l.id]?.error ? (
                          <div className="text-xs text-neon-red break-words">{labelSaveState[l.id]?.error}</div>
                        ) : null}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={!connected || busy}
                          onClick={async () => {
                            setError(null);
                            setBusy(true);
                            try {
                              await deleteLabel(l.id);
                            } catch (e) {
                              setError(e?.message || String(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors text-white/70 border-white/10 bg-black/20 ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/10'}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-white/45">No labels yet.</div>
                )}
              </div>
              </div>
            </div>

            {!connected ? (
              <div className="mt-3 text-xs text-white/45">Server offline: editing disabled.</div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'appearance' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Panel Options
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Home & UI
            </div>
            <div className="mt-1 text-xs text-white/45">
              Adjust the Home look & feel.
            </div>

            {isPresetSelected ? (
              <div
                className="mt-2 jvs-secondary-text text-white/60"
                style={{ fontSize: 'calc(12px * var(--jvs-secondary-text-size-scale, 1))' }}
              >
                Presets are read-only. Create a new panel profile (above) to customize these settings.
              </div>
            ) : null}

            <div
              className={`mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 ${isPresetSelected ? 'opacity-50 pointer-events-none' : ''}`}
              aria-disabled={isPresetSelected ? 'true' : 'false'}
            >
              <div className="utility-group p-4 lg:col-span-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  UI accent
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Sets the accent used across the app.
                </div>

                {accentColorSave.error ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {accentColorSave.error}</div>
                ) : null}

                <div className="mt-2 text-xs text-white/45">
                  {statusText(accentColorSave.status)}
                </div>

                <div className="mt-4">
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                      {TOLERANCE_COLOR_CHOICES.filter((c) => c.id !== 'none').map((choice) => {
                        const isSelected = choice.id === accentColorId;
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            disabled={!connected || busy || accentColorSave.status === 'saving'}
                            onClick={async () => {
                              try {
                                await accentColorSave.run(choice.id);
                              } catch {
                                // handled by controller
                              }
                            }}
                            className={`rounded-xl border px-3 py-3 text-left transition-colors ${isSelected ? 'border-white/30 bg-white/10' : 'border-white/10 bg-black/20 hover:bg-white/5'} ${(!connected || busy || accentColorSave.status === 'saving') ? 'opacity-50' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`h-3.5 w-3.5 rounded-full ${choice.swatch}`} />
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 truncate">
                                  {choice.label}
                                </div>
                                {isSelected ? (
                                  <div className="mt-1 text-[10px] text-white/40">Selected</div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                </div>
              </div>

              <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Card transparency
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Adjusts card/panel backgrounds only (not the values). 100% = default.
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={200}
                    step={1}
                    value={cardOpacityScaleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                      setCardOpacityScaleError(null);
                      setCardOpacityScaleDirty(true);
                      setCardOpacityScaleDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">%</div>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={200}
                step={1}
                value={cardOpacityScaleDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                  setCardOpacityScaleError(null);
                  setCardOpacityScaleDirty(true);
                  setCardOpacityScaleDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {cardOpacityScaleDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(cardOpacitySave.status)}
                </div>
              </div>

              {cardOpacityScaleError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {cardOpacityScaleError}</div>
              ) : null}
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Blur
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Adjusts background blur on cards/panels. 100% = default.
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={200}
                    step={1}
                    value={blurScaleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                      setBlurScaleError(null);
                      setBlurScaleDirty(true);
                      setBlurScaleDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">%</div>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={200}
                step={1}
                value={blurScaleDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : 100;
                  setBlurScaleError(null);
                  setBlurScaleDirty(true);
                  setBlurScaleDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {blurScaleDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(blurScaleSave.status)}
                </div>
              </div>

              {blurScaleError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {blurScaleError}</div>
              ) : null}
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Primary text
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Transparency for the main text on Home (room titles/values).
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={primaryTextOpacityDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                      setPrimaryTextOpacityError(null);
                      setPrimaryTextOpacityDirty(true);
                      setPrimaryTextOpacityDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">%</div>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={primaryTextOpacityDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                  setPrimaryTextOpacityError(null);
                  setPrimaryTextOpacityDirty(true);
                  setPrimaryTextOpacityDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {primaryTextOpacityDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(primaryTextOpacitySave.status)}
                </div>
              </div>

              {primaryTextOpacityError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {primaryTextOpacityError}</div>
              ) : null}

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                      Size
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      100% = default.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={200}
                      step={1}
                      value={primaryTextSizeDraft}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                        setPrimaryTextSizeError(null);
                        setPrimaryTextSizeDirty(true);
                        setPrimaryTextSizeDraft(next);
                      }}
                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    />
                    <div className="text-xs text-white/45">%</div>
                  </div>
                </div>

                <input
                  type="range"
                  min={50}
                  max={200}
                  step={1}
                  value={primaryTextSizeDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                    setPrimaryTextSizeError(null);
                    setPrimaryTextSizeDirty(true);
                    setPrimaryTextSizeDraft(next);
                  }}
                  className="mt-3 w-full"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {primaryTextSizeDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(primaryTextSizeSave.status)}
                  </div>
                </div>

                {primaryTextSizeError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {primaryTextSizeError}</div>
                ) : null}
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                      Color
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Choose a color for Home primary text.
                    </div>
                  </div>

                  <select
                    value={primaryTextColorDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const v = String(e.target.value || '').trim();
                      setPrimaryTextColorError(null);
                      setPrimaryTextColorDirty(true);
                      setPrimaryTextColorDraft(v);
                    }}
                    className="w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  >
                    <option value="">Default</option>
                    {TOLERANCE_COLOR_CHOICES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {primaryTextColorDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(primaryTextColorSave.status)}
                  </div>
                </div>

                {primaryTextColorError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {primaryTextColorError}</div>
                ) : null}
              </div>
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Secondary text
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Transparency for the small gray text on Home (labels/subtitles).
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={secondaryTextOpacityDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 45;
                      setSecondaryTextOpacityError(null);
                      setSecondaryTextOpacityDirty(true);
                      setSecondaryTextOpacityDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">%</div>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={secondaryTextOpacityDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 45;
                  setSecondaryTextOpacityError(null);
                  setSecondaryTextOpacityDirty(true);
                  setSecondaryTextOpacityDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {secondaryTextOpacityDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(secondaryTextOpacitySave.status)}
                </div>
              </div>

              {secondaryTextOpacityError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {secondaryTextOpacityError}</div>
              ) : null}

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                      Size
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      100% = default.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={200}
                      step={1}
                      value={secondaryTextSizeDraft}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                        setSecondaryTextSizeError(null);
                        setSecondaryTextSizeDirty(true);
                        setSecondaryTextSizeDraft(next);
                      }}
                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    />
                    <div className="text-xs text-white/45">%</div>
                  </div>
                </div>

                <input
                  type="range"
                  min={50}
                  max={200}
                  step={1}
                  value={secondaryTextSizeDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                    setSecondaryTextSizeError(null);
                    setSecondaryTextSizeDirty(true);
                    setSecondaryTextSizeDraft(next);
                  }}
                  className="mt-3 w-full"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {secondaryTextSizeDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(secondaryTextSizeSave.status)}
                  </div>
                </div>

                {secondaryTextSizeError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {secondaryTextSizeError}</div>
                ) : null}
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                      Color
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Choose a color for Home secondary text.
                    </div>
                  </div>

                  <select
                    value={secondaryTextColorDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const v = String(e.target.value || '').trim();
                      setSecondaryTextColorError(null);
                      setSecondaryTextColorDirty(true);
                      setSecondaryTextColorDraft(v);
                    }}
                    className="w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  >
                    <option value="">Default</option>
                    {TOLERANCE_COLOR_CHOICES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {secondaryTextColorDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(secondaryTextColorSave.status)}
                  </div>
                </div>

                {secondaryTextColorError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {secondaryTextColorError}</div>
                ) : null}
              </div>
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Tertiary text (Info Cards)
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Transparency for info card values.
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={tertiaryTextOpacityDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 70;
                      setTertiaryTextOpacityError(null);
                      setTertiaryTextOpacityDirty(true);
                      setTertiaryTextOpacityDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">%</div>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={tertiaryTextOpacityDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 70;
                  setTertiaryTextOpacityError(null);
                  setTertiaryTextOpacityDirty(true);
                  setTertiaryTextOpacityDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {tertiaryTextOpacityDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(tertiaryTextOpacitySave.status)}
                </div>
              </div>

              {tertiaryTextOpacityError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {tertiaryTextOpacityError}</div>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Tertiary text size
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Baseline scale for info card values. 100% = default.
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={50}
                    max={200}
                    step={1}
                    value={tertiaryTextSizeDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                      setTertiaryTextSizeError(null);
                      setTertiaryTextSizeDirty(true);
                      setTertiaryTextSizeDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">%</div>
                </div>
              </div>

              <input
                type="range"
                min={50}
                max={200}
                step={1}
                value={tertiaryTextSizeDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                  setTertiaryTextSizeError(null);
                  setTertiaryTextSizeDirty(true);
                  setTertiaryTextSizeDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {tertiaryTextSizeDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(tertiaryTextSizeSave.status)}
                </div>
              </div>

              {tertiaryTextSizeError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {tertiaryTextSizeError}</div>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Tertiary text color
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Choose a color for info card values.
                  </div>
                </div>

                <select
                  value={tertiaryTextColorDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const v = String(e.target.value || '').trim();
                    setTertiaryTextColorError(null);
                    setTertiaryTextColorDirty(true);
                    setTertiaryTextColorDraft(v);
                  }}
                  className="w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                >
                  <option value="">Default</option>
                  {TOLERANCE_COLOR_CHOICES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {tertiaryTextColorDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(tertiaryTextColorSave.status)}
                </div>
              </div>

              {tertiaryTextColorError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {tertiaryTextColorError}</div>
              ) : null}
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Glow
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Optional override for the animated accent glow.
                  </div>
                </div>

                <select
                  value={glowColorDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const v = String(e.target.value || '').trim();
                    setGlowColorError(null);
                    setGlowColorDirty(true);
                    setGlowColorDraft(v);
                  }}
                  className="w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                >
                  <option value="">Inherit (UI accent)</option>
                  {TOLERANCE_COLOR_CHOICES.filter((c) => c.id !== 'none').map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {glowColorDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(glowColorSave.status)}
                </div>
              </div>

              {glowColorError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {glowColorError}</div>
              ) : null}
            </div>

            <div className="utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Icons
              </div>
              <div className="mt-1 text-xs text-white/45">
                Optional override for metric icons on Home.
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                  Color
                </div>
                <select
                  value={iconColorDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const v = String(e.target.value || '').trim();
                    setIconColorError(null);
                    setIconColorDirty(true);
                    setIconColorDraft(v);
                  }}
                  className="w-[220px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                >
                  <option value="">Default (scheme)</option>
                  {TOLERANCE_COLOR_CHOICES.filter((c) => c.id !== 'none').map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      Opacity
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      100% = default.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={iconOpacityDraft}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                        setIconOpacityError(null);
                        setIconOpacityDirty(true);
                        setIconOpacityDraft(next);
                      }}
                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    />
                    <div className="text-xs text-white/45">%</div>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={iconOpacityDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                    setIconOpacityError(null);
                    setIconOpacityDirty(true);
                    setIconOpacityDraft(next);
                  }}
                  className="mt-3 w-full"
                />
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      Size
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      100% = default.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={200}
                      step={1}
                      value={iconSizeDraft}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                        setIconSizeError(null);
                        setIconSizeDirty(true);
                        setIconSizeDraft(next);
                      }}
                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    />
                    <div className="text-xs text-white/45">%</div>
                  </div>
                </div>

                <input
                  type="range"
                  min={50}
                  max={200}
                  step={1}
                  value={iconSizeDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                    setIconSizeError(null);
                    setIconSizeDirty(true);
                    setIconSizeDraft(next);
                  }}
                  className="mt-3 w-full"
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {(iconColorDirty || iconOpacityDirty || iconSizeDirty) ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {[
                    statusText(iconColorSave.status),
                    statusText(iconOpacitySave.status),
                    statusText(iconSizeSave.status),
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>

              {iconColorError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {iconColorError}</div>
              ) : null}
              {iconOpacityError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {iconOpacityError}</div>
              ) : null}
              {iconSizeError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {iconSizeError}</div>
              ) : null}
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Card spacing
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Scales Home card padding/spacing. 100% = default.
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={50}
                    max={200}
                    step={1}
                    value={cardScaleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                      setCardScaleError(null);
                      setCardScaleDirty(true);
                      setCardScaleDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">%</div>
                </div>
              </div>

              <input
                type="range"
                min={50}
                max={200}
                step={1}
                value={cardScaleDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(50, Math.min(200, Math.round(n))) : 100;
                  setCardScaleError(null);
                  setCardScaleDirty(true);
                  setCardScaleDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {cardScaleDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(cardScaleSave.status)}
                </div>
              </div>

              {cardScaleError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {cardScaleError}</div>
              ) : null}
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Home top row
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Show or scale the first row on Home. Applies per panel profile.
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={homeTopRowDraft.enabled === true}
                    disabled={!connected}
                    onChange={(e) => {
                      setHomeTopRowError(null);
                      setHomeTopRowDirty(true);
                      setHomeTopRowDraft((prev) => ({ ...prev, enabled: e.target.checked }));
                    }}
                    className="h-4 w-4 rounded border-white/30 bg-black/50"
                  />
                  <span>Show</span>
                </label>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      Scale
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Shrink the row (50–120%). Lower values reduce the height.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={120}
                      step={1}
                      value={homeTopRowDraft.scalePct}
                      disabled={!connected}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(50, Math.min(120, Math.round(n))) : 100;
                        setHomeTopRowError(null);
                        setHomeTopRowDirty(true);
                        setHomeTopRowDraft((prev) => ({ ...prev, scalePct: next }));
                      }}
                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    />
                    <div className="text-xs text-white/45">%</div>
                  </div>
                </div>

                <input
                  type="range"
                  min={50}
                  max={120}
                  step={1}
                  value={homeTopRowDraft.scalePct}
                  disabled={!connected}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? Math.max(50, Math.min(120, Math.round(n))) : 100;
                    setHomeTopRowError(null);
                    setHomeTopRowDirty(true);
                    setHomeTopRowDraft((prev) => ({ ...prev, scalePct: next }));
                  }}
                  className="mt-3 w-full"
                />
              </div>

              <div className="mt-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                  Cards
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  {HOME_TOP_ROW_CARD_IDS.map((id) => {
                    const labelMap = {
                      time: 'Time & date',
                      outside: 'Outside',
                      inside: 'Inside',
                      home: 'Home status',
                    };
                    const checked = Array.isArray(homeTopRowDraft.cards)
                      ? homeTopRowDraft.cards.includes(id)
                      : false;
                    return (
                      <label key={id} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!connected}
                          onChange={(e) => {
                            setHomeTopRowError(null);
                            setHomeTopRowDirty(true);
                            setHomeTopRowDraft((prev) => {
                              const set = new Set(Array.isArray(prev.cards) ? prev.cards : []);
                              if (e.target.checked) set.add(id);
                              else set.delete(id);
                              return { ...prev, cards: Array.from(set) };
                            });
                          }}
                          className="h-4 w-4 rounded border-white/30 bg-black/50"
                        />
                        <span>{labelMap[id] || id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {homeTopRowDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(homeTopRowSave.status)}
                </div>
              </div>

              {homeTopRowError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {homeTopRowError}</div>
              ) : null}
            </div>

            <div className="utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Home columns (wide screens)
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Sets how many room cards per row on XL screens.
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={6}
                    step={1}
                    value={homeRoomColumnsXlDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const next = Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 3;
                      setHomeRoomColumnsXlError(null);
                      setHomeRoomColumnsXlDirty(true);
                      setHomeRoomColumnsXlDraft(next);
                    }}
                    className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  />
                  <div className="text-xs text-white/45">cols</div>
                </div>
              </div>

              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={homeRoomColumnsXlDraft}
                disabled={!connected || busy}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 3;
                  setHomeRoomColumnsXlError(null);
                  setHomeRoomColumnsXlDirty(true);
                  setHomeRoomColumnsXlDraft(next);
                }}
                className="mt-3 w-full"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {homeRoomColumnsXlDirty ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(homeRoomColsSave.status)}
                </div>
              </div>

              {homeRoomColumnsXlError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {homeRoomColumnsXlError}</div>
              ) : null}

              <div className="mt-6 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                      Room layout (granular)
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Auto-fit packs rooms by minimum width. Use per-room span/order to fill the screen how you want.
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">Layout mode</div>
                    <div className="shrink-0 flex items-center gap-2">
                      <select
                        value={homeRoomLayoutModeDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const raw = String(e.target.value || '').trim().toLowerCase();
                          const nextMode = raw === 'masonry' ? 'masonry' : 'grid';
                          setHomeRoomLayoutError(null);
                          setHomeRoomLayoutDirty(true);
                          setHomeRoomLayoutModeDraft(nextMode);
                        }}
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      >
                        <option value="grid">Grid (default)</option>
                        <option value="masonry">Masonry</option>
                      </select>
                    </div>
                  </div>

                  {homeRoomLayoutModeDraft === 'masonry' ? (
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-white/45">Masonry row height</div>
                        <div className="shrink-0 flex items-center gap-2">
                          <input
                            type="number"
                            min={4}
                            max={40}
                            step={1}
                            value={homeRoomMasonryRowHeightPxDraft}
                            disabled={!connected || busy}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              const next = Number.isFinite(n) ? Math.max(4, Math.min(40, Math.round(n))) : 10;
                              setHomeRoomLayoutError(null);
                              setHomeRoomLayoutDirty(true);
                              setHomeRoomMasonryRowHeightPxDraft(next);
                            }}
                            className="w-[110px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                          />
                          <div className="text-xs text-white/45">px</div>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={40}
                        step={1}
                        value={homeRoomMasonryRowHeightPxDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(4, Math.min(40, Math.round(n))) : 10;
                          setHomeRoomLayoutError(null);
                          setHomeRoomLayoutDirty(true);
                          setHomeRoomMasonryRowHeightPxDraft(next);
                        }}
                        className="mt-2 w-full"
                      />
                      <div className="mt-1 text-[11px] text-white/45">
                        Tip: use per-room row-span overrides below to force taller/shorter cards.
                      </div>
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={homeRoomMinWidthPxDraft > 0}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const enabled = e.target.checked === true;
                        setHomeRoomLayoutError(null);
                        setHomeRoomLayoutDirty(true);
                        setHomeRoomMinWidthPxDraft(enabled ? Math.max(240, homeRoomMinWidthPxDraft || 360) : 0);
                      }}
                      className="h-4 w-4 rounded border-white/30 bg-black/50"
                    />
                    <span>Enable auto-fit room grid</span>
                  </label>

                  {homeRoomMinWidthPxDraft > 0 ? (
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-white/45">Minimum room width</div>
                        <div className="shrink-0 flex items-center gap-2">
                          <input
                            type="number"
                            min={240}
                            max={1200}
                            step={10}
                            value={homeRoomMinWidthPxDraft}
                            disabled={!connected || busy}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              const next = Number.isFinite(n) ? Math.max(240, Math.min(1200, Math.round(n))) : 360;
                              setHomeRoomLayoutError(null);
                              setHomeRoomLayoutDirty(true);
                              setHomeRoomMinWidthPxDraft(next);
                            }}
                            className="w-[110px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                          />
                          <div className="text-xs text-white/45">px</div>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={240}
                        max={1200}
                        step={10}
                        value={homeRoomMinWidthPxDraft}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? Math.max(240, Math.min(1200, Math.round(n))) : 360;
                          setHomeRoomLayoutError(null);
                          setHomeRoomLayoutDirty(true);
                          setHomeRoomMinWidthPxDraft(next);
                        }}
                        className="mt-2 w-full"
                      />
                    </div>
                  ) : null}

                  <div className="mt-2">
                    <div className="text-xs text-white/45">Per-room overrides</div>
                    <div className="mt-2 space-y-2">
                      {(Array.isArray(config?.rooms) ? config.rooms : [])
                        .map((r) => ({
                          id: String(r?.id || '').trim(),
                          name: String(r?.name || r?.id || '').trim(),
                        }))
                        .filter((r) => r.id)
                        .map((r) => {
                          const tile = (homeRoomTilesDraft && typeof homeRoomTilesDraft === 'object') ? homeRoomTilesDraft[r.id] : null;
                          const spanRaw = tile && typeof tile === 'object' ? Number(tile.span) : NaN;
                          const orderRaw = tile && typeof tile === 'object' ? Number(tile.order) : NaN;
                          const rowSpanRaw = tile && typeof tile === 'object' ? Number(tile.rowSpan) : NaN;
                          const span = Number.isFinite(spanRaw) ? Math.max(1, Math.min(6, Math.round(spanRaw))) : 1;
                          const order = Number.isFinite(orderRaw) ? Math.max(-999, Math.min(999, Math.round(orderRaw))) : '';
                          const rowSpan = Number.isFinite(rowSpanRaw) ? Math.max(1, Math.min(999, Math.round(rowSpanRaw))) : '';

                          return (
                            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-sm text-white/85 truncate">{r.name || r.id}</div>
                                <div className="text-[11px] text-white/40 truncate">{r.id}</div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                <div className="text-[11px] text-white/45">span</div>
                                <select
                                  value={span}
                                  disabled={!connected || busy}
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    const nextSpan = Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 1;
                                    setHomeRoomLayoutError(null);
                                    setHomeRoomLayoutDirty(true);
                                    setHomeRoomTilesDraft((prev) => {
                                      const base = (prev && typeof prev === 'object') ? { ...prev } : {};
                                      const prevEntry = (base[r.id] && typeof base[r.id] === 'object') ? base[r.id] : {};
                                      const nextEntry = { ...prevEntry, span: nextSpan };
                                      base[r.id] = nextEntry;
                                      return base;
                                    });
                                  }}
                                  className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90"
                                >
                                  <option value={1}>1</option>
                                  <option value={2}>2</option>
                                  <option value={3}>3</option>
                                  <option value={4}>4</option>
                                  <option value={5}>5</option>
                                  <option value={6}>6</option>
                                </select>

                                <div className="ml-2 text-[11px] text-white/45">order</div>
                                <input
                                  type="number"
                                  min={-999}
                                  max={999}
                                  step={1}
                                  value={order}
                                  disabled={!connected || busy}
                                  onChange={(e) => {
                                    const s = String(e.target.value);
                                    const n = s.trim() === '' ? null : Number(s);
                                    const nextOrder = (n === null) ? null : (Number.isFinite(n) ? Math.max(-999, Math.min(999, Math.round(n))) : null);
                                    setHomeRoomLayoutError(null);
                                    setHomeRoomLayoutDirty(true);
                                    setHomeRoomTilesDraft((prev) => {
                                      const base = (prev && typeof prev === 'object') ? { ...prev } : {};
                                      const prevEntry = (base[r.id] && typeof base[r.id] === 'object') ? base[r.id] : {};
                                      const nextEntry = { ...prevEntry };
                                      if (nextOrder === null) delete nextEntry.order;
                                      else nextEntry.order = nextOrder;
                                      base[r.id] = nextEntry;
                                      return base;
                                    });
                                  }}
                                  className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90"
                                  placeholder="(auto)"
                                />

                                {homeRoomLayoutModeDraft === 'masonry' ? (
                                  <>
                                    <div className="ml-2 text-[11px] text-white/45">rows</div>
                                    <input
                                      type="number"
                                      min={1}
                                      max={999}
                                      step={1}
                                      value={rowSpan}
                                      disabled={!connected || busy}
                                      onChange={(e) => {
                                        const s = String(e.target.value);
                                        const n = s.trim() === '' ? null : Number(s);
                                        const nextRowSpan = (n === null) ? null : (Number.isFinite(n) ? Math.max(1, Math.min(999, Math.round(n))) : null);
                                        setHomeRoomLayoutError(null);
                                        setHomeRoomLayoutDirty(true);
                                        setHomeRoomTilesDraft((prev) => {
                                          const base = (prev && typeof prev === 'object') ? { ...prev } : {};
                                          const prevEntry = (base[r.id] && typeof base[r.id] === 'object') ? base[r.id] : {};
                                          const nextEntry = { ...prevEntry };
                                          if (nextRowSpan === null) delete nextEntry.rowSpan;
                                          else nextEntry.rowSpan = nextRowSpan;
                                          base[r.id] = nextEntry;
                                          return base;
                                        });
                                      }}
                                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-sm text-white/90"
                                      placeholder="(auto)"
                                    />
                                  </>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="text-xs text-white/45">
                      {homeRoomLayoutDirty ? 'Pending changes…' : 'Saved'}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-white/45">{statusText(homeRoomLayoutSave.status)}</div>
                      <button
                        type="button"
                        disabled={!connected || busy || !homeRoomLayoutDirty}
                        onClick={async () => {
                          try {
                            setHomeRoomLayoutError(null);
                            const rawTiles = (homeRoomTilesDraft && typeof homeRoomTilesDraft === 'object') ? homeRoomTilesDraft : {};
                            const cleaned = {};
                            for (const [rid, vRaw] of Object.entries(rawTiles)) {
                              const id = String(rid || '').trim();
                              if (!id) continue;
                              const v = (vRaw && typeof vRaw === 'object') ? vRaw : {};
                              const spanNum = Number(v.span);
                              const orderNum = Number(v.order);
                              const rowSpanNum = Number(v.rowSpan);
                              const entry = {};
                              if (Number.isFinite(spanNum)) entry.span = Math.max(1, Math.min(6, Math.round(spanNum)));
                              if (Number.isFinite(orderNum)) entry.order = Math.max(-999, Math.min(999, Math.round(orderNum)));
                              if (Number.isFinite(rowSpanNum)) entry.rowSpan = Math.max(1, Math.min(999, Math.round(rowSpanNum)));
                              if (Object.keys(entry).length) cleaned[id] = entry;
                            }

                            await homeRoomLayoutSave.run({
                              homeRoomLayoutMode: homeRoomLayoutModeDraft,
                              homeRoomMasonryRowHeightPx: homeRoomMasonryRowHeightPxDraft,
                              homeRoomMinWidthPx: homeRoomMinWidthPxDraft,
                              homeRoomTiles: cleaned,
                            });
                            setHomeRoomLayoutDirty(false);
                          } catch (e) {
                            setHomeRoomLayoutError(e?.message || String(e));
                          }
                        }}
                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white/90 disabled:opacity-50"
                      >
                        Save layout
                      </button>
                    </div>
                  </div>

                  {homeRoomLayoutError ? (
                    <div className="text-[11px] text-neon-red break-words">Save failed: {homeRoomLayoutError}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                      Sub-card columns
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Controls the metric sub-card grid inside each room card.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <select
                      value={homeRoomMetricColumnsDraft}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
                        setHomeRoomMetricColumnsError(null);
                        setHomeRoomMetricColumnsDirty(true);
                        setHomeRoomMetricColumnsDraft(next);
                      }}
                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    >
                      <option value={0}>Auto</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                    <div className="text-xs text-white/45">cols</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {homeRoomMetricColumnsDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(homeRoomMetricColsSave.status)}
                  </div>
                </div>

                {homeRoomMetricColumnsError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {homeRoomMetricColumnsError}</div>
                ) : null}
              </div>

              <div className="mt-6 border-t border-white/10 pt-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  Room metric cards
                </div>
                <div className="mt-1 text-xs text-white/45">
                  These metrics render on every room; rooms without sensors show —.
                </div>

                <div className="mt-3 flex flex-wrap gap-4">
                  {[
                    { key: 'temperature', label: 'Temperature' },
                    { key: 'humidity', label: 'Humidity' },
                    { key: 'illuminance', label: 'Illuminance' },
                  ].map((opt) => {
                    const set = new Set(homeRoomMetricKeysDraft);
                    const checked = set.has(opt.key);
                    return (
                      <label key={opt.key} className="flex items-center gap-2 select-none">
                        <input
                          type="checkbox"
                          className={`h-5 w-5 ${scheme.checkboxAccent}`}
                          disabled={!connected || busy}
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(homeRoomMetricKeysDraft);
                            if (e.target.checked) next.add(opt.key);
                            else next.delete(opt.key);
                            setHomeRoomMetricKeysError(null);
                            setHomeRoomMetricKeysDirty(true);
                            setHomeRoomMetricKeysDraft(Array.from(next));
                          }}
                        />
                        <span className="text-xs text-white/70">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {homeRoomMetricKeysDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(homeRoomMetricKeysSave.status)}
                  </div>
                </div>

                {homeRoomMetricKeysError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {homeRoomMetricKeysError}</div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Cameras & Sensors
              </div>
              <div className="mt-1 text-xs text-white/45">
                These settings are profile-aware and apply to the currently selected panel.
              </div>

              <div
                className={`mt-4 utility-group p-4 ${isPresetSelected ? 'opacity-50 pointer-events-none' : ''}`}
                aria-disabled={isPresetSelected ? 'true' : 'false'}
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  Camera Previews
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Shows room camera snapshot tiles (from configured cameras).
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3 select-none">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Home</div>
                      <div className="mt-1 text-xs text-white/45">Embed camera snapshots on Home.</div>
                    </div>
                    <input
                      type="checkbox"
                      className={`h-5 w-5 ${scheme.checkboxAccent}`}
                      disabled={!connected || busy}
                      checked={cameraPreviewsDraft.homeCameraPreviewsEnabled === true}
                      onChange={(e) => {
                        setCameraPreviewsError(null);
                        setCameraPreviewsDirty(true);
                        setCameraPreviewsDraft((prev) => ({ ...prev, homeCameraPreviewsEnabled: e.target.checked === true }));
                      }}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3 select-none">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Controls</div>
                      <div className="mt-1 text-xs text-white/45">Embed camera snapshots on Controls.</div>
                    </div>
                    <input
                      type="checkbox"
                      className={`h-5 w-5 ${scheme.checkboxAccent}`}
                      disabled={!connected || busy}
                      checked={cameraPreviewsDraft.controlsCameraPreviewsEnabled === true}
                      onChange={(e) => {
                        setCameraPreviewsError(null);
                        setCameraPreviewsDirty(true);
                        setCameraPreviewsDraft((prev) => ({ ...prev, controlsCameraPreviewsEnabled: e.target.checked === true }));
                      }}
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    Refresh
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={2}
                      max={120}
                      step={1}
                      value={cameraPreviewsDraft.cameraPreviewRefreshSeconds}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(2, Math.min(120, Math.round(n))) : 10;
                        setCameraPreviewsError(null);
                        setCameraPreviewsDirty(true);
                        setCameraPreviewsDraft((prev) => ({ ...prev, cameraPreviewRefreshSeconds: next }));
                      }}
                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    />
                    <div className="text-xs text-white/45">sec</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {cameraPreviewsDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(cameraPreviewsSave.status)}
                  </div>
                </div>

                {cameraPreviewsError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {cameraPreviewsError}</div>
                ) : null}
              </div>

              <div
                className={`mt-4 utility-group p-4 ${isPresetSelected ? 'opacity-50 pointer-events-none' : ''}`}
                aria-disabled={isPresetSelected ? 'true' : 'false'}
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  Sensor Badge Colors
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Controls the color of sensor indicator icons on Home when active.
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { k: 'motion', label: 'Motion' },
                    { k: 'door', label: 'Door' },
                    { k: 'smoke', label: 'Smoke' },
                    { k: 'co', label: 'CO' },
                    { k: 'water', label: 'Water/Leak' },
                    { k: 'presence', label: 'Presence' },
                  ].map(({ k, label }) => (
                    <label key={k} className="block">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                        <span>{label} Color</span>
                        <span className={`inline-block h-2 w-2 rounded-full ${toleranceSwatchClass(sensorColorsDraft[k])}`} />
                      </div>
                      <select
                        value={sensorColorsDraft[k]}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const next = String(e.target.value);
                          setSensorColorsDirty(true);
                          setSensorColorsDraft((prev) => ({ ...prev, [k]: next }));
                        }}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      >
                        {TOLERANCE_COLOR_CHOICES.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {sensorColorsDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(sensorColorsSave.status)}
                  </div>
                </div>

                {sensorColorsError ? (
                  <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {sensorColorsError}</div>
                ) : null}
              </div>
            </div>

            <div
              className={`mt-4 utility-group p-4 ${isPresetSelected ? 'opacity-50 pointer-events-none' : ''}`}
              aria-disabled={isPresetSelected ? 'true' : 'false'}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Visible Rooms</div>
              <div className="mt-1 text-xs text-white/45">
                Choose which rooms appear on this panel. If none are selected, all rooms are shown.
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                {allRoomsForVisibility.map((r) => {
                  const checked = visibleRoomIds.has(r.id);
                  return (
                    <label key={r.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!connected || busy || visibleRoomsSave.status === 'saving'}
                        onChange={(e) => toggleVisibleRoom(r.id, Boolean(e.target.checked))}
                      />
                      <span className="min-w-0 truncate text-sm font-semibold text-white/85">{r.name}</span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {visibleRoomIds.size ? `${visibleRoomIds.size} selected` : 'All rooms'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(visibleRoomsSave.status)}
                </div>
              </div>

              {visibleRoomsSave.error ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {visibleRoomsSave.error}</div>
              ) : null}
            </div>

            </div>
          </div>
        ) : null}

        {activeTab === 'display' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Global Options
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Cameras
            </div>
            <div className="mt-1 text-xs text-white/45">
              Register cameras once, then assign them to rooms per panel.
            </div>

            {!connected ? (
              <div className="mt-2 text-xs text-white/45">Disconnected — camera changes can’t be saved.</div>
            ) : null}

            {uiCamerasError ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Load failed: {uiCamerasError}</div>
            ) : null}

            <div className="mt-4 utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  {cameraFormMode === 'edit' ? 'Edit Camera' : 'Add Camera'}
                </div>
                {cameraFormMode === 'edit' ? (
                  <button
                    type="button"
                    disabled={!connected || busy}
                    onClick={() => {
                      setCameraFormMode('create');
                      setCameraFormId('');
                      setCameraFormError(null);
                      setCameraForm({
                        id: '',
                        label: '',
                        enabled: true,
                        defaultRoomId: '',
                        snapshotUrl: '',
                        snapshotUsername: '',
                        snapshotPassword: '',
                        snapshotUpdatePassword: false,
                        snapshotHadPassword: false,
                        embedUrl: '',
                        rtspUrl: '',
                      });
                    }}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/5'}`}
                  >
                    New
                  </button>
                ) : null}
              </div>

              {cameraFormError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {cameraFormError}</div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                    ID (optional)
                  </div>
                  <input
                    type="text"
                    value={cameraForm.id}
                    disabled={!connected || busy || cameraFormMode === 'edit'}
                    onChange={(e) => setCameraForm((prev) => ({ ...prev, id: String(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    placeholder="front_porch"
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                    Label
                  </div>
                  <input
                    type="text"
                    value={cameraForm.label}
                    disabled={!connected || busy}
                    onChange={(e) => setCameraForm((prev) => ({ ...prev, label: String(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    placeholder="Front Porch"
                  />
                </label>

                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                    Default Room (optional)
                  </div>
                  <select
                    value={cameraForm.defaultRoomId}
                    disabled={!connected || busy}
                    onChange={(e) => setCameraForm((prev) => ({ ...prev, defaultRoomId: String(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  >
                    <option value="">(none)</option>
                    {allRoomsForVisibility.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 select-none">
                  <input
                    type="checkbox"
                    className={`h-5 w-5 ${scheme.checkboxAccent}`}
                    checked={cameraForm.enabled === true}
                    disabled={!connected || busy}
                    onChange={(e) => setCameraForm((prev) => ({ ...prev, enabled: e.target.checked === true }))}
                  />
                  <div className="text-xs text-white/70">Enabled</div>
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Snapshot</div>
                <div className="mt-1 text-xs text-white/45">Used for image previews (proxy fetches on the server).</div>

                <label className="block mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Snapshot URL</div>
                  <input
                    type="text"
                    value={cameraForm.snapshotUrl}
                    disabled={!connected || busy}
                    onChange={(e) => setCameraForm((prev) => ({ ...prev, snapshotUrl: String(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    placeholder="http://camera/snapshot.jpg"
                  />
                </label>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Username</div>
                    <input
                      type="text"
                      value={cameraForm.snapshotUsername}
                      disabled={!connected || busy}
                      onChange={(e) => setCameraForm((prev) => ({ ...prev, snapshotUsername: String(e.target.value) }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      placeholder="(optional)"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Password</div>
                      <label className="flex items-center gap-2 text-xs text-white/55 select-none">
                        <input
                          type="checkbox"
                          checked={cameraForm.snapshotUpdatePassword === true}
                          disabled={!connected || busy}
                          onChange={(e) => setCameraForm((prev) => ({ ...prev, snapshotUpdatePassword: e.target.checked === true }))}
                        />
                        Update
                      </label>
                    </div>
                    <input
                      type="password"
                      value={cameraForm.snapshotPassword}
                      disabled={!connected || busy || cameraForm.snapshotUpdatePassword !== true}
                      onChange={(e) => setCameraForm((prev) => ({ ...prev, snapshotPassword: String(e.target.value) }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      placeholder={cameraForm.snapshotHadPassword ? '(stored)' : '(optional)'}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Embed (HTTP/S)</div>
                <div className="mt-1 text-xs text-white/45">Renders as a borderless iframe.</div>
                <label className="block mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Embed URL</div>
                  <input
                    type="text"
                    value={cameraForm.embedUrl}
                    disabled={!connected || busy}
                    onChange={(e) => setCameraForm((prev) => ({ ...prev, embedUrl: String(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    placeholder="https://camera/live"
                  />
                </label>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">RTSP</div>
                <div className="mt-1 text-xs text-white/45">Streams via server-side RTSP → HLS (ffmpeg required on the server).</div>
                {cameraFormMode === 'edit' && RTSP_REDACTED_PATTERN.test(String(cameraForm.rtspUrl || '')) ? (
                  <div className="mt-1 text-[11px] text-white/45">
                    Password is hidden; leave unchanged to keep the stored credentials.
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <label className="block">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">RTSP URL</div>
                    <input
                      type="text"
                      value={cameraForm.rtspUrl}
                      disabled={!connected || busy}
                      onChange={(e) => setCameraForm((prev) => ({ ...prev, rtspUrl: String(e.target.value) }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      placeholder="rtsp://user:pass@192.168.1.50:554/stream"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={!connected || busy || !String(cameraForm.label || cameraForm.id || '').trim()}
                  onClick={async () => {
                    setCameraFormError(null);
                    setBusy(true);
                    try {
                      const idTrimmed = String(cameraForm.id || '').trim();
                      const labelTrimmed = String(cameraForm.label || '').trim();

                      if (!idTrimmed && !labelTrimmed) {
                        setCameraFormError('Camera requires an id or label.');
                        return;
                      }

                      const snapshotUrl = String(cameraForm.snapshotUrl || '').trim();
                      const snapshotUser = String(cameraForm.snapshotUsername || '').trim();
                      const snapshotHadPassword = cameraForm.snapshotHadPassword === true;
                      const snapshotUpdatePassword = cameraForm.snapshotUpdatePassword === true;
                      const snapshotPassword = String(cameraForm.snapshotPassword ?? '');

                      const embedUrl = String(cameraForm.embedUrl || '').trim();
                      const rtspUrl = String(cameraForm.rtspUrl || '').trim();
                      const payload = {
                        ...(cameraFormMode === 'create' && idTrimmed ? { id: idTrimmed } : {}),
                        label: labelTrimmed || idTrimmed,
                        enabled: cameraForm.enabled !== false,
                        defaultRoomId: String(cameraForm.defaultRoomId || '').trim(),
                        ...(snapshotUrl ? {
                          snapshot: {
                            url: snapshotUrl,
                            ...((snapshotUser || snapshotUpdatePassword || snapshotHadPassword) ? {
                              basicAuth: {
                                ...(snapshotUser ? { username: snapshotUser } : {}),
                                ...(snapshotUpdatePassword ? { password: snapshotPassword } : {}),
                              },
                            } : {}),
                          },
                        } : {}),
                        ...(embedUrl ? { embed: { url: embedUrl } } : {}),
                        ...(rtspUrl ? { rtsp: { url: rtspUrl } } : {}),
                      };

                      if (cameraFormMode === 'edit') {
                        await updateUiCamera(cameraFormId, payload);
                      } else {
                        await createUiCamera(payload);
                      }

                      const cams = await fetchUiCameras();
                      setUiCameras(Array.isArray(cams) ? cams : []);

                      setCameraFormMode('create');
                      setCameraFormId('');
                      setCameraForm({
                        id: '',
                        label: '',
                        enabled: true,
                        defaultRoomId: '',
                        snapshotUrl: '',
                        snapshotUsername: '',
                        snapshotPassword: '',
                        snapshotUpdatePassword: false,
                        snapshotHadPassword: false,
                        embedUrl: '',
                        rtspUrl: '',
                      });
                    } catch (e) {
                      setCameraFormError(e?.message || String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy || !String(cameraForm.label || cameraForm.id || '').trim()) ? 'opacity-50' : 'hover:bg-white/5'}`}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  Registered Cameras
                </div>
                <div className="text-xs text-white/45">
                  {uiCamerasStatus === 'loading' ? 'Loading…' : `${uiCameras.length} total`}
                </div>
              </div>

              {uiCameras.length ? (
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {uiCameras.map((c) => {
                    const id = String(c?.id || '').trim();
                    if (!id) return null;
                    const label = String(c?.label || id).trim() || id;
                    const enabled = c?.enabled !== false;
                    const snap = (c?.snapshot && typeof c.snapshot === 'object') ? c.snapshot : null;
                    const hasSnapshot = Boolean(snap && String(snap.url || '').trim());
                    const hasEmbed = Boolean(c?.embed && typeof c.embed === 'object' && String(c.embed.url || '').trim());
                    const hasRtsp = Boolean(c?.rtsp && typeof c.rtsp === 'object' && String(c.rtsp.url || '').trim());

                    return (
                      <div key={id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white/85 truncate">{label}</div>
                          <div className="mt-1 text-[11px] text-white/45 truncate">
                            <span className="text-white/55">{id}</span>
                            {enabled ? '' : ' • Disabled'}
                            {hasSnapshot ? ' • Snapshot' : ''}
                            {hasEmbed ? ' • Embed' : ''}
                            {hasRtsp ? ' • RTSP' : ''}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!connected || busy}
                          onClick={() => {
                            const snapAuth = snap && snap.basicAuth && typeof snap.basicAuth === 'object' ? snap.basicAuth : null;
                            const snapUser = snapAuth ? String(snapAuth.username ?? '') : '';
                            const snapHadPassword = Boolean(snapAuth && snapAuth.hasPassword === true);
                            const embed = (c?.embed && typeof c.embed === 'object') ? c.embed : null;
                            const rtsp = (c?.rtsp && typeof c.rtsp === 'object') ? c.rtsp : null;

                            setCameraFormMode('edit');
                            setCameraFormId(id);
                            setCameraFormError(null);
                            setCameraForm({
                              id,
                              label,
                              enabled,
                              defaultRoomId: String(c?.defaultRoomId || '').trim(),
                              snapshotUrl: snap ? String(snap.url || '') : '',
                              snapshotUsername: snapUser,
                              snapshotPassword: '',
                              snapshotUpdatePassword: false,
                              snapshotHadPassword: snapHadPassword,
                              embedUrl: embed ? String(embed.url || '') : '',
                              rtspUrl: rtsp ? String(rtsp.url || '') : '',
                            });
                          }}
                          className={`rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} ${(!connected || busy) ? 'opacity-50' : 'hover:bg-white/5'}`}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          disabled={!connected || busy}
                          onClick={async () => {
                            setCameraFormError(null);
                            setBusy(true);
                            try {
                              await deleteUiCamera(id);
                              const cams = await fetchUiCameras();
                              setUiCameras(Array.isArray(cams) ? cams : []);
                              if (cameraFormMode === 'edit' && cameraFormId === id) {
                                setCameraFormMode('create');
                                setCameraFormId('');
                              }
                            } catch (e) {
                              setCameraFormError(e?.message || String(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className={`rounded-xl border border-neon-red/30 bg-black/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-neon-red/90 transition-colors ${(!connected || busy) ? 'opacity-50' : 'hover:bg-neon-red/10'}`}
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 text-xs text-white/45">
                  No cameras registered yet.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === 'deviceOptions' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Settings
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Device Options
            </div>
            <div className="mt-1 text-xs text-white/45">
              Preferences for how device types render controls.
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Switch controls
              </div>
              <div className="mt-1 text-xs text-white/45">
                How switch-type devices render on the Controls screen.
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Control style</div>
                  <select
                    value={globalSwitchControlStyleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const next = String(e.target.value || '').trim().toLowerCase();
                      setGlobalSwitchControlStyleError(null);
                      setGlobalSwitchControlStyleDirty(true);
                      setGlobalSwitchControlStyleDraft(next);
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  >
                    <option value="auto">Auto</option>
                    <option value="buttons">Buttons (On/Off)</option>
                    <option value="switch">Switch (toggle)</option>
                  </select>
                </label>

                <label className="block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Animation</div>
                  <select
                    value={globalSwitchAnimationStyleDraft}
                    disabled={!connected || busy}
                    onChange={(e) => {
                      const next = String(e.target.value || '').trim().toLowerCase();
                      setGlobalSwitchAnimationStyleError(null);
                      setGlobalSwitchAnimationStyleDirty(true);
                      setGlobalSwitchAnimationStyleDraft(next);
                    }}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  >
                    <option value="none">None</option>
                    <option value="pulse">Pulse when on</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  {(globalSwitchControlStyleDirty || globalSwitchAnimationStyleDirty) ? 'Pending changes…' : 'Saved'}
                </div>
                <div className="text-xs text-white/45">
                  {statusText(deviceControlStylesSave.status)}
                </div>
              </div>

              {(globalSwitchControlStyleError || globalSwitchAnimationStyleError) ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">
                  Save failed: {globalSwitchControlStyleError || globalSwitchAnimationStyleError}
                </div>
              ) : null}
            </div>

            <div className="mt-4 utility-group p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                Control Icons
              </div>
              <div className="mt-1 text-xs text-white/45">
                Assign interactive toggle icons to devices. Only compatible icons are shown for each device.
              </div>

              {controlIconsError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">
                  Control icons unavailable: {controlIconsError}
                </div>
              ) : null}

              {/* Device list with multi-icon assignment */}
              {(() => {
                const icons = Array.isArray(controlIconsIndex?.icons) ? controlIconsIndex.icons : [];
                
                // Use local state for display (optimistic updates)
                const currentAssignments = localIconAssignments;
                
                // Get devices with commands that could use control icons
                const commandDevices = allDevices
                  .filter((d) => Array.isArray(d.commands) && d.commands.length > 0)
                  .map((d) => {
                    const cmds = Array.isArray(d.commands) ? d.commands : [];
                    // Find compatible icons for this device
                    const compatibleIcons = icons.filter((icon) => {
                      const required = Array.isArray(icon.requiredCommands) ? icon.requiredCommands : [];
                      return required.every((cmd) => cmds.includes(cmd));
                    });
                    return { ...d, compatibleIcons };
                  })
                  .filter((d) => d.compatibleIcons.length > 0); // Only show devices with at least one compatible icon
                
                if (commandDevices.length === 0) {
                  return (
                    <div className="mt-4 text-xs text-white/45">
                      No devices with compatible control icons.
                    </div>
                  );
                }

                // Helper to get current icons array for a device
                const getDeviceIcons = (deviceId) => {
                  const val = currentAssignments[deviceId];
                  if (!val) return [];
                  if (Array.isArray(val)) return val;
                  return [val]; // backward compat: single string → array
                };

                return (
                  <div className="mt-4 space-y-3">
                    {commandDevices.map((device) => {
                      const currentIconIds = getDeviceIcons(device.id);

                      return (
                        <div key={device.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          {/* Device name */}
                          <div className="text-sm font-medium text-white/90 mb-2">
                            {device.label}
                          </div>
                          
                          {/* Icon checkboxes - multiple select */}
                          <div className="flex flex-wrap gap-2">
                            {device.compatibleIcons.map((icon) => {
                              const isSelected = currentIconIds.includes(icon.id);
                              
                              return (
                                <button
                                  key={icon.id}
                                  disabled={!connected || busy}
                                  onClick={async () => {
                                    setError(null);
                                    try {
                                      // Compute next state from current local state (use ref for fresh value)
                                      const currentAssignmentsNow = localIconAssignmentsRef.current;
                                      const prevVal = currentAssignmentsNow[device.id];
                                      const prevIconIds = prevVal
                                        ? (Array.isArray(prevVal) ? prevVal : [prevVal]).map((v) => String(v || '').trim()).filter(Boolean)
                                        : [];
                                      
                                      const alreadySelected = prevIconIds.includes(icon.id);
                                      let nextIcons;
                                      if (alreadySelected) {
                                        nextIcons = prevIconIds.filter((id) => id !== icon.id);
                                      } else {
                                        nextIcons = [...prevIconIds, icon.id];
                                      }
                                      
                                      const nextVal = nextIcons.length > 0 ? nextIcons : null;
                                      
                                      // Update local state optimistically (also updates ref on next render)
                                      setLocalIconAssignments((prev) => {
                                        const updated = {
                                          ...prev,
                                          [device.id]: nextVal,
                                        };
                                        localIconAssignmentsRef.current = updated;
                                        return updated;
                                      });
                                      
                                      // Save to server
                                      await deviceControlIconsSave.run({ [device.id]: nextVal });
                                    } catch (err) {
                                      setError(err?.message || String(err));
                                    }
                                  }}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all ${
                                    isSelected 
                                      ? 'border-neon-blue/60 bg-neon-blue/20 text-white' 
                                      : 'border-white/10 bg-black/30 text-white/60 hover:border-white/20'
                                  }`}
                                  title={icon.description || icon.name}
                                >
                                  <div className="w-6 h-6 flex items-center justify-center">
                                    <img
                                      src={`${API_HOST}${controlIconsIndex.rootUrl}/${icon.file}`}
                                      alt={icon.name || icon.id}
                                      className="max-w-full max-h-full"
                                    />
                                  </div>
                                  <span className="text-[11px]">{icon.name || icon.id}</span>
                                </button>
                              );
                            })}
                          </div>
                          
                          {/* Preview of selected icons */}
                          {currentIconIds.length > 0 ? (
                            <div className="mt-2 flex gap-1 items-center">
                              <span className="text-[10px] text-white/40 mr-1">Active:</span>
                              {currentIconIds.map((iconId) => {
                                const icon = icons.find((i) => i.id === iconId);
                                if (!icon) return null;
                                return (
                                  <div key={iconId} className="w-8 h-8 rounded border border-white/10 bg-black/40 flex items-center justify-center p-0.5">
                                    <img
                                      src={`${API_HOST}${controlIconsIndex.rootUrl}/${icon.file}`}
                                      alt={icon.name || icon.id}
                                      className="max-w-full max-h-full"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="mt-3 flex items-center justify-end gap-3">
                <div className="text-xs text-white/45">
                  {statusText(deviceControlIconsSave.status)}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'climate' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Climate
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Heatmap Tolerances
            </div>
            <div className="mt-1 text-xs text-white/45">
              Adjust the thresholds used for Climate colors (Temperature/Humidity/Illuminance).
            </div>

            <div className="mt-4 utility-group p-4">
              <label className="flex items-center justify-between gap-4 select-none">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Colorize Home values
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    Use the Climate tolerance colors to glow the big numbers on Home.
                  </div>
                </div>
                <input
                  type="checkbox"
                  className={`h-5 w-5 ${scheme.checkboxAccent}`}
                  disabled={!connected || busy || homeValueSave.status === 'saving'}
                  checked={colorizeHomeValues}
                  onChange={async (e) => {
                    const next = !!e.target.checked;
                    setHomeValueColorError(null);
                    try {
                      await homeValueSave.run({
                        colorizeHomeValues: next,
                        colorizeHomeValuesOpacityPct: homeValueOpacityDraft,
                      });
                    } catch (err) {
                      setHomeValueColorError(err?.message || String(err));
                    }
                  }}
                />
              </label>

              <div className="mt-3 utility-group p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      Color opacity
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Lower = more translucent (less intense color).
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={homeValueOpacityDraft}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = Number(raw);
                        const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                        setHomeValueOpacityDirty(true);
                        setHomeValueOpacityDraft(next);
                      }}
                      className="w-[90px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                    />
                    <div className="text-xs text-white/45">%</div>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={homeValueOpacityDraft}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
                    setHomeValueOpacityDirty(true);
                    setHomeValueOpacityDraft(next);
                  }}
                  className="mt-3 w-full"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {homeValueOpacityDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(homeValueSave.status)}
                  </div>
                </div>
              </div>

              {homeValueColorError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {homeValueColorError}</div>
              ) : null}
            </div>

            {climateError ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {climateError}</div>
            ) : null}

            {climateColorsError ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {climateColorsError}</div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="utility-group p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Temperature (°F)</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[{ k: 'cold', label: 'Cold <' }, { k: 'comfy', label: 'Comfy <' }, { k: 'warm', label: 'Warm <' }].map(({ k, label }) => (
                    <label key={k} className="block">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</div>
                      <input
                        type="number"
                        value={climateDraft.temperatureF[k]}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          setClimateDirty(true);
                          setClimateDraft((prev) => ({
                            ...prev,
                            temperatureF: { ...prev.temperatureF, [k]: v },
                          }));
                        }}
                        className="no-spinner mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[{ k: 'cold', label: 'Cold' }, { k: 'comfy', label: 'Comfy' }, { k: 'warm', label: 'Warm' }, { k: 'hot', label: 'Hot' }].map(({ k, label }) => (
                    <label key={k} className="block">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                        <span>{label} Color</span>
                        <span className={`inline-block h-2 w-2 rounded-full ${toleranceSwatchClass(climateColorsDraft.temperatureF[k])}`} />
                      </div>
                      <select
                        value={climateColorsDraft.temperatureF[k]}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const next = String(e.target.value);
                          setClimateColorsDirty(true);
                          setClimateColorsDraft((prev) => ({
                            ...prev,
                            temperatureF: { ...prev.temperatureF, [k]: next },
                          }));
                        }}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      >
                        {TOLERANCE_COLOR_CHOICES.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="utility-group p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Humidity (%)</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[{ k: 'dry', label: 'Dry <' }, { k: 'comfy', label: 'Comfy <' }, { k: 'humid', label: 'Humid <' }].map(({ k, label }) => (
                    <label key={k} className="block">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</div>
                      <input
                        type="number"
                        value={climateDraft.humidityPct[k]}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          setClimateDirty(true);
                          setClimateDraft((prev) => ({
                            ...prev,
                            humidityPct: { ...prev.humidityPct, [k]: v },
                          }));
                        }}
                        className="no-spinner mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[{ k: 'dry', label: 'Dry' }, { k: 'comfy', label: 'Comfy' }, { k: 'humid', label: 'Humid' }, { k: 'veryHumid', label: 'Very Humid' }].map(({ k, label }) => (
                    <label key={k} className="block">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                        <span>{label} Color</span>
                        <span className={`inline-block h-2 w-2 rounded-full ${toleranceSwatchClass(climateColorsDraft.humidityPct[k])}`} />
                      </div>
                      <select
                        value={climateColorsDraft.humidityPct[k]}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const next = String(e.target.value);
                          setClimateColorsDirty(true);
                          setClimateColorsDraft((prev) => ({
                            ...prev,
                            humidityPct: { ...prev.humidityPct, [k]: next },
                          }));
                        }}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      >
                        {TOLERANCE_COLOR_CHOICES.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="utility-group p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Illuminance (lux)</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[{ k: 'dark', label: 'Dark <' }, { k: 'dim', label: 'Dim <' }, { k: 'bright', label: 'Bright <' }].map(({ k, label }) => (
                    <label key={k} className="block">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</div>
                      <input
                        type="number"
                        value={climateDraft.illuminanceLux[k]}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          setClimateDirty(true);
                          setClimateDraft((prev) => ({
                            ...prev,
                            illuminanceLux: { ...prev.illuminanceLux, [k]: v },
                          }));
                        }}
                        className="no-spinner mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[{ k: 'dark', label: 'Dark' }, { k: 'dim', label: 'Dim' }, { k: 'bright', label: 'Bright' }, { k: 'veryBright', label: 'Very Bright' }].map(({ k, label }) => (
                    <label key={k} className="block">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                        <span>{label} Color</span>
                        <span className={`inline-block h-2 w-2 rounded-full ${toleranceSwatchClass(climateColorsDraft.illuminanceLux[k])}`} />
                      </div>
                      <select
                        value={climateColorsDraft.illuminanceLux[k]}
                        disabled={!connected || busy}
                        onChange={(e) => {
                          const next = String(e.target.value);
                          setClimateColorsDirty(true);
                          setClimateColorsDraft((prev) => ({
                            ...prev,
                            illuminanceLux: { ...prev.illuminanceLux, [k]: next },
                          }));
                        }}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                      >
                        {TOLERANCE_COLOR_CHOICES.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-white/45">
                {(climateDirty || climateColorsDirty) ? 'Pending changes…' : 'Saved'}
              </div>
              <div className="text-xs text-white/45">
                Tolerances: {statusText(climateTolSave.status) || 'Idle'} · Colors: {statusText(climateColorsSave.status) || 'Idle'}
              </div>
            </div>

            {!connected ? (
              <div className="mt-3 text-xs text-white/45">Server offline: editing disabled.</div>
            ) : null}

          </div>
        ) : null}

        {activeTab === 'events' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                  Events
                </div>
                <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                  Recent Posts
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Open the Events page to see live posts to <span className="text-white/70">/api/events</span>.
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenEvents?.()}
                className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${scheme.actionButton} hover:bg-white/5`}
              >
                Open
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
