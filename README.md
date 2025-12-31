# JVSHomeControl

Local home automation dashboard (client) + Node/Express backend (server) with realtime updates via Socket.IO.

Core idea: Hubitat is the local “brain”, and this panel provides a fast, kiosk-friendly UI on top of it — with optional integration paths for Google Home devices via a relay.

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

## Repo layout

- `client/` — React + Vite UI
- `server/` — Express + Socket.IO backend
- `server/data/config.json` — persisted, installation-specific config (rooms/sensors mapping + layout + UI settings)

## Quick start (local dev)

Prereqs:

- Node.js 18+

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

Then open the Vite URL (usually `http://localhost:5173`).

## Production note

Build the client (`client/dist`) and the backend will serve it:

```bash
cd client
npm install
npm run build

cd ../server
npm install
npm start
```

Browse to `http(s)://<host>:3000/`.

- **Rooms**: names, IDs, floors, and grid/layout positions are specific to one floorplan.
- **Sensors**: Hubitat device IDs and the room mapping are installation-specific.

## Notes

- The server auto-backs up `server/data/config.json` into `server/data/backups/` on writes and keeps only the most recent 200 backup files by default (override with `BACKUP_MAX_FILES`). Consider excluding backups from source control for long-term use.
- See `server/MAKER_API.md` for Maker API endpoint patterns.
