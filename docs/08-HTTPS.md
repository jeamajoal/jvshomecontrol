# HTTPS & Certificates

The server can run as HTTP or HTTPS.

## Automatic behavior

- If a certificate exists, the server will automatically use HTTPS.
- If a certificate does not exist, the server will run as HTTP (even if HTTPS is requested) and log a warning.

Note: If you start the server as a systemd service, it runs non-interactively, so you will not see an interactive prompt. In that case, run the helper once in a terminal to generate a cert:

```bash
cd server
node scripts/https-setup.js
```

If you start the server via `npm start`, the server package runs the HTTPS helper as a `prestart` step. That helper will prompt only in an interactive terminal.

## Recommended (Debian/Ubuntu)

For most users on Debian/Ubuntu, the easiest path is the guided installer:

- [scripts/install-debian.sh](../scripts/install-debian.sh)

It handles install/update and can create or recreate the HTTPS certificate during the prompts.

Default certificate paths:

- `server/data/certs/localhost.crt`
- `server/data/certs/localhost.key`

Override paths with:

- `HTTPS_CERT_PATH`
- `HTTPS_KEY_PATH`

## Important: trust the self-signed cert

If you create a self-signed cert:

- You must trust it in the browser/device that loads the panel.
- Otherwise the browser will warn, and you may see repeated security prompts/errors.

## Maker API and HTTPS

If Hubitat Maker API `postURL` is configured to post to `https://<panel>/api/events`:

- Hubitat must trust the panel cert (or ignore certificate warnings if supported)
- Otherwise it may fail to post events

If your Hubitat host itself is `https://...` with a self-signed cert, set:

- `HUBITAT_TLS_INSECURE=1`

## Switching http ↔ https

If you decide to switch schemes:

- Update any relevant env vars (example: `HUBITAT_HOST=http://...` → `https://...`)
- Restart the service

Example:

```bash
sudo systemctl restart jvshomecontrol
```

## HLS (recommended for HTTPS)

For customer-friendly RTSP playback under HTTPS, the server can also expose RTSP cameras as HLS over the same origin (`https://...`), avoiding the browser restriction on `ws://`.

How it works:

- Server spawns `ffmpeg` to read RTSP and write an HLS playlist (`.m3u8`) plus segment files (`.ts`).
- UI plays the HLS stream using native HLS when available (Safari/iOS), otherwise via `hls.js`.

Endpoints:

- `GET /api/cameras/:id/hls/ensure` → returns `{ playlistUrl }`
- `GET /api/cameras/:id/hls/playlist.m3u8`
- `GET /api/cameras/:id/hls/seg_#.ts`

Requirements:

- `ffmpeg` must be installed and available on the server.

Optional tuning env vars:

- `RTSP_HLS_SEGMENT_SECONDS` (default `2`, clamp `1..6`)
- `RTSP_HLS_LIST_SIZE` (default `6`, clamp `3..20`)
- `RTSP_HLS_OUTPUT_FPS` (default `15`, clamp `1..60`) — forces a constant output FPS to avoid HLS stalls from broken RTSP timestamps
- `RTSP_HLS_STARTUP_TIMEOUT_MS` (default `15000`, clamp `2000..60000`)
- `RTSP_HLS_CRF` (default `20`, lower = higher quality)
- `RTSP_HLS_GOP` (default `segmentSeconds * 25`)
- `RTSP_HLS_RTSP_TRANSPORT` (default: `tcp`, options: `tcp` or `udp`)
