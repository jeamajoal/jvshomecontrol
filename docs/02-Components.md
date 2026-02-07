# Components

Everything you need — and everything that's optional — to run JVSHomeControl.

---

## Required

| Component | What It Does | Notes |
|-----------|-------------|-------|
| **Hubitat Hub** | Controls your smart devices | Tested on C-8. Any model with Maker API should work. |
| **Maker API** | Exposes Hubitat devices over HTTP | Built-in Hubitat app — just enable and select devices. |
| **Server machine** | Runs the JVS backend | Raspberry Pi 4+, mini PC, NAS, or any Debian/Ubuntu box. |
| **Display** | Shows the dashboard | Wall tablet, spare phone, desktop browser, or any screen on your network. |

> **Minimum specs:** 512 MB RAM, 1 CPU core, 200 MB disk. A Raspberry Pi 4 handles everything comfortably.

---

## Optional

| Component | What It Does | When You Need It |
|-----------|-------------|-----------------|
| **RTSP cameras** | Live camera feeds in the dashboard | Server uses ffmpeg to convert RTSP → HLS for browser playback. |
| **ffmpeg** | Video transcoding | Installed automatically by the install script. Only needed for cameras. |
| **Google Assistant Relay** | Control Google-only devices via Hubitat | For cheap smart devices that only support Google Home. See [05-Google-Assistant-Relay.md](05-Google-Assistant-Relay.md). |
| **Custom Hubitat Driver** | Makes GAR devices look like Hubitat switches | Included in this repo. See [06-Custom-Driver.md](06-Custom-Driver.md). |

---

## How They Connect

```
                                    ┌──────────────┐
                                    │  RTSP Camera │ (optional)
                                    └──────┬───────┘
                                           │ RTSP
┌─────────────┐    Maker API    ┌──────────┴────────┐    WebSocket    ┌──────────────┐
│   Hubitat   │ ◄─────────────  │   JVS Server      │ ──────────────  │  Tablet /    │
│   Hub       │ ─────────────  │   (Express)        │                │  Browser     │
└─────────────┘    Events       └───────────────────┘                 └──────────────┘
                                        │
                               ┌────────┴────────┐
                               │   Open-Meteo    │ (free weather)
                               └─────────────────┘
```

---

## Supported Devices

JVSHomeControl works with any device exposed through Hubitat Maker API, including:

- **Switches** — on/off toggle (lights, outlets, smart plugs)
- **Dimmers** — brightness slider with on/off
- **Sensors** — temperature, humidity, illuminance, motion, contact
- **Locks** — lock/unlock
- **Shades** — open/close
- **Fans** — speed control
- **Media players** — transport controls, volume
- **Garage doors** — open/close
- **Sirens** — activate/deactivate
- **Valves** — open/close

---

## Next Steps

| Task | Doc |
|------|-----|
| Install the server | [03-Installation.md](03-Installation.md) |
| Configure Hubitat | [04-Hubitat.md](04-Hubitat.md) |
| Add Google devices | [05-Google-Assistant-Relay.md](05-Google-Assistant-Relay.md) |
