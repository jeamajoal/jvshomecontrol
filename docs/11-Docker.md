# Docker

Run JVSHomeControl in a Docker container — no system-level Node.js or ffmpeg installation required.

---

## Quick Start — Pull from Docker Hub

The fastest way to get running. No cloning or building required.

### One command

```bash
docker run -d --name jvshomecontrol \
  -p 80:80 \
  -v jvs-data:/app/server/data \
  --restart unless-stopped \
  jeamajoal/jvshomecontrol:latest
```

Open `http://localhost` — **all configuration happens in the browser**, including Hubitat connection credentials.

### Using Docker Compose (recommended)

Create a `docker-compose.yml` anywhere on your machine:

```yaml
services:
  jvshomecontrol:
    image: jeamajoal/jvshomecontrol:latest
    container_name: jvshomecontrol
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - jvs-data:/app/server/data

volumes:
  jvs-data:
```

Then start:

```bash
docker compose up -d
```

Open `http://localhost` and configure your Hubitat connection in **Settings → Server**.

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

Once the container starts, **all setup happens in the browser** at `http://<host>`:

1. Open **Settings** (gear icon) → **Server** tab.
2. Enter your **Hubitat Host**, **Maker API App ID**, and **Access Token**. Toggle **TLS Insecure** if your Hubitat uses a self-signed certificate.
3. The dashboard connects immediately — rooms and devices are auto-discovered.
4. Configure rooms, layouts, weather, themes, cameras, and more from the other Settings tabs.
5. All changes are saved to `config.json` inside the `jvs-data` volume automatically.

You never need to SSH into the container or edit files by hand.

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

## HTTPS in Docker

By default, the container starts in **HTTP** mode. To enable HTTPS:

### Option 1: Generate certs interactively

Run the setup script in the running container:

```bash
docker compose exec -it jvshomecontrol node scripts/https-setup.js
docker compose restart
```

The script will prompt for a hostname and generate the cert.

### Option 2: Generate certs non-interactively

Pass the hostname and `--yes` flag:

```bash
docker compose exec jvshomecontrol node scripts/https-setup.js 192.168.1.100 --yes
docker compose restart
```

### Option 3: Mount your own certs

If you already have certificates (from Let's Encrypt, your CA, etc.):

```yaml
volumes:
  - ./my-certs/localhost.crt:/app/server/data/certs/localhost.crt:ro
  - ./my-certs/localhost.key:/app/server/data/certs/localhost.key:ro
```

The server auto-detects them at startup.

### Option 4: Use a reverse proxy

Put nginx, Caddy, or Traefik in front of the container and let it handle TLS. The server will serve HTTP on port 80 internally.

> **Note:** Self-signed certs cause browser warnings. Accept the warning once, or install the cert on your device (see [08-HTTPS.md](08-HTTPS.md)).

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

The container listens on port 80 internally. Map it to any host port:

```yaml
ports:
  - "8443:80"    # Host port 8443 → Container port 80
```

---

## Adding Cameras

Cameras work the same way as a bare-metal install — ffmpeg is included in the Docker image. Configure cameras through the Settings page in the dashboard.

For RTSP tuning details, see [10-RTSP-HLS-Configuration.md](10-RTSP-HLS-Configuration.md).

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
