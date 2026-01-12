# Overview

JVSHomeControl is a local-first home dashboard (React + Vite) backed by a Node/Express server with Socket.IO realtime updates.

It’s built around the idea that **Hubitat is the local brain**, and this project is the fast, kiosk-friendly UI on top.

At a high level:

- The **server** polls Hubitat Maker API (initially on startup and then on an interval), normalizes devices into `rooms` + `sensors`, persists UI layout/mapping, and broadcasts updates.
- If Maker API `postURL` is configured, the server also accepts callbacks to apply low-latency device state updates between polls.
- The **server** also provides built-in **Weather** via Open‑Meteo (cached by the backend and exposed to the UI).
- The **client** renders pages like Home (Environment), Climate (heatmap), Weather, Activity, and Controls.

## What this project is good for

- A wall tablet / kiosk dashboard
- A “single pane of glass” that stays responsive even when your cloud devices are flaky
- Bridging multiple ecosystems (Hubitat, Google Home) into one controllable panel

## What this project is not

- A public internet-facing control plane (it can be hardened, but the default posture assumes a trusted LAN)
- A replacement for Hubitat/Google Home automations; it’s a UI and thin control layer on top

## Device visibility & controls (allowlists + overrides)

The UI is intentionally conservative about device control.

- **Allowlists** decide which devices can appear on **Home** and **Controls**.
	- Persisted keys: `ui.mainAllowedDeviceIds` and `ui.ctrlAllowedDeviceIds`
	- These can be locked by server env vars (see Settings → Devices).
- **Panel profiles** let you save different configs per tablet/panel.
	- Built-in preset profiles (e.g., "Neon Glass", "Stealth Slate", etc.) are shipped with the server and automatically available.
	- User-defined custom profiles can be persisted under `ui.panelProfiles[panelName]`.
	- The client merges global defaults + the selected panel profile.
- **Visible rooms per panel** (optional):
	- Persisted key: `ui.visibleRoomIds` (and per panel: `ui.panelProfiles[panelName].visibleRoomIds`)
	- If the list is empty, it means “show all rooms”.
- **Per-device overrides** (optional):
	- **Display name override**: `ui.deviceLabelOverrides[deviceId] = "My Friendly Name"`
	- **Command allowlist**: `ui.deviceCommandAllowlist[deviceId] = ["on","off",...]`
	- Both also support per-panel versions under `ui.panelProfiles[panelName].deviceLabelOverrides` and `.deviceCommandAllowlist`.

In Settings → Devices:

- Leaving **Display Name** empty means “inherit”.
- For **Commands**, clicking **Reset** means “inherit”. When inheriting, the UI defaults to showing all supported commands that the device actually exposes.

Server endpoints used by the Settings UI:

- `PUT /api/ui/allowed-device-ids`
- `PUT /api/ui/visible-room-ids`
- `PUT /api/ui/device-overrides`

## Related docs

- Components and integrations: [02-Components.md](02-Components.md)
- Installation (dev + production + service): [03-Installation.md](03-Installation.md)
- Hubitat + Maker API details: [04-Hubitat.md](04-Hubitat.md)
- Google Assistant Relay flow: [05-Google-Assistant-Relay.md](05-Google-Assistant-Relay.md)
- Custom driver notes: [06-Custom-Driver.md](06-Custom-Driver.md)
- Security: [07-Security.md](07-Security.md)
- HTTPS + certificates: [08-HTTPS.md](08-HTTPS.md)
- Troubleshooting: [09-Troubleshooting.md](09-Troubleshooting.md)
