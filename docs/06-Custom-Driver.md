# Custom Switch Driver (Hubitat)

This repo does not ship a Hubitat driver, but it is designed to work well with the “virtual switch → HTTP call” pattern.

## What the driver typically does

- Defines a virtual switch (or dimmer) in Hubitat
- On `on()` / `off()`, calls your GAR endpoint (or another local bridge)
- Optionally syncs state back into Hubitat

## Why this is useful

Once the Google-linked device is represented as a Hubitat device, it becomes controllable via:

- Hubitat automations
- Hubitat dashboards
- Maker API
- This panel

## Recommended documentation

If you have a separate repo for the custom driver, link it here:

- <INSERT_DRIVER_REPO_URL_HERE>
