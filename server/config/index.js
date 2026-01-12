/**
 * Configuration module index.
 * Re-exports all configuration from sub-modules for convenient importing.
 */

const constants = require('./constants');
const hlsConfig = require('./hls');
const hubitatConfig = require('./hubitat');
const eventsConfig = require('./events');
const uiConfig = require('./ui');

module.exports = {
    ...constants,
    ...hlsConfig,
    ...hubitatConfig,
    ...eventsConfig,
    ...uiConfig,
};
