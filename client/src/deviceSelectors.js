const asText = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
};

export function getHomeVisibleDeviceIdSet(config) {
  const uiObj = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
  const hasKey = Object.prototype.hasOwnProperty.call(uiObj, 'homeVisibleDeviceIds');
  if (!hasKey) return null;
  const ids = Array.isArray(uiObj.homeVisibleDeviceIds)
    ? uiObj.homeVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  return new Set(ids);
}

export function getCtrlVisibleDeviceIdSet(config) {
  const uiObj = (config?.ui && typeof config.ui === 'object') ? config.ui : {};
  const hasKey = Object.prototype.hasOwnProperty.call(uiObj, 'ctrlVisibleDeviceIds');
  if (!hasKey) return null;
  const ids = Array.isArray(uiObj.ctrlVisibleDeviceIds)
    ? uiObj.ctrlVisibleDeviceIds.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  return new Set(ids);
}

function getVisibleRoomIdSet(config) {
  const ids = Array.isArray(config?.ui?.visibleRoomIds)
    ? config.ui.visibleRoomIds.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  return ids.length ? new Set(ids) : null;
}

function getDeviceLabelOverride(config, deviceId) {
  const id = asText(deviceId);
  if (!id) return null;
  const raw = (config?.ui?.deviceLabelOverrides && typeof config.ui.deviceLabelOverrides === 'object')
    ? config.ui.deviceLabelOverrides
    : {};
  const v = raw[id];
  const s = asText(v);
  return s;
}

export function getDeviceCommandAllowlist(config, deviceId) {
  const id = asText(deviceId);
  if (!id) return null;
  const raw = (config?.ui?.deviceCommandAllowlist && typeof config.ui.deviceCommandAllowlist === 'object')
    ? config.ui.deviceCommandAllowlist
    : {};
  const arr = raw[id];
  if (!Array.isArray(arr)) return null;
  const cleaned = arr.map((v) => String(v || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned : [];
}

/**
 * Retrieve the configured Home metrics allowlist for a device from the UI config.
 *
 * @param {Object} config - Application configuration object containing a `ui` section.
 * @param {*} deviceId - Device identifier; will be converted to a trimmed string. Invalid or empty ids return `null`.
 * @returns {string[]|null} Trimmed metric ids allowed for the device, or `null` if no allowlist is defined for that device. An empty array explicitly indicates that no Home metrics should be shown for this device.
 */
export function getDeviceHomeMetricAllowlist(config, deviceId) {
  const id = asText(deviceId);
  if (!id) return null;
  const raw = (config?.ui?.deviceHomeMetricAllowlist && typeof config.ui.deviceHomeMetricAllowlist === 'object')
    ? config.ui.deviceHomeMetricAllowlist
    : {};
  const arr = raw[id];
  if (!Array.isArray(arr)) return null;
  // Empty array is allowed (meaning: show no Home metrics from this device).
  return arr.map((v) => String(v || '').trim()).filter(Boolean);
}

/**
 * Retrieve the list of info-metric IDs allowed for a device from the UI configuration.
 * @param {object} config - Configuration object; expected to contain `ui.deviceInfoMetricAllowlist` as an object mapping device IDs to arrays.
 * @param {*} deviceId - Device identifier; will be converted to a trimmed string and validated.
 * @returns {string[]|null} An array of non-empty trimmed metric IDs for the device (may be empty to indicate no info cards), or `null` if the deviceId is invalid or the configured entry is not an array.
 */
export function getDeviceInfoMetricAllowlist(config, deviceId) {
  const id = asText(deviceId);
  if (!id) return null;
  const raw = (config?.ui?.deviceInfoMetricAllowlist && typeof config.ui.deviceInfoMetricAllowlist === 'object')
    ? config.ui.deviceInfoMetricAllowlist
    : {};
  const arr = raw[id];
  if (!Array.isArray(arr)) return null;
  // Empty array is allowed (meaning: show no info cards for this device).
  return arr.map((v) => String(v || '').trim()).filter(Boolean);
}

/**
 * Retrieve the status object for a device by id.
 *
 * @param {Object<string, *>} statuses - Mapping of device ids to status objects.
 * @param {*} deviceId - Device identifier; falsy or whitespace-only values are treated as invalid.
 * @returns {*} The status object for the normalized device id, or `null` if the id is invalid or no status exists.
 */
export function getDeviceStatus(statuses, deviceId) {
  const id = asText(deviceId);
  if (!id) return null;
  return statuses?.[id] || null;
}

export function getAllowedDeviceIds(config, scope = 'union') {
  const ui = (config?.ui && typeof config.ui === 'object') ? config.ui : {};

  const main = Array.isArray(ui.mainAllowedDeviceIds) ? ui.mainAllowedDeviceIds : null;
  const ctrl = Array.isArray(ui.ctrlAllowedDeviceIds) ? ui.ctrlAllowedDeviceIds : null;
  const legacy = Array.isArray(ui.allowedDeviceIds) ? ui.allowedDeviceIds : [];

  const raw =
    scope === 'main' ? (main ?? legacy) :
    scope === 'ctrl' ? (ctrl ?? legacy) :
    // union / default
    (Array.isArray(ui.allowedDeviceIds) ? ui.allowedDeviceIds : (Array.isArray(main) ? main : (Array.isArray(ctrl) ? ctrl : legacy)));

  return raw.map((v) => String(v));
}

export function getAllowedDeviceIdSet(config, scope = 'union') {
  return new Set(getAllowedDeviceIds(config, scope).map((v) => String(v)));
}

export function buildRoomsWithStatuses(config, statuses, options = {}) {
  const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
  const devices = Array.isArray(config?.sensors) ? config.sensors : [];
  const ignoreVisibleRooms = Boolean(options && options.ignoreVisibleRooms);
  const visibleRoomIds = ignoreVisibleRooms ? null : getVisibleRoomIdSet(config);
  const deviceIdSet = (options && options.deviceIdSet instanceof Set) ? options.deviceIdSet : null;

  const byRoomId = new Map();
  for (const r of rooms) {
    const id = asText(r?.id);
    if (!id) continue;
    byRoomId.set(id, { room: r, devices: [] });
  }

  const unassigned = [];

  for (const dev of devices) {
    const id = asText(dev?.id);
    if (!id) continue;

    if (deviceIdSet && !deviceIdSet.has(id)) continue;

    const labelOverride = getDeviceLabelOverride(config, id);
    const entry = {
      ...dev,
      status: getDeviceStatus(statuses, id),
      label: labelOverride || String(dev?.label || getDeviceStatus(statuses, id)?.label || id),
    };

    const roomId = asText(dev?.roomId);
    const bucket = roomId ? byRoomId.get(roomId) : null;
    if (bucket) bucket.devices.push(entry);
    else unassigned.push(entry);
  }

  const result = Array.from(byRoomId.values())
    .map(({ room, devices: roomDevices }) => ({ room, devices: roomDevices }))
    .filter((r) => r.devices.length > 0);

  const filtered = visibleRoomIds
    ? result.filter((r) => visibleRoomIds.has(asText(r?.room?.id) || ''))
    : result;

  if (unassigned.length && (!visibleRoomIds || visibleRoomIds.has('unassigned'))) {
    filtered.push({ room: { id: 'unassigned', name: 'Unassigned' }, devices: unassigned });
  }

  return filtered;
}

export function buildRoomsWithActivity(config, statuses) {
  const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
  const devices = Array.isArray(config?.sensors) ? config.sensors : [];
  const visibleRoomIds = getVisibleRoomIdSet(config);

  const byRoomId = new Map();
  for (const r of rooms) {
    const id = asText(r?.id);
    if (!id) continue;
    byRoomId.set(id, { room: r, devices: [] });
  }

  const unassigned = [];

  for (const d of devices) {
    const id = asText(d?.id);
    if (!id) continue;

    const st = getDeviceStatus(statuses, id);
    const labelOverride = getDeviceLabelOverride(config, id);
    const attrs = st?.attributes && typeof st.attributes === 'object' ? st.attributes : {};

    const motion = asText(attrs.motion);
    const contact = asText(attrs.contact);

    const hasActivity = (motion === 'active' || motion === 'inactive') || (contact === 'open' || contact === 'closed');
    if (!hasActivity) continue;

    const entry = {
      id,
      label: String(labelOverride || d?.label || st?.label || id),
      motion,
      contact,
      lastUpdated: asText(st?.lastUpdated),
      roomId: asText(d?.roomId) || '',
    };

    const bucket = byRoomId.get(entry.roomId);
    if (bucket) bucket.devices.push(entry);
    else unassigned.push(entry);
  }

  const result = Array.from(byRoomId.values())
    .map(({ room, devices: roomDevices }) => ({ room, devices: roomDevices }))
    .filter((r) => r.devices.length > 0)
    .sort((a, b) => String(a.room?.name || '').localeCompare(String(b.room?.name || '')));

  const filtered = visibleRoomIds
    ? result.filter((r) => visibleRoomIds.has(asText(r?.room?.id) || ''))
    : result;

  if (unassigned.length && (!visibleRoomIds || visibleRoomIds.has('unassigned'))) {
    filtered.push({ room: { id: 'unassigned', name: 'Unassigned' }, devices: unassigned });
  }

  return filtered;
}