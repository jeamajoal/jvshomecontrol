/**
 * Services module index.
 * Re-exports all services for convenient importing.
 */

const hlsService = require('./hls');
const stateService = require('./state');

module.exports = {
    hls: hlsService,
    state: stateService,
};
