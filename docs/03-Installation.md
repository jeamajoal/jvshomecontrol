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

The server starts on **HTTP port 80** — no credentials required. All configuration happens from the browser.

---

## After Installation

### 1. Open the dashboard

Navigate to `http://your-server-ip` in any browser.

The dashboard loads immediately. Without Hubitat configured, you'll see the UI with no devices — that's expected.

### 2. Connect your Hubitat

Go to **Settings → Server** and enter:

- **Hubitat Host** — your hub's IP (e.g., `https://192.168.1.50`)
- **Maker API App ID** — the numeric ID from Hubitat → Apps → Maker API
- **Access Token** — your Maker API access token
- **Allow self-signed certs** — enable this if your Hubitat uses HTTPS (most do)

Click **Save**. The dashboard connects and populates immediately — no restart needed.

### 3. Enable HTTPS (recommended)

Go to **Settings → Server → Network & Security** and click **Generate Certificate**. Enter your server's hostname or IP. For a clean HTTPS URL, also change the **Port** to **443** in the same section. Then restart:

```bash
sudo systemctl restart jvshomecontrol
```

After restart, access the dashboard at `https://your-server-ip`. Your browser will warn about the self-signed certificate — accept it once. See [08-HTTPS.md](08-HTTPS.md) for details on trusting the cert on tablets and phones.

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
curl -s http://localhost/api/status
```

---

## Weather Location

Weather uses [Open-Meteo](https://open-meteo.com/) — a free API with no key required. Set your location in **Settings → Weather**.

---

## Changing the Port

The default port is **80** (standard HTTP). After enabling HTTPS, the recommended port is **443** (standard HTTPS) — this is covered in step 3 above.

To use a non-standard port, set it in **Settings → Server**.

Then: `sudo systemctl restart jvshomecontrol`

The installer's systemd service includes `AmbientCapabilities=CAP_NET_BIND_SERVICE`, which lets the non-root `jvshome` user bind to privileged ports (< 1024) like 80 and 443. If you wrote your own service file, add these lines to the `[Service]` section:

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

Configure from the browser at `http://localhost`.

---

## File Locations

| Path | Purpose |
|------|---------|
| `/opt/jvshomecontrol/` | Application root |
| `/opt/jvshomecontrol/server/data/config.json` | All configuration (persisted by the Settings UI) |
| `/opt/jvshomecontrol/server/data/certs/` | HTTPS certificates |
| `/opt/jvshomecontrol/server/data/backups/` | Automatic config backups |
| `/opt/jvshomecontrol/server/data/backgrounds/` | Custom background images |
| `/opt/jvshomecontrol/server/data/sounds/` | Alert sound files |

---

## Fresh Start

To reset all configuration and start from scratch:

```bash
sudo systemctl stop jvshomecontrol
sudo rm /opt/jvshomecontrol/server/data/config.json
sudo systemctl start jvshomecontrol
```

The server starts with a clean configuration. Open `http://your-server-ip` and configure from scratch.

> **Note:** This does not remove custom backgrounds, sounds, or HTTPS certificates. To remove those as well, delete the entire `server/data/` directory contents and re-run the installer.
