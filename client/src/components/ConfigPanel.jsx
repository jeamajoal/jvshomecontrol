import React, { useEffect, useMemo, useRef, useState } from 'react';

import { API_HOST } from '../apiHost';
import { useAppState } from '../appState';
import {
  TOLERANCE_COLOR_CHOICES,
  normalizeToleranceColorId,
} from '../toleranceColors';

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

async function saveColorScheme(colorScheme) {
  const res = await fetch(`${API_HOST}/api/ui/color-scheme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ colorScheme }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Color scheme save failed (${res.status})`);
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

const UI_COLOR_SCHEMES = {
  'electric-blue': {
    actionButton: 'text-neon-blue border-neon-blue/30 bg-neon-blue/10',
    checkboxAccent: 'accent-neon-blue',
    swatch: 'bg-neon-blue',
  },
  'classic-blue': {
    actionButton: 'text-primary border-primary/30 bg-primary/10',
    checkboxAccent: 'accent-primary',
    swatch: 'bg-primary',
  },
  emerald: {
    actionButton: 'text-success border-success/30 bg-success/10',
    checkboxAccent: 'accent-success',
    swatch: 'bg-success',
  },
  amber: {
    actionButton: 'text-warning border-warning/30 bg-warning/10',
    checkboxAccent: 'accent-warning',
    swatch: 'bg-warning',
  },
  'neon-green': {
    actionButton: 'text-neon-green border-neon-green/30 bg-neon-green/10',
    checkboxAccent: 'accent-neon-green',
    swatch: 'bg-neon-green',
  },
  'neon-red': {
    actionButton: 'text-neon-red border-neon-red/30 bg-neon-red/10',
    checkboxAccent: 'accent-neon-red',
    swatch: 'bg-neon-red',
  },
  slate: {
    actionButton: 'text-slate-200 border-slate-500/35 bg-slate-500/15',
    checkboxAccent: 'accent-slate-400',
    swatch: 'bg-slate-500',
  },
  stone: {
    actionButton: 'text-stone-200 border-stone-400/35 bg-stone-400/15',
    checkboxAccent: 'accent-stone-400',
    swatch: 'bg-stone-400',
  },
  zinc: {
    actionButton: 'text-zinc-200 border-zinc-400/35 bg-zinc-400/15',
    checkboxAccent: 'accent-zinc-400',
    swatch: 'bg-zinc-400',
  },
  white: {
    actionButton: 'text-white border-white/25 bg-white/10',
    checkboxAccent: 'accent-white',
    swatch: 'bg-white',
  },
  copper: {
    actionButton: 'text-amber-300 border-amber-700/40 bg-amber-700/20',
    checkboxAccent: 'accent-amber-500',
    swatch: 'bg-amber-700',
  },
};

const COLOR_SCHEME_CHOICES = [
  { id: 'classic-blue', label: 'Classic Blue', vibe: 'Classy' },
  { id: 'emerald', label: 'Emerald', vibe: 'Classy' },
  { id: 'amber', label: 'Amber', vibe: 'Classy' },
  { id: 'stone', label: 'Stone (Tan)', vibe: 'Classy' },
  { id: 'slate', label: 'Slate (Charcoal)', vibe: 'Classy' },
  { id: 'zinc', label: 'Zinc', vibe: 'Classy' },
  { id: 'white', label: 'White', vibe: 'Classy' },
  { id: 'copper', label: 'Copper (Brown)', vibe: 'Classy' },
  { id: 'electric-blue', label: 'Electric Blue', vibe: 'Wild' },
  { id: 'neon-green', label: 'Neon Green', vibe: 'Wild' },
  { id: 'neon-red', label: 'Neon Red', vibe: 'Wild' },
];

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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [soundFiles, setSoundFiles] = useState([]);
  const [soundFilesError, setSoundFilesError] = useState(null);
  const [openMeteoDraft, setOpenMeteoDraft] = useState(() => ({ lat: '', lon: '', timezone: 'auto' }));
  const [openMeteoDirty, setOpenMeteoDirty] = useState(false);
  const [openMeteoError, setOpenMeteoError] = useState(null);
  const [openMeteoEnvOverrides, setOpenMeteoEnvOverrides] = useState(() => ({ lat: false, lon: false, timezone: false }));

  const colorSchemeId = String(config?.ui?.colorScheme || 'electric-blue');
  const scheme = UI_COLOR_SCHEMES[colorSchemeId] || UI_COLOR_SCHEMES['electric-blue'];

  const allowlistSave = useAsyncSave(saveAllowlists);
  const colorSchemeSave = useAsyncSave(saveColorScheme);
  const alertSoundsSave = useAsyncSave(saveAlertSounds);
  const homeValueSave = useAsyncSave(saveColorizeHomeValues);
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

  const [sensorColorsDraft, setSensorColorsDraft] = useState(() => ({ motion: 'warning', door: 'neon-red' }));
  const [sensorColorsDirty, setSensorColorsDirty] = useState(false);
  const [sensorColorsError, setSensorColorsError] = useState(null);

  const colorizeHomeValues = Boolean(config?.ui?.colorizeHomeValues);

  useEffect(() => {
    if (homeValueOpacityDirty) return;
    setHomeValueOpacityDraft(homeValueOpacityFromConfig);
  }, [homeValueOpacityDirty, homeValueOpacityFromConfig]);

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

  return (
    <div className="w-full h-full overflow-auto utility-page">
      <div className="w-full">
        <div className="utility-panel p-4 md:p-6">
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

          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Appearance
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Color Scheme
            </div>
            <div className="mt-1 text-xs text-white/45">
              Pick a single accent color for the UI.
            </div>

            {colorSchemeSave.error ? (
              <div className="mt-2 text-[11px] text-neon-red break-words">Save failed: {colorSchemeSave.error}</div>
            ) : null}

            <div className="mt-2 text-xs text-white/45">
              {statusText(colorSchemeSave.status)}
            </div>

            <div className="mt-4">
              {['Classy', 'Wild'].map((vibe) => (
                <div key={vibe} className={vibe === 'Wild' ? 'mt-4' : ''}>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">
                    {vibe}
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {COLOR_SCHEME_CHOICES.filter((c) => c.vibe === vibe).map((choice) => {
                      const isSelected = choice.id === colorSchemeId;
                      const choiceScheme = UI_COLOR_SCHEMES[choice.id] || UI_COLOR_SCHEMES['electric-blue'];
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          disabled={!connected || busy || colorSchemeSave.status === 'saving'}
                          onClick={async () => {
                            try {
                              await colorSchemeSave.run(choice.id);
                            } catch {
                              // handled by controller
                            }
                          }}
                          className={`rounded-xl border px-3 py-3 text-left transition-colors ${isSelected ? 'border-white/30 bg-white/10' : 'border-white/10 bg-black/20 hover:bg-white/5'} ${(!connected || busy || colorSchemeSave.status === 'saving') ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-3.5 w-3.5 rounded-full ${choiceScheme.swatch}`} />
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
              ))}
            </div>
          </div>

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
                Home Sensor Indicator Colors
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

          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Rooms
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Manual Rooms
            </div>
            <div className="mt-1 text-xs text-white/45">
              Add/remove rooms that aren’t discovered from Hubitat. They can be placed/resized on the Environment page.
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

          <div className="mt-4 utility-panel p-4 md:p-6">
            <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
              Labels
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Freeform Text
            </div>
            <div className="mt-1 text-xs text-white/45">
              Add labels here, then position/resize them on the Environment page in Edit mode.
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
      </div>
    </div>
  );
};

export default ConfigPanel;
