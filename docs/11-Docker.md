# Docker

Run JVSHomeControl in a Docker container — no system-level Node.js or ffmpeg installation required.

---

## Quick Start — Pull from Docker Hub

The fastest way to get running. No cloning or building required.

### One command

```bash
docker run -d --name jvshomecontrol \
  -p 3000:3000 \
  -e HUBITAT_HOST=https://192.168.1.50 \
  -e HUBITAT_APP_ID=30 \
  -e HUBITAT_ACCESS_TOKEN=your-token-here \
  -e HUBITAT_TLS_INSECURE=1 \
  -v jvs-data:/app/server/data \
  --restart unless-stopped \
  jeamajoal/jvshomecontrol:latest
```

Open `http://localhost:3000` — all configuration (rooms, layouts, themes) happens in the browser.

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
    environment:
      - HUBITAT_HOST=${HUBITAT_HOST}
      - HUBITAT_APP_ID=${HUBITAT_APP_ID}
      - HUBITAT_ACCESS_TOKEN=${HUBITAT_ACCESS_TOKEN}
      # - HUBITAT_TLS_INSECURE=1        # Uncomment for self-signed Hubitat certs

volumes:
  jvs-data:
```

Create a `.env` file next to it:

```bash
HUBITAT_HOST=https://192.168.1.50
HUBITAT_APP_ID=30
HUBITAT_ACCESS_TOKEN=your-token-here
```

Then start:

```bash
docker compose up -d
```

> **Security:** Never commit your `.env` file to source control.

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

1. **Rooms & devices** are auto-discovered from Hubitat — no manual editing needed.
2. Open **Settings** (gear icon) to configure rooms, layouts, weather, themes, cameras, and more.
3. Changes are saved to `config.json` inside the `jvs-data` volume automatically.
4. You never need to SSH into the container or edit files by hand.

> The only things that **must** be set as environment variables are the three Hubitat Maker API credentials (`HUBITAT_HOST`, `HUBITAT_APP_ID`, `HUBITAT_ACCESS_TOKEN`). Everything else can be configured from the UI.

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

### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `HUBITAT_HOST` | `https://192.168.1.50` | Hubitat URL |
| `HUBITAT_APP_ID` | `30` | Maker API app ID |
| `HUBITAT_ACCESS_TOKEN` | `abc123...` | Maker API token |

### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `HUBITAT_TLS_INSECURE` | `false` | Set `1` for self-signed Hubitat HTTPS certs |

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

## Using a .env File

If you didn't already create one in the [Quick Start](#quick-start--pull-from-docker-hub), create a `.env` file next to your `docker-compose.yml`:

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

> **Security:** Add `.env` to your `.gitignore` so you don't commit secrets.

---

## HTTPS in Docker

By default, the container runs HTTP. To enable HTTPS:

### Option 1: Generate certs inside the container

```bash
docker compose exec jvshomecontrol node scripts/https-setup.js
docker compose restart
```

The certificates are stored in the persistent volume and survive restarts.

### Option 2: Mount existing certs

```yaml
volumes:
  - ./my-certs/localhost.crt:/app/server/data/certs/localhost.crt:ro
  - ./my-certs/localhost.key:/app/server/data/certs/localhost.key:ro
```

### Option 3: Use a reverse proxy

Put nginx, Caddy, or Traefik in front of the container and let it handle TLS. Set `HTTP_ONLY=1` in the container.

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
