# Components & Integrations

This repo is the dashboard + backend server. A typical installation also includes these external pieces.

## Hubitat C‑8 + Maker API

Hubitat is the “local brain” and device hub.

- Hubitat automations run locally.
- Maker API exposes devices and commands over HTTP(S).
- This project polls Maker API and also accepts Maker event callbacks at `POST /api/events`.

See: [04-Hubitat.md](04-Hubitat.md) and [server/MAKER_API.md](../server/MAKER_API.md)

## Google Assistant Relay (GAR) server

Google Assistant Relay (GAR) is commonly used to turn **Google Home / Assistant** actions into local HTTP endpoints.

Typical reason you’d use it here:

- You have inexpensive “works with Google” devices that don’t integrate natively with Hubitat.
- You can still control them via Google Assistant.
- GAR gives you an HTTP trigger you can call locally.

The common flow:

1. Panel / Hubitat calls a local endpoint on the GAR server.
2. GAR triggers a Google Assistant routine / device action.
3. The Google-linked device changes state.
4. Hubitat and/or this panel reflects the state via sensors/events.

See: [05-Google-Assistant-Relay.md](05-Google-Assistant-Relay.md)

## Custom switch driver (Hubitat)

A common pattern is a custom virtual switch driver in Hubitat that:

- Represents a Google-linked device (or a Google routine) as a Hubitat switch
- On switch command, calls your GAR endpoint

This makes the Google device appear like a normal Hubitat switch, which then makes it controllable from:

- Hubitat dashboards/automations
- Maker API
- This panel

See: [06-Custom-Driver.md](06-Custom-Driver.md)

## This panel (JVSHomeControl)

This project sits on top of Hubitat as a UI:

- Displays metrics (temperature/humidity/illuminance) in the Climate heatmap
- Allows safe device control via allowlists
- Provides a mobile-friendly kiosk UI
