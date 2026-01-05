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

## RTSP camera previews + HTTPS limitation

RTSP camera previews are implemented as:

- Server-side: `ffmpeg` reads `rtsp://...` and outputs MPEG1 video
- Backend: Node serves that video over a **plain WebSocket** (`ws://...`) (via `node-rtsp-stream`)
- Browser: the UI connects to that websocket to render the video

Because the stream websocket is `ws://` (not `wss://`), browsers will block it when the dashboard is loaded over `https://`.
Firefox typically reports this as: `DOMException: The operation is insecure`.

Workarounds:

- **Testing / easiest**: run the dashboard over HTTP (disable TLS): set `HTTP_ONLY=1` (or `HTTPS=0`) and restart the service.
- **Production HTTPS**: run a reverse proxy (Caddy/Nginx) that terminates TLS and provides `wss://` for the stream websocket.

Note: `ffmpeg` itself does not create websockets; only the Node server does.
