# Hubitat Maker API Reference

Quick reference for Maker API endpoints used by this project.

---

## Security First

**Always use HTTPS for Maker API**, even on your local network.

Your access token is sent with every request. Without encryption, anyone on your network can capture it and control your devices.

---

## How This Project Uses Maker API

1. **Polls** all devices on startup and on interval
2. **Receives callbacks** at `POST /api/events` (if postURL is configured)
3. **Sends commands** when you tap buttons in the UI

---

## Environment Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `HUBITAT_HOST` | `https://192.168.1.50` | Hubitat URL (use HTTPS!) |
| `HUBITAT_APP_ID` | `30` | Maker API app ID |
| `HUBITAT_ACCESS_TOKEN` | `abc123...` | Maker API token |
| `HUBITAT_TLS_INSECURE` | `1` | Required for self-signed Hubitat certs |
| `HUBITAT_POLL_INTERVAL_MS` | `60000` | Poll interval (default: 2000) |
| `PORT` | `8443` | Server port (default: 80) |

---

## Recommended Configuration

```bash
# /etc/jvshomecontrol.env
HUBITAT_HOST=https://192.168.1.50
HUBITAT_APP_ID=30
HUBITAT_ACCESS_TOKEN=your-token-here
HUBITAT_TLS_INSECURE=1
```

---

## Token Security

- Store in `/etc/jvshomecontrol.env` or enter via the Settings UI — env file is more secure (never written to config.json)
- Never commit tokens to git
- If you leak a token, rotate it in Hubitat immediately

---

## Common Endpoints

Replace `<HOST>`, `<APP_ID>`, `<TOKEN>`, `<DEVICE_ID>`:

### List all devices
```
GET <HOST>/apps/api/<APP_ID>/devices/all?access_token=<TOKEN>
```

### Get device info
```
GET <HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>?access_token=<TOKEN>
```

### Send command
```
GET <HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>/<COMMAND>?access_token=<TOKEN>
```

### Send command with value
```
GET <HOST>/apps/api/<APP_ID>/devices/<DEVICE_ID>/<COMMAND>/<VALUE>?access_token=<TOKEN>
```

---

## Event Callbacks (postURL)

Configure Maker API to post events to:
```
https://your-server/api/events
```

With token protection:
```
https://your-server/api/events?token=your-secret
```

---

## Rooms

Maker API doesn't have a dedicated rooms endpoint. Room names come from device attributes. Rooms with no devices won't appear but can be created manually for the climate page if desired.
