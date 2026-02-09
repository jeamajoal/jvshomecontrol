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
5. Creates a systemd service that auto-starts on boot
6. Preserves your config and certs on future updates

The server starts on **HTTP port 3000** with no credentials required. All configuration happens from the browser.

---

## After Installation

### 1. Open the dashboard

Navigate to `http://your-server-ip:3000` in any browser.

The dashboard loads immediately. Without Hubitat configured, you'll see the UI with no devices — that's expected.

### 2. Connect your Hubitat

Go to **Settings → Server** and enter:

- **Hubitat Host** — your hub's IP (e.g., `https://192.168.1.50`)
- **Maker API App ID** — the numeric ID from Hubitat → Apps → Maker API
- **Access Token** — your Maker API access token
- **Allow self-signed certs** — enable this if your Hubitat uses HTTPS (most do)

Click **Save**. The dashboard connects and populates immediately — no restart needed.

### 3. Enable HTTPS (recommended)

Go to **Settings → Server → Network & Security** and click **Generate Certificate**. Enter your server's hostname or IP, then restart the service:

```bash
sudo systemctl restart jvshomecontrol
```

After restart, access the dashboard at `https://your-server-ip:3000`. Your browser will warn about the self-signed certificate — accept it once. See [08-HTTPS.md](08-HTTPS.md) for details on trusting the cert on tablets and phones.

> **Why HTTPS?** Your Maker API access token is sent with every poll request. Even on a local network, HTTPS prevents anyone on your WiFi from capturing it.

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
curl -s http://localhost:3000/api/status
```

---

## Environment Variables (Advanced)

Most settings are configured from the Settings UI. Environment variables are optional overrides for advanced use cases (Docker, CI, locked deployments). When set, env vars take priority and lock the corresponding Settings UI fields.

Create the file only if you need overrides:

```bash
sudo nano /etc/jvshomecontrol.env
sudo chmod 600 /etc/jvshomecontrol.env
sudo systemctl restart jvshomecontrol
```

| Variable | Default | Description |
|----------|---------|-------------|
| `HUBITAT_HOST` | — | Hubitat URL (e.g., `https://192.168.1.50`) |
| `HUBITAT_APP_ID` | — | Maker API app ID number |
| `HUBITAT_ACCESS_TOKEN` | — | Maker API access token |
| `HUBITAT_TLS_INSECURE` | `false` | Set `1` for self-signed Hubitat HTTPS certs |
| `PORT` | `3000` | Server listen port (ports < 1024 like 443 require the installer's systemd service) |
| `HUBITAT_POLL_INTERVAL_MS` | `2000` | How often to poll Hubitat (milliseconds) |
| `EVENTS_INGEST_TOKEN` | — | Token to protect the events endpoint |
| `EVENTS_MAX` | `500` | Max events kept in memory |
| `EVENTS_PERSIST_JSONL` | `false` | Persist events to disk |
| `BACKUP_MAX_FILES` | `200` | Config backup retention |
| `HTTP_ONLY` | `false` | Force HTTP (skip HTTPS) |
| `HTTPS` | — | Set `1` to force HTTPS even without auto-detected certs |
| `HTTPS_CERT_PATH` | Auto | Custom TLS certificate path |
| `HTTPS_KEY_PATH` | Auto | Custom TLS private key path |
| `HTTPS_CERT_HOSTNAME` | `hostname` | Hostname/IP to embed in generated self-signed cert |
| `HTTPS_SETUP_ASSUME_YES` | `false` | Auto-create self-signed cert without prompting (useful in Docker/CI) |
| `OPEN_METEO_LAT` | Auto | Weather latitude (decimal or DMS) |
| `OPEN_METEO_LON` | Auto | Weather longitude (decimal or DMS) |
| `OPEN_METEO_TIMEZONE` | `auto` | Weather timezone (e.g., `America/New_York`) |
| `OPEN_METEO_TEMPERATURE_UNIT` | `fahrenheit` | `fahrenheit` or `celsius` |
| `OPEN_METEO_WIND_SPEED_UNIT` | `mph` | `mph`, `kmh`, `ms`, or `kn` |
| `OPEN_METEO_PRECIPITATION_UNIT` | `inch` | `inch` or `mm` |
| `FFMPEG_PATH` | Auto | Custom path to ffmpeg binary |
| `UI_ALLOWED_DEVICE_IDS` | — | Comma-separated device IDs for global allowlist |
| `UI_ALLOWED_MAIN_DEVICE_IDS` | — | Comma-separated device IDs for Home page |
| `UI_ALLOWED_CTRL_DEVICE_IDS` | — | Comma-separated device IDs for Controls page |
| `UI_ALLOWED_MAIN_DEVICE_IDS_LOCKED` | `false` | Prevent UI from changing Home allowlist |
| `UI_ALLOWED_CTRL_DEVICE_IDS_LOCKED` | `false` | Prevent UI from changing Controls allowlist |
| `UI_EXTRA_ALLOWED_PANEL_DEVICE_COMMANDS` | — | Extra commands allowed on control panels |

---

## Weather Location

Weather uses [Open-Meteo](https://open-meteo.com/) — a free API with no key required. Location can be set in the Settings UI or via environment variables:

```bash
# In /etc/jvshomecontrol.env:
OPEN_METEO_LAT=35.2271
OPEN_METEO_LON=-80.8431
```

Restart after env changes: `sudo systemctl restart jvshomecontrol`

---

## Changing the Port

Set the port in **Settings → Server**, or via the environment file:

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

Configure from the browser at `http://localhost:3000`, or set environment variables before running.

---

## File Locations

| Path | Purpose |
|------|---------|
| `/opt/jvshomecontrol/` | Application root |
| `/etc/jvshomecontrol.env` | Environment variable overrides (optional, advanced) |
| `/opt/jvshomecontrol/server/data/config.json` | All configuration (persisted by the Settings UI) |
| `/opt/jvshomecontrol/server/data/certs/` | HTTPS certificates |
| `/opt/jvshomecontrol/server/data/backups/` | Automatic config backups |
| `/opt/jvshomecontrol/server/data/backgrounds/` | Custom background images |
| `/opt/jvshomecontrol/server/data/sounds/` | Alert sound files |
