import React from 'react';
import { INTERNAL_DEVICE_TYPES } from '../deviceMapping';
import ThermostatPopup from './ThermostatPopup';
import FanSpeedPopup from './FanSpeedPopup';
import MediaPopup from './MediaPopup';

/**
 * DEVICE_TYPES_WITH_POPUP
 *
 * Multi-control devices where a popup saves space while providing rich controls.
 * Color / CT lights render inline (color wheel, sliders) and do NOT need popups.
 */
export const DEVICE_TYPES_WITH_POPUP = new Set([
  INTERNAL_DEVICE_TYPES.THERMOSTAT,
  INTERNAL_DEVICE_TYPES.FAN_CONTROLLER,
  INTERNAL_DEVICE_TYPES.MEDIA_PLAYER,
]);

/**
 * DevicePopup
 *
 * Dispatcher that renders the correct popup controller for a device type.
 *
 * Props:
 *   internalType - The INTERNAL_DEVICE_TYPES value
 *   onClose      - Close handler
 *   device       - Device attributes object (merged attrs + commands)
 *   control      - Structured control object from mapDeviceToControls
 *   onCommand    - (deviceId, command, args) => Promise
 *   disabled     - Disable interactions
 *   uiScheme     - UI accent scheme
 */
export default function DevicePopup({ internalType, onClose, device, control, onCommand, disabled, uiScheme }) {
  const props = { open: true, onClose, device, control, onCommand, disabled, uiScheme };

  switch (internalType) {
    case INTERNAL_DEVICE_TYPES.THERMOSTAT:
      return <ThermostatPopup {...props} />;
    case INTERNAL_DEVICE_TYPES.FAN_CONTROLLER:
      return <FanSpeedPopup {...props} />;
    case INTERNAL_DEVICE_TYPES.MEDIA_PLAYER:
      return <MediaPopup {...props} />;
    default:
      return null;
  }
}
