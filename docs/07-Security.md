# Security

JVSHomeControl is designed for **trusted local networks**. It has no built-in authentication — anyone who can reach the server can use the dashboard and control devices.

This document covers the security measures you should take.

---

## Security Checklist

| Priority | Action | Status |
|----------|--------|--------|
| **Critical** | Use HTTPS for the dashboard | ✅ Auto-configured by installer |
| **Critical** | Use HTTPS for Hubitat Maker API | 🔧 See [04-Hubitat.md](04-Hubitat.md) |
| **Critical** | Store secrets in env file, not config | 🔧 Use `/etc/jvshomecontrol.env` |
| **High** | Don't expose to the internet | 🔧 Firewall rules below |
| **High** | Protect the events endpoint | 🔧 Set `EVENTS_INGEST_TOKEN` |
| **Medium** | Restrict device access with allowlists | 🔧 See below |
| **Medium** | Use VPN for remote access | 🔧 WireGuard or Tailscale |

---

## Why HTTPS Matters (Even Locally)

Your Hubitat Maker API access token is sent with **every request** from the server to your hub. Without encryption:

- Anyone on your WiFi can capture the token with a packet sniffer
- That token grants full control of every device in Maker API
- Smart locks, garage doors, and alarms could be compromised

**Always use HTTPS**, even on your home network. The installer creates certificates automatically.

---

## Protecting Your Secrets

| Secret | Where to Store | Never Put In |
|--------|---------------|-------------|
| `HUBITAT_ACCESS_TOKEN` | `/etc/jvshomecontrol.env` | `config.json`, code, git |
| `EVENTS_INGEST_TOKEN` | `/etc/jvshomecontrol.env` | URLs shared publicly |
| Camera credentials | RTSP URL in config | Plain text files |

**File permissions:**
```bash
sudo chmod 600 /etc/jvshomecontrol.env
sudo chown root:root /etc/jvshomecontrol.env
```

---

## Network Access Control

### Recommended: LAN Only

```bash
# Allow only your local network (using ufw)
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw deny 3000
```

### Remote Access

**Never port-forward the dashboard to the internet.** Instead, use a VPN:

- **[Tailscale](https://tailscale.com/)** — easiest option, free for personal use
- **[WireGuard](https://www.wireguard.com/)** — lightweight, fast, built into Linux kernel

---

## Device Allowlists

Limit which devices can be controlled from the dashboard. Useful when a wall tablet shouldn't control certain devices (e.g., locks).

These are configured in the Settings page or via the config API. You can set separate allowlists for:

- **Home page** (`mainAllowedDeviceIds`) — which devices show metrics
- **Controls page** (`ctrlAllowedDeviceIds`) — which devices can be toggled

---

## Event Ingest Protection

If using Hubitat Maker API `postURL` to push events to JVSHomeControl, protect the endpoint with a token:

```bash
# In /etc/jvshomecontrol.env:
EVENTS_INGEST_TOKEN=your-random-secret-here
```

Then set your Maker API `postURL` to:
```
https://your-server:3000/api/events?token=your-random-secret-here
```

Without this, anyone who can reach port 3000 can inject fake events.

---

## Systemd Hardening

The installer configures these security options:

```ini
NoNewPrivileges=true      # Prevent privilege escalation
PrivateTmp=true           # Isolated temp directory
ProtectSystem=strict      # Read-only filesystem (except data dir)
ProtectHome=true          # No access to home directories
ReadWritePaths=/opt/jvshomecontrol/server/data
```

---

## What This Project Does NOT Provide

- **Authentication** — no login screen. Restrict access at the network level.
- **Authorization** — no per-user permissions. All users see the same dashboard.
- **Audit logging** — no record of who changed what. Use Hubitat's built-in logging.
- **Rate limiting** — no API throttling. Keep it on a trusted network.

If you need these features for a commercial deployment, consider adding a reverse proxy (nginx, Caddy) with authentication in front of the dashboard.
