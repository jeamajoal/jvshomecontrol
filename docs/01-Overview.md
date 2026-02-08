# Overview

JVSHomeControl is a **local-first smart home dashboard** designed to turn any tablet, phone, or browser into a beautiful, always-on control panel for your Hubitat-powered smart home.

It works entirely on your local network — no cloud accounts, no subscriptions, no internet dependency.

---

## Architecture

```
┌─────────────┐     Maker API      ┌─────────────────┐     WebSocket     ┌─────────────┐
│   Hubitat   │ ◄────────────────  │  JVS Server     │ ────────────────  │  Browser /  │
│   Hub       │ ────────────────  │  (Node.js)      │                   │  Tablet UI  │
└─────────────┘     Events (POST)   └─────────────────┘                   └─────────────┘
                                            │
                                    ┌───────┴───────┐
                                    │  Open-Meteo   │  (Free weather API)
                                    └───────────────┘
```

| Component | Role |
|-----------|------|
| **Hubitat Hub** | Smart home controller — manages Zigbee/Z-Wave/WiFi devices |
| **JVS Server** | Node.js backend — polls Hubitat, caches state, converts camera streams, serves the UI |
| **Browser UI** | React dashboard — receives real-time updates via WebSocket |
| **Open-Meteo** | Free weather forecast API — no API key required |

---

## Dashboard Pages

| Page | Purpose |
|------|---------|
| **Home** | Room-by-room environment overview: temperature, humidity, motion, doors — with visual alerts |
| **Climate** | Colour-coded heatmap showing temperature/humidity flow across your home |
| **Weather** | Multi-day local forecast with hourly details |
| **Activity** | Minimal motion/door event feed — ideal for small screens, with optional sound alerts |
| **Controls** | Dense device control grid — switches, dimmers, locks, shades, and more |
| **Settings** | Theme customisation, panel profiles, device visibility, camera config |
| **Info** | System health, version info, and about |

---

## Key Capabilities

- **Real-time updates** — WebSocket push from server; no page refresh needed
- **Panel profiles** — different themes and settings per tablet ([learn more](12-Panel-Profiles.md))
- **22+ built-in themes** — plus full colour/opacity/blur customisation
- **Interactive control icons** — SVG-based icons with smart command mapping ([learn more](15-Control-Icons.md))
- **Custom backgrounds** — per-room or per-profile, from URL or uploaded image ([learn more](14-Backgrounds-Sounds.md))
- **Camera support** — RTSP streams converted to in-browser HLS via ffmpeg ([learn more](10-RTSP-HLS-Configuration.md))
- **Sound alerts** — configurable audio on motion/door events ([learn more](14-Backgrounds-Sounds.md))
- **Device allowlists** — control exactly which devices appear on each page
- **Label overrides** — rename devices per-panel without changing Hubitat
- **Docker support** — run in a container with a single command ([learn more](11-Docker.md))
- **Kiosk-friendly** — PWA installable, auto-fullscreen, wall-tablet ready ([learn more](13-PWA-Kiosk.md))
- **Local-first** — no cloud dependency; your data never leaves your network

---

## How Updates Flow

1. **On startup**, the server polls all devices from Hubitat Maker API
2. **On interval** (default: every 2 seconds), the server re-polls for changes
3. **Optionally**, configure Hubitat's `postURL` to push instant event callbacks
4. **In real-time**, the server pushes updates to all connected browsers via WebSocket

This dual approach (polling + callbacks) ensures updates are both fast and reliable.

---

## Next Steps

| Topic | Link |
|-------|------|
| What you need | [02-Components.md](02-Components.md) |
| Installation | [03-Installation.md](03-Installation.md) |
| Hubitat setup | [04-Hubitat.md](04-Hubitat.md) |
| Docker deployment | [11-Docker.md](11-Docker.md) |
| Panel profiles | [12-Panel-Profiles.md](12-Panel-Profiles.md) |
| PWA & kiosk mode | [13-PWA-Kiosk.md](13-PWA-Kiosk.md) |
| Security best practices | [07-Security.md](07-Security.md) |
| Security best practices | [07-Security.md](07-Security.md) |
