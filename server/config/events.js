/**
 * Event ingestion configuration.
 * Settings for the Hubitat Maker API event inbox.
 */

// --- Event Inbox Configuration ---
// Hubitat Maker API can POST back to our API via the Maker "postURL" endpoint.
// This keeps a small in-memory ring buffer of recent events so the UI (or logs)
// can inspect what is arriving.

const MAX_INGESTED_EVENTS = (() => {
    const raw = process.env.EVENTS_MAX;
    const parsed = raw ? Number(raw) : 500;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 500;
})();

const EVENTS_INGEST_TOKEN = String(process.env.EVENTS_INGEST_TOKEN || '').trim();

const EVENTS_PERSIST_JSONL = (() => {
    const raw = String(process.env.EVENTS_PERSIST_JSONL || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
})();

module.exports = {
    MAX_INGESTED_EVENTS,
    EVENTS_INGEST_TOKEN,
    EVENTS_PERSIST_JSONL,
};
