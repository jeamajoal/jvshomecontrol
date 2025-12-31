# Hubitat (C‑8) + Maker API

## Required environment variables

Set these before starting the server:

- `HUBITAT_HOST` (example: `http://192.168.1.50`)
- `HUBITAT_APP_ID`
- `HUBITAT_ACCESS_TOKEN`

If you decide to use HTTPS for Hubitat:

- Set `HUBITAT_HOST=https://...`
- If Hubitat uses a self-signed cert, also set `HUBITAT_TLS_INSECURE=1`
- Restart your service after env var changes

## Maker event callback (postURL)

This server accepts Maker callbacks at:

- `POST /api/events`

If you use HTTPS for the panel and a self-signed cert, Hubitat/Maker must trust it (or ignore certificate warnings), otherwise it may fail to post events.

## More details

- Maker endpoint patterns and notes: [server/MAKER_API.md](../server/MAKER_API.md)
