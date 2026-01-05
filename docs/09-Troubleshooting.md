# Troubleshooting

## The dashboard loads but no data appears

- Check the backend: `http(s)://<host>:3000/api/config`
- Confirm Hubitat env vars are set: `HUBITAT_HOST`, `HUBITAT_APP_ID`, `HUBITAT_ACCESS_TOKEN`

## Mixed content errors (HTTPS page trying to call HTTP)

This should be fixed in current builds by using a protocol-aware API base.

If you still see it:

- Ensure you’re on the latest build
- Confirm the browser URL scheme matches what you intend (http vs https)

## RTSP cameras

RTSP cameras play via server-side HLS (served from the same origin as the dashboard).

If an RTSP feed won’t play:

- Ensure `ffmpeg` is installed on the server.
- See `docs/08-HTTPS.md` for HLS endpoints and tuning.

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
