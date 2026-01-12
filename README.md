# JVSHomeControl

Local-first home automation dashboard (UI + backend) designed for a wall tablet / kiosk.

## At a glance
- ## What does it look like!?!? ![Examples](https://github.com/<owner>/<repo>/releases/download/screenshots-v1/)
- **What is this?** A Hubitat-backed control panel: UI (React) + backend (Node/Express) with realtime updates.
- **Who wrote it?** Jeremy Henderson from **JVS Automation** (this repo is a personal/demo project written for a spare 1080p tablet).
- **JVS Automation**: Facebook **JVS_Automation** · Instagram **@jvs_automation**
- **Why?** To get a fast, always-on “single pane of glass” that stays usable even when cloud integrations are flaky.

## What it does

- Pulls devices from **Hubitat Maker API**, normalizes them into `rooms` + `sensors`, and keeps state refreshed.
- Renders a kiosk-friendly dashboard:
	- Home (environment summary)
	- Climate (heatmap for temperature/humidity/illuminance)
	- Weather (built-in Open‑Meteo)
	- Activity + basic controls
- Supports a common “bridge” approach for cheap Google-linked devices:
	- Google Assistant Relay (GAR) + a Hubitat virtual switch driver → control Google devices *through Hubitat* → controllable by this panel.
	- Note: GAR reliability may change over time as Google rolls out Gemini; see: [docs/05-Google-Assistant-Relay.md](docs/05-Google-Assistant-Relay.md)

## Start here

- Overview: [docs/01-Overview.md](docs/01-Overview.md)
- Components used (Hubitat C‑8, Maker API, GAR server, custom driver): [docs/02-Components.md](docs/02-Components.md)
- Installation (dev + production + service): [docs/03-Installation.md](docs/03-Installation.md)
- Hubitat setup (Maker API + postURL): [docs/04-Hubitat.md](docs/04-Hubitat.md)
- Google Assistant Relay flow + `garsSetup` link: [docs/05-Google-Assistant-Relay.md](docs/05-Google-Assistant-Relay.md)
- Custom switch driver notes: [docs/06-Custom-Driver.md](docs/06-Custom-Driver.md)
- Security & hardening: [docs/07-Security.md](docs/07-Security.md)
- HTTPS & certificates: [docs/08-HTTPS.md](docs/08-HTTPS.md)
- Troubleshooting: [docs/09-Troubleshooting.md](docs/09-Troubleshooting.md)
- RTSP/HLS camera streaming configuration: [docs/10-RTSP-HLS-Configuration.md](docs/10-RTSP-HLS-Configuration.md)

## Repo layout

- `client/` — React + Vite UI
- `server/` — Express + Socket.IO backend
- `server/data/config.json` — persisted, installation-specific config (rooms/sensors mapping + layout + UI settings)

## Built-in Weather

Weather is built in via **Open‑Meteo** (fetched/cached by the backend and shown in the Weather page).

## Quick start (standard install)

This project is typically run as **one service** on **port 3000** (backend + built frontend served together).

Build the client (`client/dist`) and start the backend:

```bash
cd client
npm install
npm run build

cd ../server
npm install
npm start
```

Note: `npm start` runs the HTTPS helper as a `prestart` step. It will only prompt to generate a cert when run in an interactive terminal; systemd runs non-interactively.

Browse to `http(s)://<host>:3000/`.

## What you’ll need to build something similar

- **Hubitat hub** (tested/targeted: C‑8) with **Maker API** enabled
- A machine to run the server (mini PC, Raspberry Pi, home server)
- A device to display the UI (wall tablet/kiosk) on your LAN
- Optional (for Google-only devices): a **Google Assistant Relay** server + a **Hubitat virtual switch driver** that calls it

If you’re trying to replicate the full “Google Home → Hubitat → panel” path, start with:

- Components overview: [docs/02-Components.md](docs/02-Components.md)
- GAR setup link: [docs/05-Google-Assistant-Relay.md](docs/05-Google-Assistant-Relay.md)

## Optional: local development (two processes)

If you’re actively developing the UI, you can run Vite separately.

Terminal 1 (server):

```bash
cd server
npm install
npm run dev
```

Terminal 2 (client):

```bash
cd client
npm install
npm run dev
```

In this mode, the UI is served by Vite (commonly on `http://localhost:5173`) and the API is still on port 3000.

- **Rooms**: names, IDs, floors, and grid/layout positions are specific to one floorplan.
- **Sensors**: Hubitat device IDs and the room mapping are installation-specific.

## Notes

- The server auto-backs up `server/data/config.json` into `server/data/backups/` on writes and keeps only the most recent 200 backup files by default (override with `BACKUP_MAX_FILES`). Consider excluding backups from source control for long-term use.
- See `server/MAKER_API.md` for Maker API endpoint patterns.

## Ideas

- **Weather “data hub” microservice**: build a small app that pulls **Open‑Meteo** on a schedule, stores the latest values (and optionally history) in something simple like SQLite/JSON, and exposes them via a tiny HTTP API (or MQTT) so other apps can consume one consistent local weather feed.
