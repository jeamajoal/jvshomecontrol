# Installation

This doc covers local development and a production install.

## Local development

Prereqs:

- Node.js 18+ (server uses built-in `fetch`)

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

Open the Vite URL (usually `http://localhost:5173`).

## Production (single service)

In production, you typically build the client and let the server serve it:

```bash
cd client
npm install
npm run build

cd ../server
npm install
npm start
```

Then browse to `http(s)://<host>:3000/`.

## Running as a service (Debian / systemd)

There are two ways:

- Use the step-by-step approach in the root README
- Or use the helper script:

- [scripts/install-debian.sh](../scripts/install-debian.sh)

If you change environment variables (for example switching `http://` to `https://`), you must restart the service:

```bash
sudo systemctl restart jvshomecontrol
```

## Configuration files

- Persisted config: `server/data/config.json`
- Sounds: `server/data/sounds/`
- HTTPS certs (optional): `server/data/certs/`
