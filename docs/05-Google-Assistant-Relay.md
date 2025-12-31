# Google Assistant Relay (GAR)

This repo does not include a GAR server implementation, but it can integrate with one.

## Why GAR

Some “works with Google” / cloud-only devices are cheap and convenient, but don’t expose a clean local API and may not integrate with Hubitat directly.

A GAR server can:

- Run locally on your network
- Expose simple HTTP endpoints
- Trigger Google Assistant actions (devices, routines)

## Common integration pattern

- Hubitat has a virtual switch representing a Google action.
- The driver turns switch `on/off` into an HTTP call to GAR.
- Hubitat then exposes that device via Maker API.
- This panel controls the Hubitat device (which indirectly controls the Google device).

## garsSetup link

Setup guide:

- `garsSetup`: https://greghesp.github.io/assistant-relay/docs/getting-started/installation/
