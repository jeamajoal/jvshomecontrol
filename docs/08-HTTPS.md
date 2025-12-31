# HTTPS & Certificates

The server can run as HTTP or HTTPS.

## Automatic behavior

- If a certificate exists, the server will automatically use HTTPS.
- If not, starting the server will offer to create a self-signed certificate.

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
