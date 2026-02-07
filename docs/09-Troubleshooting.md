# Troubleshooting

Solutions for common issues, organised by symptom.

---

## Dashboard Loads But Shows "Waiting for Config"

This means the UI loaded successfully but didn't receive device data.

**Step 1: Check Hubitat connection**
```bash
curl -sk https://localhost:3000/api/hubitat/health
```

If `configured` is `false`, your credentials aren't set. See Step 2.

**Step 2: Verify environment variables**
```bash
sudo cat /etc/jvshomecontrol.env | grep HUBITAT
```

You need all three:
```bash
HUBITAT_HOST=https://192.168.1.50
HUBITAT_APP_ID=30
HUBITAT_ACCESS_TOKEN=your-token-here
```

**Step 3: Verify Maker API devices are selected**

In Hubitat → Apps → Maker API, make sure devices are checked in the "Allow Access" list.

**Step 4: Test Maker API directly**
```bash
curl -sk "https://YOUR-HUBITAT-IP/apps/api/YOUR-APP-ID/devices/all?access_token=YOUR-TOKEN"
```

If this returns an empty array or an error, the problem is on the Hubitat side.

---

## Service Won't Start

```bash
# Check status
sudo systemctl status jvshomecontrol

# View recent logs
sudo journalctl -u jvshomecontrol -n 100

# View live logs
sudo journalctl -u jvshomecontrol -f
```

**Common causes:**
- **Port already in use** — another service is on port 3000. Change with `PORT=8443` in the env file.
- **Missing environment file** — ensure `/etc/jvshomecontrol.env` exists.
- **Permission issues** — the `jvshome` user needs write access to `/opt/jvshomecontrol/server/data/`.
- **Node.js not found** — run `node --version`. Needs v20 or later.

---

## HTTPS Certificate Warnings

Self-signed certificates always trigger browser warnings. To suppress them:

### Desktop Browsers
Click "Advanced" → "Proceed" (or "Accept the Risk"). Most browsers remember this.

### iOS
1. Open `https://your-server:3000` in **Safari** (not Chrome)
2. Accept the warning
3. Go to **Settings → General → About → Certificate Trust Settings**
4. Toggle trust for the certificate

### Android
1. Open the URL in Chrome
2. Accept the warning
3. Optionally install the `.crt` file via **Settings → Security → Install Certificates**

### Regenerate Certificates
```bash
cd /opt/jvshomecontrol/server
sudo -u jvshome node scripts/https-setup.js
sudo systemctl restart jvshomecontrol
```

---

## Cameras Not Loading

**Check ffmpeg is installed:**
```bash
ffmpeg -version
```

**Check HLS health:**
```bash
curl -sk https://localhost:3000/api/hls/health | python3 -m json.tool
```

**Test the RTSP URL directly:**
```bash
ffmpeg -i "rtsp://user:pass@camera-ip:554/stream" -t 5 -f null -
```

**Common fixes:**
- Camera RTSP URL is wrong or requires authentication
- Network firewall blocking RTSP port (usually 554)
- Try switching transport: set `RTSP_HLS_RTSP_TRANSPORT=udp` in the env file
- Lower framerate if CPU is high: `RTSP_HLS_OUTPUT_FPS=10`

---

## Mixed Content Errors

If you see "blocked loading mixed active content" in the browser console:
- You're accessing via HTTP but some resources use HTTPS (or vice versa)
- Solution: always access via `https://` — the server defaults to HTTPS
- Or set `HTTP_ONLY=1` in the env file to disable HTTPS entirely

---

## WebSocket Disconnections

If the status indicator frequently flips between ONLINE/OFFLINE:
- Check network stability between the server and tablet
- The client automatically reconnects with exponential backoff
- If on WiFi, ensure the tablet isn't aggressively power-saving

---

## Config File Location

```bash
# Main config (all UI settings, rooms, devices, themes)
/opt/jvshomecontrol/server/data/config.json

# Automatic backups (timestamped)
/opt/jvshomecontrol/server/data/backups/
```

---

## Reset to Factory Defaults

> **Warning:** This erases your UI configuration (themes, device lists, layout). Hubitat credentials in `/etc/jvshomecontrol.env` are preserved.

```bash
sudo systemctl stop jvshomecontrol
sudo rm /opt/jvshomecontrol/server/data/config.json
sudo systemctl start jvshomecontrol
```

The server will recreate `config.json` from the example template on next start.

---

## Getting Help

1. Check the logs: `sudo journalctl -u jvshomecontrol -f`
2. Test the API: `curl -sk https://localhost:3000/api/hubitat/health`
3. Open an issue on [GitHub](https://github.com/jeamajoal/JVSHomeControl/issues)
