# Overview

JVSHomeControl is a local-first home dashboard (React + Vite) backed by a Node/Express server with Socket.IO realtime updates.

It’s built around the idea that **Hubitat is the local brain**, and this project is the fast, kiosk-friendly UI on top.

At a high level:

- The **server** polls Hubitat Maker API, normalizes devices into `rooms` + `sensors`, persists UI layout/mapping, and broadcasts updates.
- The **server** also provides built-in **Weather** via Open‑Meteo (cached by the backend and exposed to the UI).
- The **client** renders pages like Home (Environment), Climate (heatmap), Weather, Activity, and Controls.

## What this project is good for

- A wall tablet / kiosk dashboard
- A “single pane of glass” that stays responsive even when your cloud devices are flaky
- Bridging multiple ecosystems (Hubitat, Google Home) into one controllable panel

## What this project is not

- A public internet-facing control plane (it can be hardened, but the default posture assumes a trusted LAN)
- A replacement for Hubitat/Google Home automations; it’s a UI and thin control layer on top

## Related docs

- Components and integrations: [02-Components.md](02-Components.md)
- Installation (dev + production + service): [03-Installation.md](03-Installation.md)
- Hubitat + Maker API details: [04-Hubitat.md](04-Hubitat.md)
- Google Assistant Relay flow: [05-Google-Assistant-Relay.md](05-Google-Assistant-Relay.md)
- Custom driver notes: [06-Custom-Driver.md](06-Custom-Driver.md)
- Security: [07-Security.md](07-Security.md)
- HTTPS + certificates: [08-HTTPS.md](08-HTTPS.md)
- Troubleshooting: [09-Troubleshooting.md](09-Troubleshooting.md)
