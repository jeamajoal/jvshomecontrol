# Docker

Run JVSHomeControl in a Docker container — no system-level Node.js or ffmpeg installation required.

---

## Quick Start

```bash
git clone https://github.com/jeamajoal/JVSHomeControl.git
cd JVSHomeControl

# Create your environment file
cp docker-compose.yml docker-compose.override.yml
# Edit docker-compose.override.yml with your Hubitat credentials

docker compose up -d
```

Open `http://localhost:3000` (or `https://` if you add certificates).

---

## docker-compose.yml

The included `docker-compose.yml` is ready to use:

```yaml
services:
  jvshomecontrol:
    build: .
    container_name: jvshomecontrol
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - jvs-data:/app/server/data
    environment:
      - HUBITAT_HOST=https://192.168.1.50
      - HUBITAT_APP_ID=30
      - HUBITAT_ACCESS_TOKEN=your-token-here
      - HUBITAT_TLS_INSECURE=1

volumes:
  jvs-data:
```

> **Tip:** Use environment variables from your shell or a `.env` file instead of hardcoding secrets in `docker-compose.yml`. See [Environment Variables](#environment-variables) below.

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

Create a `.env` file next to `docker-compose.yml`:

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
