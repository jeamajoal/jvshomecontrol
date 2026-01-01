# Hubitat (C‑8) + Maker API

## Required environment variables

Set these before starting the server:

- `HUBITAT_HOST` (example: `https://192.168.1.50`)
- `HUBITAT_APP_ID`
- `HUBITAT_ACCESS_TOKEN`

If you decide to use HTTPS for Hubitat:

- Set `HUBITAT_HOST=https://...`
- If Hubitat uses a self-signed cert, also set `HUBITAT_TLS_INSECURE=1`
- Restart your service after env var changes

Note: If you provide `HUBITAT_HOST` as just an IP/hostname (no scheme), the server will assume `https://`.

## Polling + event callbacks (how updates work)

This project uses a **hybrid** approach:

- On service startup, the server does an **initial poll** of Maker API (devices list).
- It then continues polling on a fixed interval.
- If you configure Maker API `postURL`, the server will also accept callbacks and apply them to the cached device state for faster updates.

Polling remains the source of truth (it repairs missed callbacks and refreshes metadata), while callbacks provide lower-latency state changes.

### Poll interval

Configure the poll interval (milliseconds):

- `HUBITAT_POLL_INTERVAL_MS` (default: `2000`)

Example (poll once per minute):

- `HUBITAT_POLL_INTERVAL_MS=60000`

## Maker event callback (postURL)

This server accepts Maker callbacks at:

- `POST /api/events`

If you use HTTPS for the panel and a self-signed cert, Hubitat/Maker must trust it (or ignore certificate warnings), otherwise it may fail to post events.

## More details

- Maker endpoint patterns and notes: [server/MAKER_API.md](../server/MAKER_API.md)
