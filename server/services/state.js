/**
 * Shared application state management.
 * This module manages the core state objects that are shared across the server.
 * 
 * State includes:
 * - persistedConfig: Configuration stored in server/data/config.json
 * - config: Runtime configuration sent to clients
 * - sensorStatuses: Current status of all sensors/devices
 * - settings: Runtime settings (weather config, etc.)
 * - Various cached data (Hubitat devices, weather, events)
 */

// Default settings
const defaultSettings = {
    weather: {
        openMeteo: {
            lat: `35°29'44.9"N`,
            lon: `86°04'53.8"W`,
            timezone: 'auto',
            temperatureUnit: 'fahrenheit',
            windSpeedUnit: 'mph',
            precipitationUnit: 'inch',
        }
    }
};

// --- Core State Objects ---

// Stored in server/data/config.json
let persistedConfig = { weather: defaultSettings.weather, rooms: [], sensors: [] };
let lastPersistedSerialized = '';

// The merged view sent to client
let config = { rooms: [], sensors: [], ui: { allowedDeviceIds: [] } };

// Current device statuses
let sensorStatuses = {};

// Runtime settings
let settings = { ...defaultSettings };

// Write throttling
let lastConfigWriteAtMs = 0;
let pendingPersistTimeout = null;
let pendingPersistLabel = null;

// Cached Hubitat data
let lastHubitatDevices = [];
let lastHubitatFetchAt = null;
let lastHubitatError = null;
let lastHubitatErrorLoggedAt = 0;

// Cached Weather data
let lastWeather = null;
let lastWeatherFetchAt = null;
let lastWeatherError = null;
let lastWeatherErrorLoggedAt = 0;

// Ingested events buffer
let ingestedEvents = [];

// --- Getters ---

function getPersistedConfig() {
    return persistedConfig;
}

function setPersistedConfig(value) {
    persistedConfig = value;
}

function getLastPersistedSerialized() {
    return lastPersistedSerialized;
}

function setLastPersistedSerialized(value) {
    lastPersistedSerialized = value;
}

function getConfig() {
    return config;
}

function setConfig(value) {
    config = value;
}

function getSensorStatuses() {
    return sensorStatuses;
}

function setSensorStatuses(value) {
    sensorStatuses = value;
}

function getSettings() {
    return settings;
}

function setSettings(value) {
    settings = value;
}

function getLastConfigWriteAtMs() {
    return lastConfigWriteAtMs;
}

function setLastConfigWriteAtMs(value) {
    lastConfigWriteAtMs = value;
}

function getPendingPersistTimeout() {
    return pendingPersistTimeout;
}

function setPendingPersistTimeout(value) {
    pendingPersistTimeout = value;
}

function getPendingPersistLabel() {
    return pendingPersistLabel;
}

function setPendingPersistLabel(value) {
    pendingPersistLabel = value;
}

// --- Hubitat State ---

function getLastHubitatDevices() {
    return lastHubitatDevices;
}

function setLastHubitatDevices(value) {
    lastHubitatDevices = value;
}

function getLastHubitatFetchAt() {
    return lastHubitatFetchAt;
}

function setLastHubitatFetchAt(value) {
    lastHubitatFetchAt = value;
}

function getLastHubitatError() {
    return lastHubitatError;
}

function setLastHubitatError(value) {
    lastHubitatError = value;
}

function getLastHubitatErrorLoggedAt() {
    return lastHubitatErrorLoggedAt;
}

function setLastHubitatErrorLoggedAt(value) {
    lastHubitatErrorLoggedAt = value;
}

// --- Weather State ---

function getLastWeather() {
    return lastWeather;
}

function setLastWeather(value) {
    lastWeather = value;
}

function getLastWeatherFetchAt() {
    return lastWeatherFetchAt;
}

function setLastWeatherFetchAt(value) {
    lastWeatherFetchAt = value;
}

function getLastWeatherError() {
    return lastWeatherError;
}

function setLastWeatherError(value) {
    lastWeatherError = value;
}

function getLastWeatherErrorLoggedAt() {
    return lastWeatherErrorLoggedAt;
}

function setLastWeatherErrorLoggedAt(value) {
    lastWeatherErrorLoggedAt = value;
}

// --- Events State ---

function getIngestedEvents() {
    return ingestedEvents;
}

function setIngestedEvents(value) {
    ingestedEvents = value;
}

function pushIngestedEvent(event) {
    ingestedEvents.push(event);
}

module.exports = {
    // Default settings
    defaultSettings,
    
    // Core state
    getPersistedConfig,
    setPersistedConfig,
    getLastPersistedSerialized,
    setLastPersistedSerialized,
    getConfig,
    setConfig,
    getSensorStatuses,
    setSensorStatuses,
    getSettings,
    setSettings,
    
    // Write throttling
    getLastConfigWriteAtMs,
    setLastConfigWriteAtMs,
    getPendingPersistTimeout,
    setPendingPersistTimeout,
    getPendingPersistLabel,
    setPendingPersistLabel,
    
    // Hubitat state
    getLastHubitatDevices,
    setLastHubitatDevices,
    getLastHubitatFetchAt,
    setLastHubitatFetchAt,
    getLastHubitatError,
    setLastHubitatError,
    getLastHubitatErrorLoggedAt,
    setLastHubitatErrorLoggedAt,
    
    // Weather state
    getLastWeather,
    setLastWeather,
    getLastWeatherFetchAt,
    setLastWeatherFetchAt,
    getLastWeatherError,
    setLastWeatherError,
    getLastWeatherErrorLoggedAt,
    setLastWeatherErrorLoggedAt,
    
    // Events state
    getIngestedEvents,
    setIngestedEvents,
    pushIngestedEvent,
};
