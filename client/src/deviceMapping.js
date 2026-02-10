const asNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

const asText = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

const toLowerText = (value) => {
  const s = asText(value);
  return s ? s.toLowerCase() : null;
};

// ── Internal device type taxonomy ─────────────────────────────────────────
// Ordered from most-specific to least-specific for detection priority.
export const INTERNAL_DEVICE_TYPES = Object.freeze({
  // Sophisticated actuators (detected before generic switch/dimmer)
  THERMOSTAT: 'thermostat',
  FAN_CONTROLLER: 'fan_controller',
  COLOR_LIGHT: 'color_light',
  CT_LIGHT: 'ct_light',
  SHADE: 'shade',
  LOCK: 'lock',
  GARAGE: 'garage',
  VALVE: 'valve',
  SIREN: 'siren',

  // Generic actuators
  DIMMER: 'dimmer',
  SWITCH: 'switch',

  // Media
  MEDIA_PLAYER: 'media_player',

  // Input-only
  BUTTON: 'button',
  SENSOR: 'sensor',
  UNKNOWN: 'unknown',
});

export function normalizeCommandSchemas(raw) {
  if (!Array.isArray(raw)) return [];

  // Accept:
  // - ['on','off']
  // - [{command:'on', parameters:[...]}]
  // - Maker API odd shapes (best-effort)
  return raw
    .map((item) => {
      if (!item) return null;

      if (typeof item === 'string') {
        const command = item.trim();
        if (!command) return null;
        return { command, parameters: [] };
      }

      if (typeof item === 'object') {
        const command = asText(item.command) || asText(item.name);
        if (!command) return null;
        const paramsRaw = Array.isArray(item.parameters) ? item.parameters : [];
        const parameters = paramsRaw
          .map((p) => {
            if (!p || typeof p !== 'object') return null;
            const name = asText(p.name);
            const type = asText(p.type);
            if (!name && !type) return null;
            return { ...(name ? { name } : {}), ...(type ? { type } : {}) };
          })
          .filter(Boolean);

        return { command, parameters };
      }

      return null;
    })
    .filter(Boolean);
}

export function getCommandNameSet(commandSchemas) {
  const schemas = normalizeCommandSchemas(commandSchemas);
  return new Set(schemas.map((s) => s.command));
}

export function filterCommandSchemasByAllowlist(commandSchemas, allowlist) {
  const schemas = normalizeCommandSchemas(commandSchemas);
  if (allowlist === null) return schemas;
  const allowSet = new Set((Array.isArray(allowlist) ? allowlist : []).map(String));
  return schemas.filter((s) => allowSet.has(String(s.command)));
}

// ── Device type inference ─────────────────────────────────────────────────
// Tries the most specific types first so that e.g. a thermostat with a switch
// attribute isn't misclassified as a plain switch.

export function inferInternalDeviceType({ hubitatType, capabilities, attributes, state, commandSchemas }) {
  const typeStr = toLowerText(hubitatType) || '';
  const caps = Array.isArray(capabilities) ? capabilities.map((c) => String(c || '').trim()).filter(Boolean) : [];
  const capSet = new Set(caps);
  const attrs = (attributes && typeof attributes === 'object') ? attributes : {};
  const cmdSet = getCommandNameSet(commandSchemas);

  // ── Thermostat ──────────────────────────────────────────────────────────
  const isThermostat =
    capSet.has('Thermostat') ||
    capSet.has('ThermostatHeatingSetpoint') ||
    capSet.has('ThermostatCoolingSetpoint') ||
    capSet.has('ThermostatSetpoint') ||
    cmdSet.has('setHeatingSetpoint') ||
    cmdSet.has('setCoolingSetpoint') ||
    cmdSet.has('setThermostatMode') ||
    typeStr.includes('thermostat');
  if (isThermostat) return INTERNAL_DEVICE_TYPES.THERMOSTAT;

  // ── Lock ────────────────────────────────────────────────────────────────
  const isLock =
    capSet.has('Lock') ||
    (cmdSet.has('lock') && cmdSet.has('unlock')) ||
    typeStr.includes('lock');
  if (isLock) return INTERNAL_DEVICE_TYPES.LOCK;

  // ── Garage door ─────────────────────────────────────────────────────────
  const isGarage =
    capSet.has('GarageDoorControl') ||
    attrs.door !== undefined ||
    typeStr.includes('garage');
  if (isGarage) return INTERNAL_DEVICE_TYPES.GARAGE;

  // ── Window shade / blind ────────────────────────────────────────────────
  const isShade =
    capSet.has('WindowShade') ||
    capSet.has('WindowBlind') ||
    cmdSet.has('setPosition') ||
    attrs.windowShade !== undefined ||
    typeStr.includes('shade') ||
    typeStr.includes('blind');
  if (isShade) return INTERNAL_DEVICE_TYPES.SHADE;

  // ── Valve ───────────────────────────────────────────────────────────────
  const isValve =
    capSet.has('Valve') ||
    attrs.valve !== undefined ||
    typeStr.includes('valve');
  if (isValve) return INTERNAL_DEVICE_TYPES.VALVE;

  // ── Siren ───────────────────────────────────────────────────────────────
  const isSiren =
    capSet.has('Alarm') ||
    cmdSet.has('siren') ||
    cmdSet.has('strobe') ||
    typeStr.includes('siren');
  if (isSiren) return INTERNAL_DEVICE_TYPES.SIREN;

  // ── Color light (hue/saturation) ────────────────────────────────────────
  const hasColor =
    capSet.has('ColorControl') ||
    cmdSet.has('setColor') ||
    cmdSet.has('setHue');
  if (hasColor) return INTERNAL_DEVICE_TYPES.COLOR_LIGHT;

  // ── Color temperature light ─────────────────────────────────────────────
  const hasCT =
    capSet.has('ColorTemperature') ||
    cmdSet.has('setColorTemperature');
  if (hasCT) return INTERNAL_DEVICE_TYPES.CT_LIGHT;

  // ── Fan controller (speed, not just on/off) ─────────────────────────────
  const isFan =
    capSet.has('FanControl') ||
    cmdSet.has('setSpeed') ||
    cmdSet.has('cycleSpeed') ||
    typeStr.includes('fan');
  if (isFan) return INTERNAL_DEVICE_TYPES.FAN_CONTROLLER;

  // ── Media player ────────────────────────────────────────────────────────
  if (typeStr.includes('chromecast') || capSet.has('MediaTransport') || capSet.has('AudioVolume') ||
      capSet.has('MusicPlayer') || capSet.has('SpeechSynthesis') ||
      typeStr.includes('media') || typeStr.includes('speaker') || typeStr.includes('sonos') ||
      typeStr.includes('roku') || typeStr.includes('tv')) {
    return INTERNAL_DEVICE_TYPES.MEDIA_PLAYER;
  }

  // ── Generic switch / dimmer ─────────────────────────────────────────────
  const sw = toLowerText(attrs.switch) || toLowerText(state);
  const hasSwitchAttr = sw === 'on' || sw === 'off';
  const looksLikeSwitch = hasSwitchAttr || cmdSet.has('on') || cmdSet.has('off') || cmdSet.has('toggle') || capSet.has('Switch');

  if (looksLikeSwitch) {
    const looksLikeDimmer = cmdSet.has('setLevel') || asNumber(attrs.level) !== null || capSet.has('SwitchLevel');
    if (looksLikeDimmer) return INTERNAL_DEVICE_TYPES.DIMMER;
    return INTERNAL_DEVICE_TYPES.SWITCH;
  }

  // ── Button ──────────────────────────────────────────────────────────────
  if (capSet.has('PushableButton') || capSet.has('HoldableButton') || capSet.has('DoubleTapableButton')) {
    return INTERNAL_DEVICE_TYPES.BUTTON;
  }

  // Fallback: if it has no actuator-ish commands, treat as sensor.
  if (capSet.has('Sensor')) return INTERNAL_DEVICE_TYPES.SENSOR;

  return INTERNAL_DEVICE_TYPES.UNKNOWN;
}

// ── Auto-assign control icon IDs based on capabilities ────────────────────
// Returns an array of control-icon manifest IDs that should be shown for a
// device, used as fallback when the user has not manually assigned icons.

export function inferControlIconIds({ capabilities, attributes, commandSchemas }) {
  const caps = Array.isArray(capabilities) ? capabilities.map((c) => String(c || '').trim()).filter(Boolean) : [];
  const capSet = new Set(caps);
  const attrs = (attributes && typeof attributes === 'object') ? attributes : {};
  const cmdSet = getCommandNameSet(commandSchemas);
  const ids = [];

  // Toggle controls
  if (cmdSet.has('lock') && cmdSet.has('unlock')) ids.push('lock-toggle');
  if (attrs.door !== undefined || capSet.has('GarageDoorControl')) ids.push('garage-toggle');
  if (attrs.windowShade !== undefined || capSet.has('WindowShade') || capSet.has('WindowBlind')) ids.push('shade-toggle');
  if (attrs.valve !== undefined || capSet.has('Valve')) ids.push('valve-toggle');
  if (cmdSet.has('siren') || cmdSet.has('strobe') || capSet.has('Alarm')) ids.push('siren-toggle');

  // Fan on/off
  if (capSet.has('FanControl') || cmdSet.has('setSpeed') || cmdSet.has('cycleSpeed')) ids.push('fan-toggle');

  // Switch/light toggles (only if none of the specific toggles above matched)
  if (!ids.length) {
    if (cmdSet.has('on') || cmdSet.has('off') || cmdSet.has('toggle')) {
      const isLightish = capSet.has('SwitchLevel') || capSet.has('ColorControl') || capSet.has('ColorTemperature') || cmdSet.has('setLevel');
      ids.push(isLightish ? 'light-toggle' : 'power-toggle');
    }
  }

  // Level / brightness
  if (cmdSet.has('setLevel') || capSet.has('SwitchLevel')) ids.push('brightness-slider');

  // Color controls
  if (cmdSet.has('setHue') || capSet.has('ColorControl')) ids.push('color-wheel');
  if (cmdSet.has('setSaturation')) ids.push('saturation-slider');
  if (cmdSet.has('setColorTemperature') || capSet.has('ColorTemperature')) ids.push('color-temp-slider');

  // Shade position
  if (cmdSet.has('setPosition')) ids.push('shade-position-slider');

  // Fan speed
  if (cmdSet.has('setSpeed') || cmdSet.has('cycleSpeed')) ids.push('fan-speed');

  // Thermostat
  if (cmdSet.has('setThermostatMode') || capSet.has('Thermostat')) ids.push('thermostat-mode');
  if (cmdSet.has('setHeatingSetpoint') || cmdSet.has('setCoolingSetpoint') || cmdSet.has('setThermostatSetpoint')) ids.push('thermostat-setpoint');
  if (cmdSet.has('setThermostatFanMode')) ids.push('thermostat-fan-mode');

  // Media
  if (cmdSet.has('play') || cmdSet.has('pause') || capSet.has('MediaTransport') || capSet.has('MusicPlayer')) ids.push('media-transport');
  if (cmdSet.has('setVolume') || capSet.has('AudioVolume')) ids.push('volume-knob');
  if (cmdSet.has('mute') || cmdSet.has('unmute')) ids.push('mute-toggle');

  return ids;
}

export function mapDeviceToControls({ deviceId, label, hubitatType, capabilities, attributes, state, commandSchemas }) {
  const id = asText(deviceId);
  if (!id) return [];

  const safeLabel = asText(label) || id;
  const attrs = (attributes && typeof attributes === 'object') ? attributes : {};
  const cmdSet = getCommandNameSet(commandSchemas);

  const internalType = inferInternalDeviceType({ hubitatType, capabilities, attributes: attrs, state, commandSchemas });

  // Switch-like devices (includes dimmer, color light, ct light, fan, siren, etc.)
  const switchTypes = new Set([
    INTERNAL_DEVICE_TYPES.SWITCH,
    INTERNAL_DEVICE_TYPES.DIMMER,
    INTERNAL_DEVICE_TYPES.COLOR_LIGHT,
    INTERNAL_DEVICE_TYPES.CT_LIGHT,
    INTERNAL_DEVICE_TYPES.FAN_CONTROLLER,
    INTERNAL_DEVICE_TYPES.SIREN,
  ]);

  if (switchTypes.has(internalType)) {
    const sw = toLowerText(attrs.switch) || toLowerText(state);
    const isOn = sw === 'on';
    return [
      {
        kind: 'switch',
        deviceId: id,
        label: safeLabel,
        isOn,
        canOn: cmdSet.has('on'),
        canOff: cmdSet.has('off'),
        canToggle: cmdSet.has('toggle'),
        internalType,
      },
    ];
  }

  // Lock
  if (internalType === INTERNAL_DEVICE_TYPES.LOCK) {
    const lockState = toLowerText(attrs.lock);
    return [
      {
        kind: 'lock',
        deviceId: id,
        label: safeLabel,
        isLocked: lockState === 'locked',
        canLock: cmdSet.has('lock'),
        canUnlock: cmdSet.has('unlock'),
        internalType,
      },
    ];
  }

  // Garage door
  if (internalType === INTERNAL_DEVICE_TYPES.GARAGE) {
    const doorState = toLowerText(attrs.door);
    return [
      {
        kind: 'garage',
        deviceId: id,
        label: safeLabel,
        isOpen: doorState === 'open' || doorState === 'opening',
        state: doorState || 'unknown',
        canOpen: cmdSet.has('open'),
        canClose: cmdSet.has('close'),
        internalType,
      },
    ];
  }

  // Shade / blind
  if (internalType === INTERNAL_DEVICE_TYPES.SHADE) {
    const shadeState = toLowerText(attrs.windowShade);
    const position = asNumber(attrs.position);
    return [
      {
        kind: 'shade',
        deviceId: id,
        label: safeLabel,
        isOpen: shadeState === 'open' || shadeState === 'opening',
        state: shadeState || 'unknown',
        position: position !== null ? position : (shadeState === 'open' ? 100 : 0),
        canOpen: cmdSet.has('open'),
        canClose: cmdSet.has('close'),
        canSetPosition: cmdSet.has('setPosition'),
        internalType,
      },
    ];
  }

  // Valve
  if (internalType === INTERNAL_DEVICE_TYPES.VALVE) {
    const valveState = toLowerText(attrs.valve);
    return [
      {
        kind: 'valve',
        deviceId: id,
        label: safeLabel,
        isOpen: valveState === 'open',
        canOpen: cmdSet.has('open'),
        canClose: cmdSet.has('close'),
        internalType,
      },
    ];
  }

  // Thermostat
  if (internalType === INTERNAL_DEVICE_TYPES.THERMOSTAT) {
    return [
      {
        kind: 'thermostat',
        deviceId: id,
        label: safeLabel,
        temperature: asNumber(attrs.temperature),
        heatingSetpoint: asNumber(attrs.heatingSetpoint),
        coolingSetpoint: asNumber(attrs.coolingSetpoint),
        thermostatSetpoint: asNumber(attrs.thermostatSetpoint),
        thermostatMode: toLowerText(attrs.thermostatMode) || 'off',
        thermostatFanMode: toLowerText(attrs.thermostatFanMode) || 'auto',
        thermostatOperatingState: toLowerText(attrs.thermostatOperatingState) || 'idle',
        humidity: asNumber(attrs.humidity),
        canSetHeating: cmdSet.has('setHeatingSetpoint'),
        canSetCooling: cmdSet.has('setCoolingSetpoint'),
        canSetMode: cmdSet.has('setThermostatMode'),
        canSetFanMode: cmdSet.has('setThermostatFanMode'),
        internalType,
      },
    ];
  }

  // Media player
  if (internalType === INTERNAL_DEVICE_TYPES.MEDIA_PLAYER) {
    const transport = toLowerText(attrs.transportStatus) || toLowerText(attrs.playbackStatus) || toLowerText(attrs.status);
    return [
      {
        kind: 'media',
        deviceId: id,
        label: safeLabel,
        isPlaying: transport === 'playing',
        isPaused: transport === 'paused',
        volume: asNumber(attrs.volume),
        mute: toLowerText(attrs.mute) === 'muted',
        trackDescription: asText(attrs.trackDescription),
        canPlay: cmdSet.has('play'),
        canPause: cmdSet.has('pause'),
        canStop: cmdSet.has('stop'),
        canSetVolume: cmdSet.has('setVolume'),
        canMute: cmdSet.has('mute'),
        canNextTrack: cmdSet.has('nextTrack'),
        canPrevTrack: cmdSet.has('previousTrack'),
        internalType,
      },
    ];
  }

  return [];
}
