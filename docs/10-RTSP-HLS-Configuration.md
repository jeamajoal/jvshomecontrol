# Camera Setup (RTSP → HLS)

Stream RTSP cameras directly in the JVSHomeControl dashboard. The server runs ffmpeg to convert RTSP streams into browser-friendly HLS (HTTP Live Streaming) format.

> **Status:** Camera support is functional but considered beta. It works reliably for most mainstream cameras but edge cases may exist.

---

## How It Works

```
┌──────────┐   RTSP    ┌──────────┐   HLS segments   ┌──────────────┐
│  Camera  │ ────────→ │  ffmpeg  │ ────────────────→ │  Browser     │
│  (RTSP)  │           │  (server)│                   │  (hls.js)    │
└──────────┘           └──────────┘                   └──────────────┘
```

1. The server starts an ffmpeg process per camera
2. ffmpeg reads the RTSP stream and writes HLS `.ts` segments + `.m3u8` playlist
3. The browser's hls.js player fetches segments over HTTP and plays them
4. The server monitors health and auto-restarts stalled streams

---

## Requirements

- **ffmpeg** installed on the server (the installer does this automatically)
- Camera with **RTSP** support (most IP cameras have this)
- Camera reachable from the server over the network

---

## Adding a Camera

### Via the Dashboard

1. Go to **Settings** → scroll to **Cameras**
2. Add a new camera entry with:
   - **Label** — friendly name (e.g., "Front Door")
   - **RTSP URL** — full URL including credentials
   - **Room** — associate with a room (optional)
3. Save — the stream will start automatically

### Common RTSP URL Formats

| Brand | URL Pattern |
|-------|-------------|
| **Generic** | `rtsp://user:pass@ip:554/stream1` |
| **Hikvision** | `rtsp://user:pass@ip:554/Streaming/Channels/101` |
| **Dahua / Amcrest** | `rtsp://user:pass@ip:554/cam/realmonitor?channel=1&subtype=0` |
| **Reolink** | `rtsp://user:pass@ip:554/h264Preview_01_main` |
| **Tapo** | `rtsp://user:pass@ip:554/stream1` |
| **UniFi Protect** | Check the camera's RTSP settings page |

> **Tip:** Use the camera's **sub-stream** (lower resolution) instead of the main stream. This significantly reduces CPU usage and network bandwidth with minimal visual difference on a dashboard.

---

## Snapshot Cameras

For cameras that only support HTTP snapshots (not RTSP), configure the snapshot URL instead:

```json
{
  "id": "front-door",
  "label": "Front Door",
  "snapshot": {
    "url": "http://192.168.1.50/cgi-bin/snapshot.cgi",
    "basicAuth": {
      "username": "admin",
      "password": "changeme"
    }
  }
}
```

The dashboard will poll the snapshot URL at a configurable interval (default: 10 seconds).

---

## Tuning Parameters

All HLS/RTSP tuning parameters are configured in `config.json` and can be edited via the Settings UI or the config API. Common tuning options:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Segment duration | `2` seconds | 1–6 | Shorter = lower latency, more CPU |
| Output FPS | `15` | 1–60 | Lower = less CPU, choppier video |
| RTSP transport | `tcp` | tcp/udp | TCP is more reliable; UDP is lower latency |

### Performance Tips

- **High CPU?** Lower FPS to 10
- **Choppy video?** Increase FPS or check network bandwidth
- **High latency?** Decrease segment duration to 1 second
- **Unreliable stream?** Switch transport to UDP

---

## Health Monitoring

The server automatically monitors all active streams:

- Detects when streams stall (no new segments)
- Auto-restarts failed streams with exponential backoff
- Cleans up old HLS segments to prevent disk bloat

Check health via API:
```bash
curl -sk https://localhost/api/hls/health | python3 -m json.tool
```

### Advanced Health Settings

These defaults are configured in the server's config modules:

| Setting | Default | Description |
|---------|---------|-------------|
| Health check interval | `10000` ms | How often to check stream health |
| Max restart attempts | `5` | Max auto-restarts before giving up |
| Stale threshold | `15` seconds | How long before a stream is considered dead |
| Cleanup on shutdown | `false` | Delete HLS files when server stops |
| Playlist window size | `6` segments | HLS playlist window size |
| Max segment age | `30` seconds | Delete segments older than this |

---

## Troubleshooting

**Camera not appearing:**
- Ensure the camera entry is `"enabled": true` in config
- Check server logs: `sudo journalctl -u jvshomecontrol -f`

**Stream keeps restarting:**
```bash
# Test the RTSP URL directly
ffmpeg -rtsp_transport tcp -i "rtsp://user:pass@camera:554/stream" -t 10 -f null -
```
If this fails, the RTSP URL or credentials are wrong.

**Black screen in browser:**
- Check browser console for HLS errors
- Verify the server can reach the camera: `ping camera-ip`
- Try a different RTSP transport (tcp ↔ udp)

**"Stream stale" in health API:**
- Camera may have disconnected or rebooted
- The server will auto-restart — check if it recovers
- If persistent, the camera's RTSP server may be unreliable
