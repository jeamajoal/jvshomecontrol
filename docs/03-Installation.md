# Installation

## Quick Start (Debian / Ubuntu)

One command installs everything:

```bash
curl -fsSL https://raw.githubusercontent.com/jeamajoal/JVSHomeControl/main/scripts/install-debian.sh | sudo bash
```

**What the script does:**

1. Installs Node.js 22 LTS, git, and ffmpeg
2. Creates a `jvshome` system user
3. Clones the repo to `/opt/jvshomecontrol`
4. Builds the React UI
5. Generates self-signed HTTPS certificates (interactive prompt)
6. Creates a systemd service that auto-starts on boot
7. Preserves your config and certs on future updates

---

## After Installation

### 1. Add your Hubitat credentials

**Option A — Configure in the browser (easiest):**

Open `https://your-server-ip:3000`, go to **Settings → Server**, and enter your Hubitat Host, Maker API App ID, and Access Token. The dashboard connects immediately.

**Option B — Use the environment file:**

```bash
sudo nano /etc/jvshomecontrol.env
```

Set these values (find them in Hubitat → Apps → Maker API):

```bash
HUBITAT_HOST=https://192.168.1.50
HUBITAT_APP_ID=30
HUBITAT_ACCESS_TOKEN=your-token-here
HUBITAT_TLS_INSECURE=1
```

Then restart the service:

```bash
sudo systemctl restart jvshomecontrol
```

> **Why HTTPS?** Your Maker API access token is sent with every poll request. Even on a local network, use HTTPS to protect it. Set `HUBITAT_TLS_INSECURE=1` because Hubitat uses a self-signed certificate. Env vars take priority over UI settings and lock those fields in the Settings page.

### 2. Open the dashboard

Navigate to `https://your-server-ip:3000` in any browser.

Your browser will warn about the self-signed certificate — accept it once. On tablets, you can install the certificate permanently (see [08-HTTPS.md](08-HTTPS.md)).

---

## Updating

Run the same install command again. The script detects an existing installation and:

- Backs up your `config.json`, certificates, and custom backgrounds
- Pulls the latest code
- Rebuilds the UI
- Restores your files
- Restarts the service

```bash
curl -fsSL https://raw.githubusercontent.com/jeamajoal/JVSHomeControl/main/scripts/install-debian.sh | sudo bash
```

---

## Verify It's Working

```bash
# Check the service is running
sudo systemctl status jvshomecontrol

# View live logs
sudo journalctl -u jvshomecontrol -f

# Test the API
curl -sk https://localhost:3000/api/hubitat/health
```

---

## All Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HUBITAT_HOST` | No | — | Hubitat URL (e.g., `https://192.168.1.50`). Can also be set in Settings UI. |
| `HUBITAT_APP_ID` | No | — | Maker API app ID number. Can also be set in Settings UI. |
| `HUBITAT_ACCESS_TOKEN` | No | — | Maker API access token. Can also be set in Settings UI. |
| `HUBITAT_TLS_INSECURE` | No | `false` | Set `1` for self-signed Hubitat HTTPS certs. Can also be set in Settings UI. |
| `PORT` | No | `3000` | Server listen port (ports < 1024 like 443 require the installer's systemd service) |
| `HUBITAT_POLL_INTERVAL_MS` | No | `2000` | How often to poll Hubitat (milliseconds) |
| `EVENTS_INGEST_TOKEN` | No | — | Token to protect the events endpoint |
| `EVENTS_MAX` | No | `500` | Max events kept in memory |
| `EVENTS_PERSIST_JSONL` | No | `false` | Persist events to disk |
| `BACKUP_MAX_FILES` | No | `200` | Config backup retention |
| `HTTP_ONLY` | No | `false` | Force HTTP (skip HTTPS) |
| `HTTPS` | No | — | Set `1` to force HTTPS even without auto-detected certs |
| `HTTPS_CERT_PATH` | No | Auto | Custom TLS certificate path |
| `HTTPS_KEY_PATH` | No | Auto | Custom TLS private key path |
| `HTTPS_CERT_HOSTNAME` | No | `hostname` | Hostname/IP to embed in generated self-signed cert |
| `HTTPS_SETUP_ASSUME_YES` | No | `false` | Auto-create self-signed cert without prompting (useful in Docker/CI) |
| `OPEN_METEO_LAT` | No | Auto | Weather latitude (decimal or DMS) |
| `OPEN_METEO_LON` | No | Auto | Weather longitude (decimal or DMS) |
| `OPEN_METEO_TIMEZONE` | No | `auto` | Weather timezone (e.g., `America/New_York`) |
| `OPEN_METEO_TEMPERATURE_UNIT` | No | `fahrenheit` | `fahrenheit` or `celsius` |
| `OPEN_METEO_WIND_SPEED_UNIT` | No | `mph` | `mph`, `kmh`, `ms`, or `kn` |
| `OPEN_METEO_PRECIPITATION_UNIT` | No | `inch` | `inch` or `mm` |
| `FFMPEG_PATH` | No | Auto | Custom path to ffmpeg binary |
| `UI_ALLOWED_DEVICE_IDS` | No | — | Comma-separated device IDs for global allowlist |
| `UI_ALLOWED_MAIN_DEVICE_IDS` | No | — | Comma-separated device IDs for Home page |
| `UI_ALLOWED_CTRL_DEVICE_IDS` | No | — | Comma-separated device IDs for Controls page |
| `UI_ALLOWED_MAIN_DEVICE_IDS_LOCKED` | No | `false` | Prevent UI from changing Home allowlist |
| `UI_ALLOWED_CTRL_DEVICE_IDS_LOCKED` | No | `false` | Prevent UI from changing Controls allowlist |
| `UI_EXTRA_ALLOWED_PANEL_DEVICE_COMMANDS` | No | — | Extra commands allowed on control panels |

---

## Weather Location

Weather uses [Open-Meteo](https://open-meteo.com/) — a free API with no key required. By default, location is auto-detected. To set manually:

```bash
# In /etc/jvshomecontrol.env:
OPEN_METEO_LAT=35.2271
OPEN_METEO_LON=-80.8431
```

Restart after changes: `sudo systemctl restart jvshomecontrol`

---

## Changing the Port

```bash
# In /etc/jvshomecontrol.env:
PORT=8443
```

Then: `sudo systemctl restart jvshomecontrol`

### Using Port 443 (Standard HTTPS)

To run on port 443 so browsers don't need `:3000` in the URL:

```bash
# In /etc/jvshomecontrol.env:
PORT=443
```

The installer's systemd service includes `AmbientCapabilities=CAP_NET_BIND_SERVICE`, which lets the non-root `jvshome` user bind to privileged ports (< 1024). If you wrote your own service file, add these lines to the `[Service]` section:

```ini
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
```

Then reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart jvshomecontrol
```

> **Already installed?** If you installed before this update, re-run the installer to pick up the new service file, or manually add the two lines above to `/etc/systemd/system/jvshomecontrol.service`.

---

## Installing a Specific Branch

```bash
sudo REPO_BRANCH=develop bash scripts/install-debian.sh
```

Or interactively — type `?` when prompted to list available branches.

---

## Manual Installation (Advanced)

If you prefer full control:

```bash
git clone https://github.com/jeamajoal/JVSHomeControl.git
cd JVSHomeControl

# Build the UI
cd client && npm ci && npm run build && cd ..

# Start the server
cd server && npm ci && node server.js
```

Set environment variables before running, or create `/etc/jvshomecontrol.env`.

---

## File Locations

| Path | Purpose |
|------|---------|
| `/opt/jvshomecontrol/` | Application root |
| `/etc/jvshomecontrol.env` | Environment variables (credentials, settings) |
| `/opt/jvshomecontrol/server/data/config.json` | UI configuration (themes, device lists, layout) |
| `/opt/jvshomecontrol/server/data/certs/` | HTTPS certificates |
| `/opt/jvshomecontrol/server/data/backups/` | Automatic config backups |
| `/opt/jvshomecontrol/server/data/backgrounds/` | Custom background images |
| `/opt/jvshomecontrol/server/data/sounds/` | Alert sound files |
