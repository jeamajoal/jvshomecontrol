# Installation

This doc covers local development and a production install.

## Standard install (recommended)

This project is typically deployed as a **single service** on **port 3000** (backend + built frontend).

```bash
cd client
npm install
npm run build

cd ../server
npm install
npm start
```

Browse to `http(s)://<host>:3000/`.

## Local development (optional)

Prereqs:

- Node.js 20+ (recommended: latest LTS; the Debian installer targets Node 22)

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

In this dev mode, the UI is served by Vite (commonly on `http://localhost:5173`) and the API is on port 3000.

## Notes

- Production/default is port 3000 for both UI + API.
- Vite (`:5173`) is only used during active UI development.

## Running as a service (Debian / systemd)

There are two ways:

- Use the step-by-step approach in the root README
- Or use the helper script:

- [scripts/install-debian.sh](../scripts/install-debian.sh)

If you're on Debian/Ubuntu and just want the easiest setup/update experience, use the helper script above.
It is intended to be a one-stop flow for:

- Install
- Update
- Create a HTTPS certificate the first time
- Recreate/replace the HTTPS certificate later

It updates the repo by overwriting tracked files (a clean checkout), while preserving your installation-specific data:

- `server/data/config.json`
- `server/data/certs/`

The Debian installer is split into two files:

- `scripts/install-debian.sh` (bootstrap): updates/clones the repo, then runs the repo version installer.
- `scripts/install-debian-run.sh` (runner): the actual install logic executed from the updated checkout.

Note: The Debian install script runs the HTTPS setup helper during install/update and guides you through the prompts.
In normal interactive use, there is no need to run the certificate helper separately.

If you're running non-interactively (for example via systemd or an SSH session with no TTY), prompts are skipped; in that case you can generate/recreate the cert later from an interactive terminal.

If you change environment variables (for example switching `http://` to `https://`), you must restart the service:

```bash
sudo systemctl restart jvshomecontrol
```

### systemd environment (Debian installer)

If you used the Debian installer, the systemd service reads environment variables from:

- `/etc/jvshomecontrol.env`

That’s where you should set Hubitat variables like `HUBITAT_HOST`, and optional tuning like the polling interval:

- `HUBITAT_POLL_INTERVAL_MS=60000` (poll once per minute)

## Configuration files

- Persisted config: `server/data/config.json`
- Sounds: `server/data/sounds/`
- HTTPS certs (optional): `server/data/certs/`
