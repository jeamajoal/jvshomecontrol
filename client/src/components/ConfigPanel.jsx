import React, { useEffect, useMemo, useRef, useState } from 'react';

import { API_HOST } from '../apiHost';
import { useAppState } from '../appState';
import {
  TOLERANCE_COLOR_CHOICES,
  normalizeToleranceColorId,
} from '../toleranceColors';
import { getUiScheme } from '../uiScheme';

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

async function fetchBackgroundFiles() {
  const res = await fetch(`${API_HOST}/api/backgrounds`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Backgrounds fetch failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const files = Array.isArray(data?.files) ? data.files : [];
  return files.map((v) => String(v)).filter(Boolean);
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

async function saveHomeBackground(homeBackground, panelName) {
  const res = await fetch(`${API_HOST}/api/ui/home-background`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      homeBackground: homeBackground || {},
      ...(panelName ? { panelName } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Home background save failed (${res.status})`);
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

const ConfigPanel = ({ config: configProp, statuses: statusesProp, connected: connectedProp, onOpenEvents }) => {
  const ctx = useAppState();
  const config = configProp ?? ctx?.config;
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

  const [soundFiles, setSoundFiles] = useState([]);
  const [soundFilesError, setSoundFilesError] = useState(null);
  const [backgroundFiles, setBackgroundFiles] = useState([]);
  const [backgroundFilesError, setBackgroundFilesError] = useState(null);
  const [openMeteoDraft, setOpenMeteoDraft] = useState(() => ({ lat: '', lon: '', timezone: 'auto' }));
  const [openMeteoDirty, setOpenMeteoDirty] = useState(false);
  const [openMeteoError, setOpenMeteoError] = useState(null);
  const [openMeteoEnvOverrides, setOpenMeteoEnvOverrides] = useState(() => ({ lat: false, lon: false, timezone: false }));

  const [activeTab, setActiveTab] = useState('appearance');

  const TABS = [
    { id: 'devices', label: 'Devices' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'home', label: 'Home' },
    { id: 'sounds', label: 'Sounds' },
    { id: 'climate', label: 'Climate' },
    { id: 'events', label: 'Events' },
  ];

  const accentColorId = String(config?.ui?.accentColorId || 'neon-blue');
  const scheme = getUiScheme(accentColorId);

  const allowlistSave = useAsyncSave(saveAllowlists);
  const accentColorSave = useAsyncSave((nextAccentColorId) => saveAccentColorId(nextAccentColorId, selectedPanelName || null));
  const alertSoundsSave = useAsyncSave(saveAlertSounds);
  const homeValueSave = useAsyncSave(saveColorizeHomeValues);
  const homeBackgroundSave = useAsyncSave((homeBackground) => saveHomeBackground(homeBackground, selectedPanelName || null));
  const cardOpacitySave = useAsyncSave((cardOpacityScalePct) => saveCardOpacityScalePct(cardOpacityScalePct, selectedPanelName || null));
  const blurScaleSave = useAsyncSave((blurScalePct) => saveBlurScalePct(blurScalePct, selectedPanelName || null));
  const secondaryTextOpacitySave = useAsyncSave((secondaryTextOpacityPct) => saveSecondaryTextOpacityPct(secondaryTextOpacityPct, selectedPanelName || null));
  const secondaryTextSizeSave = useAsyncSave((secondaryTextSizePct) => saveSecondaryTextSizePct(secondaryTextSizePct, selectedPanelName || null));
  const secondaryTextColorSave = useAsyncSave((secondaryTextColorId) => saveSecondaryTextColorId(secondaryTextColorId, selectedPanelName || null));
  const primaryTextOpacitySave = useAsyncSave((primaryTextOpacityPct) => savePrimaryTextOpacityPct(primaryTextOpacityPct, selectedPanelName || null));
  const primaryTextSizeSave = useAsyncSave((primaryTextSizePct) => savePrimaryTextSizePct(primaryTextSizePct, selectedPanelName || null));
  const primaryTextColorSave = useAsyncSave((primaryTextColorId) => savePrimaryTextColorId(primaryTextColorId, selectedPanelName || null));
  const glowColorSave = useAsyncSave((glowColorId) => saveGlowColorId(glowColorId, selectedPanelName || null));
  const iconColorSave = useAsyncSave((iconColorId) => saveIconColorId(iconColorId, selectedPanelName || null));
  const iconOpacitySave = useAsyncSave((iconOpacityPct) => saveIconOpacityPct(iconOpacityPct, selectedPanelName || null));
  const iconSizeSave = useAsyncSave((iconSizePct) => saveIconSizePct(iconSizePct, selectedPanelName || null));
  const cardScaleSave = useAsyncSave((cardScalePct) => saveCardScalePct(cardScalePct, selectedPanelName || null));
  const homeRoomColsSave = useAsyncSave((homeRoomColumnsXl) => saveHomeRoomColumnsXl(homeRoomColumnsXl, selectedPanelName || null));
  const sensorColorsSave = useAsyncSave(saveSensorIndicatorColors);
  const climateTolSave = useAsyncSave(saveClimateTolerances);
  const climateColorsSave = useAsyncSave(saveClimateToleranceColors);
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

  const blurScaleFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.blurScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(0, Math.min(200, Math.round(raw)));
  }, [config?.ui?.blurScalePct]);

  const secondaryTextOpacityFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.secondaryTextOpacityPct);
    if (!Number.isFinite(raw)) return 45;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [config?.ui?.secondaryTextOpacityPct]);

  const secondaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.secondaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.secondaryTextSizePct]);

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

  const primaryTextSizeFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.primaryTextSizePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.primaryTextSizePct]);

  const primaryTextColorFromConfig = useMemo(() => {
    const raw = String(config?.ui?.primaryTextColorId ?? '').trim();
    if (!raw) return '';
    if (TOLERANCE_COLOR_CHOICES.some((c) => c.id === raw)) return raw;
    return '';
  }, [config?.ui?.primaryTextColorId]);

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

  const cardScaleFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.cardScalePct);
    if (!Number.isFinite(raw)) return 100;
    return Math.max(50, Math.min(200, Math.round(raw)));
  }, [config?.ui?.cardScalePct]);

  const homeRoomColumnsXlFromConfig = useMemo(() => {
    const raw = Number(config?.ui?.homeRoomColumnsXl);
    if (!Number.isFinite(raw)) return 3;
    return Math.max(1, Math.min(6, Math.round(raw)));
  }, [config?.ui?.homeRoomColumnsXl]);

  const [cardOpacityScaleDraft, setCardOpacityScaleDraft] = useState(() => 100);
  const [cardOpacityScaleDirty, setCardOpacityScaleDirty] = useState(false);
  const [cardOpacityScaleError, setCardOpacityScaleError] = useState(null);

  const [blurScaleDraft, setBlurScaleDraft] = useState(() => 100);
  const [blurScaleDirty, setBlurScaleDirty] = useState(false);
  const [blurScaleError, setBlurScaleError] = useState(null);

  const [secondaryTextOpacityDraft, setSecondaryTextOpacityDraft] = useState(() => 45);
  const [secondaryTextOpacityDirty, setSecondaryTextOpacityDirty] = useState(false);
  const [secondaryTextOpacityError, setSecondaryTextOpacityError] = useState(null);

  const [secondaryTextSizeDraft, setSecondaryTextSizeDraft] = useState(() => 100);
  const [secondaryTextSizeDirty, setSecondaryTextSizeDirty] = useState(false);
  const [secondaryTextSizeError, setSecondaryTextSizeError] = useState(null);

  const [secondaryTextColorDraft, setSecondaryTextColorDraft] = useState(() => '');
  const [secondaryTextColorDirty, setSecondaryTextColorDirty] = useState(false);
  const [secondaryTextColorError, setSecondaryTextColorError] = useState(null);

  const [primaryTextOpacityDraft, setPrimaryTextOpacityDraft] = useState(() => 100);
  const [primaryTextOpacityDirty, setPrimaryTextOpacityDirty] = useState(false);
  const [primaryTextOpacityError, setPrimaryTextOpacityError] = useState(null);

  const [primaryTextSizeDraft, setPrimaryTextSizeDraft] = useState(() => 100);
  const [primaryTextSizeDirty, setPrimaryTextSizeDirty] = useState(false);
  const [primaryTextSizeError, setPrimaryTextSizeError] = useState(null);

  const [primaryTextColorDraft, setPrimaryTextColorDraft] = useState(() => '');
  const [primaryTextColorDirty, setPrimaryTextColorDirty] = useState(false);
  const [primaryTextColorError, setPrimaryTextColorError] = useState(null);

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

  const [cardScaleDraft, setCardScaleDraft] = useState(() => 100);
  const [cardScaleDirty, setCardScaleDirty] = useState(false);
  const [cardScaleError, setCardScaleError] = useState(null);

  const [homeRoomColumnsXlDraft, setHomeRoomColumnsXlDraft] = useState(() => 3);
  const [homeRoomColumnsXlDirty, setHomeRoomColumnsXlDirty] = useState(false);
  const [homeRoomColumnsXlError, setHomeRoomColumnsXlError] = useState(null);

  const homeBackgroundFromConfig = useMemo(() => {
    const raw = (config?.ui?.homeBackground && typeof config.ui.homeBackground === 'object')
      ? config.ui.homeBackground
      : {};

    const enabled = raw.enabled === true;
    const url = (raw.url === null || raw.url === undefined) ? '' : String(raw.url);
    const opacityRaw = Number(raw.opacityPct);
    const opacityPct = Number.isFinite(opacityRaw)
      ? Math.max(0, Math.min(100, Math.round(opacityRaw)))
      : 35;

    return { enabled, url, opacityPct };
  }, [config?.ui?.homeBackground]);

  const [homeBackgroundDraft, setHomeBackgroundDraft] = useState(() => ({ enabled: false, url: '', opacityPct: 35 }));
  const [homeBackgroundDirty, setHomeBackgroundDirty] = useState(false);
  const [homeBackgroundError, setHomeBackgroundError] = useState(null);

  const [sensorColorsDraft, setSensorColorsDraft] = useState(() => ({ motion: 'warning', door: 'neon-red' }));
  const [sensorColorsDirty, setSensorColorsDirty] = useState(false);
  const [sensorColorsError, setSensorColorsError] = useState(null);

  const colorizeHomeValues = Boolean(config?.ui?.colorizeHomeValues);

  useEffect(() => {
    if (homeValueOpacityDirty) return;
    setHomeValueOpacityDraft(homeValueOpacityFromConfig);
  }, [homeValueOpacityDirty, homeValueOpacityFromConfig]);

  // When switching profiles, ensure the Home background editor reflects the selected profile.
  useEffect(() => {
    setHomeBackgroundError(null);
    setHomeBackgroundDirty(false);
    setHomeBackgroundDraft(homeBackgroundFromConfig);
  }, [selectedPanelName]);

  useEffect(() => {
    if (cardOpacityScaleDirty) return;
    setCardOpacityScaleDraft(cardOpacityScaleFromConfig);
  }, [cardOpacityScaleDirty, cardOpacityScaleFromConfig]);

  useEffect(() => {
    if (blurScaleDirty) return;
    setBlurScaleDraft(blurScaleFromConfig);
  }, [blurScaleDirty, blurScaleFromConfig]);

  useEffect(() => {
    if (secondaryTextOpacityDirty) return;
    setSecondaryTextOpacityDraft(secondaryTextOpacityFromConfig);
  }, [secondaryTextOpacityDirty, secondaryTextOpacityFromConfig]);

  useEffect(() => {
    if (secondaryTextSizeDirty) return;
    setSecondaryTextSizeDraft(secondaryTextSizeFromConfig);
  }, [secondaryTextSizeDirty, secondaryTextSizeFromConfig]);

  useEffect(() => {
    if (secondaryTextColorDirty) return;
    setSecondaryTextColorDraft(secondaryTextColorFromConfig);
  }, [secondaryTextColorDirty, secondaryTextColorFromConfig]);

  useEffect(() => {
    if (primaryTextOpacityDirty) return;
    setPrimaryTextOpacityDraft(primaryTextOpacityFromConfig);
  }, [primaryTextOpacityDirty, primaryTextOpacityFromConfig]);

  useEffect(() => {
    if (primaryTextSizeDirty) return;
    setPrimaryTextSizeDraft(primaryTextSizeFromConfig);
  }, [primaryTextSizeDirty, primaryTextSizeFromConfig]);

  useEffect(() => {
    if (primaryTextColorDirty) return;
    setPrimaryTextColorDraft(primaryTextColorFromConfig);
  }, [primaryTextColorDirty, primaryTextColorFromConfig]);

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
    if (cardScaleDirty) return;
    setCardScaleDraft(cardScaleFromConfig);
  }, [cardScaleDirty, cardScaleFromConfig]);

  useEffect(() => {
    if (homeRoomColumnsXlDirty) return;
    setHomeRoomColumnsXlDraft(homeRoomColumnsXlFromConfig);
  }, [homeRoomColumnsXlDirty, homeRoomColumnsXlFromConfig]);

  useEffect(() => {
    if (homeBackgroundDirty) return;
    setHomeBackgroundDraft(homeBackgroundFromConfig);
  }, [homeBackgroundDirty, homeBackgroundFromConfig]);

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

  // Autosave: Home background.
  useEffect(() => {
    if (!connected) return;
    if (!homeBackgroundDirty) return;

    const t = setTimeout(async () => {
      setHomeBackgroundError(null);
      try {
        const trimmedUrl = String(homeBackgroundDraft.url || '').trim();
        const enabled = homeBackgroundDraft.enabled === true;
        const opacityRaw = Number(homeBackgroundDraft.opacityPct);
        const opacityPct = Number.isFinite(opacityRaw)
          ? Math.max(0, Math.min(100, Math.round(opacityRaw)))
          : 35;

        // If enabled but missing URL, force-disable to avoid a save loop.
        if (enabled && !trimmedUrl) {
          setHomeBackgroundDraft((prev) => ({ ...prev, enabled: false }));
          setHomeBackgroundError('Enter an image URL before enabling.');
          setHomeBackgroundDirty(false);
          return;
        }

        await homeBackgroundSave.run({
          enabled,
          url: trimmedUrl || null,
          opacityPct,
        });
        setHomeBackgroundDirty(false);
      } catch (e) {
        setHomeBackgroundError(e?.message || String(e));
      }
    }, 700);

    return () => clearTimeout(t);
  }, [connected, homeBackgroundDirty, homeBackgroundDraft]);

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
    let cancelled = false;

    const load = async () => {
      try {
        setBackgroundFilesError(null);
        const files = await fetchBackgroundFiles();
        if (!cancelled) setBackgroundFiles(files);
      } catch (e) {
        if (!cancelled) setBackgroundFilesError(e?.message || String(e));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const [newRoomName, setNewRoomName] = useState('');
  const [labelDrafts, setLabelDrafts] = useState(() => ({}));

  const [labelSaveState, setLabelSaveState] = useState(() => ({}));
  const labelSaveTimersRef = useRef(new Map());

  const mainAllowedIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.mainAllowedDeviceIds)
      ? config.ui.mainAllowedDeviceIds
      : [];
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.mainAllowedDeviceIds]);

  const ctrlAllowedIds = useMemo(() => {
    const ids = Array.isArray(config?.ui?.ctrlAllowedDeviceIds)
      ? config.ui.ctrlAllowedDeviceIds
      : (Array.isArray(config?.ui?.allowedDeviceIds) ? config.ui.allowedDeviceIds : []);
    return new Set(ids.map((v) => String(v)));
  }, [config?.ui?.ctrlAllowedDeviceIds, config?.ui?.allowedDeviceIds]);

  const mainLocked = Boolean(config?.ui?.mainAllowlistLocked);
  const ctrlLocked = Boolean(config?.ui?.ctrlAllowlistLocked);

  const allSwitchLikeDevices = useMemo(() => {
    const devices = (config?.sensors || [])
      .map((d) => {
        const st = statuses?.[d.id] || null;
        const attrs = st?.attributes || {};
        const commands = Array.isArray(st?.commands) ? st.commands : [];

        const isSwitchAttr = typeof attrs.switch === 'string' && (attrs.switch === 'on' || attrs.switch === 'off');
        const isSwitchCmd = commands.includes('on') || commands.includes('off') || commands.includes('toggle');
        if (!isSwitchAttr && !isSwitchCmd) return null;

        return {
          id: String(d.id),
          label: d.label || st?.label || String(d.id),
        };
      })
      .filter(Boolean);

    devices.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return devices;
  }, [config?.sensors, statuses]);

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

  const setAllowed = async (deviceId, list, nextAllowed) => {
    setError(null);
    try {
      const nextMain = new Set(Array.from(mainAllowedIds));
      const nextCtrl = new Set(Array.from(ctrlAllowedIds));
      const target = list === 'main' ? nextMain : nextCtrl;
      if (nextAllowed) target.add(String(deviceId));
      else target.delete(String(deviceId));

      const payload = {};
      if (!mainLocked) payload.mainAllowedDeviceIds = Array.from(nextMain);
      if (!ctrlLocked) payload.ctrlAllowedDeviceIds = Array.from(nextCtrl);
      await allowlistSave.run(payload);
    } catch (e) {
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
    <div className="w-full h-full overflow-auto utility-page">
      <div className="w-full">
        <div className="utility-panel p-3 md:p-4">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
            Settings
          </div>
          <div className="mt-3 flex items-center gap-2 overflow-x-auto">
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
                <option value="">Global defaults</option>
                {panelNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <div
                className="mt-1 jvs-secondary-text text-white/60"
                style={{ fontSize: 'calc(11px * var(--jvs-secondary-text-size-scale, 1))' }}
              >
                {selectedPanelName ? 'Panel-specific overrides enabled.' : 'Editing global defaults.'}
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
        </div>

        {activeTab === 'devices' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Config
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Device Visibility
            </div>
            <div className="mt-1 text-xs text-white/45">
              Choose where each device appears: Home and/or Controls.
            </div>

            {mainLocked ? (
              <div className="mt-2 text-[11px] text-neon-red">
                Home list locked by server env var UI_ALLOWED_MAIN_DEVICE_IDS.
              </div>
            ) : null}
            {ctrlLocked ? (
              <div className="mt-2 text-[11px] text-neon-red">
                Controls list locked by server env var UI_ALLOWED_CTRL_DEVICE_IDS (or legacy UI_ALLOWED_DEVICE_IDS).
              </div>
            ) : null}
            {error ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {error}</div>
            ) : null}

            <div className="mt-2 text-xs text-white/45">
              {statusText(allowlistSave.status)}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {allSwitchLikeDevices.length ? (
                allSwitchLikeDevices.map((d) => {
                  const isMain = mainAllowedIds.has(String(d.id));
                  const isCtrl = ctrlAllowedIds.has(String(d.id));
                  return (
                    <div
                      key={d.id}
                      className={`rounded-2xl border p-4 bg-white/5 border-white/10 ${!connected ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/80 truncate">
                            {d.label}
                          </div>
                          <div className="mt-1 text-xs text-white/45 truncate">ID: {d.id}</div>
                        </div>

                        <div className="shrink-0 flex items-center gap-4">
                          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                            <input
                              type="checkbox"
                              className={`h-5 w-5 ${scheme.checkboxAccent}`}
                              disabled={!connected || allowlistSave.status === 'saving' || mainLocked}
                              checked={isMain}
                              onChange={(e) => setAllowed(d.id, 'main', e.target.checked)}
                            />
                            Home
                          </label>

                          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 select-none">
                            <input
                              type="checkbox"
                              className={`h-5 w-5 ${scheme.checkboxAccent}`}
                              disabled={!connected || allowlistSave.status === 'saving' || ctrlLocked}
                              checked={isCtrl}
                              onChange={(e) => setAllowed(d.id, 'ctrl', e.target.checked)}
                            />
                            Controls
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-white/45">No switch devices discovered.</div>
              )}
            </div>

            {!connected ? (
              <div className="mt-3 text-xs text-white/45">Server offline: editing disabled.</div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'appearance' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Appearance
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
            </div>

            </div>
          </div>
        ) : null}

        {activeTab === 'home' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Home
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Background
            </div>
            <div className="mt-1 text-xs text-white/45">
              Set an image URL to show behind all Home controls.
            </div>

            <div className="mt-4 utility-group p-4">
              <label className="flex items-center justify-between gap-4 select-none">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Enable background
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    When enabled, the image renders behind the Home dashboard.
                  </div>
                </div>

                <input
                  type="checkbox"
                  className={`h-5 w-5 ${scheme.checkboxAccent}`}
                  disabled={!connected || busy || homeBackgroundSave.status === 'saving'}
                  checked={homeBackgroundDraft.enabled}
                  onChange={(e) => {
                    const nextEnabled = !!e.target.checked;
                    const trimmedUrl = String(homeBackgroundDraft.url || '').trim();
                    setHomeBackgroundError(null);

                    if (nextEnabled && !trimmedUrl) {
                      setHomeBackgroundError('Enter an image URL before enabling.');
                      return;
                    }

                    setHomeBackgroundDirty(true);
                    setHomeBackgroundDraft((prev) => ({ ...prev, enabled: nextEnabled }));
                  }}
                />
              </label>

              <label className="block mt-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                  Image URL
                </div>
                <input
                  type="text"
                  value={homeBackgroundDraft.url}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const nextUrl = String(e.target.value);
                    setHomeBackgroundError(null);
                    setHomeBackgroundDirty(true);
                    setHomeBackgroundDraft((prev) => {
                      const trimmed = nextUrl.trim();
                      // If the user clears the URL, force-disable to avoid an invalid enabled state.
                      const nextEnabled = prev.enabled && trimmed.length ? prev.enabled : false;
                      return { ...prev, url: nextUrl, enabled: nextEnabled };
                    });
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                  placeholder="https://example.com/background.jpg (or /path/on-this-server.jpg)"
                />
              </label>

              <label className="block mt-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                  Or pick a server background
                </div>
                <select
                  value=""
                  disabled={!connected || busy || !backgroundFiles.length}
                  onChange={(e) => {
                    const file = String(e.target.value || '').trim();
                    if (!file) return;

                    setHomeBackgroundError(null);
                    setHomeBackgroundDirty(true);
                    setHomeBackgroundDraft((prev) => {
                      const nextUrl = `/backgrounds/${encodeURIComponent(file)}`;
                      const nextEnabled = true;
                      return { ...prev, url: nextUrl, enabled: nextEnabled };
                    });

                    // reset select back to placeholder
                    try {
                      e.target.value = '';
                    } catch {
                      // ignore
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90"
                >
                  <option value="">
                    {backgroundFilesError
                      ? `Backgrounds unavailable (${backgroundFilesError})`
                      : (backgroundFiles.length ? 'Select a background…' : 'No backgrounds found')}
                  </option>
                  {backgroundFiles.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-white/45">
                  Put images in <span className="text-white/70">server/data/backgrounds</span> to appear here.
                </div>
              </label>

              <div className="mt-4 utility-group p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      Opacity
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Lower = more translucent.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={homeBackgroundDraft.opacityPct}
                      disabled={!connected || busy}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 35;
                        setHomeBackgroundError(null);
                        setHomeBackgroundDirty(true);
                        setHomeBackgroundDraft((prev) => ({ ...prev, opacityPct: next }));
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
                  value={homeBackgroundDraft.opacityPct}
                  disabled={!connected || busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 35;
                    setHomeBackgroundError(null);
                    setHomeBackgroundDirty(true);
                    setHomeBackgroundDraft((prev) => ({ ...prev, opacityPct: next }));
                  }}
                  className="mt-3 w-full"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/45">
                    {homeBackgroundDirty ? 'Pending changes…' : 'Saved'}
                  </div>
                  <div className="text-xs text-white/45">
                    {statusText(homeBackgroundSave.status)}
                  </div>
                </div>
              </div>

              {homeBackgroundError ? (
                <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {homeBackgroundError}</div>
              ) : null}
            </div>

              <div className="mt-4 utility-group p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                  Sensor Badge Colors
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Controls the color of the "Motion" and "Door" badges on Home.
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[{ k: 'motion', label: 'Motion' }, { k: 'door', label: 'Door' }].map(({ k, label }) => (
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

              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
                  Layout
                </div>
                <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                  Rooms & Labels
                </div>
                <div className="mt-1 text-xs text-white/45">
                  These controls affect Home and the Climate (heatmap) view.
                </div>

                <div className="mt-4 utility-group p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Manual Rooms</div>
                  <div className="mt-1 text-xs text-white/45">
                    Add/remove rooms that aren’t discovered from Hubitat. Rooms can be placed/resized on the Climate page.
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

                <div className="mt-4 utility-group p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Freeform Text</div>
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

        {activeTab === 'sounds' ? (
          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Sounds
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Activity Alerts
            </div>
            <div className="mt-1 text-xs text-white/45">
              Pick which server-hosted sound file plays for each event.
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

            <div className="mt-3 utility-group p-4">
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
  );
};

export default ConfigPanel;
