# JVSHomeControl

**A beautiful, local-first smart home dashboard.**

> Turn any browser into a sleek home control panel — no cloud required.

---

## See It In Action

[![See examples and screenshots](https://img.shields.io/badge/Screenshots_and_Demo-jvsautomate.com-blue?style=for-the-badge)](https://jvsautomate.com/jvshomecontrol)

---

## One-Command Install (Debian/Ubuntu)

```bash
curl -fsSL https://raw.githubusercontent.com/jeamajoal/JVSHomeControl/main/scripts/install-debian.sh | sudo bash
```

That's it. The script handles everything:
- Installs Node.js, git, ffmpeg
- Downloads and builds the app
- Sets up a systemd service (auto-starts on boot)
- Preserves your settings on updates

**After install:** Open `http://your-server-ip` in your browser and configure your Hubitat connection in **Settings → Server**. See [Installation Guide](docs/03-Installation.md) for details.

---

## What Is This?

JVSHomeControl is a **browser-based dashboard** for your smart home. Control devices, view cameras, and create **focused room panels** with backgrounds and themes that match each room's natural mood.

| Feature | Description |
|---------|-------------|
| **Home** | Designed around multisensors — a beautiful view of temp, humidity, motion, and doors with visual alerts when someone moves or opens a door |
| **Climate** | See how your home breathes — a room map showing how the fireplace, dryer, or an open window affects the rooms around it |
| **Weather** | Built-in forecast via Open-Meteo API — no API key needed ([set your location](docs/03-Installation.md#weather-location)) |
| **Activity** | Minimal view for small screens or phones — motion and door events with optional configurable sound alerts |
| **Controls** | Densely packed device control — keep your home decluttered while having fingertip access to every switch, light, and device |
| **Cameras** | Integrate different camera types via RTSP → HLS conversion *(beta — needs work)* |

**Works with:** Hubitat (tested on C-8) · Home Assistant support coming soon

---

## Why I Built This

I wanted a **fast, beautiful, always-on control panel** that:

- Works even when the internet is down
- Doesn't depend on cloud services
- Looks good enough to leave on a wall 24/7
- Lets my family control the house without an app

If you've been frustrated by slow cloud dashboards or ugly DIY solutions, this is for you.

---

## Requirements

| You Need | Notes |
|----------|-------|
| **Hubitat hub** | Tested on C-8. Enable Maker API. |
| **A server** | Raspberry Pi, mini PC, or home server (Debian/Ubuntu) |
| **A display** | Wall tablet, spare phone, or browser on your network |

---

## Documentation

| Topic | Link |
|-------|------|
| Full Setup Guide | [docs/03-Installation.md](docs/03-Installation.md) |
| Hubitat Configuration | [docs/04-Hubitat.md](docs/04-Hubitat.md) |
| Security and HTTPS | [docs/07-Security.md](docs/07-Security.md) |
| Camera Setup (RTSP/HLS) | [docs/10-RTSP-HLS-Configuration.md](docs/10-RTSP-HLS-Configuration.md) |
| Docker Deployment | [docs/11-Docker.md](docs/11-Docker.md) |
| Panel Profiles & Themes | [docs/12-Panel-Profiles.md](docs/12-Panel-Profiles.md) |
| PWA & Kiosk Mode | [docs/13-PWA-Kiosk.md](docs/13-PWA-Kiosk.md) |
| Backgrounds & Sounds | [docs/14-Backgrounds-Sounds.md](docs/14-Backgrounds-Sounds.md) |
| Control Icons | [docs/15-Control-Icons.md](docs/15-Control-Icons.md) |
| Troubleshooting | [docs/09-Troubleshooting.md](docs/09-Troubleshooting.md) |
| Google Assistant Relay | [docs/05-Google-Assistant-Relay.md](docs/05-Google-Assistant-Relay.md) |

---

## Roadmap

- [x] Docker support
- [x] 22+ built-in panel themes
- [x] Interactive SVG control icons
- [x] PWA support (Add to Home Screen)
- [ ] Home Assistant integration
- [ ] Improved camera support (more protocols, better reliability)
- [ ] More animated SVG icons for controls

---

## About the Author

**Jeremy Henderson** - JVS Automation

I'm an IT engineer and integrator who loves making things work together that people didn't think could.

- [jvsautomate.com](https://jvsautomate.com)
- [Facebook: JVS_Automation](https://facebook.com/61585421825308)
- [Instagram: @jvs_automation](https://instagram.com/jvs_automation)

**Looking for help with your smart home, network, or IT infrastructure?** I help small businesses and homeowners build reliable, automated systems from the ground up.

---

## For Developers

<details>
<summary>Click to expand technical details</summary>

### Tech Stack
- **Frontend:** React + Vite + TailwindCSS
- **Backend:** Node.js + Express + Socket.IO
- **Data:** Hubitat Maker API polling + event callbacks

### Project Structure
```
client/          # React UI
server/          # Express backend
server/data/     # Config, certs, backgrounds, sounds
hubitat/driver/  # Custom Hubitat driver
scripts/         # Install scripts
docs/            # Documentation
```

### Manual Install (Advanced)
```bash
# Build the UI
cd client && npm install && npm run build

# Start the server
cd ../server && npm install && npm start
```

### Development Mode
```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend (hot reload)
cd client && npm run dev
```

### Environment Variables
See [docs/03-Installation.md](docs/03-Installation.md) for the full list. Configure from the browser or set env vars for headless/automated deployments.

</details>

---

## License

MIT - use it, modify it, share it.

---

<p align="center">
  <strong>Built by <a href="https://jvsautomate.com">JVS Automation</a></strong><br>
  <em>Making smart homes actually smart.</em>
</p>
