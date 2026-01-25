/**
 * Services module index.
 * Re-exports all services for convenient importing.
 */

const hlsService = require('./hls');
const stateService = require('./state');
const controlIconsService = require('./controlIcons');

module.exports = {
    hls: hlsService,
    state: stateService,
    controlIcons: controlIconsService,
};
