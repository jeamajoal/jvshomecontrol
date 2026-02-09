/**
 * Event ingestion configuration.
 * Defaults only — runtime values come from config.json (applied at startup).
 */

const MAX_INGESTED_EVENTS = 500;
const EVENTS_INGEST_TOKEN = '';
const EVENTS_PERSIST_JSONL = false;

module.exports = {
    MAX_INGESTED_EVENTS,
    EVENTS_INGEST_TOKEN,
    EVENTS_PERSIST_JSONL,
};
