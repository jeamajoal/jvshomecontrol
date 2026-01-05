# Troubleshooting

## The dashboard loads but no data appears

- Check the backend: `http(s)://<host>:3000/api/config`
- Confirm Hubitat env vars are set: `HUBITAT_HOST`, `HUBITAT_APP_ID`, `HUBITAT_ACCESS_TOKEN`

## Mixed content errors (HTTPS page trying to call HTTP)

This should be fixed in current builds by using a protocol-aware API base.

If you still see it:

- Ensure you’re on the latest build
- Confirm the browser URL scheme matches what you intend (http vs https)

## RTSP preview: Firefox "The operation is insecure"

If you enabled an RTSP camera preview and Firefox shows:

- `Uncaught (in promise) DOMException: The operation is insecure`

That usually means the dashboard is loaded over `https://` but the RTSP preview websocket is `ws://`.
Browsers block `ws://` from an `https://` page.

Fix options:

- For testing: disable TLS for the dashboard (`HTTP_ONLY=1` or `HTTPS=0`) and restart the service.
- For HTTPS: use a reverse proxy that provides `wss://`.

## Hubitat HTTPS errors

If Hubitat is `https://...` with a self-signed cert:

- Set `HUBITAT_TLS_INSECURE=1`
- Restart the service

## Maker API postURL fails

If the panel is HTTPS with a self-signed cert:

- Trust the cert on the device you’re using
- If Hubitat posts to the panel via HTTPS, Hubitat must trust the cert or ignore TLS warnings (if supported)

## Where config lives

- `server/data/config.json`
- Backups: `server/data/backups/`
