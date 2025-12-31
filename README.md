# JVSHomeControl

Home automation dashboard (client) + Node/Express backend (server) with realtime updates via Socket.IO.

- **Server** polls Hubitat Maker API, normalizes device data into `rooms` + `sensors`, persists layout/mapping in `server/data/config.json`, and broadcasts updates.
- **Client** renders an environment dashboard, heatmap, and basic interactions UI.

## Repo layout

- `client/` — React + Vite UI
- `server/` — Express + Socket.IO backend
- `server/data/config.json` — persisted, installation-specific configuration (rooms/sensors mapping + layout + weather settings)

## Quick start (local dev)

Prereqs:
- Node.js 18+ (server uses built-in `fetch`)

Terminal 1 (server):

```bash
cd server
npm install
npm run dev
```

Terminal 2 (client):

```bash
cd client
npm install
npm run dev
```

Then open the Vite URL (usually `http://localhost:5173`). The client expects the server at port **3000** by default.

Production note: if you run `npm run build` in `client/`, the server will serve the built UI from `client/dist` at `http://<host>:3000/`.

## Configuration

### Hubitat Maker API

Set these environment variables before starting the server:

- `HUBITAT_HOST` (example: `http://192.168.1.50`)
- `HUBITAT_APP_ID`
- `HUBITAT_ACCESS_TOKEN` (secret)

If these are not set, the server will still start, but Hubitat polling/commands are disabled.

### Dashboard device allowlists

For safety, the UI only renders controls for devices in explicit allowlists, and the server only accepts commands for devices allowed by either list.

There are two independent allowlists:

- **Main** (Dash page): `UI_ALLOWED_MAIN_DEVICE_IDS` or `server/data/config.json` → `ui.mainAllowedDeviceIds`
- **Ctrl** (Ctrl page / room controls): `UI_ALLOWED_CTRL_DEVICE_IDS` or `server/data/config.json` → `ui.ctrlAllowedDeviceIds`

Back-compat:

- `UI_ALLOWED_DEVICE_IDS` is treated as the **Ctrl** allowlist.

### Weather (Open‑Meteo)

Config priority is:

1. Environment variables
2. `server/data/config.json`
3. Server defaults

Env vars:

- `OPEN_METEO_LAT`
- `OPEN_METEO_LON`
- `OPEN_METEO_TZ`
- `OPEN_METEO_TEMPERATURE_UNIT`
- `OPEN_METEO_WIND_SPEED_UNIT`
- `OPEN_METEO_PRECIPITATION_UNIT`

## Server endpoints (high level)

- `GET /api/config` — merged rooms/sensors config
- `GET /api/status` — latest device statuses
- `POST /api/events` — ingest events (Hubitat Maker API `postURL` target)
- `GET /api/events` — view recently ingested events
- `GET /api/weather` — cached Open‑Meteo response
- `POST /api/devices/:id/command` — Maker API command passthrough
- `POST /api/layout` — persist room layout + sensor positions

## Run as an unprivileged user + start on reboot

The recommended way to run the backend continuously (kiosk, home server, Raspberry Pi, mini PC) is:

- run the Node server under a dedicated **non-admin** OS user
- register it as a service so it starts automatically after every reboot

### Debian Linux (systemd)

0) Install Node.js (20+; recommended: 22 LTS) and required tools:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

# NodeSource (recommended to ensure Node 22 LTS on older Debian releases)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

1) Create a dedicated user (no shell login):

```bash
sudo useradd \
  --system \
  --create-home \
  --home-dir /opt/jvshomecontrol \
  --shell /usr/sbin/nologin \
  jvshome
```

2) Install the repo and dependencies as that user:

```bash
sudo mkdir -p /opt/jvshomecontrol
sudo chown -R jvshome:jvshome /opt/jvshomecontrol

sudo -u jvshome -H bash -lc 'cd /opt/jvshomecontrol && git clone https://github.com/jeamajoal/JVSHomeControl.git .'
sudo -u jvshome -H bash -lc 'cd /opt/jvshomecontrol/server && npm ci --omit=dev'
sudo -u jvshome -H bash -lc 'cd /opt/jvshomecontrol/client && npm ci && npm run build && npm prune --omit=dev'
```

## Optional: custom Activity alert sounds

The Activity page can play custom sounds for motion/door events. Add URLs under `ui.alertSounds` in `server/data/config.json`:

```json
{
  "ui": {
    "alertSounds": {
      "motion": "/sounds/footsteps.mp3",
      "doorOpen": "/sounds/door-open.mp3",
      "doorClose": "/sounds/door-close.mp3"
    }
  }
}
```

Notes:

- Recommended: put files in `client/public/sounds/` (they will be served as `/sounds/<file>` after you build the client).
- You can also set values to a bare filename like `dooropen.mp3` and it will resolve to `/sounds/dooropen.mp3`.
- URLs must be reachable by the browser (same-origin recommended) and permit fetch/CORS if hosted elsewhere.
- Sounds load when you enable alerts (tap the volume icon). If loading fails, the app falls back to built-in tones.

3) Create an environment file for secrets/settings:

```bash
sudo tee /etc/jvshomecontrol.env >/dev/null <<'EOF'
HUBITAT_HOST=http://192.168.1.50
HUBITAT_APP_ID=30
HUBITAT_ACCESS_TOKEN=REPLACE_ME

# Optional weather overrides
# OPEN_METEO_LAT=...
# OPEN_METEO_LON=...

# Optional backup retention
# BACKUP_MAX_FILES=200
EOF

sudo chmod 600 /etc/jvshomecontrol.env
```

4) Create a systemd service:

```bash
sudo tee /etc/systemd/system/jvshomecontrol.service >/dev/null <<'EOF'
[Unit]
Description=JVS Home Control Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=jvshome
Group=jvshome
WorkingDirectory=/opt/jvshomecontrol/server
EnvironmentFile=/etc/jvshomecontrol.env
ExecStart=/usr/bin/node /opt/jvshomecontrol/server/server.js
Restart=on-failure
RestartSec=5

# Hardening (safe defaults; remove if they break your environment)
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/jvshomecontrol/server/data

[Install]
WantedBy=multi-user.target
EOF
```

5) Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jvshomecontrol
sudo systemctl status jvshomecontrol --no-pager
```

Logs:

```bash
journalctl -u jvshomecontrol -f
```

## Static values to make configurable (for new implementations)

This repo is currently tuned for a specific home/network. For any new installation, these should be parameters (env vars, config file entries, or UI settings), not hard-coded:

### Backend (`server/`)

- **HTTP port**: `PORT = 3000` in `server/server.js`.
- **CORS policy**: Socket.IO and Express currently allow `origin: "*"`.
- **Hubitat connection defaults**: `HUBITAT_HOST`, `HUBITAT_APP_ID`, `HUBITAT_ACCESS_TOKEN` should not have hard-coded fallback values.
- **Hubitat polling interval**: `setInterval(syncHubitatData, 2000)` (2s refresh).
- **Weather defaults**: default lat/lon + units + timezone.
- **Weather cache TTL**: `/api/weather` caches for 5 minutes.
- **Filesystem locations**:
  - `server/data/config.json` (persisted config)
  - `server/data/backups/` (auto-created backups; will grow over time)

### Frontend (`client/`)

- **API base URL**: multiple components build `http://${window.location.hostname}:3000`.
  - In a production deployment you’ll likely want this to be a single configurable value (or use relative `/api/...` with a proxy).
- **Branding text**: the app title/header strings are currently static.

### Data (`server/data/config.json`)

- **Rooms**: names, IDs, floors, and grid/layout positions are specific to one floorplan.
- **Sensors**: Hubitat device IDs and the room mapping are installation-specific.

## Notes

- The server auto-backs up `server/data/config.json` into `server/data/backups/` on writes and keeps only the most recent 200 backup files by default (override with `BACKUP_MAX_FILES`). Consider excluding backups from source control for long-term use.
- See `server/MAKER_API.md` for Maker API endpoint patterns.
