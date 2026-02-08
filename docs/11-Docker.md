# Docker

Run JVSHomeControl in a Docker container — no system-level Node.js or ffmpeg installation required.

---

## Quick Start — Pull from Docker Hub

The fastest way to get running. No cloning or building required.

### One command

```bash
docker run -d --name jvshomecontrol \
  -p 3000:3000 \
  -v jvs-data:/app/server/data \
  --restart unless-stopped \
  jeamajoal/jvshomecontrol:latest
```

Open `http://localhost:3000` — **all configuration happens in the browser**, including Hubitat connection credentials.

> **Prefer environment variables?** You can still pass `HUBITAT_HOST`, `HUBITAT_APP_ID`, `HUBITAT_ACCESS_TOKEN`, and `HUBITAT_TLS_INSECURE` as `-e` flags if you'd rather configure them outside the UI. Env vars take priority over UI settings and lock those fields in the Settings page.

### Using Docker Compose (recommended)

Create a `docker-compose.yml` anywhere on your machine:

```yaml
services:
  jvshomecontrol:
    image: jeamajoal/jvshomecontrol:latest
    container_name: jvshomecontrol
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - jvs-data:/app/server/data
    # environment:                         # Optional — configure in browser instead
    #   - HUBITAT_HOST=https://192.168.1.50
    #   - HUBITAT_APP_ID=30
    #   - HUBITAT_ACCESS_TOKEN=your-token
    #   - HUBITAT_TLS_INSECURE=1

volumes:
  jvs-data:
```

Then start:

```bash
docker compose up -d
```

Open `http://localhost:3000` and configure your Hubitat connection in **Settings → Server**.

> **Prefer a `.env` file?** Create one next to `docker-compose.yml` with `HUBITAT_HOST`, `HUBITAT_APP_ID`, `HUBITAT_ACCESS_TOKEN` and uncomment the `environment` block above. Env vars take priority and lock those fields in the Settings UI. Never commit your `.env` file to source control.

---

## Quick Start — Build from Source

If you prefer to build the image yourself:

```bash
git clone https://github.com/jeamajoal/JVSHomeControl.git
cd JVSHomeControl
docker compose up -d
```

The included `docker-compose.yml` in the repo uses `build: .` so it will compile everything locally.

To push your own build to a registry:

```bash
docker build -t your-user/jvshomecontrol:latest .
docker push your-user/jvshomecontrol:latest
```

---

## First-Run Configuration

Once the container starts, **all setup happens in the browser** at `http://<host>:3000`:

1. Open **Settings** (gear icon) → **Server** tab.
2. Enter your **Hubitat Host**, **Maker API App ID**, and **Access Token**. Toggle **TLS Insecure** if your Hubitat uses a self-signed certificate.
3. The dashboard connects immediately — rooms and devices are auto-discovered.
4. Configure rooms, layouts, weather, themes, cameras, and more from the other Settings tabs.
5. All changes are saved to `config.json` inside the `jvs-data` volume automatically.

You never need to SSH into the container or edit files by hand.

> **Tip:** If you prefer to keep credentials outside the UI (e.g. for automated deployments), pass them as environment variables instead. Env vars take priority over UI settings and lock those fields in the Settings page.

---

## Persistent Data

The `jvs-data` volume stores everything that should survive container restarts:

| Path (inside container) | Contents |
|------------------------|----------|
| `/app/server/data/config.json` | All UI settings, rooms, device lists, layouts |
| `/app/server/data/certs/` | HTTPS certificates |
| `/app/server/data/backups/` | Automatic config backups |
| `/app/server/data/backgrounds/` | Custom background images |
| `/app/server/data/sounds/` | Alert sound files |

---

## Environment Variables

Pass them via the `environment` key in `docker-compose.yml`, a `.env` file, or `docker run -e`.

### Hubitat Connection (optional — can be set in the browser instead)

| Variable | Example | Description |
|----------|---------|-------------|
| `HUBITAT_HOST` | `https://192.168.1.50` | Hubitat URL |
| `HUBITAT_APP_ID` | `30` | Maker API app ID |
| `HUBITAT_ACCESS_TOKEN` | `abc123...` | Maker API token |
| `HUBITAT_TLS_INSECURE` | `1` | Skip TLS verification for self-signed Hubitat certs |

> When set as env vars, these values take priority over the UI and the corresponding Settings fields are shown as locked.

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `HTTP_ONLY` | `false` | Force HTTP (skip HTTPS) |
| `HUBITAT_POLL_INTERVAL_MS` | `2000` | How often to poll Hubitat (ms) |
| `EVENTS_INGEST_TOKEN` | — | Token to protect the events endpoint |
| `OPEN_METEO_LAT` | auto | Weather latitude |
| `OPEN_METEO_LON` | auto | Weather longitude |
| `OPEN_METEO_TIMEZONE` | `auto` | Weather timezone |

For the full list, see [03-Installation.md](03-Installation.md#all-environment-variables).

---

## Using a .env File (optional)

If you prefer to keep Hubitat credentials outside the UI — for example in automated or headless deployments — create a `.env` file next to your `docker-compose.yml`:

```bash
HUBITAT_HOST=https://192.168.1.50
HUBITAT_APP_ID=30
HUBITAT_ACCESS_TOKEN=your-token-here
HUBITAT_TLS_INSECURE=1
```

Then reference them in `docker-compose.yml`:

```yaml
environment:
  - HUBITAT_HOST=${HUBITAT_HOST}
  - HUBITAT_APP_ID=${HUBITAT_APP_ID}
  - HUBITAT_ACCESS_TOKEN=${HUBITAT_ACCESS_TOKEN}
  - HUBITAT_TLS_INSECURE=${HUBITAT_TLS_INSECURE}
```

Fields set via env vars will show an **ENV** badge in the Settings UI and cannot be changed from the browser.

> **Security:** Add `.env` to your `.gitignore` so you don't commit secrets.

---

## HTTPS in Docker

By default, the container starts in **HTTP** mode. Here's how that works:

1. The Dockerfile's `prestart` script (`https-setup.js`) runs before the server.
2. If it finds existing certs in `server/data/certs/`, it uses them.
3. If **no certs exist** and the session is **non-interactive** (which Docker is), it silently skips generation and falls back to HTTP.
4. The server checks for cert files at startup — if present, it serves HTTPS; otherwise HTTP.

To enable HTTPS, pick one of these options:

### Option 1: Auto-generate certs on first start (easiest)

Set `HTTPS_SETUP_ASSUME_YES=1` so the prestart script creates a self-signed certificate without prompting:

```yaml
environment:
  - HTTPS_SETUP_ASSUME_YES=1
  - HTTPS_CERT_HOSTNAME=192.168.1.100   # Your server's LAN IP or hostname
```

Or with `docker run`:

```bash
docker run -d --name jvshomecontrol \
  -p 3000:3000 \
  -e HTTPS_SETUP_ASSUME_YES=1 \
  -e HTTPS_CERT_HOSTNAME=192.168.1.100 \
  -v jvs-data:/app/server/data \
  --restart unless-stopped \
  jeamajoal/jvshomecontrol:latest
```

The cert is written to the `jvs-data` volume and survives container restarts/updates. It only generates once — if certs already exist, the script skips.

> **Note:** Self-signed certs cause browser warnings. Accept the warning once, or install the cert on your device (see [08-HTTPS.md](08-HTTPS.md)).

### Option 2: Generate certs interactively

Run the setup script manually in the running container:

```bash
docker compose exec -it jvshomecontrol node scripts/https-setup.js
docker compose restart
```

The script will prompt for a hostname and generate the cert.

### Option 3: Mount your own certs

If you already have certificates (from Let's Encrypt, your CA, etc.):

```yaml
volumes:
  - ./my-certs/localhost.crt:/app/server/data/certs/localhost.crt:ro
  - ./my-certs/localhost.key:/app/server/data/certs/localhost.key:ro
```

The server auto-detects them at startup.

### Option 4: Use a reverse proxy

Put nginx, Caddy, or Traefik in front of the container and let it handle TLS. Set `HTTP_ONLY=1` in the container so it only serves HTTP internally.

### HTTPS-related environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_ONLY` | `false` | Force HTTP only — skip HTTPS entirely |
| `HTTPS` | — | Set `1` to force HTTPS (warns if no certs found) |
| `HTTPS_SETUP_ASSUME_YES` | `false` | Auto-create self-signed cert without prompting |
| `HTTPS_CERT_HOSTNAME` | system hostname | Hostname/IP embedded in the generated certificate |
| `HTTPS_CERT_PATH` | `data/certs/localhost.crt` | Custom path to TLS certificate |
| `HTTPS_KEY_PATH` | `data/certs/localhost.key` | Custom path to TLS private key |

---

## Updating

### From Docker Hub

```bash
docker compose pull
docker compose up -d
```

### From source

```bash
cd JVSHomeControl
git pull
docker compose build
docker compose up -d
```

Your config, backgrounds, sounds, and certs are in the `jvs-data` volume and won't be lost.

---

## Viewing Logs

```bash
# Live logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail 100
```

---

## Health Check

The Docker image includes a built-in `HEALTHCHECK` that pings `/api/status` every 30 seconds. Orchestrators like Docker Compose, Portainer, and Kubernetes will automatically monitor it.

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' jvshomecontrol
```

Additional diagnostic endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/status` | Overall server status |
| `GET /api/hubitat/health` | Hubitat connection health |
| `GET /api/hls/health` | Camera streaming health |

---

## Custom Port

```yaml
ports:
  - "8443:3000"    # Host port : Container port
environment:
  - PORT=3000      # Keep internal port at 3000
```

---

## Adding Cameras

Cameras work the same way as a bare-metal install — ffmpeg is included in the Docker image. Configure cameras through the Settings page in the dashboard.

For RTSP tuning variables, see [10-RTSP-HLS-Configuration.md](10-RTSP-HLS-Configuration.md).

---

## Copying Files Into the Container

To add custom backgrounds or sounds to a running container:

```bash
# Copy a background image
docker cp my-background.jpg jvshomecontrol:/app/server/data/backgrounds/

# Copy a sound file
docker cp doorbell.mp3 jvshomecontrol:/app/server/data/sounds/
```

Or bind-mount the directories directly:

```yaml
volumes:
  - jvs-data:/app/server/data
  - ./my-backgrounds:/app/server/data/backgrounds
  - ./my-sounds:/app/server/data/sounds
```
