# Security & Hardening Notes

Default assumption: this runs on a trusted LAN.

If you want to harden it, start here.

## Protect secrets

- Treat `HUBITAT_ACCESS_TOKEN` as a secret.
- Don’t commit `server/data/config.json` if it contains sensitive values.
- Prefer OS-level secret storage (systemd `EnvironmentFile` with `chmod 600`, or equivalent).

## Network exposure

- Do not expose port `3000` directly to the public internet.
- Prefer a firewall rule: allow only your LAN / kiosk devices.
- If remote access is needed, use a VPN (WireGuard/Tailscale) instead of opening ports.

## HTTPS

- HTTPS is supported (including self-signed cert generation).
- For self-signed certs, you must trust the cert on the client device.

See: [08-HTTPS.md](08-HTTPS.md)

## Reduce control surface

- Use allowlists (`UI_ALLOWED_MAIN_DEVICE_IDS`, `UI_ALLOWED_CTRL_DEVICE_IDS`).
- If you don’t use the Hubitat event ingest endpoint, consider restricting it with `EVENTS_INGEST_TOKEN`.

## Service hardening

If using systemd:

- Run as an unprivileged user
- Limit write access to `server/data/`
- Keep `NoNewPrivileges=true`

## Browser kiosk devices

- Keep the kiosk OS updated.
- Lock the device down (guided access/kiosk mode).
- Trust the HTTPS cert once so it doesn’t nag on every load.
