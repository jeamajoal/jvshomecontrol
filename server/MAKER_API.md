# Hubitat Maker API quick reference

This project uses Hubitat Maker API primarily via the **"list all devices"** endpoint configured in the server settings.

Maker API does **not** provide a dedicated "rooms" endpoint. Room names are typically exposed per-device (e.g., `dev.room` in the devices list), so rooms with **no devices** will not be discoverable via Maker API alone.

## Security note

Treat your Maker API `access_token` as a secret.

- Do **not** commit it to git.
- Prefer storing it in an environment variable or in `server/data/config.json` (which should remain local/private).
- If you’ve pasted a real token into chat/logs, consider rotating it in Hubitat.

## HTTPS notes (self-signed certs)

This project can run the dashboard/API over **HTTPS** using a local certificate.

- If a cert/key exist, the server will automatically use them.
- If they do not exist, the server will run over HTTP and log a warning.

To generate a self-signed certificate:

- Run `cd server && node scripts/https-setup.js` in an interactive terminal
- Or start via `npm start` (the server package runs the HTTPS helper as a `prestart` step)

### Trust the cert (important)

If you generate a self-signed certificate, you must **trust** it on the device/browser that loads the dashboard.
If you don’t, the browser will show warnings and you may see repeated alerts/errors.

### Maker API `postURL` and TLS verification

If you set Maker API `postURL` to an `https://.../api/events` URL and Hubitat does not trust your certificate,
the intended setup is:

- Configure Hubitat/Maker to **ignore certificate warnings** (if that option is available).

If you can’t ignore warnings (or can’t install a trusted cert), fall back to using an `http://.../api/events` URL.

### Hubitat polling with HTTPS

If your `HUBITAT_HOST` is `https://...` and Hubitat uses a self-signed cert, set:

- `HUBITAT_TLS_INSECURE=1`

This disables TLS verification for the Hubitat fetch calls from this server.

## Endpoint patterns

Replace these placeholders:

- `<HUBITAT_HOST>`: Hubitat base URL including scheme, e.g. `https://192.168.x.x` (or `http://...`)
- `<APP_ID>`: Maker API app id
- `<ACCESS_TOKEN>`: Maker API access token
- `<DEVICE_ID>`: subscribed device id
- `<ATTRIBUTE>`: supported attribute name
- `<COMMAND>`: supported command name
- `<SECONDARY>`: optional secondary value
- `<URL_ENCODED>`: URL-encoded target URL
- `<VARIABLE_NAME>` / `<VALUE>`: hub variable and value
- `<MODE_ID>`: mode id

### Get device info

`<HUBITAT_HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>?access_token=<ACCESS_TOKEN>`

### Get device event history

`<HUBITAT_HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>/events?access_token=<ACCESS_TOKEN>`

### Get device commands

`<HUBITAT_HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>/commands?access_token=<ACCESS_TOKEN>`

### Get device capabilities

`<HUBITAT_HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>/capabilities?access_token=<ACCESS_TOKEN>`

### Get a single device attribute

`<HUBITAT_HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>/attribute/<ATTRIBUTE>?access_token=<ACCESS_TOKEN>`

### Send a device command

`<HUBITAT_HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>/<COMMAND>/<SECONDARY>?access_token=<ACCESS_TOKEN>`

(Secondary value is optional; omit the `/<SECONDARY>` segment if unused.)

### Send POST URL

`<HUBITAT_HOST>/apps/api/<APP_ID>/postURL/<URL_ENCODED>?access_token=<ACCESS_TOKEN>`

### Set hub variable

`<HUBITAT_HOST>/apps/api/<APP_ID>/hubvariables/<VARIABLE_NAME>/<VALUE>?access_token=<ACCESS_TOKEN>`

### Get modes list

`<HUBITAT_HOST>/apps/api/<APP_ID>/modes?access_token=<ACCESS_TOKEN>`

### Set mode

`<HUBITAT_HOST>/apps/api/<APP_ID>/modes/<MODE_ID>?access_token=<ACCESS_TOKEN>`
