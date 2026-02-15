# Docker

Run JVSHomeControl in a Docker container — no system-level Node.js or ffmpeg installation required.

---

## Quick Start — Pull from Docker Hub

The fastest way to get running. No cloning or building required.

### One command

```bash
docker run -d --name jvshomecontrol \
  -p 80:80 -p 443:443 \
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
      - "80:80"      # HTTP  (default)
      - "443:443"    # HTTPS (after enabling in Settings → Server)
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

## Container Entrypoint

The Docker image includes an entrypoint script (`docker-entrypoint.sh`) that runs automatically each time the container starts. It:

1. **Creates data directories** — ensures `backups/`, `sounds/`, `backgrounds/`, `device-icons/`, `control-icons/`, and `certs/` exist inside the mounted volume.
2. **Seeds `config.json`** — on first run (fresh volume), copies the bundled `config.example.json` so the server has a valid starting configuration.
3. **Seeds control-icon manifests** — copies any missing default `.manifest.json` files into the volume (useful after image upgrades that add new icon types).
4. **Fixes file ownership** — if running as root, ensures the `node` user (uid 1000) owns the data directory so the server can read/write without permission errors.
5. **Hands off to the server** — replaces itself with `node server.js` (via `exec`) so the Node process is PID 1 and receives shutdown signals correctly.

You don't need to configure or call the entrypoint manually — it's built into the image.

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

By default, the container starts in **HTTP** mode on port 80. To enable HTTPS, you have several options — the easiest is the built-in Settings UI.

> **Important:** Always map **both** ports (`80:80` and `443:443`) when you first create the container. Docker does not allow changing port mappings on a running container. By mapping both up front, you can switch between HTTP and HTTPS entirely from the browser without touching Docker.

### Option 1: Settings UI (recommended)

No terminal or SSH required — everything happens in the browser:

1. Open the dashboard at `http://localhost`.
2. Go to **Settings** (gear icon) → **Server** tab.
3. Click **Generate Certificate** (self-signed) or **Upload Certificate** (custom PEM).
4. Change the **Port** from `80` to `443`.
5. Click **Restart Server**.

The container will restart automatically (thanks to `restart: unless-stopped`) and come back up on HTTPS at port 443. Open `https://localhost` to continue.

To switch back to HTTP, delete the certificate in Settings → Server, change the port back to `80`, and restart.

### Option 2: Generate certs from the command line

Run the setup script inside the running container:

```bash
docker compose exec -it jvshomecontrol node scripts/https-setup.js
docker compose restart
```

Or pass the hostname and `--yes` flag to skip prompts:

```bash
docker compose exec jvshomecontrol node scripts/https-setup.js 192.168.1.100 --yes
docker compose restart
```

After restarting, change the port to 443 in Settings → Server → Restart.

### Option 3: Mount your own certs

If you already have certificates (from Let's Encrypt, your CA, etc.):

```yaml
volumes:
  - jvs-data:/app/server/data
  - ./my-certs/localhost.crt:/app/server/data/certs/localhost.crt:ro
  - ./my-certs/localhost.key:/app/server/data/certs/localhost.key:ro
```

The server auto-detects them at startup and enables HTTPS.

### Option 4: Use a reverse proxy

Put nginx, Caddy, or Traefik in front of the container and let it handle TLS. The server will serve HTTP on port 80 internally.

> **Note:** Self-signed certs cause browser warnings. Accept the warning once, or install the cert on your device (see [08-HTTPS.md](08-HTTPS.md)).

### Already created a container with only port 80?

You'll need to recreate it once to add the 443 mapping. Your config and data are safe in the volume:

```bash
docker stop jvshomecontrol
docker rm jvshomecontrol
docker run -d --name jvshomecontrol \
  -p 80:80 -p 443:443 \
  -v jvs-data:/app/server/data \
  --restart unless-stopped \
  jeamajoal/jvshomecontrol:latest
```

In **Docker Desktop**: stop and delete the container (the `jvs-data` volume is preserved), then re-run the image with both port mappings.

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

The server port is configurable at runtime via **Settings → Server → Port** in the browser. The default is `80`. When HTTPS is enabled, change it to `443` and restart — the container's port mapping handles the rest.

If you need a non-standard host port (e.g. your host already uses 80/443), adjust the **left side** of the port mapping:

```yaml
ports:
  - "8080:80"     # HTTP on host port 8080
  - "8443:443"    # HTTPS on host port 8443
```

The **right side** (container port) must match the port configured in Settings → Server.

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
